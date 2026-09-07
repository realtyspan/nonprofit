const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess, requireOwner } = require("../lib/auth");
const { normalizeEmail, findOrCreatePlayer, registerTeam, addLog } = require("../lib/tournamentLogic");
const { stripe, createExpressAccount, createOnboardingLink } = require("../lib/stripe");
const { buildTournamentFlyerPdf, resolveTournamentFlyerUrl } = require("../lib/tournamentFlyerPdf");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// Mirrors golf.js's requireOwnerOrGolfAdmin — connecting/disconnecting
// online payment is a big enough decision that the technical Owner can
// always do it, but so can whoever holds Admin on the tournaments module.
function requireOwnerOrTournamentsAdmin(req, res, next) {
  if (req.orgTier === "Owner") return next();
  return requirePermission("tournaments", "Admin")(req, res, next);
}

// Denormalized names (log actorName) need the caller's current display
// name — the JWT only carries userId/orgId (see auth.js) — same pattern as
// golf.js.
router.use(async (req, res, next) => {
  req.callerUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, name: true } });
  next();
});

// An org can have more than one tournament open at once (unlike Golf,
// which assumes roughly one active tournament — see the plan doc), so
// every sub-resource route is nested under /tournaments/:tournamentId.
// Loads + ownership-checks the tournament once per request, attaching it
// to req.tournament — direct port of golf.js's own router.param.
router.param("tournamentId", async (req, res, next, tournamentId) => {
  const tournament = await prisma.tournament.findFirst({ where: { id: tournamentId, orgId: req.user.orgId } });
  if (!tournament) return res.status(404).json({ error: "Tournament not found" });
  req.tournament = tournament;
  next();
});

function requireActiveTournament(req, res, next) {
  if (req.tournament.status === "closed") {
    return res.status(400).json({ error: "This tournament is closed" });
  }
  next();
}

router.param("teamId", async (req, res, next, teamId) => {
  const team = await prisma.tournamentTeam.findFirst({ where: { id: teamId, orgId: req.user.orgId, tournamentId: req.tournament.id } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  req.team = team;
  next();
});

router.param("sponsorshipId", async (req, res, next, sponsorshipId) => {
  const sponsorship = await prisma.tournamentSponsorship.findFirst({ where: { id: sponsorshipId, orgId: req.user.orgId, tournamentId: req.tournament.id } });
  if (!sponsorship) return res.status(404).json({ error: "Sponsorship not found" });
  req.sponsorship = sponsorship;
  next();
});

// --- Stripe Connect (org-wide, not tournament-scoped) ---
// Direct port of golf.js's own Stripe Connect section — duplicated rather
// than shared, deliberately: this module needs to work standalone for an
// org that never buys Golf, so it can't depend on golf.js's routes to set
// up the same org-wide OrgStripeConnect row.

router.get("/stripe-connect", requireOwnerOrTournamentsAdmin, async (req, res) => {
  const connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });
  res.json(connect || { chargesEnabled: false, onboardingStatus: "not_started" });
});

router.post("/stripe-connect/onboard", requireOwnerOrTournamentsAdmin, async (req, res) => {
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
  const returnUrl = `${appUrl}/?tournamentsStripeReturn=1`;
  const link = await createOnboardingLink(connect.stripeAccountId, { refreshUrl: returnUrl, returnUrl });
  res.json({ url: link.url });
});

router.post("/stripe-connect/sync", requireOwnerOrTournamentsAdmin, async (req, res) => {
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

// --- Tournament types (org-managed list) ---
// Deliberately org-scoped, not a platform-wide list — see schema.prisma's
// TournamentType comment for why.

router.get("/types", requireReadAccess("tournaments"), async (req, res) => {
  const types = await prisma.tournamentType.findMany({ where: { orgId: req.user.orgId }, orderBy: { name: "asc" } });
  res.json(types);
});

router.post("/types", requirePermission("tournaments", "Admin"), async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const type = await prisma.tournamentType.create({ data: { orgId: req.user.orgId, name } });
    res.json(type);
  } catch (err) {
    if (err.code === "P2002") return res.status(400).json({ error: `"${name}" already exists` });
    throw err;
  }
});

