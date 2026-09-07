const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../lib/rateLimit");
const { normalizeEmail, registerTeam, addLog, markCheckoutSessionPaid, revertCheckoutSession } = require("../lib/tournamentLogic");
const { stripPhone } = require("../lib/phone");
const { stripe } = require("../lib/stripe");
const { resolveTournamentAlertRecipients } = require("../lib/tournamentAlerts");
const { tournamentInterestAlertHtml } = require("../lib/tournamentInterestEmail");
const { sendEmail } = require("../lib/notifications");

const router = express.Router();

const PUBLIC_TOURNAMENT_FIELDS = {
  id: true, slug: true, name: true, year: true, date: true, format: true, maxTeamSize: true,
  venueName: true, venueAddress: true, flyerImage: true, flyerImagePosition: true, costPerPlayer: true, capacity: true, registeredTeamCount: true,
  includedItems: true, scheduleItems: true, contactName: true, contactPhone: true, contactEmail: true,
  allowCheckPayment: true, checkPayableInstructions: true, allowInPersonPayment: true, inPersonPaymentInstructions: true,
  type: { select: { name: true } },
};

// The subset of a tournament's payment settings a visitor needs to decide
// how to pay — shared by the register and pay routes below. Direct port of
// publicGolf.js's own publicPaymentInfo.
function publicPaymentInfo(tournament, org) {
  return {
    payOnlineAvailable: !!org.orgStripeConnect?.chargesEnabled,
    allowCheckPayment: tournament.allowCheckPayment,
    checkPayableInstructions: tournament.checkPayableInstructions,
    allowInPersonPayment: tournament.allowInPersonPayment,
    inPersonPaymentInstructions: tournament.inPersonPaymentInstructions,
  };
}

function publicTeamShape(team) {
  return {
    id: team.id,
    name: team.name,
    players: team.players.map((p) => ({
      id: p.id, name: p.player.name, isCaptain: p.isCaptain,
      amountDue: p.amountDue, paymentStatus: p.paymentStatus, paymentMethod: p.paymentMethod,
    })),
  };
}

function shapeTournament(t) {
  return {
    ...t,
    typeName: t.type?.name || null,
    type: undefined,
    spotsRemaining: t.capacity != null ? Math.max(0, t.capacity - t.registeredTeamCount) : null,
    isFull: t.capacity != null && t.registeredTeamCount >= t.capacity,
  };
}

// Every open tournament across every type, soonest first — the
// multi-open-tournament index Golf doesn't have today (Golf assumes
// roughly one active tournament; this module doesn't). Also carries what
// the empty state (see PublicTournaments.jsx) needs when nothing's open:
// previewTournament (the org's single most recent tournament, any status/
// type — direct port of publicGolf.js's own fallback, minus the
// isHistorical filter Golf needs and this module doesn't have yet) and
// types (the org's own TournamentType list, for the notify form's "which
// tournament?" dropdown).
router.get("/:orgSlug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const [tournaments, types] = await Promise.all([
    prisma.tournament.findMany({
      where: { orgId: org.id, status: "open" },
      select: PUBLIC_TOURNAMENT_FIELDS,
      orderBy: { date: "asc" },
    }),
    prisma.tournamentType.findMany({ where: { orgId: org.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  let previewTournament = null;
  if (tournaments.length === 0) {
    const preview = await prisma.tournament.findFirst({
      where: { orgId: org.id },
      select: PUBLIC_TOURNAMENT_FIELDS,
      orderBy: { date: "desc" },
    });
    previewTournament = preview ? shapeTournament(preview) : null;
  }

  res.json({ orgName: org.name, tournaments: tournaments.map(shapeTournament), previewTournament, types });
});

// Captures a "notify me" lead when a visitor lands on the page with
// nothing open — see PublicTournaments.jsx's empty-state NotifyForm.
// Deliberately its own model/route rather than folding into register:
// there's no tournament to register against yet, and this person hasn't
// played or sponsored, so they don't belong in the real player/sponsor
// directories either. `website` is a honeypot field, same convention as
// every other public route here. Direct port of publicGolf.js's own
// POST /:slug/interest.
router.post(
  "/:orgSlug/interest",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) return res.json({ ok: true }); // silently drop suspected bot submissions

    const { role, name, email, phone, companyName, note, typeId } = req.body;
    if (!["player", "sponsor"].includes(role)) return res.status(400).json({ error: "Choose player or sponsor" });
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = stripPhone(phone);
    if (!normalizedEmail && !normalizedPhone) return res.status(400).json({ error: "Enter an email or phone number so we can reach you" });

    let type = null;
    if (typeId) {
      type = await prisma.tournamentType.findFirst({ where: { id: typeId, orgId: org.id } });
    }

    const signup = await prisma.tournamentInterestSignup.create({
      data: {
        orgId: org.id,
        role,
        name: name.trim(),
        email: normalizedEmail || "",
        phone: normalizedPhone || "",
        companyName: role === "sponsor" && companyName ? companyName.trim() : null,
        note: note && note.trim() ? note.trim() : null,
        typeId: type?.id || null,
      },
    });
    res.json({ ok: true });

    // Fire-and-forget: the signup is already saved and the visitor already
    // has their on-screen confirmation, so an alert-email hiccup here
    // shouldn't turn into a failed request.
    const recipients = await resolveTournamentAlertRecipients(org.id, org);
    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient.email, toName: recipient.name,
          subject: `New tournament interest signup — ${signup.name}`,
          html: tournamentInterestAlertHtml({ signup, org, typeName: type?.name || null }),
          fromName: org.name, replyTo: signup.email || undefined,
        });
      } catch (err) {
        console.error(`Tournament interest alert email failed for signup ${signup.id} -> ${recipient.email}:`, err.message);
      }
    }
  }
);

