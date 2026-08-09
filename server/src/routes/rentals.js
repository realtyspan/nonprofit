const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { computeRentalQuote, hasConflict } = require("../lib/rentalLogic");
const { generateOccurrences } = require("../lib/recurrence");
const { lodgeDateTimeStringToUtc } = require("../lib/timezone");
const { buildRentalContractPdf } = require("../lib/rentalContractPdf");
const { publishRentalBooking, publishRentalBlock, removeCalendarEventFor } = require("../lib/calendarSync");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// --- Spaces ---

router.get("/spaces", requireReadAccess("rentals"), async (req, res) => {
  const spaces = await prisma.rentalSpace.findMany({ where: { orgId: req.user.orgId }, orderBy: { name: "asc" } });
  res.json(spaces);
});

router.post("/spaces", requirePermission("rentals", "Admin"), async (req, res) => {
  const space = await prisma.rentalSpace.create({ data: { ...req.body, orgId: req.user.orgId } });
  res.json(space);
});

router.patch("/spaces/:id", requirePermission("rentals", "Admin"), async (req, res) => {
  const space = await prisma.rentalSpace.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!space) return res.status(404).json({ error: "Space not found" });
  const updated = await prisma.rentalSpace.update({ where: { id: space.id }, data: req.body });
  res.json(updated);
});

// --- Bookings ---

router.get("/bookings", requireReadAccess("rentals"), async (req, res) => {
  const where = { orgId: req.user.orgId };
  if (req.query.status) where.status = req.query.status;
  const bookings = await prisma.rentalBooking.findMany({
    where,
    include: { space: true },
    orderBy: { startAt: "asc" },
  });
  res.json(bookings);
});

// Staff-entered booking (phone/walk-in inquiry) — always starts as an inquiry,
// same as a public submission; staff still has to confirm it.
router.post("/bookings", requirePermission("rentals", "Helper"), async (req, res) => {
  const space = await prisma.rentalSpace.findFirst({ where: { id: req.body.spaceId, orgId: req.user.orgId } });
  if (!space) return res.status(404).json({ error: "Space not found" });

  const booking = await prisma.rentalBooking.create({
    data: {
      orgId: req.user.orgId,
      spaceId: space.id,
      renterName: req.body.renterName,
      renterEmail: req.body.renterEmail,
      renterPhone: req.body.renterPhone,
      renterAddress: req.body.renterAddress,
      isMember: !!req.body.isMember,
      eventType: req.body.eventType,
      expectedGuests: req.body.expectedGuests ? Number(req.body.expectedGuests) : null,
      startAt: lodgeDateTimeStringToUtc(req.body.startAt),
      endAt: lodgeDateTimeStringToUtc(req.body.endAt),
      wantsBartender: !!req.body.wantsBartender,
      roundTables: Number(req.body.roundTables) || 0,
      longTables: Number(req.body.longTables) || 0,
      chairs: Number(req.body.chairs) || 0,
      kitchenUse: req.body.kitchenUse || null,
      chafingDishes: Number(req.body.chafingDishes) || 0,
      notes: req.body.notes,
    },
  });
  res.json(booking);
});

// Edits are only allowed before a booking is locked into a final state.
router.patch("/bookings/:id", requirePermission("rentals", "Helper"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!["inquiry", "confirmed"].includes(booking.status)) {
    return res.status(400).json({ error: "This booking is no longer editable" });
  }

  const {
    renterName, renterEmail, renterPhone, renterAddress, isMember, eventType, expectedGuests,
    startAt, endAt, wantsBartender, roundTables, longTables, chairs, kitchenUse, chafingDishes, notes,
  } = req.body;

  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: {
      renterName, renterEmail, renterPhone, renterAddress,
      isMember: isMember !== undefined ? !!isMember : undefined,
      eventType,
      expectedGuests: expectedGuests !== undefined ? Number(expectedGuests) || null : undefined,
      startAt: startAt ? lodgeDateTimeStringToUtc(startAt) : undefined,
      endAt: endAt ? lodgeDateTimeStringToUtc(endAt) : undefined,
      wantsBartender: wantsBartender !== undefined ? !!wantsBartender : undefined,
      roundTables: roundTables !== undefined ? Number(roundTables) || 0 : undefined,
      longTables: longTables !== undefined ? Number(longTables) || 0 : undefined,
      chairs: chairs !== undefined ? Number(chairs) || 0 : undefined,
      kitchenUse,
      chafingDishes: chafingDishes !== undefined ? Number(chafingDishes) || 0 : undefined,
      notes,
    },
  });
  res.json(updated);
});

