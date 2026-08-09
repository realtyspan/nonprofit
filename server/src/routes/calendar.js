const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { generateOccurrences } = require("../lib/recurrence");
const { hasConflict } = require("../lib/rentalLogic");
const { lodgeDateTimeStringToUtc } = require("../lib/timezone");

const router = express.Router();
router.use(requireAuth, loadPermissions);

function canManageRentals(req) {
  return req.orgTier === "Owner" || req.moduleGrants.rentals === "Admin";
}

// Checks each candidate space for a conflicting confirmed/completed booking or
// existing block — same all-or-nothing rule as Rental Space's own Internal
// Blocks (see rentals.js's findConflictingOccurrences). excludeCalendarEventId
// omits blocks belonging to the event currently being edited, since those are
// about to be replaced, not conflicted with.
async function findSpaceConflicts(spaceIds, startAt, endAt, excludeCalendarEventId) {
  const conflicts = [];
  for (const spaceId of spaceIds) {
    const [bookings, blocks] = await Promise.all([
      prisma.rentalBooking.findMany({ where: { spaceId, status: { in: ["confirmed", "completed"] } } }),
      prisma.rentalBlock.findMany({
        where: { spaceId, ...(excludeCalendarEventId ? { calendarEventId: { not: excludeCalendarEventId } } : {}) },
      }),
    ]);
    if (hasConflict(startAt, endAt, bookings, blocks)) conflicts.push(spaceId);
  }
  return conflicts;
}

// Replaces whatever RentalBlocks this event currently owns with a fresh set —
// same regenerate-from-scratch approach used for recurring series elsewhere
// in this app, since these blocks aren't an audit trail, just a byproduct of
// "this event occupies a room."
async function syncRentalBlocksForEvent(orgId, event, rentalSpaceIds) {
  await prisma.rentalBlock.deleteMany({ where: { calendarEventId: event.id } });
  if (!rentalSpaceIds || rentalSpaceIds.length === 0) return;
  await prisma.rentalBlock.createMany({
    data: rentalSpaceIds.map((spaceId) => ({
      orgId, spaceId, startAt: event.startAt, endAt: event.endAt, reason: event.title, calendarEventId: event.id,
    })),
  });
}

async function validateRentalSpaceIds(orgId, rentalSpaceIds) {
  if (!rentalSpaceIds || rentalSpaceIds.length === 0) return null;
  const spaces = await prisma.rentalSpace.findMany({ where: { id: { in: rentalSpaceIds }, orgId, active: true } });
  if (spaces.length !== rentalSpaceIds.length) return "One or more selected spaces are invalid";
  return null;
}

router.get("/events", requireReadAccess("calendar"), async (req, res) => {
  const { start, end } = req.query;
  const where = { orgId: req.user.orgId };
  if (start && end) {
    where.startAt = { lte: new Date(end) };
    where.endAt = { gte: new Date(start) };
  }
  const events = await prisma.calendarEvent.findMany({
    where,
    include: { rentalBlocks: { select: { spaceId: true } } },
    orderBy: { startAt: "asc" },
  });
  res.json(events.map((e) => ({ ...e, rentalSpaceIds: e.rentalBlocks.map((b) => b.spaceId), rentalBlocks: undefined })));
});

// Fetches a recurring series' rule (not its materialized occurrences) so the
// "edit entire series" form can be pre-filled with the current pattern.
router.get("/recurrences/:id", requireReadAccess("calendar"), async (req, res) => {
  const rec = await prisma.calendarRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring event not found" });
  res.json(rec);
});

