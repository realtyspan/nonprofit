const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../lib/rateLimit");
const { registerTeam, addGolfLog } = require("../lib/golfLogic");

const router = express.Router();

const PUBLIC_TOURNAMENT_FIELDS = {
  id: true, name: true, year: true, date: true, format: true, maxTeamSize: true,
  venueName: true, venueAddress: true, costPerPlayer: true, capacity: true, registeredTeamCount: true,
  includedDescription: true, scheduleText: true, contactName: true, contactPhone: true, contactEmail: true,
  allowCheckPayment: true, checkPayableInstructions: true, allowInPersonPayment: true, inPersonPaymentInstructions: true,
};

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
      team: {
        id: team.id,
        name: team.name,
        players: team.players.map((p) => ({ id: p.id, name: p.player.name, isCaptain: p.isCaptain, amountDue: p.amountDue })),
      },
      payment: {
        payOnlineAvailable: false, // wired up once Stripe Connect lands
        allowCheckPayment: tournament.allowCheckPayment,
        checkPayableInstructions: tournament.checkPayableInstructions,
        allowInPersonPayment: tournament.allowInPersonPayment,
        inPersonPaymentInstructions: tournament.inPersonPaymentInstructions,
      },
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

module.exports = router;
