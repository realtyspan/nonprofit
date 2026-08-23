const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { computeRentalQuote, hasConflict, computeBookingBalance } = require("../lib/rentalLogic");
const { generateOccurrences } = require("../lib/recurrence");
const { lodgeDateTimeStringToUtc } = require("../lib/timezone");
const { buildRentalContractPdf } = require("../lib/rentalContractPdf");
const { publishRentalBooking, publishRentalBlock, removeCalendarEventFor } = require("../lib/calendarSync");
const { addRentalLog } = require("../lib/rentalLog");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// Denormalized actorName on every RentalLog row needs the caller's current
// display name — the JWT only carries userId/orgId, so load it fresh once
// per request, same pattern as raffle.js's req.callerUser.
router.use(async (req, res, next) => {
  req.callerUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, name: true } });
  next();
});

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
    include: { space: true, payments: true },
    orderBy: { startAt: "asc" },
  });
  res.json(bookings.map((b) => ({ ...b, ...computeBookingBalance(b) })));
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
      wantsLinen: !!req.body.wantsLinen,
      roundTables: Number(req.body.roundTables) || 0,
      longTables: Number(req.body.longTables) || 0,
      chairs: Number(req.body.chairs) || 0,
      kitchenUse: req.body.kitchenUse || null,
      chafingDishes: Number(req.body.chafingDishes) || 0,
      notes: req.body.notes,
    },
  });
  await addRentalLog(req.user.orgId, booking.id, {
    type: "created", text: `Inquiry logged for ${booking.renterName}`, actorName: req.callerUser?.name,
  });
  res.json(booking);
});

// Human-readable labels for the RentalLog "Edited: ..." diff summary below —
// only fields a staff member can actually change on the edit form, compared
// before vs. after the update actually lands (not the raw request body, so
// a field sent unchanged never falsely shows up as edited).
const EDIT_FIELD_LABELS = {
  spaceId: "space", renterName: "renter name", renterEmail: "email", renterPhone: "phone", renterAddress: "address",
  isMember: "member status", eventType: "event type", expectedGuests: "guest count",
  startAt: "start time", endAt: "end time", wantsBartender: "bartender", wantsLinen: "linen",
  roundTables: "round tables", longTables: "long tables", chairs: "chairs", kitchenUse: "kitchen use",
  chafingDishes: "chafing dishes", notes: "notes", quotedTotal: "quoted total",
};

