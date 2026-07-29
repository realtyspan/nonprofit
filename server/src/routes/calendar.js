const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { generateOccurrences } = require("../lib/recurrence");

const router = express.Router();
router.use(requireAuth, loadPermissions);

router.get("/events", requireReadAccess("calendar"), async (req, res) => {
  const { start, end } = req.query;
  const where = { orgId: req.user.orgId };
  if (start && end) {
    where.startAt = { lte: new Date(end) };
    where.endAt = { gte: new Date(start) };
  }
  const events = await prisma.calendarEvent.findMany({ where, orderBy: { startAt: "asc" } });
  res.json(events);
});

// Fetches a recurring series' rule (not its materialized occurrences) so the
// "edit entire series" form can be pre-filled with the current pattern.
router.get("/recurrences/:id", requireReadAccess("calendar"), async (req, res) => {
  const rec = await prisma.calendarRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring event not found" });
  res.json(rec);
});

// One-off event, or the first materialization of a recurring series (recurrence provided in body).
router.post("/events", requirePermission("calendar", "Admin"), async (req, res) => {
  const { title, description, startAt, endAt, allDay, visibility, color, recurrence } = req.body;
  if (!title || !startAt || !endAt) return res.status(400).json({ error: "Missing required fields" });

  if (!recurrence) {
    const event = await prisma.calendarEvent.create({
      data: { orgId: req.user.orgId, title, description, startAt: new Date(startAt), endAt: new Date(endAt), allDay: !!allDay, visibility: visibility || "internal", color, source: "manual" },
    });
    return res.json(event);
  }

  const { freq, interval, byWeekday, byWeekdayOrdinal, startDate, endDate, startTime, endTime } = recurrence;
  if (!freq || !startDate || !endDate) return res.status(400).json({ error: "Recurrence needs freq, startDate, and endDate" });

  const rec = await prisma.calendarRecurrence.create({
    data: {
      orgId: req.user.orgId, title, description, allDay: !!allDay, visibility: visibility || "internal", color,
      freq, interval: Number(interval) || 1, byWeekday: byWeekday || null, byWeekdayOrdinal: byWeekdayOrdinal || null,
      startDate: new Date(startDate), endDate: new Date(endDate), startTime: startTime || "00:00", endTime: endTime || "00:00",
    },
  });

  const occurrences = generateOccurrences({ freq: rec.freq, interval: rec.interval, byWeekday: rec.byWeekday, byWeekdayOrdinal: rec.byWeekdayOrdinal, startDate: rec.startDate, endDate: rec.endDate, startTime: rec.startTime, endTime: rec.endTime, allDay: rec.allDay });
  if (occurrences.length === 0) return res.status(400).json({ error: "That recurrence rule doesn't produce any occurrences in range" });

  await prisma.calendarEvent.createMany({
    data: occurrences.map((o) => ({ orgId: req.user.orgId, title, description, startAt: o.startAt, endAt: o.endAt, allDay: !!allDay, visibility: visibility || "internal", color, source: "manual", recurrenceId: rec.id })),
  });

  const events = await prisma.calendarEvent.findMany({ where: { recurrenceId: rec.id }, orderBy: { startAt: "asc" } });
  res.json({ recurrence: rec, events });
});

// Edits a single occurrence in place — does not affect the rest of a series.
router.patch("/events/:id", requirePermission("calendar", "Admin"), async (req, res) => {
  const event = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.source !== "manual") return res.status(400).json({ error: "This event is managed by another module — edit it from there" });

  const { title, description, startAt, endAt, allDay, visibility, color } = req.body;
  const updated = await prisma.calendarEvent.update({
    where: { id: event.id },
    data: { title, description, startAt: startAt ? new Date(startAt) : undefined, endAt: endAt ? new Date(endAt) : undefined, allDay, visibility, color },
  });
  res.json(updated);
});

router.delete("/events/:id", requirePermission("calendar", "Admin"), async (req, res) => {
  const event = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.source !== "manual") return res.status(400).json({ error: "This event is managed by another module — remove it from there" });
  await prisma.calendarEvent.delete({ where: { id: event.id } });
  res.json({ ok: true });
});

// Edits the whole series: updates the rule and fully regenerates its occurrences.
// Simpler than trying to preserve already-edited single occurrences on regen —
// events here are informational, not an audit trail, so this tradeoff is fine.
router.patch("/recurrences/:id", requirePermission("calendar", "Admin"), async (req, res) => {
  const rec = await prisma.calendarRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring event not found" });

  const { title, description, allDay, visibility, color, freq, interval, byWeekday, byWeekdayOrdinal, startDate, endDate, startTime, endTime } = req.body;
  const updated = await prisma.calendarRecurrence.update({
    where: { id: rec.id },
    data: {
      title, description, allDay: allDay !== undefined ? !!allDay : undefined, visibility, color,
      freq, interval: interval !== undefined ? Number(interval) : undefined, byWeekday: byWeekday || null, byWeekdayOrdinal: byWeekdayOrdinal !== undefined ? (byWeekdayOrdinal || null) : undefined,
      startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined,
      startTime, endTime,
    },
  });

  const occurrences = generateOccurrences({ freq: updated.freq, interval: updated.interval, byWeekday: updated.byWeekday, byWeekdayOrdinal: updated.byWeekdayOrdinal, startDate: updated.startDate, endDate: updated.endDate, startTime: updated.startTime, endTime: updated.endTime, allDay: updated.allDay });
  await prisma.calendarEvent.deleteMany({ where: { recurrenceId: rec.id } });
  await prisma.calendarEvent.createMany({
    data: occurrences.map((o) => ({ orgId: req.user.orgId, title: updated.title, description: updated.description, startAt: o.startAt, endAt: o.endAt, allDay: updated.allDay, visibility: updated.visibility, color: updated.color, source: "manual", recurrenceId: rec.id })),
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
