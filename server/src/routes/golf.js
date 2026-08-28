const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess, requireOwner } = require("../lib/auth");
const { normalizeEmail, findOrCreatePlayer, registerTeam, addGolfLog } = require("../lib/golfLogic");
const { parseHistoricalPlayersCsv, parseHistoricalSponsorsCsv } = require("../lib/golfHistoricalImport");
const { stripe, createExpressAccount, createOnboardingLink } = require("../lib/stripe");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// Mirrors org.js's requireOwnerOrBellJarAdmin — connecting/disconnecting
// online payment is a big enough decision that the technical Owner can
// always do it, but so can whoever holds Admin on the golf module day to day.
function requireOwnerOrGolfAdmin(req, res, next) {
  if (req.orgTier === "Owner") return next();
  return requirePermission("golf", "Admin")(req, res, next);
}

// Denormalized names (checkedInByName, log actorName) need the caller's
// current display name — the JWT only carries userId/orgId (see auth.js),
// so load it fresh once per request, same spirit as raffle.js.
router.use(async (req, res, next) => {
  req.callerUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, name: true } });
  next();
});

// An org can run more than one golf tournament (rare, but not impossible —
// a rain-delayed makeup event, say), so every sub-resource route is nested
// under /tournaments/:tournamentId. Loads + ownership-checks the tournament
// once per request, attaching it to req.golfTournament — mirrors raffle.js's
// router.param("gameId", ...).
router.param("tournamentId", async (req, res, next, tournamentId) => {
  const tournament = await prisma.golfTournament.findFirst({ where: { id: tournamentId, orgId: req.user.orgId } });
  if (!tournament) return res.status(404).json({ error: "Tournament not found" });
  req.golfTournament = tournament;
  next();
});

// Blocks state-changing actions once a tournament is closed — reads stay
// open for historical reporting, mirrors raffle.js's requireActiveGame.
function requireActiveGolfTournament(req, res, next) {
  if (req.golfTournament.status === "closed") {
    return res.status(400).json({ error: "This tournament is closed" });
  }
  next();
}

// Loads + ownership-checks a team once per request for any route nested
// under /tournaments/:tournamentId/teams/:teamId — always runs after the
// tournamentId param above, since :tournamentId appears first in every path
// that also has :teamId.
router.param("teamId", async (req, res, next, teamId) => {
  const team = await prisma.golfTeam.findFirst({ where: { id: teamId, orgId: req.user.orgId, tournamentId: req.golfTournament.id } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  req.golfTeam = team;
  next();
});

router.param("sponsorshipId", async (req, res, next, sponsorshipId) => {
  const sponsorship = await prisma.golfSponsorship.findFirst({ where: { id: sponsorshipId, orgId: req.user.orgId, tournamentId: req.golfTournament.id } });
  if (!sponsorship) return res.status(404).json({ error: "Sponsorship not found" });
  req.golfSponsorship = sponsorship;
  next();
});

// --- Stripe Connect (org-wide, not tournament-scoped) ---
// Express account + direct charges — see plan doc for why (Stripe hosts the
// whole KYC flow for a volunteer treasurer; direct charges make the
// connected account the merchant of record so the platform never touches
// player money, even transiently).

router.get("/stripe-connect", requireOwnerOrGolfAdmin, async (req, res) => {
  const connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });
  res.json(connect || { chargesEnabled: false, onboardingStatus: "not_started" });
});

router.post("/stripe-connect/onboard", requireOwnerOrGolfAdmin, async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  let connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });

  if (!connect?.stripeAccountId) {
    const account = await createExpressAccount({ email: org.contactEmail, orgName: org.name });
    connect = await prisma.orgStripeConnect.upsert({
      where: { orgId: req.user.orgId },
      update: { stripeAccountId: account.id, disconnectedAt: null, onboardingStatus: "onboarding" },
      create: { orgId: req.user.orgId, stripeAccountId: account.id, onboardingStatus: "onboarding" },
    });
  }

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const returnUrl = `${appUrl}/?golfStripeReturn=1`;
  const link = await createOnboardingLink(connect.stripeAccountId, { refreshUrl: returnUrl, returnUrl });
  res.json({ url: link.url });
});

// Called by the client right after the org admin lands back from Stripe's
// hosted onboarding — Stripe doesn't push a webhook the instant onboarding
// finishes, so this gives the admin an immediate, accurate status instead of
// waiting on account.updated to arrive.
router.post("/stripe-connect/sync", requireOwnerOrGolfAdmin, async (req, res) => {
  const connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });
  if (!connect?.stripeAccountId) return res.status(400).json({ error: "Stripe isn't connected yet" });

  const account = await stripe.accounts.retrieve(connect.stripeAccountId);
  const updated = await prisma.orgStripeConnect.update({
    where: { orgId: req.user.orgId },
    data: {
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
      onboardingStatus: account.charges_enabled ? "complete" : account.details_submitted ? "restricted" : "onboarding",
      country: account.country || null,
      defaultCurrency: account.default_currency || null,
    },
  });
  res.json(updated);
});