// Edits are only allowed before a booking is locked into a final state —
// either by status (declined/cancelled/completed are history, not editable)
// or by fundsDepositedAt, which locks a confirmed booking's own details once
// its money has actually been turned in (see /mark-funds-deposited below).
router.patch("/bookings/:id", requirePermission("rentals", "Helper"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!["inquiry", "confirmed"].includes(booking.status)) {
    return res.status(400).json({ error: "This booking is no longer editable" });
  }
  if (booking.fundsDepositedAt) {
    return res.status(400).json({ error: "Funds have been deposited — unlock this booking for correction before editing" });
  }

  const {
    spaceId, renterName, renterEmail, renterPhone, renterAddress, isMember, eventType, expectedGuests,
    startAt, endAt, wantsBartender, wantsLinen, roundTables, longTables, chairs, kitchenUse, chafingDishes, notes,
    quotedTotal,
  } = req.body;

  // The quoted total is real money already committed to on a confirmed
  // booking — same Admin bar as setting it in the first place at /confirm,
  // not the Helper level the rest of this route allows.
  if (quotedTotal !== undefined && req.moduleGrants.rentals !== "Admin") {
    return res.status(403).json({ error: "Only a Rentals Admin can adjust the quoted total" });
  }

  let newSpace = null;
  if (spaceId && spaceId !== booking.spaceId) {
    newSpace = await prisma.rentalSpace.findFirst({ where: { id: spaceId, orgId: req.user.orgId } });
    if (!newSpace) return res.status(404).json({ error: "Space not found" });
  }

  // A confirmed booking already occupies a slot on the calendar — moving it
  // to a new space or time needs the same conflict check /confirm runs, so
  // an edit can't silently create a double-booking. Not needed for a plain
  // inquiry since that never held a slot to begin with.
  if (booking.status === "confirmed" && (spaceId || startAt || endAt)) {
    const effectiveSpaceId = spaceId || booking.spaceId;
    const effectiveStart = startAt ? lodgeDateTimeStringToUtc(startAt) : booking.startAt;
    const effectiveEnd = endAt ? lodgeDateTimeStringToUtc(endAt) : booking.endAt;
    const [otherBookings, blocks] = await Promise.all([
      prisma.rentalBooking.findMany({ where: { spaceId: effectiveSpaceId, status: { in: ["confirmed", "completed"] } } }),
      prisma.rentalBlock.findMany({ where: { spaceId: effectiveSpaceId } }),
    ]);
    if (hasConflict(effectiveStart, effectiveEnd, otherBookings, blocks, booking.id)) {
      return res.status(409).json({ error: "This space is already booked or blocked for an overlapping time" });
    }
  }

  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: {
      spaceId: spaceId || undefined,
      renterName, renterEmail, renterPhone, renterAddress,
      isMember: isMember !== undefined ? !!isMember : undefined,
      eventType,
      expectedGuests: expectedGuests !== undefined ? Number(expectedGuests) || null : undefined,
      startAt: startAt ? lodgeDateTimeStringToUtc(startAt) : undefined,
      endAt: endAt ? lodgeDateTimeStringToUtc(endAt) : undefined,
      wantsBartender: wantsBartender !== undefined ? !!wantsBartender : undefined,
      wantsLinen: wantsLinen !== undefined ? !!wantsLinen : undefined,
      roundTables: roundTables !== undefined ? Number(roundTables) || 0 : undefined,
      longTables: longTables !== undefined ? Number(longTables) || 0 : undefined,
      chairs: chairs !== undefined ? Number(chairs) || 0 : undefined,
      kitchenUse,
      chafingDishes: chafingDishes !== undefined ? Number(chafingDishes) || 0 : undefined,
      notes,
      quotedTotal: quotedTotal !== undefined ? Number(quotedTotal) : undefined,
    },
  });

  // Keep the shared calendar in sync with whatever just changed — same
  // idempotent upsert /confirm uses, safe to re-run on every edit.
  if (booking.status === "confirmed") {
    const currentSpace = newSpace || await prisma.rentalSpace.findUnique({ where: { id: updated.spaceId } });
    await publishRentalBooking(req.user.orgId, updated, currentSpace);
  }

  const changedFields = Object.entries(EDIT_FIELD_LABELS)
    .filter(([key]) => {
      const before = booking[key] instanceof Date ? booking[key].getTime() : booking[key];
      const after = updated[key] instanceof Date ? updated[key].getTime() : updated[key];
      return before !== after;
    })
    .map(([, label]) => label);
  if (changedFields.length > 0) {
    await addRentalLog(req.user.orgId, booking.id, {
      type: "edited", text: `Edited: ${changedFields.join(", ")}`, actorName: req.callerUser?.name,
    });
  }

  res.json(updated);
});

// Marks the booking's collected funds as physically turned in/deposited —
// locks its own details (renter info, dates, space, pricing) against further
// edits from here on, same "lock once the money's real" pattern as a filed
// GC-7Q report. Payments, signing, and lifecycle actions are never gated on
// this. Reversible via /unlock below for a genuine correction.
router.post("/bookings/:id/mark-funds-deposited", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!["confirmed", "completed"].includes(booking.status)) {
    return res.status(400).json({ error: "Only a confirmed or completed booking can be marked as deposited" });
  }
  if (booking.fundsDepositedAt) return res.status(400).json({ error: "Already marked as deposited" });
  const updated = await prisma.rentalBooking.update({ where: { id: booking.id }, data: { fundsDepositedAt: new Date() } });
  await addRentalLog(req.user.orgId, booking.id, { type: "funds_deposited", text: "Funds marked deposited — booking locked", actorName: req.callerUser?.name });
  res.json(updated);
});

