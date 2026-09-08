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

// Only ever called for a "published" Event (see events.js) — a draft or
// cancelled one has no business on the calendar at all, and removes any
// stale entry via removeCalendarEventFor("event", event.id) instead. The
// linkUrl sends Calendar's own "More info" straight to the full Events
// page for that event, deep-linked via its slug.
async function publishEvent(orgId, event, org) {
  const existing = await prisma.calendarEvent.findFirst({ where: { source: "event", sourceId: event.id } });
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const data = {
    title: event.title,
    description: event.tagline || event.description || null,
    location: event.location || null,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    visibility: "public",
    linkUrl: org?.slug ? `${appUrl}/events/${org.slug}?event=${event.slug}` : null,
  };
  if (existing) {
    await prisma.calendarEvent.update({ where: { id: existing.id }, data });
  } else {
    await prisma.calendarEvent.create({ data: { orgId, source: "event", sourceId: event.id, ...data } });
  }
}

async function removeCalendarEventFor(source, sourceId) {
  await prisma.calendarEvent.deleteMany({ where: { source, sourceId } });
}

// The three functions below feed the public Activities feed
// (publicActivities.js) — same shared table, same visibility flag, just
// three more sources. Golf has no per-tournament slug (its own public page
// always shows whatever's currently open), so every golf-tournament row
// points at the same org-wide URL; Tournaments links to the specific
// tournament's own slug since more than one can be open at once.

async function publishGolfTournament(orgId, tournament, org) {
  const existing = await prisma.calendarEvent.findFirst({ where: { source: "golf-tournament", sourceId: tournament.id } });
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const data = {
    title: tournament.name,
    location: tournament.venueName || null,
    startAt: tournament.date,
    endAt: tournament.date,
    allDay: true,
    visibility: "public",
    linkUrl: org?.slug ? `${appUrl}/golf/${org.slug}` : null,
  };
  if (existing) {
    await prisma.calendarEvent.update({ where: { id: existing.id }, data });
  } else {
    await prisma.calendarEvent.create({ data: { orgId, source: "golf-tournament", sourceId: tournament.id, ...data } });
  }
}

async function publishTournament(orgId, tournament, org) {
  const existing = await prisma.calendarEvent.findFirst({ where: { source: "tournament", sourceId: tournament.id } });
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const data = {
    title: tournament.name,
    location: tournament.venueName || null,
    startAt: tournament.date,
    endAt: tournament.date,
    allDay: true,
    visibility: "public",
    linkUrl: org?.slug ? `${appUrl}/tournaments/${org.slug}/${tournament.slug}` : null,
  };
  if (existing) {
    await prisma.calendarEvent.update({ where: { id: existing.id }, data });
  } else {
    await prisma.calendarEvent.create({ data: { orgId, source: "tournament", sourceId: tournament.id, ...data } });
  }
}

// Raffle has no public storefront page (ticket links are per-buyer, not a
// page a visitor browses to) — so unlike every other source here, this one
// never gets a linkUrl. Shows on Activities as an announcement only.
// Historical-import raffle rows never reach this function through the
// routes that call it, but the guard costs nothing and matches how other
// modules guard their own historical shells.
async function publishRaffleGame(orgId, game) {
  if (game.isHistorical) return;
  const existing = await prisma.calendarEvent.findFirst({ where: { source: "raffle-game", sourceId: game.id } });
  const data = {
    title: game.name,
    startAt: game.raffleStartDate,
    endAt: game.raffleEndDate,
    visibility: "public",
    linkUrl: null,
  };
  if (existing) {
    await prisma.calendarEvent.update({ where: { id: existing.id }, data });
  } else {
    await prisma.calendarEvent.create({ data: { orgId, source: "raffle-game", sourceId: game.id, ...data } });
  }
}

module.exports = {
  publishRentalBooking, publishRentalBlock, publishEvent, removeCalendarEventFor,
  publishGolfTournament, publishTournament, publishRaffleGame,
};