router.delete("/stripe-connect", requireOwner, async (req, res) => {
  const connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });
  if (!connect) return res.json({ ok: true });
  await prisma.orgStripeConnect.update({
    where: { orgId: req.user.orgId },
    data: { disconnectedAt: new Date(), chargesEnabled: false },
  });
  res.json({ ok: true });
});

// --- Tournament management ---

// Historical imports are deliberately excluded here — they're not a real,
// selectable operational tournament, same as raffle's GET /games. See
// /historical-imports below.
router.get("/tournaments", requireReadAccess("golf"), async (req, res) => {
  const tournaments = await prisma.golfTournament.findMany({ where: { orgId: req.user.orgId, isHistorical: false }, orderBy: { date: "desc" } });
  res.json(tournaments);
});

// Validates an admin-chosen "pull past players/sponsors from" link — must be
// another tournament in the same org and can't point at itself. Mirrors
// raffle.js's resolvePreviousGameId.
async function resolvePreviousTournamentId(orgId, previousTournamentId, selfId) {
  if (!previousTournamentId) return null;
  if (previousTournamentId === selfId) {
    throw Object.assign(new Error("A tournament can't link to itself"), { status: 400 });
  }
  const tournament = await prisma.golfTournament.findFirst({ where: { id: previousTournamentId, orgId } });
  if (!tournament) throw Object.assign(new Error("That linked tournament wasn't found"), { status: 400 });
  return tournament.id;
}

// Base64 data URLs are ~33% larger than the underlying bytes, so this caps
// the actual image around 450KB — plenty for a resized hero photo, and a
// real ceiling regardless of what the client sends (the client's own resize
// targets a much smaller size than this; this is the backstop). Kept low
// because this string round-trips through the public tournament-list API on
// every visit to the registration page, not just an admin-only view.
const MAX_FLYER_IMAGE_CHARS = 600000;
const FLYER_IMAGE_POSITIONS = ["top", "center", "bottom"];

function resolveTournamentFields(body) {
  const { name, year, date, format, maxTeamSize, venueName, venueAddress, flyerImage, flyerImagePosition, costPerPlayer, capacity, includedDescription, scheduleText, contactName, contactPhone, contactEmail, allowCheckPayment, checkPayableInstructions, allowInPersonPayment, inPersonPaymentInstructions } = body;

  if (flyerImage && flyerImage.length > MAX_FLYER_IMAGE_CHARS) {
    throw Object.assign(new Error("That photo is too large — choose a smaller or simpler image"), { status: 400 });
  }

  if (!name || !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });

  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
    throw Object.assign(new Error("year must be a whole number (e.g. 2026)"), { status: 400 });
  }
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) throw Object.assign(new Error("date must be a valid date"), { status: 400 });

  const price = Number(costPerPlayer);
  if (!Number.isFinite(price) || price <= 0) throw Object.assign(new Error("costPerPlayer must be a positive number"), { status: 400 });

  const teamSize = maxTeamSize == null || maxTeamSize === "" ? 4 : Number(maxTeamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 12) {
    throw Object.assign(new Error("maxTeamSize must be a whole number between 1 and 12"), { status: 400 });
  }

  let parsedCapacity = null;
  if (capacity != null && capacity !== "") {
    parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      throw Object.assign(new Error("capacity must be a positive whole number, or left blank for unlimited"), { status: 400 });
    }
  }

  return {
    name: name.trim(),
    year: parsedYear,
    date: parsedDate,
    format: format?.trim() || null,
    maxTeamSize: teamSize,
    venueName: venueName?.trim() || null,
    venueAddress: venueAddress?.trim() || null,
    flyerImage: flyerImage || null,
    flyerImagePosition: FLYER_IMAGE_POSITIONS.includes(flyerImagePosition) ? flyerImagePosition : "center",
    costPerPlayer: price,
    capacity: parsedCapacity,
    includedDescription: includedDescription?.trim() || null,
    scheduleText: scheduleText?.trim() || null,
    contactName: contactName?.trim() || null,
    contactPhone: contactPhone?.trim() || null,
    contactEmail: contactEmail?.trim() || null,
    allowCheckPayment: !!allowCheckPayment,
    checkPayableInstructions: checkPayableInstructions?.trim() || null,
    allowInPersonPayment: !!allowInPersonPayment,
    inPersonPaymentInstructions: inPersonPaymentInstructions?.trim() || null,
  };
}