// One tournament's full public detail, by its own slug — reachable
// independently of the index above so a flyer's QR code or a shared link
// always lands on the right tournament even when several are open.
router.get("/:orgSlug/:tournamentSlug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug }, include: { orgStripeConnect: true } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const tournament = await prisma.tournament.findFirst({
    where: { orgId: org.id, slug: req.params.tournamentSlug, status: "open" },
    select: PUBLIC_TOURNAMENT_FIELDS,
  });
  if (!tournament) return res.status(404).json({ error: "This tournament isn't open for registration" });

  res.json({
    orgName: org.name,
    tournament: { ...shapeTournament(tournament), payment: publicPaymentInfo(tournament, org) },
  });
});

// Registers a team with no payment info at all — payment is a separate,
// later step. `website` is a honeypot field: real visitors never see or
// fill it, so a non-empty value means a bot — mirrors publicGolf.js.
router.post(
  "/:orgSlug/:tournamentSlug/register",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug }, include: { orgStripeConnect: true } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) {
      return res.json({ ok: true }); // silently drop suspected bot submissions
    }

    const tournament = await prisma.tournament.findFirst({
      where: { slug: req.params.tournamentSlug, orgId: org.id, status: "open" },
    });
    if (!tournament) return res.status(404).json({ error: "This tournament isn't open for registration" });

    const { teamName, players } = req.body;
    let teamId;
    try {
      teamId = await registerTeam(org.id, tournament, { teamName, players });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const team = await prisma.tournamentTeam.findUnique({
      where: { id: teamId },
      include: { players: { include: { player: true } } },
    });
    const captain = team.players.find((p) => p.isCaptain) || team.players[0];

    res.json({
      ok: true,
      team: publicTeamShape(team),
      payUrl: `/tournaments/${req.params.orgSlug}/${tournament.slug}/teams/${team.id}/pay`,
      payment: publicPaymentInfo(tournament, org),
    });

    addLog(org.id, tournament.id, {
      type: "team_registered",
      text: `Team${team.name ? ` "${team.name}"` : ""} registered online by ${captain?.player?.name || "a visitor"} with ${team.players.length} player(s)`,
      teamId: team.id,
    }).catch((err) => console.error(`Tournament registration log failed for team ${team.id}:`, err.message));
  }
);

// Roster + payment status for the pay page. The team's cuid is the de
// facto access token, same trust model as every other public link in this
// app.
router.get("/:orgSlug/:tournamentSlug/teams/:teamId", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug }, include: { orgStripeConnect: true } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const tournament = await prisma.tournament.findFirst({ where: { slug: req.params.tournamentSlug, orgId: org.id } });
  if (!tournament) return res.status(404).json({ error: "Not found" });

  const team = await prisma.tournamentTeam.findFirst({
    where: { id: req.params.teamId, orgId: org.id, tournamentId: tournament.id },
    include: { players: { include: { player: true } } },
  });
  if (!team) return res.status(404).json({ error: "Not found" });

  res.json({ team: publicTeamShape(team), payment: publicPaymentInfo(tournament, org) });
});

