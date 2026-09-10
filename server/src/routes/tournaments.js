const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess, requireOwner } = require("../lib/auth");
const { normalizeEmail, findOrCreatePlayer, registerTeam, addLog } = require("../lib/tournamentLogic");
const { stripe, createExpressAccount, createOnboardingLink } = require("../lib/stripe");
const { buildTournamentFlyerPdf, resolveTournamentFlyerUrl } = require("../lib/tournamentFlyerPdf");
const { tournamentKickoffEmailHtml } = require("../lib/tournamentKickoffEmail");
const { tournamentSponsorEmailHtml } = require("../lib/tournamentSponsorEmail");
const { buildUnsubscribeToken } = require("../lib/tournamentUnsubscribe");
const { sendEmail } = require("../lib/notifications");
const { decodeDataUrl } = require("../lib/dataUrl");
const {
  readWorkbookRows, interpretPlayerRows, interpretSponsorRows,
  RECOMMENDED_PLAYER_FORMAT, RECOMMENDED_SPONSOR_FORMAT,
} = require("../lib/tournamentHistoricalImport");
const { publishTournament, removeCalendarEventFor } = require("../lib/calendarSync");
const { extractPlayersFromRows, extractSponsorsFromRows } = require("../lib/tournamentHistoricalImportAi");

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
    try {
      connect = await prisma.orgStripeConnect.upsert({
        where: { orgId: req.user.orgId },
        update: { stripeAccountId: account.id, disconnectedAt: null, onboardingStatus: "onboarding" },
        create: { orgId: req.user.orgId, stripeAccountId: account.id, onboardingStatus: "onboarding" },
      });
    } catch (err) {
      if (err.code !== "P2002") throw err;
      // A concurrent onboard call (this module's or Golf's — they share one
      // OrgStripeConnect row) already created it with its own Stripe
      // account. Delete the orphan we just made and use the one that won.
      await stripe.accounts.del(account.id).catch(() => {});
      connect = await prisma.orgStripeConnect.findUnique({ where: { orgId: req.user.orgId } });
    }
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
    where: { orgId: req.user.orgId, isHistorical: false },
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

  // Keep the Activities feed's copy (title/venue/date) in sync with an edit
  // to an already-open tournament — same "only if already public" guard
  // events.js's own PATCH /:id uses for publishEvent.
  if (updated.status === "open") {
    const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
    await publishTournament(req.user.orgId, updated, org);
  }

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
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  await publishTournament(req.user.orgId, updated, org);
  res.json(updated);
});

router.post("/:tournamentId/close", requirePermission("tournaments", "Admin"), async (req, res) => {
  if (req.tournament.status === "closed") return res.status(400).json({ error: "This tournament is already closed" });
  const updated = await prisma.tournament.update({ where: { id: req.tournament.id }, data: { status: "closed", closedAt: new Date() } });
  await addLog(req.user.orgId, req.tournament.id, { type: "tournament_closed", text: `"${req.tournament.name}" closed`, actorName: req.callerUser?.name || "" });
  await removeCalendarEventFor("tournament", req.tournament.id);
  res.json(updated);
});

router.post("/:tournamentId/reopen", requirePermission("tournaments", "Admin"), async (req, res) => {
  if (req.tournament.status !== "closed") return res.status(400).json({ error: "This tournament isn't closed" });
  const updated = await prisma.tournament.update({ where: { id: req.tournament.id }, data: { status: "open", closedAt: null } });
  await addLog(req.user.orgId, req.tournament.id, { type: "tournament_opened", text: `"${req.tournament.name}" reopened`, actorName: req.callerUser?.name || "" });
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  await publishTournament(req.user.orgId, updated, org);
  res.json(updated);
});

