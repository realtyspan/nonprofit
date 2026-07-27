// Keeps the shared CalendarEvent table in sync with Rental data. Direct function
// calls rather than an event bus — this is a monolith, so a new module publishing
// to the calendar is just "call this after your write," same pattern every module
// after Rental should follow.
const prisma = require("./prisma");

// Title is privacy-safe by construction (no renter name/event type) since these
// events are visibility:"public" — the public calendar shows a rental as busy
// without exposing who booked it or why.
async function publishRentalBooking(orgId, booking, space) {
  const existing = await prisma.calendarEvent.findFirst({ where: { source: "rental-booking", sourceId: booking.id } });
  const data = {
    title: `Reserved — ${space.name}`,
    description: `${booking.renterName} · ${booking.eventType || "Private event"}`,
    startAt: booking.startAt,
    endAt: booking.endAt,
  };
  if (existing) {
    await prisma.calendarEvent.update({ where: { id: existing.id }, data });
  } else {
    await prisma.calendarEvent.create({ data: { orgId, source: "rental-booking", sourceId: booking.id, visibility: "public", ...data } });
  }
}

// An internal block (a meeting, a members-only function) still occupies the
// space, so by default it shows on the public calendar too — using the
// block's own `reason` as the label (e.g. "Trustees Meeting — Banquet Hall"),
// same as the admin sees, since staff wrote that reason themselves. Only
// hidden when the block's visibleOnPublicCalendar flag is explicitly off.
async function publishRentalBlock(orgId, block, space) {
  const existing = await prisma.calendarEvent.findFirst({ where: { source: "rental-block", sourceId: block.id } });
  const data = {
    title: `${block.reason || "Reserved"} — ${space.name}`,
    startAt: block.startAt,
    endAt: block.endAt,
    visibility: block.visibleOnPublicCalendar ? "public" : "internal",
  };
  if (existing) {
    await prisma.calendarEvent.update({ where: { id: existing.id }, data });
  } else {
    await prisma.calendarEvent.create({ data: { orgId, source: "rental-block", sourceId: block.id, ...data } });
  }
}

async function removeCalendarEventFor(source, sourceId) {
  await prisma.calendarEvent.deleteMany({ where: { source, sourceId } });
}

module.exports = { publishRentalBooking, publishRentalBlock, removeCalendarEventFor };