// One-off event, or the first materialization of a recurring series (recurrence provided in body).
// rentalSpaceIds only applies to one-off events — a recurring room commitment
// (e.g. a twice-monthly meeting) is created from Rental Space > Internal
// Blocks instead, which already has its own recurrence support.
router.post("/events", requirePermission("calendar", "Admin"), async (req, res) => {
  const { title, description, location, linkUrl, startAt, endAt, allDay, visibility, color, recurrence, rentalSpaceIds } = req.body;
  if (!title || !startAt || !endAt) return res.status(400).json({ error: "Missing required fields" });

  if (!recurrence) {
    if (rentalSpaceIds?.length > 0 && !canManageRentals(req)) {
      return res.status(403).json({ error: "Requires Admin on rentals to mark an event as using a rental space" });
    }
    const spaceError = await validateRentalSpaceIds(req.user.orgId, rentalSpaceIds);
    if (spaceError) return res.status(400).json({ error: spaceError });

    const start = lodgeDateTimeStringToUtc(startAt), end = lodgeDateTimeStringToUtc(endAt);
    if (rentalSpaceIds?.length > 0) {
      const conflicts = await findSpaceConflicts(rentalSpaceIds, start, end);
      if (conflicts.length > 0) return res.status(409).json({ error: "This space is already booked or blocked for an overlapping time", conflicts });
    }

    const event = await prisma.calendarEvent.create({
      data: { orgId: req.user.orgId, title, description, location, linkUrl, startAt: start, endAt: end, allDay: !!allDay, visibility: visibility || "internal", color, source: "manual" },
    });
    await syncRentalBlocksForEvent(req.user.orgId, event, rentalSpaceIds);
    return res.json({ ...event, rentalSpaceIds: rentalSpaceIds || [] });
  }

  const { freq, interval, byWeekday, byWeekdayOrdinal, startDate, endDate, startTime, endTime } = recurrence;
  if (!freq || !startDate || !endDate) return res.status(400).json({ error: "Recurrence needs freq, startDate, and endDate" });

  const rec = await prisma.calendarRecurrence.create({
    data: {
      orgId: req.user.orgId, title, description, location, linkUrl, allDay: !!allDay, visibility: visibility || "internal", color,
      freq, interval: Number(interval) || 1, byWeekday: byWeekday || null, byWeekdayOrdinal: byWeekdayOrdinal || null,
      startDate: new Date(startDate), endDate: new Date(endDate), startTime: startTime || "00:00", endTime: endTime || "00:00",
    },
  });

  const occurrences = generateOccurrences({ freq: rec.freq, interval: rec.interval, byWeekday: rec.byWeekday, byWeekdayOrdinal: rec.byWeekdayOrdinal, startDate: rec.startDate, endDate: rec.endDate, startTime: rec.startTime, endTime: rec.endTime, allDay: rec.allDay });
  if (occurrences.length === 0) return res.status(400).json({ error: "That recurrence rule doesn't produce any occurrences in range" });

  await prisma.calendarEvent.createMany({
    data: occurrences.map((o) => ({ orgId: req.user.orgId, title, description, location, linkUrl, startAt: o.startAt, endAt: o.endAt, allDay: !!allDay, visibility: visibility || "internal", color, source: "manual", recurrenceId: rec.id })),
  });

  const events = await prisma.calendarEvent.findMany({ where: { recurrenceId: rec.id }, orderBy: { startAt: "asc" } });
  res.json({ recurrence: rec, events });
});