// Move an open tournament back to draft — the inverse of /open, mirroring
// events.js's /:id/unpublish. Lets an admin pull a tournament off the public
// site while they finish editing it, without "closing" it (which reads as
// "the tournament is over"). Distinct from /close: draft is invisible
// everywhere and can be re-opened cleanly; closed keeps its roster/history
// visible for reporting. Allowed even with registered teams — the client
// confirms the consequence (their registration/pay pages go dark until it's
// re-opened) before calling this.
router.post("/:tournamentId/unpublish", requirePermission("tournaments", "Admin"), async (req, res) => {
  if (req.tournament.status !== "open") {
    return res.status(400).json({ error: "Only an open tournament can be moved back to draft" });
  }
  const updated = await prisma.tournament.update({
    where: { id: req.tournament.id },
    data: { status: "draft", closedAt: null },
  });
  const teamNote = req.tournament.registeredTeamCount > 0
    ? ` — ${req.tournament.registeredTeamCount} registered team${req.tournament.registeredTeamCount === 1 ? "" : "s"} lose page access until it's re-opened`
    : "";
  await addLog(req.user.orgId, req.tournament.id, {
    type: "tournament_unpublished",
    text: `"${req.tournament.name}" moved back to draft (hidden from the public)${teamNote}`,
    actorName: req.callerUser?.name || "",
  });
  await removeCalendarEventFor("tournament", req.tournament.id);
  res.json(updated);
});