router.post("/bookings/:id/unlock", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!booking.fundsDepositedAt) return res.status(400).json({ error: "This booking isn't locked" });
  const updated = await prisma.rentalBooking.update({ where: { id: booking.id }, data: { fundsDepositedAt: null } });
  await addRentalLog(req.user.orgId, booking.id, { type: "unlocked", text: "Unlocked for correction", actorName: req.callerUser?.name });
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
  // The computed quote is only ever a starting point — staff can override it
  // in the Review modal for a discount, a comp, or anything the pricing
  // model doesn't account for. Falls back to the computed total if omitted
  // or not a real number, so existing callers (and a blank field) still work.
  const overrideTotal = Number(req.body.quotedTotal);
  const quotedTotal = req.body.quotedTotal != null && !Number.isNaN(overrideTotal) ? overrideTotal : quote.total;

  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: { status: "confirmed", quotedTotal, depositAmount },
  });
  await publishRentalBooking(req.user.orgId, updated, space);
  await addRentalLog(req.user.orgId, booking.id, {
    type: "confirmed", text: `Confirmed — total $${quotedTotal.toFixed(2)}, deposit $${(depositAmount || 0).toFixed(2)}`, actorName: req.callerUser?.name,
  });
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
  await addRentalLog(req.user.orgId, booking.id, {
    type: "declined", text: `Declined${req.body.declineReason ? ` — ${req.body.declineReason}` : ""}`, actorName: req.callerUser?.name,
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
  await addRentalLog(req.user.orgId, booking.id, { type: "cancelled", text: "Cancelled", actorName: req.callerUser?.name });
  res.json(updated);
});

router.post("/bookings/:id/complete", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status !== "confirmed") return res.status(400).json({ error: "Only a confirmed booking can be marked completed" });
  const updated = await prisma.rentalBooking.update({ where: { id: booking.id }, data: { status: "completed" } });
  await addRentalLog(req.user.orgId, booking.id, { type: "completed", text: "Marked completed", actorName: req.callerUser?.name });
  res.json(updated);
});

const HISTORY_STATUSES = ["completed", "declined", "cancelled"];

// Undoes a cancel/decline/complete made in error — lands on the status the
// booking was actually in before, not just "confirmed" for everything: a
// declined booking was never confirmed in the first place, so it goes back
// to an inquiry rather than skipping straight to confirmed.
router.post("/bookings/:id/restore", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!HISTORY_STATUSES.includes(booking.status)) {
    return res.status(400).json({ error: "Only a completed, declined, or cancelled booking can be restored" });
  }
  const restoredStatus = booking.status === "declined" ? "inquiry" : "confirmed";
  const updated = await prisma.rentalBooking.update({ where: { id: booking.id }, data: { status: restoredStatus, declineReason: null } });
  await addRentalLog(req.user.orgId, booking.id, {
    type: "restored", text: `Restored from ${booking.status} to ${restoredStatus}`, actorName: req.callerUser?.name,
  });
  res.json(updated);
});

// Permanently removes a booking logged in error. Same immutability rule as
// raffle games: once real activity exists (a payment recorded, a contract
// drawn or uploaded), the record is the history and Restore is the only way
// back — not Delete. Only a "clean" history entry with nothing real
// attached can be removed.
router.delete("/bookings/:id", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId }, include: { payments: true } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!HISTORY_STATUSES.includes(booking.status)) {
    return res.status(400).json({ error: "Only a completed, declined, or cancelled booking can be deleted" });
  }
  if (booking.payments.length > 0) {
    return res.status(400).json({ error: "This booking has payment records — restore it instead of deleting" });
  }
  if (booking.contractSignatureImage || booking.uploadedContractFile) {
    return res.status(400).json({ error: "This booking has a contract attached — restore it instead of deleting" });
  }
  await prisma.rentalBooking.delete({ where: { id: booking.id } });
  await removeCalendarEventFor("rental-booking", booking.id);
  res.json({ ok: true });
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
  await addRentalLog(req.user.orgId, booking.id, {
    type: "signed", text: `Contract signed in-app by ${signedName}`, actorName: req.callerUser?.name,
  });
  res.json(updated);
});