router.patch("/types/:typeId", requirePermission("tournaments", "Admin"), async (req, res) => {
  const type = await prisma.tournamentType.findFirst({ where: { id: req.params.typeId, orgId: req.user.orgId } });
  if (!type) return res.status(404).json({ error: "Type not found" });
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const updated = await prisma.tournamentType.update({ where: { id: type.id }, data: { name } });
    res.json(updated);
  } catch (err) {
    if (err.code === "P2002") return res.status(400).json({ error: `"${name}" already exists` });
    throw err;
  }
});

router.delete("/types/:typeId", requirePermission("tournaments", "Admin"), async (req, res) => {
  const type = await prisma.tournamentType.findFirst({ where: { id: req.params.typeId, orgId: req.user.orgId } });
  if (!type) return res.status(404).json({ error: "Type not found" });
  const inUse = await prisma.tournament.count({ where: { typeId: type.id } });
  if (inUse > 0) return res.status(400).json({ error: "This type is used by at least one tournament — remove or reassign those first" });
  await prisma.tournamentType.delete({ where: { id: type.id } });
  res.json({ ok: true });
});

// --- Tournament management ---

router.get("/", requireReadAccess("tournaments"), async (req, res) => {
  const tournaments = await prisma.tournament.findMany({
    where: { orgId: req.user.orgId },
    include: { type: true },
    orderBy: { date: "desc" },
  });
  res.json(tournaments);
});

async function resolvePreviousTournamentId(orgId, previousTournamentId, selfId) {
  if (!previousTournamentId) return null;
  if (previousTournamentId === selfId) {
    throw Object.assign(new Error("A tournament can't link to itself"), { status: 400 });
  }
  const tournament = await prisma.tournament.findFirst({ where: { id: previousTournamentId, orgId } });
  if (!tournament) throw Object.assign(new Error("That linked tournament wasn't found"), { status: 400 });
  return tournament.id;
}

// Same real ceiling as golf.js's MAX_FLYER_IMAGE_CHARS.
const MAX_FLYER_IMAGE_CHARS = 600000;
const FLYER_IMAGE_POSITIONS = ["top", "center", "bottom"];