// Records how a visitor intends to pay for a chosen subset of the roster.
// Direct port of publicGolf.js's own /pay route, including the
// stale-session sweep and idempotent mark-paid/revert helpers.
router.post(
  "/:orgSlug/:tournamentSlug/teams/:teamId/pay",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug }, include: { orgStripeConnect: true } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) {
      return res.json({ ok: true }); // silently drop suspected bot submissions
    }

    const tournament = await prisma.tournament.findFirst({ where: { slug: req.params.tournamentSlug, orgId: org.id } });
    if (!tournament) return res.status(404).json({ error: "Not found" });

    const team = await prisma.tournamentTeam.findFirst({
      where: { id: req.params.teamId, orgId: org.id, tournamentId: tournament.id },
      include: { players: { include: { player: true } } },
    });
    if (!team) return res.status(404).json({ error: "Not found" });

    const { teamPlayerIds, paymentMethod } = req.body;
    if (!Array.isArray(teamPlayerIds) || teamPlayerIds.length === 0) {
      return res.status(400).json({ error: "Select at least one player to pay for" });
    }
    let selected = team.players.filter((p) => teamPlayerIds.includes(p.id));
    if (selected.length !== teamPlayerIds.length) {
      return res.status(400).json({ error: "One or more selected players aren't on this team" });
    }
    if (selected.some((p) => p.paymentStatus === "paid")) {
      return res.status(400).json({ error: "One or more selected players are already paid" });
    }

    if (paymentMethod === "check" && !tournament.allowCheckPayment) {
      return res.status(400).json({ error: "Paying by check isn't available for this tournament" });
    } else if (paymentMethod === "in_person" && !tournament.allowInPersonPayment) {
      return res.status(400).json({ error: "Paying in person isn't available for this tournament" });
    } else if (paymentMethod === "stripe") {
      if (!org.orgStripeConnect?.chargesEnabled) {
        return res.status(400).json({ error: "Online payment isn't available for this tournament" });
      }
      const stripeAccountId = org.orgStripeConnect.stripeAccountId;

      const staleSessionIds = [...new Set(
        selected.filter((p) => p.paymentStatus === "pending" && p.stripeCheckoutSessionId).map((p) => p.stripeCheckoutSessionId)
      )];
      for (const oldSessionId of staleSessionIds) {
        try {
          const oldSession = await stripe.checkout.sessions.retrieve(oldSessionId, {}, { stripeAccount: stripeAccountId });
          if (oldSession.payment_status === "paid") {
            await markCheckoutSessionPaid(oldSessionId, { paymentIntentId: oldSession.payment_intent });
          } else {
            await stripe.checkout.sessions.expire(oldSessionId, {}, { stripeAccount: stripeAccountId }).catch(() => {});
            await revertCheckoutSession(oldSessionId);
          }
        } catch (err) {
          console.error(`Stale tournament checkout session ${oldSessionId} sweep failed:`, err.message);
        }
      }

      const refreshedTeam = await prisma.tournamentTeam.findUnique({
        where: { id: team.id },
        include: { players: { include: { player: true } } },
      });
      selected = refreshedTeam.players.filter((p) => teamPlayerIds.includes(p.id) && p.paymentStatus !== "paid");
      if (selected.length === 0) {
        return res.json({ team: publicTeamShape(refreshedTeam), payment: publicPaymentInfo(tournament, org) });
      }

      const appUrl = process.env.APP_URL || "http://localhost:5173";
      const payPageUrl = `${appUrl}/tournaments/${req.params.orgSlug}/${tournament.slug}/teams/${team.id}/pay`;

      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: selected.map((p) => ({
            price_data: {
              currency: org.orgStripeConnect.defaultCurrency || "usd",
              product_data: { name: `${tournament.name} — ${p.player.name}` },
              unit_amount: Math.round(p.amountDue * 100),
            },
            quantity: 1,
          })),
          client_reference_id: team.id,
          metadata: { orgId: org.id, tournamentId: tournament.id, teamId: team.id, teamPlayerIds: JSON.stringify(selected.map((p) => p.id)) },
          success_url: `${payPageUrl}?stripeReturn=1&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${payPageUrl}?stripeCanceled=1&session_id={CHECKOUT_SESSION_ID}`,
        },
        { stripeAccount: stripeAccountId }
      );

      await prisma.tournamentTeamPlayer.updateMany({
        where: { id: { in: selected.map((p) => p.id) } },
        data: { paymentMethod: "stripe", paymentStatus: "pending", stripeCheckoutSessionId: session.id },
      });

      return res.json({ checkoutUrl: session.url, sessionId: session.id });
    } else if (!["check", "in_person"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Choose a valid payment method" });
    }

    await prisma.tournamentTeamPlayer.updateMany({
      where: { id: { in: teamPlayerIds } },
      data: { paymentMethod },
    });

    const updated = await prisma.tournamentTeam.findUnique({
      where: { id: team.id },
      include: { players: { include: { player: true } } },
    });
    res.json({ team: publicTeamShape(updated), payment: publicPaymentInfo(tournament, org) });

    const names = selected.map((p) => p.player.name).join(", ");
    addLog(org.id, tournament.id, {
      type: "payment_recorded",
      text: `${names} marked as paying by ${paymentMethod === "check" ? "check" : "in person"} (online submission, pending confirmation)`,
      teamId: team.id,
    }).catch((err) => console.error(`Tournament payment log failed for team ${team.id}:`, err.message));
  }
);

