const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");

const router = express.Router();
router.use(requireAuth, loadPermissions);

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

// Single canonical activity-log writer — every state-changing endpoint below
// goes through this instead of writing GolfLog rows inline at each call site.
async function addGolfLog(orgId, tournamentId, { type, text, actorName = "", teamId = null, playerId = null, sponsorshipId = null }) {
  await prisma.golfLog.create({ data: { orgId, tournamentId, type, text, actorName, teamId, playerId, sponsorshipId } });
}

// --- Tournament management ---

router.get("/tournaments", requireReadAccess("golf"), async (req, res) => {
  const tournaments = await prisma.golfTournament.findMany({ where: { orgId: req.user.orgId }, orderBy: { date: "desc" } });
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

function resolveTournamentFields(body) {
  const { name, year, date, format, maxTeamSize, venueName, venueAddress, costPerPlayer, capacity, includedDescription, scheduleText, contactName, contactPhone, contactEmail, allowCheckPayment, checkPayableInstructions, allowInPersonPayment, inPersonPaymentInstructions } = body;

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

module.exports = router;
