const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../lib/rateLimit");
const { stripPhone } = require("../lib/phone");
const { resolveEventAlertRecipients } = require("../lib/eventAlerts");
const { eventInterestAlertHtml } = require("../lib/eventInterestEmail");
const { sendEmail } = require("../lib/notifications");

const router = express.Router();

// Same trivial normalize every other module's own logic file defines
// independently (golfLogic.js, tournamentLogic.js, etc.) rather than
// sharing one canonical helper — Events has no logic file of its own to
// put this in, so it lives here instead.
function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

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
      reservePhone: true, contactName: true, contactEmail: true, statusNote: true, admissionNote: true, includesHeading: true, includes: true,
      scheduleItems: true,
    },
  });

  res.json({ orgName: org.name, events });
});

// Captures a "notify me" lead when a visitor lands on the page with nothing
// published — see PublicEvents.jsx's empty-state NotifyForm. `website` is a
// honeypot field, same convention as every other public route in this app.
// Direct port of publicTournaments.js's own POST /:orgSlug/interest, minus
// the role/type fields Events has no use for.
router.post(
  "/:slug/interest",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) return res.json({ ok: true }); // silently drop suspected bot submissions

    const { name, email, phone, note } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = stripPhone(phone);
    if (!normalizedEmail && !normalizedPhone) return res.status(400).json({ error: "Enter an email or phone number so we can reach you" });

    const signup = await prisma.eventInterestSignup.create({
      data: {
        orgId: org.id,
        name: name.trim(),
        email: normalizedEmail || "",
        phone: normalizedPhone || "",
        note: note && note.trim() ? note.trim() : null,
      },
    });
    res.json({ ok: true });

    // Fire-and-forget: the signup is already saved and the visitor already
    // has their on-screen confirmation, so an alert-email hiccup here
    // shouldn't turn into a failed request.
    const recipients = await resolveEventAlertRecipients(org.id, org);
    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient.email, toName: recipient.name,
          subject: `New event interest signup — ${signup.name}`,
          html: eventInterestAlertHtml({ signup, org }),
          fromName: org.name, replyTo: signup.email || undefined,
        });
      } catch (err) {
        console.error(`Event interest alert email failed for signup ${signup.id} -> ${recipient.email}:`, err.message);
      }
    }
  }
);

module.exports = router;