router.delete("/:tournamentId", requirePermission("tournaments", "Admin"), async (req, res) => {
  const teamCount = await prisma.tournamentTeam.count({ where: { tournamentId: req.tournament.id } });
  if (teamCount > 0) {
    return res.status(400).json({ error: "This tournament has registered teams — close it instead of deleting it" });
  }
  await prisma.tournament.delete({ where: { id: req.tournament.id } });
  await removeCalendarEventFor("tournament", req.tournament.id);
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

// --- Marketing email ---
// Invites a linked tournament's past players/sponsors back for this one —
// the payoff of the previousTournamentId chain set via "Player/sponsor
// history source." Direct port of golf.js's own kickoff/sponsor-email
// section (collectGolfPlayerRecipients/collectGolfSponsorRecipients ->
// collectTournamentPlayerRecipients/collectTournamentSponsorRecipients,
// same suppression/dedupe/missing-email handling), just walking
// TournamentTeamPlayer/TournamentSponsorship rows instead of Golf's own.

// Buyer/player/sponsor emails come from one shared platform sender address,
// but should still look like they're from the org running the tournament
// and route replies to that org, not the platform. Mirrors golf.js's own
// resolveReplyTo — route files in this codebase don't import from each
// other, so this small helper is duplicated rather than shared.
async function resolveReplyTo(orgId, org) {
  if (org.contactEmail) return org.contactEmail;
  const ownerMembership = await prisma.orgMembership.findFirst({
    where: { orgId, tier: "Owner" },
    include: { user: { select: { email: true } } },
  });
  return ownerMembership?.user?.email || undefined;
}

// Walks previousTournamentId starting at startTournamentId itself (already
// the *previous* tournament by the time a caller passes
// req.tournament.previousTournamentId in), cycle-guarded, capped at 50
// hops. Only rosters on non-cancelled teams count as real past players.
// Because the chain is per-tournament, this only ever walks that
// tournament's own type's history.
async function collectTournamentPlayerRecipients(orgId, startTournamentId) {
  const seriesYears = [];
  const recipients = new Map();
  let missingEmailCount = 0;

  let cursorId = startTournamentId || null;
  const visited = new Set();

  for (let hops = 0; cursorId && hops < 50; hops++) {
    if (visited.has(cursorId)) break;
    visited.add(cursorId);
    const tournament = await prisma.tournament.findFirst({ where: { id: cursorId, orgId } });
    if (!tournament) break;
    seriesYears.push({ id: tournament.id, name: tournament.name, year: tournament.year });

    const teamPlayers = await prisma.tournamentTeamPlayer.findMany({
      where: { tournamentId: tournament.id, orgId, team: { status: { not: "cancelled" } } },
      include: { player: true },
    });
    for (const tp of teamPlayers) {
      const email = normalizeEmail(tp.player.email);
      if (!email) {
        missingEmailCount += 1;
        continue;
      }
      if (!recipients.has(email)) {
        recipients.set(email, { name: tp.player.name, email: tp.player.email.trim(), phone: tp.player.phone || "", years: [tournament.year] });
      } else {
        recipients.get(email).years.push(tournament.year);
      }
    }
    cursorId = tournament.previousTournamentId;
  }

  const suppressed = await prisma.tournamentEmailSuppression.findMany({ where: { orgId }, select: { email: true } });
  const suppressedSet = new Set(suppressed.map((s) => s.email));

  const list = Array.from(recipients.values())
    .map((r) => ({ ...r, suppressed: suppressedSet.has(normalizeEmail(r.email)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { recipients: list, missingEmailCount, seriesYears };
}

// Same chain walk, over confirmed sponsorships instead of rosters — an
// "inquiry" that was never confirmed or was declined isn't a real past
// sponsor, so those are excluded rather than just uncounted.
async function collectTournamentSponsorRecipients(orgId, startTournamentId) {
  const seriesYears = [];
  const recipients = new Map();
  let missingEmailCount = 0;

  let cursorId = startTournamentId || null;
  const visited = new Set();

  for (let hops = 0; cursorId && hops < 50; hops++) {
    if (visited.has(cursorId)) break;
    visited.add(cursorId);
    const tournament = await prisma.tournament.findFirst({ where: { id: cursorId, orgId } });
    if (!tournament) break;
    seriesYears.push({ id: tournament.id, name: tournament.name, year: tournament.year });

    const sponsorships = await prisma.tournamentSponsorship.findMany({
      where: { tournamentId: tournament.id, orgId, status: "confirmed" },
      include: { sponsor: true },
    });
    for (const s of sponsorships) {
      const email = normalizeEmail(s.sponsor.email);
      if (!email) {
        missingEmailCount += 1;
        continue;
      }
      if (!recipients.has(email)) {
        recipients.set(email, {
          name: s.sponsor.contactName || s.sponsor.companyName, companyName: s.sponsor.companyName,
          email: s.sponsor.email.trim(), phone: s.sponsor.phone || "",
          years: [tournament.year], lastTierName: s.tierName || "", lastAmount: s.amount,
        });
      } else {
        const existing = recipients.get(email);
        existing.years.push(tournament.year);
        // Most recent (highest-year) sponsorship wins for the "renew at this level" prompt.
        if (tournament.year >= Math.max(...existing.years)) {
          existing.lastTierName = s.tierName || "";
          existing.lastAmount = s.amount;
        }
      }
    }
    cursorId = tournament.previousTournamentId;
  }

  const suppressed = await prisma.tournamentEmailSuppression.findMany({ where: { orgId }, select: { email: true } });
  const suppressedSet = new Set(suppressed.map((s) => s.email));

  const list = Array.from(recipients.values())
    .map((r) => ({ ...r, suppressed: suppressedSet.has(normalizeEmail(r.email)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { recipients: list, missingEmailCount, seriesYears };
}

router.get("/:tournamentId/kickoff-email", requirePermission("tournaments", "Admin"), async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const registerUrl = resolveTournamentFlyerUrl(org, req.tournament) || "#";
  const html = tournamentKickoffEmailHtml({ org, tournament: req.tournament, registerUrl });
  res.json({ html });
});

router.get("/:tournamentId/kickoff-email/recipients", requirePermission("tournaments", "Admin"), async (req, res) => {
  const result = await collectTournamentPlayerRecipients(req.user.orgId, req.tournament.previousTournamentId);
  res.json(result);
});

router.post("/:tournamentId/kickoff-email/send-test", requirePermission("tournaments", "Admin"), async (req, res) => {
  const email = (req.body.email || "").trim();
  if (!email) return res.status(400).json({ error: "An email address is required" });

  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const registerUrl = resolveTournamentFlyerUrl(org, req.tournament) || "#";
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const firstName = (req.callerUser?.name || "").trim().split(/\s+/)[0] || "there";
  const unsubscribeUrl = `${process.env.APP_URL || "http://localhost:5173"}/tournaments-unsubscribe?token=${buildUnsubscribeToken(req.user.orgId, email)}`;
  const html = tournamentKickoffEmailHtml({ org, tournament: req.tournament, registerUrl, recipientFirstName: firstName, unsubscribeUrl });

  try {
    await sendEmail({ to: email, toName: firstName, subject: `[TEST] ${req.tournament.name} is back — save your spot`, html, fromName: org.name, replyTo, unsubscribeUrl });
  } catch (err) {
    return res.status(502).json({ error: `Send failed: ${err.message}` });
  }

  await addLog(req.user.orgId, req.tournament.id, { type: "kickoff_email_test_sent", text: `Test kickoff email sent to ${email}`, actorName: req.callerUser?.name || "" });
  res.json({ ok: true });
});

router.post("/:tournamentId/kickoff-email/send", requirePermission("tournaments", "Admin"), async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const registerUrl = resolveTournamentFlyerUrl(org, req.tournament) || "#";
  const { recipients: allRecipients } = await collectTournamentPlayerRecipients(req.user.orgId, req.tournament.previousTournamentId);
  const recipients = allRecipients.filter((r) => !r.suppressed);
  const suppressedCount = allRecipients.length - recipients.length;
  if (recipients.length === 0) {
    return res.status(400).json({ error: "No recipients to send to — build the recipient list first" });
  }
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const subject = `${req.tournament.name} is back — save your spot`;
  const appUrl = process.env.APP_URL || "http://localhost:5173";

  let sent = 0;
  for (const recipient of recipients) {
    const firstName = recipient.name.trim().split(/\s+/)[0];
    const unsubscribeUrl = `${appUrl}/tournaments-unsubscribe?token=${buildUnsubscribeToken(req.user.orgId, recipient.email)}`;
    const html = tournamentKickoffEmailHtml({ org, tournament: req.tournament, registerUrl, recipientFirstName: firstName, unsubscribeUrl });
    try {
      await sendEmail({ to: recipient.email, toName: recipient.name, subject, html, fromName: org.name, replyTo, unsubscribeUrl });
      sent++;
    } catch (err) {
      console.error(`Tournament kickoff email send failed for ${recipient.email}:`, err.message);
    }
  }

  await addLog(req.user.orgId, req.tournament.id, {
    type: "kickoff_email_sent",
    text: `Kickoff email sent to ${sent} of ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}${suppressedCount ? ` (${suppressedCount} unsubscribed and skipped)` : ""}`,
    actorName: req.callerUser?.name || "",
  });
  res.json({ sent, total: recipients.length, suppressed: suppressedCount });
});

router.get("/:tournamentId/sponsor-email", requirePermission("tournaments", "Admin"), async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const registerUrl = resolveTournamentFlyerUrl(org, req.tournament) || "#";
  const html = tournamentSponsorEmailHtml({ org, tournament: req.tournament, registerUrl });
  res.json({ html });
});

router.get("/:tournamentId/sponsor-email/recipients", requirePermission("tournaments", "Admin"), async (req, res) => {
  const result = await collectTournamentSponsorRecipients(req.user.orgId, req.tournament.previousTournamentId);
  res.json(result);
});

router.post("/:tournamentId/sponsor-email/send-test", requirePermission("tournaments", "Admin"), async (req, res) => {
  const email = (req.body.email || "").trim();
  if (!email) return res.status(400).json({ error: "An email address is required" });

  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const registerUrl = resolveTournamentFlyerUrl(org, req.tournament) || "#";
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const firstName = (req.callerUser?.name || "").trim().split(/\s+/)[0] || "there";
  const unsubscribeUrl = `${process.env.APP_URL || "http://localhost:5173"}/tournaments-unsubscribe?token=${buildUnsubscribeToken(req.user.orgId, email)}`;
  const html = tournamentSponsorEmailHtml({ org, tournament: req.tournament, registerUrl, recipientName: firstName, unsubscribeUrl });

  try {
    await sendEmail({ to: email, toName: firstName, subject: `[TEST] ${req.tournament.name} sponsorship opportunities are open`, html, fromName: org.name, replyTo, unsubscribeUrl });
  } catch (err) {
    return res.status(502).json({ error: `Send failed: ${err.message}` });
  }

  await addLog(req.user.orgId, req.tournament.id, { type: "sponsor_email_test_sent", text: `Test sponsor email sent to ${email}`, actorName: req.callerUser?.name || "" });
  res.json({ ok: true });
});

router.post("/:tournamentId/sponsor-email/send", requirePermission("tournaments", "Admin"), async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const registerUrl = resolveTournamentFlyerUrl(org, req.tournament) || "#";
  const { recipients: allRecipients } = await collectTournamentSponsorRecipients(req.user.orgId, req.tournament.previousTournamentId);
  const recipients = allRecipients.filter((r) => !r.suppressed);
  const suppressedCount = allRecipients.length - recipients.length;
  if (recipients.length === 0) {
    return res.status(400).json({ error: "No recipients to send to — build the recipient list first" });
  }
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const subject = `${req.tournament.name} sponsorship opportunities are open`;
  const appUrl = process.env.APP_URL || "http://localhost:5173";

  let sent = 0;
  for (const recipient of recipients) {
    const unsubscribeUrl = `${appUrl}/tournaments-unsubscribe?token=${buildUnsubscribeToken(req.user.orgId, recipient.email)}`;
    const html = tournamentSponsorEmailHtml({
      org, tournament: req.tournament, registerUrl, recipientName: recipient.name,
      lastTierName: recipient.lastTierName, lastAmount: recipient.lastAmount, unsubscribeUrl,
    });
    try {
      await sendEmail({ to: recipient.email, toName: recipient.name, subject, html, fromName: org.name, replyTo, unsubscribeUrl });
      sent++;
    } catch (err) {
      console.error(`Tournament sponsor email send failed for ${recipient.email}:`, err.message);
    }
  }

  await addLog(req.user.orgId, req.tournament.id, {
    type: "sponsor_email_sent",
    text: `Sponsor email sent to ${sent} of ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}${suppressedCount ? ` (${suppressedCount} unsubscribed and skipped)` : ""}`,
    actorName: req.callerUser?.name || "",
  });
  res.json({ sent, total: recipients.length, suppressed: suppressedCount });
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
  // paymentStatus: { not: "paid" } so this can't silently overwrite a row
  // that already paid online (Stripe) — turning a real card payment into a
  // fake "check" record and muddying reconciliation. An already-paid row in
  // the selection is left alone and reported back as skipped.
  const result = await prisma.tournamentTeamPlayer.updateMany({
    where: { id: { in: teamPlayerIds }, teamId: req.team.id, orgId: req.user.orgId, paymentStatus: { not: "paid" } },
    data: { paymentMethod, paymentStatus: "paid", amountPaid: req.tournament.costPerPlayer },
  });
  const skipped = teamPlayerIds.length - result.count;
  await addLog(req.user.orgId, req.tournament.id, {
    type: "payment_recorded",
    text: `${result.count} player(s) marked paid via ${paymentMethod === "check" ? "check" : "in person"}`,
    actorName: req.callerUser?.name || "",
    teamId: req.team.id,
  });
  res.json({ ok: true, count: result.count, skipped });
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

// --- Historical imports ---
// Past-years player/sponsor data, uploaded once so the "email last year's
// players/sponsors" marketing lists have real data to work with. Direct
// port of golf.js's own section — an import targets an isHistorical
// Tournament "shell" that can receive players and/or sponsors, either
// created fresh by the first import or added to by a second import later
// (previousTournamentId is a single field shared by both marketing tracks
// on a real tournament, so both lists for one archival year need to live
// on the same row for a real tournament to ever link to both at once).

router.get("/historical-imports", requireReadAccess("tournaments"), async (req, res) => {
  const tournaments = await prisma.tournament.findMany({
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
// archival-year row) or creates a fresh one. `typeId` is required only on
// the fresh-creation path (an existing shell already has one) — unlike
// Golf, Tournament.typeId is non-nullable, so a shell needs a real type
// from the org's own list just like any other tournament.
async function findOrCreateHistoricalTournament(orgId, { existingTournamentId, year, name, previousTournamentId, typeId }) {
  if (existingTournamentId) {
    const existing = await prisma.tournament.findFirst({ where: { id: existingTournamentId, orgId, isHistorical: true } });
    if (!existing) throw Object.assign(new Error("That historical import wasn't found"), { status: 400 });
    return existing;
  }
  const yearNum = Number(year);
  if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2200) {
    throw Object.assign(new Error("A valid year is required"), { status: 400 });
  }
  const type = await prisma.tournamentType.findFirst({ where: { id: typeId, orgId } });
  if (!type) throw Object.assign(new Error("Choose a tournament type for this archival year"), { status: 400 });
  const resolvedPreviousId = await resolvePreviousTournamentId(orgId, previousTournamentId, null);
  const slug = await uniqueSlug(orgId, name?.trim() || `${yearNum} ${type.name} (imported)`);
  return prisma.tournament.create({
    data: {
      orgId,
      typeId: type.id,
      slug,
      name: (name && name.trim()) || `${yearNum} ${type.name} (imported)`,
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

// Reads an uploaded file (xlsx or csv, as a data URL) into raw rows, then
// tries the free deterministic reader first; falls back to the AI-assisted
// one only when the rules-based pass can't find a usable name/company
// column at all, or when the caller explicitly asks for it (a "this doesn't
// look right" retry after reviewing a bad rules-based read). Either path
// returns the exact same shape — nothing is saved here, this only powers
// the review screen the org confirms or corrects before anything commits.
router.post("/historical-imports/players/interpret", requirePermission("tournaments", "Admin"), async (req, res) => {
  const buffer = decodeDataUrl(req.body.file);
  if (!buffer) return res.status(400).json({ error: "Choose a file first" });
  let rawRows;
  try {
    rawRows = readWorkbookRows(buffer);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (req.body.force !== "ai") {
    const { rows, skipped, confident } = interpretPlayerRows(rawRows);
    if (confident && rows.length > 0) {
      return res.json({ method: "rules", rows, skipped });
    }
  }

  try {
    const rows = await extractPlayersFromRows(rawRows, req.user.orgId);
    if (rows.length === 0) return res.status(400).json({ error: `Couldn't find any players in that file. Try the recommended format: ${RECOMMENDED_PLAYER_FORMAT}` });
    res.json({ method: "ai", rows, skipped: 0 });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post("/historical-imports/sponsors/interpret", requirePermission("tournaments", "Admin"), async (req, res) => {
  const buffer = decodeDataUrl(req.body.file);
  if (!buffer) return res.status(400).json({ error: "Choose a file first" });
  let rawRows;
  try {
    rawRows = readWorkbookRows(buffer);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (req.body.force !== "ai") {
    const { rows, skipped, confident } = interpretSponsorRows(rawRows);
    if (confident && rows.length > 0) {
      return res.json({ method: "rules", rows, skipped });
    }
  }

  try {
    const rows = await extractSponsorsFromRows(rawRows, req.user.orgId);
    if (rows.length === 0) return res.status(400).json({ error: `Couldn't find any sponsors in that file. Try the recommended format: ${RECOMMENDED_SPONSOR_FORMAT}` });
    res.json({ method: "ai", rows, skipped: 0 });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Commits an already-reviewed row list (from the interpret step above,
// possibly hand-edited) — no parsing happens here, just the actual writes.
router.post("/historical-imports/players", requirePermission("tournaments", "Admin"), async (req, res) => {
  const { rows, existingTournamentId, year, name, previousTournamentId, typeId } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "No players to import" });
  }
  for (const r of rows) {
    if (!r || !r.name || !String(r.name).trim()) return res.status(400).json({ error: "Every player needs a name" });
  }

  let tournament;
  try {
    tournament = await findOrCreateHistoricalTournament(req.user.orgId, { existingTournamentId, year, name, previousTournamentId, typeId });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  // Group rows into teams by (trimmed, case-insensitive) team key; no key
  // means that row is its own one-person team, not grouped with any other
  // keyless row.
  const teamGroups = [];
  const namedGroupIndex = new Map();
  for (const r of rows) {
    const teamKey = r.teamKey ? String(r.teamKey).trim() : "";
    if (teamKey) {
      const key = teamKey.toLowerCase();
      if (!namedGroupIndex.has(key)) {
        namedGroupIndex.set(key, teamGroups.length);
        teamGroups.push({ teamName: teamKey, rows: [] });
      }
      teamGroups[namedGroupIndex.get(key)].rows.push(r);
    } else {
      teamGroups.push({ teamName: null, rows: [r] });
    }
  }

  let imported = 0;
  for (const group of teamGroups) {
    const team = await prisma.tournamentTeam.create({ data: { orgId: req.user.orgId, tournamentId: tournament.id, name: group.teamName } });
    for (let i = 0; i < group.rows.length; i++) {
      const r = group.rows[i];
      const player = await findOrCreatePlayer(prisma, req.user.orgId, { name: r.name, email: r.email, phone: r.phone });
      await prisma.tournamentTeamPlayer.create({
        data: {
          orgId: req.user.orgId, tournamentId: tournament.id, teamId: team.id, playerId: player.id,
          isCaptain: r.isCaptain != null ? !!r.isCaptain : i === 0,
          amountDue: 0,
        },
      });
      imported++;
    }
  }

  res.json({ ok: true, tournamentId: tournament.id, imported, teams: teamGroups.length });
});

router.post("/historical-imports/sponsors", requirePermission("tournaments", "Admin"), async (req, res) => {
  const { rows, existingTournamentId, year, name, previousTournamentId, typeId } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "No sponsors to import" });
  }
  for (const r of rows) {
    if (!r || !r.companyName || !String(r.companyName).trim()) return res.status(400).json({ error: "Every sponsor needs a company name" });
  }

  let tournament;
  try {
    tournament = await findOrCreateHistoricalTournament(req.user.orgId, { existingTournamentId, year, name, previousTournamentId, typeId });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  let imported = 0;
  for (const r of rows) {
    const sponsor = await findOrCreateSponsorContact(req.user.orgId, { companyName: r.companyName, contactName: r.contactName, email: r.email, phone: r.phone });
    await prisma.tournamentSponsorship.create({
      data: {
        orgId: req.user.orgId, tournamentId: tournament.id, sponsorId: sponsor.id,
        tierName: r.tierName || null, amount: r.amount || null, status: "confirmed", source: "manual",
      },
    });
    imported++;
  }

  res.json({ ok: true, tournamentId: tournament.id, imported });
});

router.delete("/historical-imports/:id", requirePermission("tournaments", "Admin"), async (req, res) => {
  const tournament = await prisma.tournament.findFirst({ where: { id: req.params.id, orgId: req.user.orgId, isHistorical: true } });
  if (!tournament) return res.status(404).json({ error: "That historical import wasn't found" });
  await prisma.tournament.delete({ where: { id: tournament.id } });
  res.json({ ok: true });
});

// Lets an import's label/link be changed after the fact — a new import's
// "pull past players/sponsors from" dropdown can only offer imports that
// already existed at the time it was created, so an older year imported
// later needs this to connect to it.
router.patch("/historical-imports/:id", requirePermission("tournaments", "Admin"), async (req, res) => {
  const tournament = await prisma.tournament.findFirst({ where: { id: req.params.id, orgId: req.user.orgId, isHistorical: true } });
  if (!tournament) return res.status(404).json({ error: "That historical import wasn't found" });
  const { name, previousTournamentId } = req.body;
  let resolvedPreviousId;
  try {
    resolvedPreviousId = await resolvePreviousTournamentId(req.user.orgId, previousTournamentId, tournament.id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data: { name: name?.trim() || tournament.name, previousTournamentId: resolvedPreviousId },
  });
  res.json(updated);
});

// --- Interest signups ---
// Leads captured from the public tournaments page's "Notify me" form
// while nothing is open — see publicTournaments.js's POST
// /:orgSlug/interest. Not nested under /:tournamentId since a signup can
// exist before any tournament does. Direct port of golf.js's own pair.

router.get("/interest-signups", requireReadAccess("tournaments"), async (req, res) => {
  const signups = await prisma.tournamentInterestSignup.findMany({
    where: { orgId: req.user.orgId },
    include: { type: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(signups.map(({ type, ...s }) => ({ ...s, typeName: type?.name || null })));
});

router.patch("/interest-signups/:id", requirePermission("tournaments", "Helper"), async (req, res) => {
  const signup = await prisma.tournamentInterestSignup.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!signup) return res.status(404).json({ error: "Signup not found" });
  const updated = await prisma.tournamentInterestSignup.update({
    where: { id: signup.id },
    data: { contactedAt: req.body.contacted ? new Date() : null },
    include: { type: { select: { name: true } } },
  });
  const { type, ...rest } = updated;
  res.json({ ...rest, typeName: type?.name || null });
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