router.post("/tournaments", requirePermission("golf", "Admin"), async (req, res) => {
  let fields, previousTournamentId;
  try {
    fields = resolveTournamentFields(req.body);
    previousTournamentId = await resolvePreviousTournamentId(req.user.orgId, req.body.previousTournamentId, null);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const tournament = await prisma.golfTournament.create({
    data: { orgId: req.user.orgId, previousTournamentId, ...fields },
  });

  await addGolfLog(req.user.orgId, tournament.id, {
    type: "tournament_created",
    text: `"${tournament.name}" created`,
    actorName: req.callerUser?.name || "",
  });

  res.json(tournament);
});

router.get("/tournaments/:tournamentId", requireReadAccess("golf"), async (req, res) => {
  res.json(req.golfTournament);
});

router.patch("/tournaments/:tournamentId", requirePermission("golf", "Admin"), requireActiveGolfTournament, async (req, res) => {
  let fields, previousTournamentId;
  try {
    fields = resolveTournamentFields(req.body);
    previousTournamentId = await resolvePreviousTournamentId(req.user.orgId, req.body.previousTournamentId, req.golfTournament.id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const updated = await prisma.golfTournament.update({
    where: { id: req.golfTournament.id },
    data: { previousTournamentId, ...fields },
  });

  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "tournament_edited",
    text: `"${updated.name}" details updated`,
    actorName: req.callerUser?.name || "",
  });

  res.json(updated);
});

// Opening a tournament to the public requires it to actually be payable
// somehow, and requires the core public-facing fields to be filled in —
// otherwise the public signup page would show a tournament with no venue,
// no cost, and no way to pay.
router.post("/tournaments/:tournamentId/open", requirePermission("golf", "Admin"), async (req, res) => {
  const t = req.golfTournament;
  if (t.status === "open") return res.status(400).json({ error: "This tournament is already open" });

  const connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });
  const stripeAvailable = !!connect?.chargesEnabled;
  if (!t.allowCheckPayment && !t.allowInPersonPayment && !stripeAvailable) {
    return res.status(400).json({ error: "Enable at least one payment method (online, check, or in person) before opening this tournament" });
  }
  if (!t.venueName || !t.date || !t.costPerPlayer) {
    return res.status(400).json({ error: "Set the venue, date, and cost per player before opening this tournament" });
  }

  const updated = await prisma.golfTournament.update({ where: { id: t.id }, data: { status: "open" } });
  await addGolfLog(req.user.orgId, t.id, { type: "tournament_opened", text: `"${t.name}" opened for registration`, actorName: req.callerUser?.name || "" });
  res.json(updated);
});

router.post("/tournaments/:tournamentId/close", requirePermission("golf", "Admin"), async (req, res) => {
  if (req.golfTournament.status === "closed") return res.status(400).json({ error: "This tournament is already closed" });
  const updated = await prisma.golfTournament.update({ where: { id: req.golfTournament.id }, data: { status: "closed", closedAt: new Date() } });
  await addGolfLog(req.user.orgId, req.golfTournament.id, { type: "tournament_closed", text: `"${req.golfTournament.name}" closed`, actorName: req.callerUser?.name || "" });
  res.json(updated);
});

router.post("/tournaments/:tournamentId/reopen", requirePermission("golf", "Admin"), async (req, res) => {
  if (req.golfTournament.status !== "closed") return res.status(400).json({ error: "This tournament isn't closed" });
  const updated = await prisma.golfTournament.update({ where: { id: req.golfTournament.id }, data: { status: "open", closedAt: null } });
  await addGolfLog(req.user.orgId, req.golfTournament.id, { type: "tournament_opened", text: `"${req.golfTournament.name}" reopened`, actorName: req.callerUser?.name || "" });
  res.json(updated);
});

// Stricter than raffle's game deletion: golf teams are payment-bearing
// registrations from members of the public, not pre-generated slot rows, so
// a tournament with any real registrations must be closed instead of
// deleted — "closed history is the record, don't erase" (see plan doc).
router.delete("/tournaments/:tournamentId", requirePermission("golf", "Admin"), async (req, res) => {
  const teamCount = await prisma.golfTeam.count({ where: { tournamentId: req.golfTournament.id } });
  if (teamCount > 0) {
    return res.status(400).json({ error: "This tournament has registered teams — close it instead of deleting it" });
  }
  await prisma.golfTournament.delete({ where: { id: req.golfTournament.id } });
  res.json({ ok: true });
});

router.get("/tournaments/:tournamentId/log", requireReadAccess("golf"), async (req, res) => {
  const logs = await prisma.golfLog.findMany({ where: { tournamentId: req.golfTournament.id }, orderBy: { createdAt: "desc" }, take: 500 });
  res.json(logs);
});

// --- Roster / team management ---
// normalizeEmail/findOrCreatePlayer/registerTeam live in ../lib/golfLogic —
// shared with publicGolf.js so admin-entered and public self-service
// registration go through the identical capacity-guarded logic.

const teamInclude = { players: { include: { player: true, checkIn: true } }, sponsorship: { include: { sponsor: true } } };

router.get("/tournaments/:tournamentId/teams", requireReadAccess("golf"), async (req, res) => {
  const teams = await prisma.golfTeam.findMany({
    where: { tournamentId: req.golfTournament.id, orgId: req.user.orgId },
    include: teamInclude,
    orderBy: { createdAt: "asc" },
  });
  res.json(teams);
});