// Approves an inquiry: checks for conflicts against other confirmed bookings/blocks,
// computes the quoted total off the space's current rates, and defaults the deposit.
router.post("/bookings/:id/confirm", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status !== "inquiry") return res.status(400).json({ error: "Only a pending inquiry can be confirmed" });

  const space = await prisma.rentalSpace.findUnique({ where: { id: booking.spaceId } });

  const [otherBookings, blocks] = await Promise.all([
    prisma.rentalBooking.findMany({ where: { spaceId: space.id, status: { in: ["confirmed", "completed"] } } }),
    prisma.rentalBlock.findMany({ where: { spaceId: space.id } }),
  ]);
  if (hasConflict(booking.startAt, booking.endAt, otherBookings, blocks, booking.id)) {
    return res.status(409).json({ error: "This space is already booked or blocked for an overlapping time" });
  }

  const quote = computeRentalQuote(space, booking);
  const depositAmount = req.body.depositAmount != null ? Number(req.body.depositAmount) : space.depositAmount;

  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: { status: "confirmed", quotedTotal: quote.total, depositAmount },
  });
  await publishRentalBooking(req.user.orgId, updated, space);
  res.json({ ...updated, quote });
});

router.post("/bookings/:id/decline", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status !== "inquiry") return res.status(400).json({ error: "Only a pending inquiry can be declined" });
  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: { status: "declined", declineReason: req.body.declineReason || null },
  });
  res.json(updated);
});

router.post("/bookings/:id/cancel", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!["inquiry", "confirmed"].includes(booking.status)) {
    return res.status(400).json({ error: "This booking can no longer be cancelled" });
  }
  const updated = await prisma.rentalBooking.update({ where: { id: booking.id }, data: { status: "cancelled" } });
  await removeCalendarEventFor("rental-booking", booking.id);
  res.json(updated);
});

router.post("/bookings/:id/complete", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status !== "confirmed") return res.status(400).json({ error: "Only a confirmed booking can be marked completed" });
  const updated = await prisma.rentalBooking.update({ where: { id: booking.id }, data: { status: "completed" } });
  res.json(updated);
});

// Captures an in-person drawn signature (staff hands their device to the
// renter at the counter) — a canvas image plus IP and timestamp for a basic
// audit trail. Not a substitute for a dedicated e-sign vendor's identity
// verification, but appropriate for a hall rental's stakes.
router.post("/bookings/:id/sign", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const { signedName, signatureImage } = req.body;
  if (!signedName) return res.status(400).json({ error: "Printed name is required" });
  if (!signatureImage) return res.status(400).json({ error: "A drawn signature is required" });
  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: { contractSignedName: signedName, contractSignatureImage: signatureImage, contractSignedIp: req.ip, contractSignedAt: new Date() },
  });
  res.json(updated);
});

router.patch("/bookings/:id/payment", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const { depositPaid, depositMethod, depositReceiptNum, balancePaid, balanceMethod } = req.body;
  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: {
      depositPaid: depositPaid !== undefined ? !!depositPaid : undefined,
      depositMethod,
      depositReceivedAt: depositPaid ? new Date() : undefined,
      depositReceiptNum,
      balancePaid: balancePaid !== undefined ? !!balancePaid : undefined,
      balanceMethod,
      balancePaidAt: balancePaid ? new Date() : undefined,
    },
  });
  res.json(updated);
});

router.get("/bookings/:id/contract.pdf", requireReadAccess("rentals"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const [org, space] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
    prisma.rentalSpace.findUnique({ where: { id: booking.spaceId } }),
  ]);
  const quote = computeRentalQuote(space, booking);

  const pdfBytes = await buildRentalContractPdf({ org, space, booking, quote });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Rental_${booking.renterName.replace(/\s+/g, "_")}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

// --- Internal blocks (lodge's own use, no renter/contract) ---
// The single tool for "this space is unavailable" for an internal reason — a
// meeting, a members-only function, maintenance. Recurring blocks matter here
// (most lodges meet on a standing twice-monthly schedule) and use the same
// materialize-occurrences approach as Calendar's recurring events.

async function findConflictingOccurrences(spaceId, occurrences, excludeBlockIds = []) {
  const [bookings, blocks] = await Promise.all([
    prisma.rentalBooking.findMany({ where: { spaceId, status: { in: ["confirmed", "completed"] } } }),
    prisma.rentalBlock.findMany({ where: { spaceId, id: { notIn: excludeBlockIds } } }),
  ]);
  return occurrences.filter((o) => hasConflict(o.startAt, o.endAt, bookings, blocks));
}

router.get("/blocks", requireReadAccess("rentals"), async (req, res) => {
  const blocks = await prisma.rentalBlock.findMany({ where: { orgId: req.user.orgId }, include: { space: true }, orderBy: { startAt: "asc" } });
  res.json(blocks);
});