function cleanIncludedItems(items) {
  if (!Array.isArray(items)) return null;
  const cleaned = items.map((s) => String(s || "").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanScheduleItems(items) {
  if (!Array.isArray(items)) return null;
  const cleaned = items
    .map((r) => ({ time: String(r?.time || "").trim(), label: String(r?.label || "").trim() }))
    .filter((r) => r.label);
  return cleaned.length > 0 ? cleaned : null;
}

// Lowercase-hyphenated, unique within the org — powers the public deep
// link and the flyer's QR code. Immutable once set, same reasoning as
// events.js's own slug (baked into printed flyers and any embed already
// shared).
function slugify(title) {
  return String(title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tournament";
}
async function uniqueSlug(orgId, name) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await prisma.tournament.findUnique({ where: { orgId_slug: { orgId, slug } } })) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

async function resolveTournamentFields(orgId, body) {
  const { name, typeId, year, date, format, maxTeamSize, venueName, venueAddress, flyerImage, flyerImagePosition, costPerPlayer, capacity, includedItems, scheduleItems, contactName, contactPhone, contactEmail, allowCheckPayment, checkPayableInstructions, allowInPersonPayment, inPersonPaymentInstructions } = body;

  if (flyerImage && flyerImage.length > MAX_FLYER_IMAGE_CHARS) {
    throw Object.assign(new Error("That photo is too large — choose a smaller or simpler image"), { status: 400 });
  }
  if (!name || !name.trim()) throw Object.assign(new Error("name is required"), { status: 400 });

  const type = await prisma.tournamentType.findFirst({ where: { id: typeId, orgId } });
  if (!type) throw Object.assign(new Error("Choose a tournament type (add one first if your list is empty)"), { status: 400 });

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
    typeId: type.id,
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
    includedItems: cleanIncludedItems(includedItems),
    scheduleItems: cleanScheduleItems(scheduleItems),
    contactName: contactName?.trim() || null,
    contactPhone: contactPhone?.trim() || null,
    contactEmail: contactEmail?.trim() || null,
    allowCheckPayment: !!allowCheckPayment,
    checkPayableInstructions: checkPayableInstructions?.trim() || null,
    allowInPersonPayment: !!allowInPersonPayment,
    inPersonPaymentInstructions: inPersonPaymentInstructions?.trim() || null,
  };
}

router.post("/", requirePermission("tournaments", "Admin"), async (req, res) => {
  let fields, previousTournamentId;
  try {
    fields = await resolveTournamentFields(req.user.orgId, req.body);
    previousTournamentId = await resolvePreviousTournamentId(req.user.orgId, req.body.previousTournamentId, null);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const slug = await uniqueSlug(req.user.orgId, fields.name);
  const tournament = await prisma.tournament.create({
    data: { orgId: req.user.orgId, slug, previousTournamentId, ...fields },
  });

  await addLog(req.user.orgId, tournament.id, { type: "tournament_created", text: `"${tournament.name}" created`, actorName: req.callerUser?.name || "" });
  res.json(tournament);
});

router.patch("/:tournamentId", requirePermission("tournaments", "Admin"), async (req, res) => {
  let fields, previousTournamentId;
  try {
    fields = await resolveTournamentFields(req.user.orgId, req.body);
    previousTournamentId = await resolvePreviousTournamentId(req.user.orgId, req.body.previousTournamentId, req.tournament.id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const updated = await prisma.tournament.update({ where: { id: req.tournament.id }, data: { previousTournamentId, ...fields } });
  await addLog(req.user.orgId, req.tournament.id, { type: "tournament_edited", text: `"${updated.name}" details updated`, actorName: req.callerUser?.name || "" });
  res.json(updated);
});

router.post("/:tournamentId/open", requirePermission("tournaments", "Admin"), async (req, res) => {
  const t = req.tournament;
  if (t.status === "open") return res.status(400).json({ error: "This tournament is already open" });

  const connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });
  const stripeAvailable = !!connect?.chargesEnabled;
  if (!t.allowCheckPayment && !t.allowInPersonPayment && !stripeAvailable) {
    return res.status(400).json({ error: "Enable at least one payment method (online, check, or in person) before opening this tournament" });
  }
  if (!t.venueName || !t.date || !t.costPerPlayer) {
    return res.status(400).json({ error: "Set the venue, date, and cost per player before opening this tournament" });
  }

  const updated = await prisma.tournament.update({ where: { id: t.id }, data: { status: "open" } });
  await addLog(req.user.orgId, t.id, { type: "tournament_opened", text: `"${t.name}" opened for registration`, actorName: req.callerUser?.name || "" });
  res.json(updated);
});

router.post("/:tournamentId/close", requirePermission("tournaments", "Admin"), async (req, res) => {
  if (req.tournament.status === "closed") return res.status(400).json({ error: "This tournament is already closed" });
  const updated = await prisma.tournament.update({ where: { id: req.tournament.id }, data: { status: "closed", closedAt: new Date() } });
  await addLog(req.user.orgId, req.tournament.id, { type: "tournament_closed", text: `"${req.tournament.name}" closed`, actorName: req.callerUser?.name || "" });
  res.json(updated);
});

router.post("/:tournamentId/reopen", requirePermission("tournaments", "Admin"), async (req, res) => {
  if (req.tournament.status !== "closed") return res.status(400).json({ error: "This tournament isn't closed" });
  const updated = await prisma.tournament.update({ where: { id: req.tournament.id }, data: { status: "open", closedAt: null } });
  await addLog(req.user.orgId, req.tournament.id, { type: "tournament_opened", text: `"${req.tournament.name}" reopened`, actorName: req.callerUser?.name || "" });
  res.json(updated);
});

router.delete("/:tournamentId", requirePermission("tournaments", "Admin"), async (req, res) => {
  const teamCount = await prisma.tournamentTeam.count({ where: { tournamentId: req.tournament.id } });
  if (teamCount > 0) {
    return res.status(400).json({ error: "This tournament has registered teams — close it instead of deleting it" });
  }
  await prisma.tournament.delete({ where: { id: req.tournament.id } });
  res.json({ ok: true });
});

router.get("/:tournamentId/log", requireReadAccess("tournaments"), async (req, res) => {
  const logs = await prisma.tournamentLog.findMany({ where: { tournamentId: req.tournament.id }, orderBy: { createdAt: "desc" }, take: 500 });
  res.json(logs);
});

router.get("/:tournamentId/flyer", requireReadAccess("tournaments"), async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const flyerUrl = resolveTournamentFlyerUrl(org, req.tournament);
  if (!flyerUrl) {
    return res.status(400).json({ error: "Set up your organization's public link first (Tournaments → Public link), then download the flyer." });
  }

  const type = await prisma.tournamentType.findUnique({ where: { id: req.tournament.typeId } });

  let bytes;
  try {
    bytes = await buildTournamentFlyerPdf({ org, tournament: req.tournament, type, flyerUrl });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't generate the flyer: " + err.message });
  }

  const fileSafeName = req.tournament.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "tournament";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileSafeName}-flyer.pdf"`);
  res.send(Buffer.from(bytes));
});