router.post("/tournaments/:tournamentId/teams", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  const { teamName, players } = req.body;
  let teamId;
  try {
    teamId = await registerTeam(req.user.orgId, req.golfTournament, { teamName, players });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const team = await prisma.golfTeam.findUnique({ where: { id: teamId }, include: teamInclude });
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "team_registered",
    text: `Team${team.name ? ` "${team.name}"` : ""} registered with ${team.players.length} player(s)`,
    actorName: req.callerUser?.name || "",
    teamId: team.id,
  });
  res.json(team);
});

router.patch("/tournaments/:tournamentId/teams/:teamId", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  const { teamName, status, sponsorshipId } = req.body;
  const data = {};
  if (teamName !== undefined) data.name = teamName?.trim() || null;
  if (status !== undefined) data.status = status;

  const linkingSponsorship = sponsorshipId !== undefined && sponsorshipId !== req.golfTeam.sponsorshipId;
  if (linkingSponsorship) {
    if (sponsorshipId) {
      const sponsorship = await prisma.golfSponsorship.findFirst({ where: { id: sponsorshipId, orgId: req.user.orgId, tournamentId: req.golfTournament.id } });
      if (!sponsorship) return res.status(400).json({ error: "That sponsorship wasn't found" });
    }
    data.sponsorshipId = sponsorshipId || null;
  }

  let updated = await prisma.golfTeam.update({ where: { id: req.golfTeam.id }, data, include: teamInclude });

  if (linkingSponsorship && data.sponsorshipId) {
    // Comping a team's entry — every unpaid roster row on it is settled by
    // the sponsorship, not by the individual players. Rows already paid some
    // other way are left alone.
    await prisma.golfTeamPlayer.updateMany({
      where: { teamId: req.golfTeam.id, paymentStatus: { not: "paid" } },
      data: { paymentMethod: "sponsor_covered", paymentStatus: "paid", amountPaid: 0 },
    });
    await addGolfLog(req.user.orgId, req.golfTournament.id, {
      type: "sponsorship_comped_team",
      text: `Team${updated.name ? ` "${updated.name}"` : ""}'s entry comped by ${updated.sponsorship?.sponsor?.companyName || "a sponsorship"}`,
      actorName: req.callerUser?.name || "",
      teamId: updated.id,
      sponsorshipId: data.sponsorshipId,
    });
    // Re-fetch — the object above still reflects each player's row from
    // before the bulk update just above ran.
    updated = await prisma.golfTeam.findUnique({ where: { id: req.golfTeam.id }, include: teamInclude });
  } else {
    await addGolfLog(req.user.orgId, req.golfTournament.id, {
      type: "team_edited",
      text: `Team${updated.name ? ` "${updated.name}"` : ""} updated`,
      actorName: req.callerUser?.name || "",
      teamId: updated.id,
    });
  }

  res.json(updated);
});

router.delete("/tournaments/:tournamentId/teams/:teamId", requirePermission("golf", "Admin"), requireActiveGolfTournament, async (req, res) => {
  await prisma.$transaction([
    prisma.golfTeam.delete({ where: { id: req.golfTeam.id } }),
    prisma.golfTournament.update({ where: { id: req.golfTournament.id }, data: { registeredTeamCount: { decrement: 1 } } }),
  ]);
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "team_cancelled",
    text: `Team${req.golfTeam.name ? ` "${req.golfTeam.name}"` : ""} removed`,
    actorName: req.callerUser?.name || "",
  });
  res.json({ ok: true });
});

router.post("/tournaments/:tournamentId/teams/:teamId/players", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  const { name, email, phone, isCaptain } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

  const currentCount = await prisma.golfTeamPlayer.count({ where: { teamId: req.golfTeam.id } });
  if (currentCount >= req.golfTournament.maxTeamSize) {
    return res.status(400).json({ error: `This tournament allows at most ${req.golfTournament.maxTeamSize} players per team` });
  }

  const player = await findOrCreatePlayer(prisma, req.user.orgId, { name, email, phone });
  const teamPlayer = await prisma.golfTeamPlayer.create({
    data: {
      orgId: req.user.orgId, tournamentId: req.golfTournament.id, teamId: req.golfTeam.id, playerId: player.id,
      isCaptain: !!isCaptain, amountDue: req.golfTournament.costPerPlayer,
    },
    include: { player: true, checkIn: true },
  });
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "player_added",
    text: `${player.name} added to team${req.golfTeam.name ? ` "${req.golfTeam.name}"` : ""}`,
    actorName: req.callerUser?.name || "",
    teamId: req.golfTeam.id, playerId: player.id,
  });
  res.json(teamPlayer);
});

async function findTeamPlayerOnTeamOrThrow(teamId, teamPlayerId) {
  const tp = await prisma.golfTeamPlayer.findFirst({ where: { id: teamPlayerId, teamId }, include: { player: true } });
  if (!tp) throw Object.assign(new Error("Player not found on this team"), { status: 404 });
  return tp;
}