// A second, equally valid way to get a signed contract on record: some
// renters prefer a physical paper contract signed in person, which staff
// then scans/photographs and attaches here instead of drawing a signature
// in-app. Independent of /sign above — a booking can have either, both, or
// neither; nothing gates on one over the other.
router.post("/bookings/:id/contract-upload", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const { receiptFile, receiptFileName } = req.body;
  if (!receiptFile) return res.status(400).json({ error: "A signed contract file is required" });
  const updated = await prisma.rentalBooking.update({
    where: { id: booking.id },
    data: { uploadedContractFile: receiptFile, uploadedContractFileName: receiptFileName || null, uploadedContractAt: new Date() },
  });
  await addRentalLog(req.user.orgId, booking.id, {
    type: "contract_uploaded", text: `Signed contract uploaded${receiptFileName ? ` (${receiptFileName})` : ""}`, actorName: req.callerUser?.name,
  });
  res.json(updated);
});

// --- Payments ---
// One row per payment received or credit applied, instead of the old
// depositPaid/balancePaid booleans — any amount, any number of times, plus
// an "adjustment" type for a discount/comp that reduces the balance without
// money changing hands (see RentalPayment's schema comment).

router.get("/bookings/:id/payments", requireReadAccess("rentals"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const payments = await prisma.rentalPayment.findMany({ where: { bookingId: booking.id, orgId: req.user.orgId }, orderBy: { recordedAt: "desc" } });
  res.json(payments);
});

router.post("/bookings/:id/payments", requirePermission("rentals", "Admin"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const { amount, type, method, receiptNum, note } = req.body;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });
  if (!["payment", "adjustment"].includes(type)) return res.status(400).json({ error: "type must be payment or adjustment" });
  if (type === "payment" && !["cash", "check"].includes(method)) {
    return res.status(400).json({ error: "method must be cash or check for a payment" });
  }
  if (type === "adjustment" && !note?.trim()) {
    return res.status(400).json({ error: "A reason is required for an adjustment" });
  }

  const payment = await prisma.rentalPayment.create({
    data: {
      orgId: req.user.orgId, bookingId: booking.id, amount: amt, type,
      method: type === "payment" ? method : null,
      receiptNum: receiptNum || null, note: note || null,
      recordedByName: req.callerUser?.name || "",
    },
  });
  await addRentalLog(req.user.orgId, booking.id, {
    type: "payment_added",
    text: type === "payment" ? `Payment recorded: $${amt.toFixed(2)} (${method})` : `Adjustment recorded: $${amt.toFixed(2)} — ${note}`,
    actorName: req.callerUser?.name,
  });
  res.json(payment);
});

router.delete("/bookings/:id/payments/:paymentId", requirePermission("rentals", "Admin"), async (req, res) => {
  const payment = await prisma.rentalPayment.findFirst({ where: { id: req.params.paymentId, bookingId: req.params.id, orgId: req.user.orgId } });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  await prisma.rentalPayment.delete({ where: { id: payment.id } });
  await addRentalLog(req.user.orgId, req.params.id, {
    type: "payment_deleted",
    text: `${payment.type === "payment" ? "Payment" : "Adjustment"} of $${payment.amount.toFixed(2)} removed (originally recorded by ${payment.recordedByName || "someone"})`,
    actorName: req.callerUser?.name,
  });
  res.json({ ok: true });
});

router.get("/bookings/:id/logs", requireReadAccess("rentals"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const logs = await prisma.rentalLog.findMany({
    where: { bookingId: booking.id, orgId: req.user.orgId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json(logs);
});

router.get("/bookings/:id/contract.pdf", requireReadAccess("rentals"), async (req, res) => {
  const booking = await prisma.rentalBooking.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const [org, space, payments] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
    prisma.rentalSpace.findUnique({ where: { id: booking.spaceId } }),
    prisma.rentalPayment.findMany({ where: { bookingId: booking.id, orgId: req.user.orgId } }),
  ]);
  const quote = computeRentalQuote(space, booking);
  const balance = computeBookingBalance({ ...booking, payments });

  const pdfBytes = await buildRentalContractPdf({ org, space, booking, quote, balance });
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