// --- Roster / team management ---
// registerTeam/findOrCreatePlayer live in ../lib/tournamentLogic — shared
// with publicTournaments.js so admin-entered and public self-service
// registration go through the identical capacity-guarded logic.

const teamInclude = { players: { include: { player: true, checkIn: true } }, sponsorship: { include: { sponsor: true } } };

router.get("/:tournamentId/teams", requireReadAccess("tournaments"), async (req, res) => {
  const teams = await prisma.tournamentTeam.findMany({
    where: { tournamentId: req.tournament.id, orgId: req.user.orgId },
    include: teamInclude,
    orderBy: { createdAt: "asc" },
  });
  res.json(teams);
});

router.post("/:tournamentId/teams", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  const { teamName, players } = req.body;
  let teamId;
  try {
    teamId = await registerTeam(req.user.orgId, req.tournament, { teamName, players });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const team = await prisma.tournamentTeam.findUnique({ where: { id: teamId }, include: teamInclude });
  await addLog(req.user.orgId, req.tournament.id, {
    type: "team_registered",
    text: `Team${team.name ? ` "${team.name}"` : ""} registered with ${team.players.length} player(s)`,
    actorName: req.callerUser?.name || "",
    teamId: team.id,
  });
  res.json(team);
});

router.patch("/:tournamentId/teams/:teamId", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  const { teamName, status, sponsorshipId } = req.body;
  const data = {};
  if (teamName !== undefined) data.name = teamName?.trim() || null;
  if (status !== undefined) data.status = status;

  const linkingSponsorship = sponsorshipId !== undefined && sponsorshipId !== req.team.sponsorshipId;
  if (linkingSponsorship) {
    if (sponsorshipId) {
      const sponsorship = await prisma.tournamentSponsorship.findFirst({ where: { id: sponsorshipId, orgId: req.user.orgId, tournamentId: req.tournament.id } });
      if (!sponsorship) return res.status(400).json({ error: "That sponsorship wasn't found" });
    }
    data.sponsorshipId = sponsorshipId || null;
  }

  let updated = await prisma.tournamentTeam.update({ where: { id: req.team.id }, data, include: teamInclude });

  if (linkingSponsorship && data.sponsorshipId) {
    // Comping a team's entry — every unpaid roster row on it is settled by
    // the sponsorship, not by the individual players. Rows already paid some
    // other way are left alone.
    await prisma.tournamentTeamPlayer.updateMany({
      where: { teamId: req.team.id, paymentStatus: { not: "paid" } },
      data: { paymentMethod: "sponsor_covered", paymentStatus: "paid", amountPaid: 0 },
    });
    await addLog(req.user.orgId, req.tournament.id, {
      type: "sponsorship_comped_team",
      text: `Team${updated.name ? ` "${updated.name}"` : ""}'s entry comped by ${updated.sponsorship?.sponsor?.companyName || "a sponsorship"}`,
      actorName: req.callerUser?.name || "",
      teamId: updated.id,
      sponsorshipId: data.sponsorshipId,
    });
    // Re-fetch — the object above still reflects each player's row from
    // before the bulk update just above ran.
    updated = await prisma.tournamentTeam.findUnique({ where: { id: req.team.id }, include: teamInclude });
  } else {
    await addLog(req.user.orgId, req.tournament.id, {
      type: "team_edited",
      text: `Team${updated.name ? ` "${updated.name}"` : ""} updated`,
      actorName: req.callerUser?.name || "",
      teamId: updated.id,
    });
  }
  res.json(updated);
});

