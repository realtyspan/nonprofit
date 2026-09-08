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

router.get("/:slug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const activities = await prisma.calendarEvent.findMany({
    where: { orgId: org.id, visibility: "public", source: { in: ACTIVITY_SOURCES }, endAt: { gte: new Date() } },
    select: { id: true, title: true, description: true, location: true, linkUrl: true, startAt: true, endAt: true, allDay: true, source: true },
    orderBy: { startAt: "asc" },
    take: MAX_ACTIVITIES,
  });

  res.json({ orgName: org.name, activities });
});

module.exports = router;