router.patch("/tournaments/:tournamentId/teams/:teamId/players/:teamPlayerId", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  let existing;
  try {
    existing = await findTeamPlayerOnTeamOrThrow(req.golfTeam.id, req.params.teamPlayerId);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const { isCaptain, paymentMethod, paymentStatus, amountPaid, checkNumber } = req.body;
  const data = {};
  if (isCaptain !== undefined) data.isCaptain = !!isCaptain;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod || null;
  if (paymentStatus !== undefined) data.paymentStatus = paymentStatus;
  if (amountPaid !== undefined) data.amountPaid = amountPaid === "" || amountPaid == null ? null : Number(amountPaid);
  if (checkNumber !== undefined) data.checkNumber = checkNumber || null;

  const updated = await prisma.golfTeamPlayer.update({ where: { id: existing.id }, data, include: { player: true, checkIn: true } });

  const paymentChanged = paymentMethod !== undefined || paymentStatus !== undefined || amountPaid !== undefined;
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: paymentChanged ? "payment_recorded" : "player_edited",
    text: paymentChanged
      ? `${updated.player.name}'s payment updated to ${updated.paymentStatus}${updated.paymentMethod ? ` (${updated.paymentMethod})` : ""}`
      : `${updated.player.name}'s roster entry updated`,
    actorName: req.callerUser?.name || "",
    teamId: req.golfTeam.id, playerId: updated.playerId,
  });
  res.json(updated);
});

router.delete("/tournaments/:tournamentId/teams/:teamId/players/:teamPlayerId", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  let existing;
  try {
    existing = await findTeamPlayerOnTeamOrThrow(req.golfTeam.id, req.params.teamPlayerId);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  await prisma.golfTeamPlayer.delete({ where: { id: existing.id } });
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "player_removed",
    text: `${existing.player.name} removed from team${req.golfTeam.name ? ` "${req.golfTeam.name}"` : ""}`,
    actorName: req.callerUser?.name || "",
    teamId: req.golfTeam.id,
  });
  res.json({ ok: true });
});

// Bulk reconciliation for check/in-person payments an admin collected outside
// the app — mirrors raffle.js's bulk-mark-funds-received. Uses a flat
// per-player amount (tournament.costPerPlayer) rather than each row's own
// amountDue, since this pass doesn't support per-player price overrides.
router.post("/tournaments/:tournamentId/teams/:teamId/mark-paid", requirePermission("golf", "Admin"), requireActiveGolfTournament, async (req, res) => {
  const { teamPlayerIds, paymentMethod } = req.body;
  if (!Array.isArray(teamPlayerIds) || teamPlayerIds.length === 0) {
    return res.status(400).json({ error: "teamPlayerIds is required" });
  }
  if (!["check", "in_person"].includes(paymentMethod)) {
    return res.status(400).json({ error: "paymentMethod must be check or in_person" });
  }
  const result = await prisma.golfTeamPlayer.updateMany({
    where: { id: { in: teamPlayerIds }, teamId: req.golfTeam.id, orgId: req.user.orgId },
    data: { paymentMethod, paymentStatus: "paid", amountPaid: req.golfTournament.costPerPlayer },
  });
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "payment_recorded",
    text: `${result.count} player(s) marked paid via ${paymentMethod === "check" ? "check" : "in person"}`,
    actorName: req.callerUser?.name || "",
    teamId: req.golfTeam.id,
  });
  res.json({ ok: true, count: result.count });
});

router.get("/tournaments/:tournamentId/stats", requireReadAccess("golf"), async (req, res) => {
  const [teams, teamPlayers] = await Promise.all([
    prisma.golfTeam.findMany({ where: { tournamentId: req.golfTournament.id, orgId: req.user.orgId } }),
    prisma.golfTeamPlayer.findMany({ where: { tournamentId: req.golfTournament.id, orgId: req.user.orgId } }),
  ]);
  res.json({
    totalTeams: teams.length,
    registeredTeams: teams.filter((t) => t.status === "registered").length,
    cancelledTeams: teams.filter((t) => t.status === "cancelled").length,
    capacity: req.golfTournament.capacity,
    totalPlayers: teamPlayers.length,
    unpaid: teamPlayers.filter((p) => p.paymentStatus === "unpaid").length,
    pending: teamPlayers.filter((p) => p.paymentStatus === "pending").length,
    paid: teamPlayers.filter((p) => p.paymentStatus === "paid").length,
    revenue: teamPlayers.filter((p) => p.paymentStatus === "paid").reduce((sum, p) => sum + (p.amountPaid || 0), 0),
  });
});