router.delete("/:tournamentId/teams/:teamId", requirePermission("tournaments", "Admin"), requireActiveTournament, async (req, res) => {
  await prisma.$transaction([
    prisma.tournamentTeam.delete({ where: { id: req.team.id } }),
    prisma.tournament.update({ where: { id: req.tournament.id }, data: { registeredTeamCount: { decrement: 1 } } }),
  ]);
  await addLog(req.user.orgId, req.tournament.id, {
    type: "team_cancelled",
    text: `Team${req.team.name ? ` "${req.team.name}"` : ""} removed`,
    actorName: req.callerUser?.name || "",
  });
  res.json({ ok: true });
});

router.post("/:tournamentId/teams/:teamId/players", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  const { name, email, phone, isCaptain } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  if (!phone || !phone.trim()) return res.status(400).json({ error: "phone is required" });

  const currentCount = await prisma.tournamentTeamPlayer.count({ where: { teamId: req.team.id } });
  if (currentCount >= req.tournament.maxTeamSize) {
    return res.status(400).json({ error: `This tournament allows at most ${req.tournament.maxTeamSize} players per team` });
  }

  const player = await findOrCreatePlayer(prisma, req.user.orgId, { name, email, phone });
  let teamPlayer;
  try {
    teamPlayer = await prisma.tournamentTeamPlayer.create({
      data: {
        orgId: req.user.orgId, tournamentId: req.tournament.id, teamId: req.team.id, playerId: player.id,
        isCaptain: !!isCaptain, amountDue: req.tournament.costPerPlayer,
      },
      include: { player: true },
    });
  } catch (err) {
    if (err.code === "P2002") return res.status(400).json({ error: `${player.name} is already on this team` });
    throw err;
  }
  await addLog(req.user.orgId, req.tournament.id, {
    type: "player_added",
    text: `${player.name} added to team${req.team.name ? ` "${req.team.name}"` : ""}`,
    actorName: req.callerUser?.name || "",
    teamId: req.team.id, playerId: player.id,
  });
  res.json(teamPlayer);
});

async function findTeamPlayerOnTeamOrThrow(teamId, teamPlayerId) {
  const tp = await prisma.tournamentTeamPlayer.findFirst({ where: { id: teamPlayerId, teamId }, include: { player: true } });
  if (!tp) throw Object.assign(new Error("Player not found on this team"), { status: 404 });
  return tp;
}

router.patch("/:tournamentId/teams/:teamId/players/:teamPlayerId", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  let existing;
  try {
    existing = await findTeamPlayerOnTeamOrThrow(req.team.id, req.params.teamPlayerId);
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

  const updated = await prisma.tournamentTeamPlayer.update({ where: { id: existing.id }, data, include: { player: true } });

  const paymentChanged = paymentMethod !== undefined || paymentStatus !== undefined || amountPaid !== undefined;
  await addLog(req.user.orgId, req.tournament.id, {
    type: paymentChanged ? "payment_recorded" : "player_edited",
    text: paymentChanged
      ? `${updated.player.name}'s payment updated to ${updated.paymentStatus}${updated.paymentMethod ? ` (${updated.paymentMethod})` : ""}`
      : `${updated.player.name}'s roster entry updated`,
    actorName: req.callerUser?.name || "",
    teamId: req.team.id, playerId: updated.playerId,
  });
  res.json(updated);
});

router.delete("/:tournamentId/teams/:teamId/players/:teamPlayerId", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  let existing;
  try {
    existing = await findTeamPlayerOnTeamOrThrow(req.team.id, req.params.teamPlayerId);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  await prisma.tournamentTeamPlayer.delete({ where: { id: existing.id } });
  await addLog(req.user.orgId, req.tournament.id, {
    type: "player_removed",
    text: `${existing.player.name} removed from team${req.team.name ? ` "${req.team.name}"` : ""}`,
    actorName: req.callerUser?.name || "",
    teamId: req.team.id,
  });
  res.json({ ok: true });
});

