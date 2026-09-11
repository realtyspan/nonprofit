const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../lib/rateLimit");
const { stripPhone } = require("../lib/phone");
const { resolveEventAlertRecipients } = require("../lib/eventAlerts");
const { eventInterestAlertHtml } = require("../lib/eventInterestEmail");
const { eventReservationConfirmationHtml, eventReservationAlertHtml } = require("../lib/eventReservationEmail");
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
      heroImage: true, secondaryImage: true, price: true, priceUnit: true, payUrl: true, sellsRaffleTickets: true,
      reservePhone: true, contactName: true, contactEmail: true, statusNote: true, admissionNote: true, includesHeading: true, includes: true,
      scheduleItems: true,
      reservationsEnabled: true, reservationDeadline: true, offersTakeout: true,
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

// A public "reserve a meal / seat" submission for one event. No payment —
// people pay at the door. Same honeypot + rate-limit shape as the interest
// route above; validates against the event's own reservation settings.
router.post(
  "/:slug/reserve",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 8 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) return res.json({ ok: true }); // honeypot — silently drop bots

    const { eventSlug, name, email, phone, partySize, serviceType, pickupTime, note } = req.body;

    const event = eventSlug
      ? await prisma.event.findUnique({ where: { orgId_slug: { orgId: org.id, slug: eventSlug } } })
      : null;
    if (!event || event.status !== "published") return res.status(404).json({ error: "That event isn't available." });
    if (!event.reservationsEnabled) return res.status(400).json({ error: "This event isn't taking reservations." });
    if (event.reservationDeadline && new Date() > new Date(event.reservationDeadline)) {
      return res.status(400).json({ error: "Reservations for this event have closed." });
    }

    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = stripPhone(phone);
    if (!normalizedEmail && !normalizedPhone) return res.status(400).json({ error: "Enter an email or phone number so we can reach you" });

    const size = Math.round(Number(partySize) || 1);
    if (!Number.isFinite(size) || size < 1 || size > 50) return res.status(400).json({ error: "Number of guests must be between 1 and 50" });

    let cleanServiceType = null;
    if (event.offersTakeout) {
      if (serviceType === "eat-in" || serviceType === "take-out") cleanServiceType = serviceType;
      else return res.status(400).json({ error: "Choose eat in or take out" });
    }

    const reservation = await prisma.eventReservation.create({
      data: {
        orgId: org.id,
        eventId: event.id,
        name: name.trim(),
        email: normalizedEmail || "",
        phone: normalizedPhone || "",
        partySize: size,
        serviceType: cleanServiceType,
        pickupTime: cleanServiceType === "take-out" && pickupTime && pickupTime.trim() ? pickupTime.trim() : null,
        note: note && note.trim() ? note.trim() : null,
      },
    });
    res.json({ ok: true });

    // Fire-and-forget notifications — the reservation is already saved and
    // the visitor already has their on-screen confirmation.
    const timeZone = org.timeZone || "America/New_York";
    if (reservation.email) {
      try {
        await sendEmail({
          to: reservation.email, toName: reservation.name,
          subject: `Reservation confirmed — ${event.title}`,
          html: eventReservationConfirmationHtml({ reservation, event, org, timeZone }),
          fromName: org.name,
          replyTo: event.contactEmail || org.contactEmail || undefined,
        });
      } catch (err) {
        console.error(`Reservation confirmation email failed for ${reservation.id} -> ${reservation.email}:`, err.message);
      }
    }
    const recipients = await resolveEventAlertRecipients(org.id, org);
    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient.email, toName: recipient.name,
          subject: `New reservation — ${event.title} (${reservation.name}, ${reservation.partySize})`,
          html: eventReservationAlertHtml({ reservation, event, org, timeZone }),
          fromName: org.name, replyTo: reservation.email || undefined,
        });
      } catch (err) {
        console.error(`Reservation alert email failed for ${reservation.id} -> ${recipient.email}:`, err.message);
      }
    }
  }
);

module.exports = router;
