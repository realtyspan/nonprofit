const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// The full public Events page for one org: every published, not-yet-ended
// event, soonest first — the client (PublicEvents.jsx) assumes exactly this
// ordering and filtering, per the design's own data-contract note.
router.get("/:slug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const events = await prisma.event.findMany({
    where: { orgId: org.id, status: "published", endAt: { gte: new Date() } },
    orderBy: { startAt: "asc" },
    select: {
      slug: true, title: true, shortTitle: true, tagline: true, description: true,
      location: true, startAt: true, endAt: true, allDay: true, recurrenceLabel: true,
      heroImage: true, secondaryImage: true, price: true, priceUnit: true, payUrl: true,
      reservePhone: true, statusNote: true, admissionNote: true, includesHeading: true, includes: true,
    },
  });

  res.json({ orgName: org.name, events });
});

module.exports = router;