router.post("/:tournamentId/teams/:teamId/mark-paid", requirePermission("tournaments", "Admin"), requireActiveTournament, async (req, res) => {
  const { teamPlayerIds, paymentMethod } = req.body;
  if (!Array.isArray(teamPlayerIds) || teamPlayerIds.length === 0) {
    return res.status(400).json({ error: "teamPlayerIds is required" });
  }
  if (!["check", "in_person"].includes(paymentMethod)) {
    return res.status(400).json({ error: "paymentMethod must be check or in_person" });
  }
  const result = await prisma.tournamentTeamPlayer.updateMany({
    where: { id: { in: teamPlayerIds }, teamId: req.team.id, orgId: req.user.orgId },
    data: { paymentMethod, paymentStatus: "paid", amountPaid: req.tournament.costPerPlayer },
  });
  await addLog(req.user.orgId, req.tournament.id, {
    type: "payment_recorded",
    text: `${result.count} player(s) marked paid via ${paymentMethod === "check" ? "check" : "in person"}`,
    actorName: req.callerUser?.name || "",
    teamId: req.team.id,
  });
  res.json({ ok: true, count: result.count });
});

// --- Check-in ---
// Direct port of golf.js's check-in routes.

// Deliberately unmasked and returns the full non-cancelled roster (not
// filtered server-side by a search param) — mirrors golf.js's own
// checkin-search: verifying who's at the door is a different concern
// than any sales-credit masking elsewhere, and the admin UI does its own
// client-side substring matching.
router.get("/:tournamentId/checkin-search", requirePermission("tournaments", "Helper"), async (req, res) => {
  const teamPlayers = await prisma.tournamentTeamPlayer.findMany({
    where: { tournamentId: req.tournament.id, orgId: req.user.orgId, team: { status: { not: "cancelled" } } },
    include: { player: true, team: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(teamPlayers.map((tp) => ({
    id: tp.id, name: tp.player.name, phone: tp.player.phone, email: tp.player.email,
    teamName: tp.team.name, isCaptain: tp.isCaptain, paymentStatus: tp.paymentStatus,
  })));
});

router.get("/:tournamentId/checkins", requireReadAccess("tournaments"), async (req, res) => {
  const checkIns = await prisma.tournamentCheckIn.findMany({ where: { tournamentId: req.tournament.id, orgId: req.user.orgId }, orderBy: { checkedInAt: "desc" } });
  res.json(checkIns);
});

// Toggle — calling it again on an already-checked-in player removes the
// check-in, so a mis-tap at the door doesn't need a separate "undo" action.
router.post("/:tournamentId/checkins/:teamPlayerId", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  const teamPlayer = await prisma.tournamentTeamPlayer.findFirst({
    where: { id: req.params.teamPlayerId, orgId: req.user.orgId, tournamentId: req.tournament.id },
    include: { player: true },
  });
  if (!teamPlayer) return res.status(404).json({ error: "Player not found" });

  const existing = await prisma.tournamentCheckIn.findUnique({ where: { teamPlayerId: teamPlayer.id } });
  if (existing) {
    await prisma.tournamentCheckIn.delete({ where: { id: existing.id } });
    await addLog(req.user.orgId, req.tournament.id, {
      type: "checkin", text: `${teamPlayer.player.name}'s check-in removed`,
      actorName: req.callerUser?.name || "", teamId: teamPlayer.teamId, playerId: teamPlayer.playerId,
    });
    return res.json({ checkedIn: false });
  }

  const checkIn = await prisma.tournamentCheckIn.create({
    data: {
      orgId: req.user.orgId, tournamentId: req.tournament.id, teamPlayerId: teamPlayer.id,
      checkedInByUserId: req.user.userId, checkedInByName: req.callerUser?.name || "",
    },
  });
  await addLog(req.user.orgId, req.tournament.id, {
    type: "checkin", text: `${teamPlayer.player.name} checked in`,
    actorName: req.callerUser?.name || "", teamId: teamPlayer.teamId, playerId: teamPlayer.playerId,
  });
  res.json({ checkedIn: true, checkIn });
});

// --- Sponsorships ---
// Direct port of golf.js's sponsorship CRUD, onto the new tables.

async function findOrCreateSponsorContact(orgId, { companyName, contactName, email, phone }) {
  if (!companyName || !companyName.trim()) throw Object.assign(new Error("companyName is required"), { status: 400 });
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const existing = await prisma.tournamentSponsorContact.findFirst({ where: { orgId, email: normalizedEmail } });
    if (existing) return existing;
  }
  return prisma.tournamentSponsorContact.create({
    data: { orgId, companyName: companyName.trim(), contactName: contactName?.trim() || null, email: normalizedEmail, phone: (phone || "").trim() },
  });
}

router.get("/:tournamentId/sponsorships", requireReadAccess("tournaments"), async (req, res) => {
  const sponsorships = await prisma.tournamentSponsorship.findMany({
    where: { tournamentId: req.tournament.id, orgId: req.user.orgId },
    include: { sponsor: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(sponsorships);
});

router.post("/:tournamentId/sponsorships", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  const { companyName, contactName, email, phone, tierName, amount, benefitsText } = req.body;
  // Required for a live-entered sponsor, but deliberately not enforced
  // inside findOrCreateSponsorContact itself — that helper is shared with
  // any future historical import, where a real past sponsor legitimately
  // has no phone on record and shouldn't be dropped for it.
  if (!phone || !phone.trim()) return res.status(400).json({ error: "phone is required" });
  let sponsor;
  try {
    sponsor = await findOrCreateSponsorContact(req.user.orgId, { companyName, contactName, email, phone });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const sponsorship = await prisma.tournamentSponsorship.create({
    data: {
      orgId: req.user.orgId, tournamentId: req.tournament.id, sponsorId: sponsor.id,
      tierName: tierName?.trim() || null, amount: amount === "" || amount == null ? null : Number(amount),
      benefitsText: benefitsText?.trim() || null, status: "confirmed", source: "manual",
    },
    include: { sponsor: true },
  });
  await addLog(req.user.orgId, req.tournament.id, {
    type: "sponsorship_added",
    text: `${sponsor.companyName} added as a sponsor${tierName ? ` (${tierName})` : ""}`,
    actorName: req.callerUser?.name || "", sponsorshipId: sponsorship.id,
  });
  res.json(sponsorship);
});

router.patch("/:tournamentId/sponsorships/:sponsorshipId", requirePermission("tournaments", "Helper"), requireActiveTournament, async (req, res) => {
  const { tierName, amount, paid, paymentMethod, benefitsText, status } = req.body;
  const data = {};
  if (tierName !== undefined) data.tierName = tierName?.trim() || null;
  if (amount !== undefined) data.amount = amount === "" || amount == null ? null : Number(amount);
  if (benefitsText !== undefined) data.benefitsText = benefitsText?.trim() || null;
  if (status !== undefined) data.status = status;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod || null;

  const wasPaid = req.sponsorship.paid;
  if (paid !== undefined) {
    data.paid = !!paid;
    data.paidAt = paid ? (wasPaid ? req.sponsorship.paidAt : new Date()) : null;
  }

  const updated = await prisma.tournamentSponsorship.update({ where: { id: req.sponsorship.id }, data, include: { sponsor: true } });

  if (paid !== undefined && !!paid !== wasPaid && paid) {
    await addLog(req.user.orgId, req.tournament.id, {
      type: "sponsorship_payment_recorded",
      text: `${updated.sponsor.companyName}'s sponsorship marked paid`,
      actorName: req.callerUser?.name || "", sponsorshipId: updated.id,
    });
  }
  res.json(updated);
});

router.delete("/:tournamentId/sponsorships/:sponsorshipId", requirePermission("tournaments", "Admin"), requireActiveTournament, async (req, res) => {
  // TournamentTeam.sponsorshipId is onDelete: SetNull, so any comped team is
  // automatically unlinked — its players' payment status from the comp is
  // left as-is (an admin can revert it manually if the comp is being undone).
  await prisma.tournamentSponsorship.delete({ where: { id: req.sponsorship.id } });
  res.json({ ok: true });
});

router.post("/:tournamentId/sponsorships/:sponsorshipId/confirm", requirePermission("tournaments", "Admin"), requireActiveTournament, async (req, res) => {
  const updated = await prisma.tournamentSponsorship.update({ where: { id: req.sponsorship.id }, data: { status: "confirmed" } });
  res.json(updated);
});

// Org-wide sponsor directory — same shape as /players above: every sponsor
// ever recorded, one shared table. No query means "list everyone" (the
// Sponsor Directory screen); a query filters (admin autocomplete when
// manually adding a sponsorship).
router.get("/sponsors", requireReadAccess("tournaments"), async (req, res) => {
  const q = (req.query.search || "").trim();
  const sponsors = await prisma.tournamentSponsorContact.findMany({
    where: {
      orgId: req.user.orgId,
      ...(q ? { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    },
    take: q ? 20 : 500,
    orderBy: { companyName: "asc" },
    include: { sponsorships: { select: { amount: true, paid: true, tournament: { select: { year: true } } } } },
  });
  res.json(sponsors.map(({ sponsorships, ...sponsor }) => {
    const years = sponsorships.map((s) => s.tournament.year);
    return {
      ...sponsor,
      sponsorshipCount: sponsorships.length,
      totalRaised: sponsorships.filter((s) => s.paid).reduce((sum, s) => sum + (s.amount || 0), 0),
      lastYear: years.length ? Math.max(...years) : null,
    };
  }));
});

router.patch("/sponsors/:sponsorId", requirePermission("tournaments", "Helper"), async (req, res) => {
  const sponsor = await prisma.tournamentSponsorContact.findFirst({ where: { id: req.params.sponsorId, orgId: req.user.orgId } });
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
  const { companyName, contactName, email, phone } = req.body;
  if (companyName !== undefined && !(companyName || "").trim()) return res.status(400).json({ error: "Company name is required" });
  const updated = await prisma.tournamentSponsorContact.update({
    where: { id: sponsor.id },
    data: {
      ...(companyName !== undefined ? { companyName: companyName.trim() } : {}),
      ...(contactName !== undefined ? { contactName: (contactName || "").trim() } : {}),
      ...(email !== undefined ? { email: normalizeEmail(email) } : {}),
      ...(phone !== undefined ? { phone: (phone || "").trim() } : {}),
    },
  });
  res.json(updated);
});

router.get("/:tournamentId/stats", requireReadAccess("tournaments"), async (req, res) => {
  const [teams, teamPlayers] = await Promise.all([
    prisma.tournamentTeam.findMany({ where: { tournamentId: req.tournament.id, orgId: req.user.orgId } }),
    prisma.tournamentTeamPlayer.findMany({ where: { tournamentId: req.tournament.id, orgId: req.user.orgId } }),
  ]);
  res.json({
    totalTeams: teams.length,
    registeredTeams: teams.filter((t) => t.status === "registered").length,
    cancelledTeams: teams.filter((t) => t.status === "cancelled").length,
    capacity: req.tournament.capacity,
    totalPlayers: teamPlayers.length,
    unpaid: teamPlayers.filter((p) => p.paymentStatus === "unpaid").length,
    pending: teamPlayers.filter((p) => p.paymentStatus === "pending").length,
    paid: teamPlayers.filter((p) => p.paymentStatus === "paid").length,
    revenue: teamPlayers.filter((p) => p.paymentStatus === "paid").reduce((sum, p) => sum + (p.amountPaid || 0), 0),
  });
});

// --- Org-wide player directory ---

router.get("/players", requireReadAccess("tournaments"), async (req, res) => {
  const q = (req.query.search || "").trim();
  const players = await prisma.tournamentPlayer.findMany({
    where: {
      orgId: req.user.orgId,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    },
    take: q ? 20 : 500,
    orderBy: { name: "asc" },
    include: { teamPlayers: { select: { tournament: { select: { year: true, name: true } } } } },
  });
  res.json(players.map(({ teamPlayers, ...player }) => {
    const years = teamPlayers.map((tp) => tp.tournament.year);
    return {
      ...player,
      tournamentCount: teamPlayers.length,
      lastYear: years.length ? Math.max(...years) : null,
    };
  }));
});

router.patch("/players/:playerId", requirePermission("tournaments", "Helper"), async (req, res) => {
  const player = await prisma.tournamentPlayer.findFirst({ where: { id: req.params.playerId, orgId: req.user.orgId } });
  if (!player) return res.status(404).json({ error: "Player not found" });
  const { name, email, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  const updated = await prisma.tournamentPlayer.update({
    where: { id: player.id },
    data: { name: name.trim(), email: (email || "").trim().toLowerCase(), phone: (phone || "").trim() },
  });
  res.json(updated);
});


module.exports = router;