// Org-wide player directory for admin autocomplete when manually adding a
// player to a team. No existing "search a directory" pattern elsewhere in
// this app to mirror (checked) — real server-side filtering via Prisma's
// case-insensitive `contains`.
router.get("/players", requireReadAccess("golf"), async (req, res) => {
  const q = (req.query.search || "").trim();
  if (!q) return res.json([]);
  const players = await prisma.golfPlayer.findMany({
    where: { orgId: req.user.orgId, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
    take: 20,
    orderBy: { name: "asc" },
  });
  res.json(players);
});

// --- Check-in ---

// Deliberately unmasked and returns the full non-cancelled roster (not
// filtered server-side by a search param) — mirrors raffle.js's
// checkin-search, which does the same for the same reason: verifying who's
// at the door is a different concern than any sales-credit masking
// elsewhere, and the admin UI does its own client-side substring matching.
router.get("/tournaments/:tournamentId/checkin-search", requirePermission("golf", "Helper"), async (req, res) => {
  const teamPlayers = await prisma.golfTeamPlayer.findMany({
    where: { tournamentId: req.golfTournament.id, orgId: req.user.orgId, team: { status: { not: "cancelled" } } },
    include: { player: true, team: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(teamPlayers.map((tp) => ({
    id: tp.id, name: tp.player.name, phone: tp.player.phone, email: tp.player.email,
    teamName: tp.team.name, isCaptain: tp.isCaptain, paymentStatus: tp.paymentStatus,
  })));
});

router.get("/tournaments/:tournamentId/checkins", requireReadAccess("golf"), async (req, res) => {
  const checkIns = await prisma.golfCheckIn.findMany({ where: { tournamentId: req.golfTournament.id, orgId: req.user.orgId }, orderBy: { checkedInAt: "desc" } });
  res.json(checkIns);
});

// Toggle — calling it again on an already-checked-in player removes the
// check-in, so a mis-tap at the door doesn't need a separate "undo" action.
// Identical semantics to raffle.js's /checkins/:ticketNumber.
router.post("/tournaments/:tournamentId/checkins/:teamPlayerId", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  const teamPlayer = await prisma.golfTeamPlayer.findFirst({
    where: { id: req.params.teamPlayerId, orgId: req.user.orgId, tournamentId: req.golfTournament.id },
    include: { player: true },
  });
  if (!teamPlayer) return res.status(404).json({ error: "Player not found" });

  const existing = await prisma.golfCheckIn.findUnique({ where: { teamPlayerId: teamPlayer.id } });
  if (existing) {
    await prisma.golfCheckIn.delete({ where: { id: existing.id } });
    await addGolfLog(req.user.orgId, req.golfTournament.id, {
      type: "checkin", text: `${teamPlayer.player.name}'s check-in removed`,
      actorName: req.callerUser?.name || "", teamId: teamPlayer.teamId, playerId: teamPlayer.playerId,
    });
    return res.json({ checkedIn: false });
  }

  const checkIn = await prisma.golfCheckIn.create({
    data: {
      orgId: req.user.orgId, tournamentId: req.golfTournament.id, teamPlayerId: teamPlayer.id,
      checkedInByUserId: req.user.userId, checkedInByName: req.callerUser?.name || "",
    },
  });
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "checkin", text: `${teamPlayer.player.name} checked in`,
    actorName: req.callerUser?.name || "", teamId: teamPlayer.teamId, playerId: teamPlayer.playerId,
  });
  res.json({ checkedIn: true, checkIn });
});

// --- Sponsorships ---

async function findOrCreateSponsorContact(orgId, { companyName, contactName, email, phone }) {
  if (!companyName || !companyName.trim()) throw Object.assign(new Error("companyName is required"), { status: 400 });
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const existing = await prisma.golfSponsorContact.findFirst({ where: { orgId, email: normalizedEmail } });
    if (existing) return existing;
  }
  return prisma.golfSponsorContact.create({
    data: { orgId, companyName: companyName.trim(), contactName: contactName?.trim() || null, email: normalizedEmail, phone: (phone || "").trim() },
  });
}