router.get("/block-recurrences/:id", requireReadAccess("rentals"), async (req, res) => {
  const rec = await prisma.rentalBlockRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring block not found" });
  res.json(rec);
});

// One-off block, or the first materialization of a recurring series
// (recurrence provided in body). Conflict-checked all-or-nothing — a series
// either fits entirely or nothing is created, so staff see exactly which
// dates need manual resolution instead of a half-created series.
router.post("/blocks", requirePermission("rentals", "Admin"), async (req, res) => {
  const space = await prisma.rentalSpace.findFirst({ where: { id: req.body.spaceId, orgId: req.user.orgId } });
  if (!space) return res.status(404).json({ error: "Space not found" });

  const { reason, recurrence } = req.body;
  const visible = req.body.visibleOnPublicCalendar !== undefined ? !!req.body.visibleOnPublicCalendar : true;

  if (!recurrence) {
    const startAt = lodgeDateTimeStringToUtc(req.body.startAt);
    const endAt = lodgeDateTimeStringToUtc(req.body.endAt);
    const conflicts = await findConflictingOccurrences(space.id, [{ startAt, endAt }]);
    if (conflicts.length > 0) {
      return res.status(409).json({ error: "This space already has a booking or block for an overlapping time" });
    }
    const block = await prisma.rentalBlock.create({
      data: { orgId: req.user.orgId, spaceId: space.id, startAt, endAt, reason, visibleOnPublicCalendar: visible },
    });
    await publishRentalBlock(req.user.orgId, block, space);
    return res.json(block);
  }

  const { freq, interval, byWeekday, byWeekdayOrdinal, startDate, endDate, startTime, endTime } = recurrence;
  if (!freq || !startDate || !endDate) return res.status(400).json({ error: "Recurrence needs freq, startDate, and endDate" });

  const occurrences = generateOccurrences({
    freq, interval: Number(interval) || 1, byWeekday: byWeekday || null, byWeekdayOrdinal: byWeekdayOrdinal || null,
    startDate: new Date(startDate), endDate: new Date(endDate), startTime: startTime || "00:00", endTime: endTime || "00:00", allDay: false,
  });
  if (occurrences.length === 0) return res.status(400).json({ error: "That recurrence rule doesn't produce any occurrences in range" });

  const conflicts = await findConflictingOccurrences(space.id, occurrences);
  if (conflicts.length > 0) {
    return res.status(409).json({
      error: "Some dates in this series conflict with an existing booking or block — resolve those first",
      conflicts: conflicts.map((c) => c.startAt),
    });
  }

  const rec = await prisma.rentalBlockRecurrence.create({
    data: {
      orgId: req.user.orgId, spaceId: space.id, reason, visibleOnPublicCalendar: visible,
      freq, interval: Number(interval) || 1, byWeekday: byWeekday || null, byWeekdayOrdinal: byWeekdayOrdinal || null,
      startDate: new Date(startDate), endDate: new Date(endDate), startTime: startTime || "00:00", endTime: endTime || "00:00",
    },
  });

  await prisma.rentalBlock.createMany({
    data: occurrences.map((o) => ({ orgId: req.user.orgId, spaceId: space.id, startAt: o.startAt, endAt: o.endAt, reason, visibleOnPublicCalendar: visible, recurrenceId: rec.id })),
  });

  const blocks = await prisma.rentalBlock.findMany({ where: { recurrenceId: rec.id }, orderBy: { startAt: "asc" } });
  for (const b of blocks) await publishRentalBlock(req.user.orgId, b, space);

  res.json({ recurrence: rec, blocks });
});

// Edits a single occurrence in place — does not affect the rest of a series.
router.patch("/blocks/:id", requirePermission("rentals", "Admin"), async (req, res) => {
  const block = await prisma.rentalBlock.findFirst({ where: { id: req.params.id, orgId: req.user.orgId }, include: { space: true } });
  if (!block) return res.status(404).json({ error: "Block not found" });
  if (block.calendarEventId) return res.status(400).json({ error: "This block is managed by a Calendar event — edit it from there" });

  const { reason, visibleOnPublicCalendar, startAt, endAt } = req.body;
  const newStart = startAt ? lodgeDateTimeStringToUtc(startAt) : block.startAt;
  const newEnd = endAt ? lodgeDateTimeStringToUtc(endAt) : block.endAt;

  if (startAt || endAt) {
    const conflicts = await findConflictingOccurrences(block.spaceId, [{ startAt: newStart, endAt: newEnd }], [block.id]);
    if (conflicts.length > 0) return res.status(409).json({ error: "This space already has a booking or block for an overlapping time" });
  }

  const updated = await prisma.rentalBlock.update({
    where: { id: block.id },
    data: { reason, visibleOnPublicCalendar: visibleOnPublicCalendar !== undefined ? !!visibleOnPublicCalendar : undefined, startAt: newStart, endAt: newEnd },
  });
  await publishRentalBlock(req.user.orgId, updated, block.space);
  res.json(updated);
});

