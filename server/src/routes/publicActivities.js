const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// Every source that's genuinely something to market — an explicit allow
// list, not a deny list, so a brand-new source added to calendarSync.js
// later has to be deliberately opted in here rather than silently showing
// up. Rental bookings/blocks are the reason this isn't just "everything
// public": those are occupancy info ("Reserved — Banquet Hall"), already
// shown on the internal-facing PublicCalendar grid, but not something an
// org is trying to promote — so they're deliberately excluded here.
const ACTIVITY_SOURCES = ["event", "manual", "golf-tournament", "tournament", "raffle-game"];

// Soonest-first, capped well above what any real org would ever have
// genuinely open at once — this is a marketing page, not a paginated
// archive, so a hard cap is simpler than real pagination for now.
const MAX_ACTIVITIES = 100;

// This is a "what's new" feed, not a duplicate of the Calendar grid — a
// recurring entry (a weekly dinner, a standing meeting) would otherwise
// show up once per future occurrence and flood the list with something
// that isn't actually news. CalendarEvent.recurrenceId is only ever set
// on a row generated from a CalendarRecurrence, so excluding those here
// needs no new modeling.
router.get("/:slug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const activities = await prisma.calendarEvent.findMany({
    where: { orgId: org.id, visibility: "public", source: { in: ACTIVITY_SOURCES }, recurrenceId: null, endAt: { gte: new Date() } },
    select: { id: true, title: true, description: true, location: true, linkUrl: true, startAt: true, endAt: true, allDay: true, source: true, sourceId: true },
    orderBy: { startAt: "asc" },
    take: MAX_ACTIVITIES,
  });

  res.json({ orgName: org.name, activities });
});

// Same field lists publicGolf.js/publicTournaments.js already select for
// their own single-tournament public pages — reused here (not imported;
// each module's public route stays independent, same convention
// calendarSync.js's own three publish functions already follow) so the
// inline detail view renders from the exact same input a real visit to
// that tournament's own page would.
const GOLF_TOURNAMENT_DETAIL_FIELDS = {
  id: true, name: true, date: true, format: true, venueName: true, venueAddress: true,
  flyerImage: true, flyerImagePosition: true, costPerPlayer: true,
  includedItems: true, scheduleItems: true, contactName: true, contactPhone: true, contactEmail: true,
};
const TOURNAMENT_DETAIL_FIELDS = { ...GOLF_TOURNAMENT_DETAIL_FIELDS };

const EVENT_DETAIL_FIELDS = {
  id: true, slug: true, title: true, tagline: true, description: true, location: true,
  startAt: true, endAt: true, allDay: true, heroImage: true, secondaryImage: true,
  price: true, priceUnit: true, payUrl: true, sellsRaffleTickets: true, reservePhone: true, statusNote: true,
  contactName: true, contactEmail: true,
  admissionNote: true, includesHeading: true, includes: true, recurrenceLabel: true,
  scheduleItems: true,
  reservationsEnabled: true, reservationDeadline: true, offersTakeout: true,
};

// Fetches and shapes the full public detail for one Activities row, given
// the source/sourceId every list row already carries — a manual entry
// needs no extra fetch (the list row already has everything it has), so
// this only ever gets called for the other four sources. Always scoped to
// the org resolved from :slug, same as every other public lookup in this
// app — a sourceId alone is never trusted on its own.
router.get("/:slug/detail/:source/:sourceId", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const { source, sourceId } = req.params;

  if (source === "golf-tournament") {
    const t = await prisma.golfTournament.findFirst({ where: { id: sourceId, orgId: org.id }, select: GOLF_TOURNAMENT_DETAIL_FIELDS });
    if (!t) return res.status(404).json({ error: "Not found" });
    return res.json({ source, ...t });
  }

  if (source === "tournament") {
    const t = await prisma.tournament.findFirst({ where: { id: sourceId, orgId: org.id }, select: TOURNAMENT_DETAIL_FIELDS });
    if (!t) return res.status(404).json({ error: "Not found" });
    return res.json({ source, ...t });
  }

  if (source === "event") {
    const e = await prisma.event.findFirst({ where: { id: sourceId, orgId: org.id }, select: EVENT_DETAIL_FIELDS });
    if (!e) return res.status(404).json({ error: "Not found" });
    return res.json({ source, ...e });
  }

  if (source === "raffle-game") {
    const g = await prisma.raffleGame.findFirst({
      where: { id: sourceId, orgId: org.id },
      select: { id: true, name: true, ticketPrice: true, raffleStartDate: true, raffleEndDate: true, eventVenue: true, eventDetails: true },
    });
    if (!g) return res.status(404).json({ error: "Not found" });
    return res.json({ source, ...g });
  }

  res.status(404).json({ error: "Not found" });
});

module.exports = router;