router.get("/tournaments/:tournamentId/sponsorships", requireReadAccess("golf"), async (req, res) => {
  const sponsorships = await prisma.golfSponsorship.findMany({
    where: { tournamentId: req.golfTournament.id, orgId: req.user.orgId },
    include: { sponsor: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(sponsorships);
});

router.post("/tournaments/:tournamentId/sponsorships", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  const { companyName, contactName, email, phone, tierName, amount, benefitsText } = req.body;
  let sponsor;
  try {
    sponsor = await findOrCreateSponsorContact(req.user.orgId, { companyName, contactName, email, phone });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const sponsorship = await prisma.golfSponsorship.create({
    data: {
      orgId: req.user.orgId, tournamentId: req.golfTournament.id, sponsorId: sponsor.id,
      tierName: tierName?.trim() || null, amount: amount === "" || amount == null ? null : Number(amount),
      benefitsText: benefitsText?.trim() || null, status: "confirmed", source: "manual",
    },
    include: { sponsor: true },
  });
  await addGolfLog(req.user.orgId, req.golfTournament.id, {
    type: "sponsorship_added",
    text: `${sponsor.companyName} added as a sponsor${tierName ? ` (${tierName})` : ""}`,
    actorName: req.callerUser?.name || "", sponsorshipId: sponsorship.id,
  });
  res.json(sponsorship);
});

router.patch("/tournaments/:tournamentId/sponsorships/:sponsorshipId", requirePermission("golf", "Helper"), requireActiveGolfTournament, async (req, res) => {
  const { tierName, amount, paid, paymentMethod, benefitsText, status } = req.body;
  const data = {};
  if (tierName !== undefined) data.tierName = tierName?.trim() || null;
  if (amount !== undefined) data.amount = amount === "" || amount == null ? null : Number(amount);
  if (benefitsText !== undefined) data.benefitsText = benefitsText?.trim() || null;
  if (status !== undefined) data.status = status;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod || null;

  const wasPaid = req.golfSponsorship.paid;
  if (paid !== undefined) {
    data.paid = !!paid;
    data.paidAt = paid ? (wasPaid ? req.golfSponsorship.paidAt : new Date()) : null;
  }

  const updated = await prisma.golfSponsorship.update({ where: { id: req.golfSponsorship.id }, data, include: { sponsor: true } });

  if (paid !== undefined && !!paid !== wasPaid && paid) {
    await addGolfLog(req.user.orgId, req.golfTournament.id, {
      type: "sponsorship_payment_recorded",
      text: `${updated.sponsor.companyName}'s sponsorship marked paid`,
      actorName: req.callerUser?.name || "", sponsorshipId: updated.id,
    });
  }
  res.json(updated);
});

router.delete("/tournaments/:tournamentId/sponsorships/:sponsorshipId", requirePermission("golf", "Admin"), requireActiveGolfTournament, async (req, res) => {
  // GolfTeam.sponsorshipId is onDelete: SetNull, so any comped team is
  // automatically unlinked — its players' payment status from the comp is
  // left as-is (an admin can revert it manually if the comp is being undone).
  await prisma.golfSponsorship.delete({ where: { id: req.golfSponsorship.id } });
  res.json({ ok: true });
});

router.post("/tournaments/:tournamentId/sponsorships/:sponsorshipId/confirm", requirePermission("golf", "Admin"), requireActiveGolfTournament, async (req, res) => {
  const updated = await prisma.golfSponsorship.update({ where: { id: req.golfSponsorship.id }, data: { status: "confirmed" } });
  res.json(updated);
});

router.get("/sponsors", requireReadAccess("golf"), async (req, res) => {
  const q = (req.query.search || "").trim();
  if (!q) return res.json([]);
  const sponsors = await prisma.golfSponsorContact.findMany({
    where: { orgId: req.user.orgId, OR: [{ companyName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
    take: 20,
    orderBy: { companyName: "asc" },
  });
  res.json(sponsors);
});

// --- Historical imports ---
// Past-years player/sponsor data, uploaded once so the "email last year's
// players/sponsors" marketing lists (see plan doc's collectGolfPlayerRecipients
// / collectGolfSponsorRecipients) have real data to walk instead of coming up
// empty until the org has run a few tournaments inside this app. Mirrors
// raffle.js's historical-imports exactly, except golf has two independent
// lists instead of one, so an import targets an isHistorical GolfTournament
// "shell" that can receive players and/or sponsors — either created fresh by
// the first import, or added to by a second import later (an org.js's
// previousTournamentId is a single field shared by both marketing tracks on
// a real tournament, so both lists for one archival year need to live on the
// same row for a real tournament to ever link to both at once).

router.get("/historical-imports", requireReadAccess("golf"), async (req, res) => {
  const tournaments = await prisma.golfTournament.findMany({
    where: { orgId: req.user.orgId, isHistorical: true },
    orderBy: { date: "desc" },
    include: { _count: { select: { teamPlayers: true, sponsorships: true } } },
  });
  res.json(tournaments.map((t) => ({
    id: t.id, name: t.name, year: t.year, previousTournamentId: t.previousTournamentId,
    playerCount: t._count.teamPlayers, sponsorshipCount: t._count.sponsorships,
  })));
});

// Shared by both import routes below — either reuses an existing historical
// shell (so a second CSV, of the other kind, can land on the same
// archival-year row) or creates a fresh one.
async function findOrCreateHistoricalTournament(orgId, { existingTournamentId, year, name, previousTournamentId }) {
  if (existingTournamentId) {
    const existing = await prisma.golfTournament.findFirst({ where: { id: existingTournamentId, orgId, isHistorical: true } });
    if (!existing) throw Object.assign(new Error("That historical import wasn't found"), { status: 400 });
    return existing;
  }
  const yearNum = Number(year);
  if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2200) {
    throw Object.assign(new Error("A valid year is required"), { status: 400 });
  }
  const resolvedPreviousId = await resolvePreviousTournamentId(orgId, previousTournamentId, null);
  return prisma.golfTournament.create({
    data: {
      orgId,
      name: (name && name.trim()) || `${yearNum} Golf Tournament (imported)`,
      year: yearNum,
      date: new Date(Date.UTC(yearNum, 5, 1)),
      costPerPlayer: 0,
      status: "closed",
      closedAt: new Date(Date.UTC(yearNum, 11, 31)),
      isHistorical: true,
      previousTournamentId: resolvedPreviousId,
    },
  });
}

router.post("/historical-imports/players", requirePermission("golf", "Admin"), async (req, res) => {
  const { csv, existingTournamentId, year, name, previousTournamentId } = req.body;
  if (!csv || !csv.trim()) return res.status(400).json({ error: "Paste or choose a CSV file first" });

  let rows, skipped;
  try {
    ({ rows, skipped } = parseHistoricalPlayersCsv(csv));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: "No usable rows found — each row needs at least a player name" });
  }

  let tournament;
  try {
    tournament = await findOrCreateHistoricalTournament(req.user.orgId, { existingTournamentId, year, name, previousTournamentId });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  // Group rows into teams by (trimmed, case-insensitive) team name; a blank
  // team name means that row is its own one-person team, not grouped with
  // any other blank-team-name row.
  const teamGroups = [];
  const namedGroupIndex = new Map();
  for (const r of rows) {
    if (r.teamName) {
      const key = r.teamName.toLowerCase();
      if (!namedGroupIndex.has(key)) {
        namedGroupIndex.set(key, teamGroups.length);
        teamGroups.push({ teamName: r.teamName, rows: [] });
      }
      teamGroups[namedGroupIndex.get(key)].rows.push(r);
    } else {
      teamGroups.push({ teamName: null, rows: [r] });
    }
  }

  let imported = 0;
  for (const group of teamGroups) {
    const team = await prisma.golfTeam.create({ data: { orgId: req.user.orgId, tournamentId: tournament.id, name: group.teamName } });
    for (let i = 0; i < group.rows.length; i++) {
      const r = group.rows[i];
      const player = await findOrCreatePlayer(prisma, req.user.orgId, { name: r.name, email: r.email, phone: r.phone });
      await prisma.golfTeamPlayer.create({
        data: {
          orgId: req.user.orgId, tournamentId: tournament.id, teamId: team.id, playerId: player.id,
          isCaptain: r.isCaptain != null ? r.isCaptain : i === 0,
          amountDue: 0,
        },
      });
      imported++;
    }
  }

  res.json({ ok: true, tournamentId: tournament.id, imported, teams: teamGroups.length, skipped });
});

router.post("/historical-imports/sponsors", requirePermission("golf", "Admin"), async (req, res) => {
  const { csv, existingTournamentId, year, name, previousTournamentId } = req.body;
  if (!csv || !csv.trim()) return res.status(400).json({ error: "Paste or choose a CSV file first" });

  let rows, skipped;
  try {
    ({ rows, skipped } = parseHistoricalSponsorsCsv(csv));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: "No usable rows found — each row needs at least a company name" });
  }

  let tournament;
  try {
    tournament = await findOrCreateHistoricalTournament(req.user.orgId, { existingTournamentId, year, name, previousTournamentId });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  let imported = 0;
  for (const r of rows) {
    const sponsor = await findOrCreateSponsorContact(req.user.orgId, { companyName: r.companyName, contactName: r.contactName, email: r.email, phone: r.phone });
    await prisma.golfSponsorship.create({
      data: {
        orgId: req.user.orgId, tournamentId: tournament.id, sponsorId: sponsor.id,
        tierName: r.tierName || null, amount: r.amount, status: "confirmed", source: "manual",
      },
    });
    imported++;
  }

  res.json({ ok: true, tournamentId: tournament.id, imported, skipped });
});

router.delete("/historical-imports/:id", requirePermission("golf", "Admin"), async (req, res) => {
  const tournament = await prisma.golfTournament.findFirst({ where: { id: req.params.id, orgId: req.user.orgId, isHistorical: true } });
  if (!tournament) return res.status(404).json({ error: "That historical import wasn't found" });
  await prisma.golfTournament.delete({ where: { id: tournament.id } });
  res.json({ ok: true });
});

// Lets an import's label/link be changed after the fact — same reasoning as
// raffle.js's equivalent: a new import's "pull past players/sponsors from"
// dropdown can only offer imports that already existed at the time it was
// created, so an older year imported later needs this to connect to it.
router.patch("/historical-imports/:id", requirePermission("golf", "Admin"), async (req, res) => {
  const tournament = await prisma.golfTournament.findFirst({ where: { id: req.params.id, orgId: req.user.orgId, isHistorical: true } });
  if (!tournament) return res.status(404).json({ error: "That historical import wasn't found" });
  const { name, previousTournamentId } = req.body;
  let resolvedPreviousId;
  try {
    resolvedPreviousId = await resolvePreviousTournamentId(req.user.orgId, previousTournamentId, tournament.id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const updated = await prisma.golfTournament.update({
    where: { id: tournament.id },
    data: { name: (name && name.trim()) || tournament.name, previousTournamentId: resolvedPreviousId },
  });
  res.json(updated);
});

module.exports = router;