router.delete("/blocks/:id", requirePermission("rentals", "Admin"), async (req, res) => {
  const block = await prisma.rentalBlock.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!block) return res.status(404).json({ error: "Block not found" });
  if (block.calendarEventId) return res.status(400).json({ error: "This block is managed by a Calendar event — remove it from there" });
  await prisma.rentalBlock.delete({ where: { id: block.id } });
  await removeCalendarEventFor("rental-block", block.id);
  res.json({ ok: true });
});

// Edits the whole series: regenerates its occurrences from the updated rule.
// Simpler than preserving per-occurrence edits on regen — same tradeoff as
// Calendar's recurring events, and for the same reason (these aren't an audit
// trail). All-or-nothing conflict check against the *other* bookings/blocks,
// excluding this series' own (about-to-be-replaced) occurrences.
router.patch("/block-recurrences/:id", requirePermission("rentals", "Admin"), async (req, res) => {
  const rec = await prisma.rentalBlockRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring block not found" });
  const space = await prisma.rentalSpace.findUnique({ where: { id: rec.spaceId } });

  const { reason, visibleOnPublicCalendar, freq, interval, byWeekday, byWeekdayOrdinal, startDate, endDate, startTime, endTime } = req.body;
  const rule = {
    freq: freq || rec.freq,
    interval: interval !== undefined ? Number(interval) : rec.interval,
    byWeekday: byWeekday !== undefined ? (byWeekday || null) : rec.byWeekday,
    byWeekdayOrdinal: byWeekdayOrdinal !== undefined ? (byWeekdayOrdinal || null) : rec.byWeekdayOrdinal,
    startDate: startDate ? new Date(startDate) : rec.startDate,
    endDate: endDate ? new Date(endDate) : rec.endDate,
    startTime: startTime || rec.startTime,
    endTime: endTime || rec.endTime,
  };

  const occurrences = generateOccurrences({ ...rule, allDay: false });
  if (occurrences.length === 0) return res.status(400).json({ error: "That recurrence rule doesn't produce any occurrences in range" });

  const existingBlockIds = (await prisma.rentalBlock.findMany({ where: { recurrenceId: rec.id }, select: { id: true } })).map((b) => b.id);
  const conflicts = await findConflictingOccurrences(rec.spaceId, occurrences, existingBlockIds);
  if (conflicts.length > 0) {
    return res.status(409).json({
      error: "Some dates in this series conflict with an existing booking or block — resolve those first",
      conflicts: conflicts.map((c) => c.startAt),
    });
  }

  const updated = await prisma.rentalBlockRecurrence.update({
    where: { id: rec.id },
    data: { reason, visibleOnPublicCalendar: visibleOnPublicCalendar !== undefined ? !!visibleOnPublicCalendar : undefined, ...rule },
  });

  for (const id of existingBlockIds) await removeCalendarEventFor("rental-block", id);
  await prisma.rentalBlock.deleteMany({ where: { recurrenceId: rec.id } });
  await prisma.rentalBlock.createMany({
    data: occurrences.map((o) => ({ orgId: req.user.orgId, spaceId: rec.spaceId, startAt: o.startAt, endAt: o.endAt, reason: updated.reason, visibleOnPublicCalendar: updated.visibleOnPublicCalendar, recurrenceId: rec.id })),
  });

  const blocks = await prisma.rentalBlock.findMany({ where: { recurrenceId: rec.id }, orderBy: { startAt: "asc" } });
  for (const b of blocks) await publishRentalBlock(req.user.orgId, b, space);

  res.json({ recurrence: updated, blocks });
});

router.delete("/block-recurrences/:id", requirePermission("rentals", "Admin"), async (req, res) => {
  const rec = await prisma.rentalBlockRecurrence.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!rec) return res.status(404).json({ error: "Recurring block not found" });
  const blockIds = (await prisma.rentalBlock.findMany({ where: { recurrenceId: rec.id }, select: { id: true } })).map((b) => b.id);
  for (const id of blockIds) await removeCalendarEventFor("rental-block", id);
  await prisma.rentalBlock.deleteMany({ where: { recurrenceId: rec.id } });
  await prisma.rentalBlockRecurrence.delete({ where: { id: rec.id } });
  res.json({ ok: true });
});

module.exports = router;
