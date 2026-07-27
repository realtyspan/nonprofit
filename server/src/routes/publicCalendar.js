const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// Public events only. `description` is safe to show for manually-created
// public events (the admin wrote it knowing the event is public), but a
// rental-booking's description holds the renter's name/event type for the
// internal admin view — that one gets stripped here. The title needs no such
// handling since rental-sourced titles are already privacy-safe by
// construction ("Reserved — Banquet Hall"), set at publish time in rentals.js.
router.get("/:slug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const { start, end } = req.query;
  const where = { orgId: org.id, visibility: "public" };
  if (start && end) {
    where.startAt = { lte: new Date(end) };
    where.endAt = { gte: new Date(start) };
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    select: { id: true, title: true, description: true, startAt: true, endAt: true, allDay: true, color: true, source: true },
    orderBy: { startAt: "asc" },
  });

  const sanitized = events.map(({ source, description, ...rest }) => ({
    ...rest,
    description: source === "rental-booking" ? null : description,
  }));

  res.json({ orgName: org.name, events: sanitized });
});

module.exports = router;