// Edits a single occurrence in place — does not affect the rest of a series.
router.patch("/events/:id", requirePermission("calendar", "Admin"), async (req, res) => {
  const event = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.source !== "manual") return res.status(400).json({ error: "This event is managed by another module — edit it from there" });

  const { title, description, location, linkUrl, startAt, endAt, allDay, visibility, color, rentalSpaceIds } = req.body;

  // Recurring occurrences don't get the rental-space option — only genuinely
  // one-off events do (see the create route's comment for why).
  if (!event.recurrenceId && rentalSpaceIds !== undefined) {
    if (rentalSpaceIds?.length > 0 && !canManageRentals(req)) {
      return res.status(403).json({ error: "Requires Admin on rentals to mark an event as using a rental space" });
    }
    const spaceError = await validateRentalSpaceIds(req.user.orgId, rentalSpaceIds);
    if (spaceError) return res.status(400).json({ error: spaceError });
  }

  const newStart = startAt ? lodgeDateTimeStringToUtc(startAt) : event.startAt;
  const newEnd = endAt ? lodgeDateTimeStringToUtc(endAt) : event.endAt;
  if (!event.recurrenceId && rentalSpaceIds?.length > 0) {
    const conflicts = await findSpaceConflicts(rentalSpaceIds, newStart, newEnd, event.id);
    if (conflicts.length > 0) return res.status(409).json({ error: "This space is already booked or blocked for an overlapping time", conflicts });
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: event.id },
    data: { title, description, location, linkUrl, startAt: startAt ? newStart : undefined, endAt: endAt ? newEnd : undefined, allDay, visibility, color },
  });
  if (!event.recurrenceId && rentalSpaceIds !== undefined) {
    await syncRentalBlocksForEvent(req.user.orgId, updated, rentalSpaceIds);
  }
  res.json({ ...updated, rentalSpaceIds: rentalSpaceIds !== undefined ? rentalSpaceIds : undefined });
});

router.delete("/events/:id", requirePermission("calendar", "Admin"), async (req, res) => {
  const event = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.source !== "manual") return res.status(400).json({ error: "This event is managed by another module — remove it from there" });
  await prisma.calendarEvent.delete({ where: { id: event.id } }); // cascades to any RentalBlocks it spawned
  res.json({ ok: true });
});

// Edits the whole series: updates the rule and fully regenerates its occurrences.
// Simpler than trying to preserve already-edited single occurrences on regen —
// events here are informational, not an audit trail, so this tradeoff is fine.
router.patch("/recurrences/:id", requirePermission("calendar", "Admin"), async (req, res) => {
  const rec = await prisma.calendarRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring event not found" });

  const { title, description, location, linkUrl, allDay, visibility, color, freq, interval, byWeekday, byWeekdayOrdinal, startDate, endDate, startTime, endTime } = req.body;
  const updated = await prisma.calendarRecurrence.update({
    where: { id: rec.id },
    data: {
      title, description, location, linkUrl, allDay: allDay !== undefined ? !!allDay : undefined, visibility, color,
      freq, interval: interval !== undefined ? Number(interval) : undefined, byWeekday: byWeekday || null, byWeekdayOrdinal: byWeekdayOrdinal !== undefined ? (byWeekdayOrdinal || null) : undefined,
      startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined,
      startTime, endTime,
    },
  });

  const occurrences = generateOccurrences({ freq: updated.freq, interval: updated.interval, byWeekday: updated.byWeekday, byWeekdayOrdinal: updated.byWeekdayOrdinal, startDate: updated.startDate, endDate: updated.endDate, startTime: updated.startTime, endTime: updated.endTime, allDay: updated.allDay });
  await prisma.calendarEvent.deleteMany({ where: { recurrenceId: rec.id } });
  await prisma.calendarEvent.createMany({
    data: occurrences.map((o) => ({ orgId: req.user.orgId, title: updated.title, description: updated.description, location: updated.location, linkUrl: updated.linkUrl, startAt: o.startAt, endAt: o.endAt, allDay: updated.allDay, visibility: updated.visibility, color: updated.color, source: "manual", recurrenceId: rec.id })),
  });

  const events = await prisma.calendarEvent.findMany({ where: { recurrenceId: rec.id }, orderBy: { startAt: "asc" } });
  res.json({ recurrence: updated, events });
});

router.delete("/recurrences/:id", requirePermission("calendar", "Admin"), async (req, res) => {
  const rec = await prisma.calendarRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring event not found" });
  await prisma.calendarEvent.deleteMany({ where: { recurrenceId: rec.id } });
  await prisma.calendarRecurrence.delete({ where: { id: rec.id } });
  res.json({ ok: true });
});

module.exports = router;