router.post(
  "/:orgSlug/:tournamentSlug/teams/:teamId/pay/sync",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug }, include: { orgStripeConnect: true } });
    if (!org?.orgStripeConnect?.stripeAccountId) return res.status(404).json({ error: "Not found" });

    const tournament = await prisma.tournament.findFirst({ where: { slug: req.params.tournamentSlug, orgId: org.id } });
    if (!tournament) return res.status(404).json({ error: "Not found" });

    const team = await prisma.tournamentTeam.findFirst({ where: { id: req.params.teamId, orgId: org.id, tournamentId: tournament.id } });
    if (!team) return res.status(404).json({ error: "Not found" });

    const { sessionId } = req.body;
    if (sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: org.orgStripeConnect.stripeAccountId });
        if (session.payment_status === "paid") {
          const result = await markCheckoutSessionPaid(sessionId, { paymentIntentId: session.payment_intent });
          if (result.count > 0) {
            await addLog(org.id, tournament.id, {
              type: "payment_recorded",
              text: `${result.count} player(s) paid online via Stripe`,
              teamId: team.id,
            });
          }
        }
      } catch (err) {
        console.error(`Tournament checkout sync failed for session ${sessionId}:`, err.message);
      }
    }

    const updated = await prisma.tournamentTeam.findUnique({
      where: { id: team.id },
      include: { players: { include: { player: true } } },
    });
    res.json({ team: publicTeamShape(updated), payment: publicPaymentInfo(tournament, org) });
  }
);

router.post(
  "/:orgSlug/:tournamentSlug/teams/:teamId/pay/cancel",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug }, include: { orgStripeConnect: true } });
    if (!org?.orgStripeConnect?.stripeAccountId) return res.status(404).json({ error: "Not found" });

    const tournament = await prisma.tournament.findFirst({ where: { slug: req.params.tournamentSlug, orgId: org.id } });
    if (!tournament) return res.status(404).json({ error: "Not found" });

    const team = await prisma.tournamentTeam.findFirst({ where: { id: req.params.teamId, orgId: org.id, tournamentId: tournament.id } });
    if (!team) return res.status(404).json({ error: "Not found" });

    const { sessionId } = req.body;
    if (sessionId) {
      try {
        await stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount: org.orgStripeConnect.stripeAccountId });
      } catch (err) {
        // Already expired/completed elsewhere (e.g. the sync call already
        // won this race) — nothing to do, revertCheckoutSession below will
        // safely no-op too if that's the case.
      }
      const result = await revertCheckoutSession(sessionId);
      if (result.count > 0) {
        await addLog(org.id, tournament.id, {
          type: "payment_recorded",
          text: `${result.count} player(s)' online payment attempt was canceled`,
          teamId: team.id,
        });
      }
    }

    const updated = await prisma.tournamentTeam.findUnique({
      where: { id: team.id },
      include: { players: { include: { player: true } } },
    });
    res.json({ team: publicTeamShape(updated), payment: publicPaymentInfo(tournament, org) });
  }
);

module.exports = router;
