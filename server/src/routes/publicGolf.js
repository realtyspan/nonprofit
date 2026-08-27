const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../lib/rateLimit");
const { registerTeam, addGolfLog } = require("../lib/golfLogic");

const router = express.Router();

const PUBLIC_TOURNAMENT_FIELDS = {
  id: true, name: true, year: true, date: true, format: true, maxTeamSize: true,
  venueName: true, venueAddress: true, flyerImage: true, costPerPlayer: true, capacity: true, registeredTeamCount: true,
  includedDescription: true, scheduleText: true, contactName: true, contactPhone: true, contactEmail: true,
  allowCheckPayment: true, checkPayableInstructions: true, allowInPersonPayment: true, inPersonPaymentInstructions: true,
};

// The subset of a tournament's payment settings a visitor needs to decide
// how to pay — shared by the register and pay routes below.
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

// Org name + every open tournament with public-safe fields — no team/player
// data, so this never leaks who else has registered. Mirrors
// publicRentals.js's GET /:slug shape.
router.get("/:slug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug }, include: { orgStripeConnect: true } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const tournaments = await prisma.golfTournament.findMany({
    where: { orgId: org.id, status: "open" },
    select: PUBLIC_TOURNAMENT_FIELDS,
    orderBy: { date: "asc" },
  });

  const payOnlineAvailable = !!org.orgStripeConnect?.chargesEnabled;
  res.json({
    orgName: org.name,
    tournaments: tournaments.map((t) => ({
      ...t,
      spotsRemaining: t.capacity != null ? Math.max(0, t.capacity - t.registeredTeamCount) : null,
      isFull: t.capacity != null && t.registeredTeamCount >= t.capacity,
      payOnlineAvailable,
    })),
  });
});

// Registers a team with no payment info at all — payment is a separate,
// later step (see plan doc's two-step register-then-pay design). `website`
// is a honeypot field: real visitors never see or fill it, so a non-empty
// value means a bot, mirrors publicRentals.js.
router.post(
  "/:slug/tournaments/:tournamentId/register",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) {
      return res.json({ ok: true }); // silently drop suspected bot submissions
    }

    const tournament = await prisma.golfTournament.findFirst({
      where: { id: req.params.tournamentId, orgId: org.id, status: "open" },
    });
    if (!tournament) return res.status(404).json({ error: "This tournament isn't open for registration" });

    const { teamName, players } = req.body;
    let teamId;
    try {
      teamId = await registerTeam(org.id, tournament, { teamName, players });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const team = await prisma.golfTeam.findUnique({
      where: { id: teamId },
      include: { players: { include: { player: true } } },
    });
    const captain = team.players.find((p) => p.isCaptain) || team.players[0];

    res.json({
      ok: true,
      team: publicTeamShape(team),
      payUrl: `/golf/${req.params.slug}/tournaments/${tournament.id}/teams/${team.id}/pay`,
      payment: { ...publicPaymentInfo(tournament, org), payOnlineAvailable: false }, // wired up once Stripe Connect lands
    });

    // Fire-and-forget: the team is already created and the visitor already
    // has their on-screen confirmation, so a logging hiccup here shouldn't
    // turn into a failed request — same best-effort spirit as
    // publicRentals.js's inquiry alert. A confirmation/alert email lands
    // alongside the rest of the golf notification emails, a later build step.
    addGolfLog(org.id, tournament.id, {
      type: "team_registered",
      text: `Team${team.name ? ` "${team.name}"` : ""} registered online by ${captain?.player?.name || "a visitor"} with ${team.players.length} player(s)`,
      teamId: team.id,
    }).catch((err) => console.error(`Golf registration log failed for team ${team.id}:`, err.message));
  }
);

// Roster + payment status for the pay page. The team's cuid is the de facto
// access token (unguessable, same trust model as every other public link in
// this app) — no separate auth needed for a low-stakes "see who on my own
// team has paid" view.
router.get("/:slug/tournaments/:tournamentId/teams/:teamId", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug }, include: { orgStripeConnect: true } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const tournament = await prisma.golfTournament.findFirst({ where: { id: req.params.tournamentId, orgId: org.id } });
  if (!tournament) return res.status(404).json({ error: "Not found" });

  const team = await prisma.golfTeam.findFirst({
    where: { id: req.params.teamId, orgId: org.id, tournamentId: tournament.id },
    include: { players: { include: { player: true } } },
  });
  if (!team) return res.status(404).json({ error: "Not found" });

  res.json({ team: publicTeamShape(team), payment: publicPaymentInfo(tournament, org) });
});

// Records how a visitor intends to pay for a chosen subset of the roster.
// check/in_person only stamp paymentMethod and leave paymentStatus "unpaid"
// pending admin reconciliation — Stripe isn't wired up yet, so it's
// explicitly rejected here even though the shape is already in place.
router.post(
  "/:slug/tournaments/:tournamentId/teams/:teamId/pay",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.slug }, include: { orgStripeConnect: true } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) {
      return res.json({ ok: true }); // silently drop suspected bot submissions
    }

    const tournament = await prisma.golfTournament.findFirst({ where: { id: req.params.tournamentId, orgId: org.id } });
    if (!tournament) return res.status(404).json({ error: "Not found" });

    const team = await prisma.golfTeam.findFirst({
      where: { id: req.params.teamId, orgId: org.id, tournamentId: tournament.id },
      include: { players: { include: { player: true } } },
    });
    if (!team) return res.status(404).json({ error: "Not found" });

    const { teamPlayerIds, paymentMethod } = req.body;
    if (!Array.isArray(teamPlayerIds) || teamPlayerIds.length === 0) {
      return res.status(400).json({ error: "Select at least one player to pay for" });
    }
    const selected = team.players.filter((p) => teamPlayerIds.includes(p.id));
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
      return res.status(400).json({ error: "Online payment isn't set up for this tournament yet" });
    } else if (!["check", "in_person"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Choose a valid payment method" });
    }

    await prisma.golfTeamPlayer.updateMany({
      where: { id: { in: teamPlayerIds } },
      data: { paymentMethod },
    });

    const updated = await prisma.golfTeam.findUnique({
      where: { id: team.id },
      include: { players: { include: { player: true } } },
    });
    res.json({ team: publicTeamShape(updated), payment: publicPaymentInfo(tournament, org) });

    const names = selected.map((p) => p.player.name).join(", ");
    addGolfLog(org.id, tournament.id, {
      type: "payment_recorded",
      text: `${names} marked as paying by ${paymentMethod === "check" ? "check" : "in person"} (online submission, pending confirmation)`,
      teamId: team.id,
    }).catch((err) => console.error(`Golf payment log failed for team ${team.id}:`, err.message));
  }
);

module.exports = router;
