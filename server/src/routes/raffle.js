const crypto = require("crypto");
const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { maskRaffleTicket, computeRaffleStats, eligibleTicketPool, fmtUsDate, computeRaffleFinancials } = require("../lib/raffleLogic");
const { saleConfirmationHtml, electronicTicketHtml, paymentReminderHtml } = require("../lib/raffleEmails");
const { sendEmail } = require("../lib/notifications");
const { buildSellerActivityReportPdf, buildTicketsTurnedInReportPdf } = require("../lib/raffleReportsPdf");
const { parseHistoricalCsv } = require("../lib/raffleHistoricalImport");
const { raffleKickoffEmailHtml } = require("../lib/raffleKickoffEmail");
const { buildUnsubscribeToken, normalizeEmail } = require("../lib/raffleUnsubscribe");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// Denormalized names (soldByName, assignedSellerName, log sellerName) need the
// caller's current display name — the JWT only carries userId/orgId (see
// auth.js), so load it fresh once per request, same spirit as loadPermissions.
router.use(async (req, res, next) => {
  req.callerUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, name: true } });
  next();
});

// A lodge can run more than one raffle at once, so every sub-resource route
// is nested under /games/:gameId. This loads + ownership-checks the game
// once per request for any route containing that param, attaching it to
// req.raffleGame — handlers below never need to repeat the lookup.
router.param("gameId", async (req, res, next, gameId) => {
  const game = await prisma.raffleGame.findFirst({ where: { id: gameId, orgId: req.user.orgId } });
  if (!game) return res.status(404).json({ error: "Raffle not found" });
  req.raffleGame = game;
  next();
});

// Blocks state-changing actions once a raffle is closed — reads stay open
// for historical reporting, but nothing can be sold/drawn/checked-in after
// the fact.
function requireActiveGame(req, res, next) {
  if (req.raffleGame.status === "closed") {
    return res.status(400).json({ error: "This raffle is closed" });
  }
  next();
}

// Single canonical activity-log writer — every state-changing endpoint below
// goes through this instead of writing RaffleLog rows inline at each call site.
async function addRaffleLog(orgId, gameId, { type, text, sellerName = "", ticketNumber = null, assignedSellerId = null }) {
  await prisma.raffleLog.create({ data: { orgId, gameId, type, text, sellerName, ticketNumber, assignedSellerId } });
}

// Buyer emails come from one shared platform sender address, but should
// still look like they're from the lodge running the raffle and route
// replies to that lodge, not to the platform. Falls back to the org's Owner
// login email when no explicit contact email has been set.
async function resolveReplyTo(orgId, org) {
  if (org.contactEmail) return org.contactEmail;
  const ownerMembership = await prisma.orgMembership.findFirst({
    where: { orgId, tier: "Owner" },
    include: { user: { select: { email: true } } },
  });
  return ownerMembership?.user?.email || undefined;
}

// Determines who gets "credit" as the assigned seller for a sale. A non-admin
// (or an admin who didn't pass assignToSellerId) keeps the ticket's existing
// assignment, or self-assigns if the caller is a Helper and nothing was
// assigned yet. An Admin may re-credit the sale to any other Admin/Helper.
async function resolveCreditSeller(req, assignToSellerId, ticket) {
  const isAdmin = req.moduleGrants.raffle === "Admin";
  if (!assignToSellerId || !isAdmin) {
    if (ticket.assignedSellerId) {
      return { assignedSellerId: ticket.assignedSellerId, assignedSellerName: ticket.assignedSellerName };
    }
    if (req.moduleGrants.raffle === "Helper") {
      return { assignedSellerId: req.user.userId, assignedSellerName: req.callerUser?.name || "" };
    }
    return { assignedSellerId: null, assignedSellerName: "" };
  }
  const seller = await prisma.user.findFirst({ where: { id: assignToSellerId, orgId: req.user.orgId } });
  if (!seller) throw Object.assign(new Error("Seller not found"), { status: 404 });
  const grant = await prisma.moduleGrant.findUnique({ where: { userId_module: { userId: seller.id, module: "raffle" } } });
  if (!grant || !["Admin", "Helper"].includes(grant.tier)) {
    throw Object.assign(new Error("Selected user is not a raffle admin or seller"), { status: 400 });
  }
  return { assignedSellerId: seller.id, assignedSellerName: seller.name };
}

// --- Game management ---

// Historical imports are deliberately excluded here — they're not a real,
// selectable raffle (no sales, drawings, or check-ins happen against them),
// just archived past-years ticket data kept so the cross-game "past buyers"
// lookup has something to find. See /historical-imports below.
router.get("/games", requireReadAccess("raffle"), async (req, res) => {
  const games = await prisma.raffleGame.findMany({ where: { orgId: req.user.orgId, isHistorical: false }, orderBy: { createdAt: "desc" } });
  res.json(games);
});

// Validates an admin-chosen "pull past buyers from" link: must be another
// game in the same org and can't point at itself. Returns null for "no
// link" (a brand-new org with no prior raffle, or one that deliberately
// doesn't want buyer history carried over).
async function resolvePreviousGameId(orgId, previousGameId, selfId) {
  if (!previousGameId) return null;
  if (previousGameId === selfId) {
    throw Object.assign(new Error("A raffle can't link to itself"), { status: 400 });
  }
  const game = await prisma.raffleGame.findFirst({ where: { id: previousGameId, orgId } });
  if (!game) throw Object.assign(new Error("That linked raffle wasn't found"), { status: 400 });
  return game.id;
}

// Ticket terms + drawing-night details — all optional except admitsPerTicket
// (defaults to 1 guest), so a raffle that doesn't care about any of this
// isn't forced to fill it in.
function resolveEventFields(body, totalTickets) {
  const admitsPerTicket = body.admitsPerTicket == null || body.admitsPerTicket === "" ? 1 : Number(body.admitsPerTicket);
  if (!Number.isInteger(admitsPerTicket) || admitsPerTicket < 1) {
    throw Object.assign(new Error("Admits per ticket must be a whole number of 1 or more"), { status: 400 });
  }
  let minimumTicketsSold = null;
  if (body.minimumTicketsSold != null && body.minimumTicketsSold !== "") {
    minimumTicketsSold = Number(body.minimumTicketsSold);
    if (!Number.isInteger(minimumTicketsSold) || minimumTicketsSold < 0 || minimumTicketsSold > totalTickets) {
      throw Object.assign(new Error("Minimum tickets sold must be a whole number between 0 and the total ticket count"), { status: 400 });
    }
  }
  return {
    admitsPerTicket,
    minimumTicketsSold,
    eventVenue: body.eventVenue?.trim() || null,
    eventDoorsOpenTime: body.eventDoorsOpenTime?.trim() || null,
    eventDetails: body.eventDetails?.trim() || null,
  };
}

router.post("/games", requirePermission("raffle", "Admin"), async (req, res) => {
  const { name, startNumber, endNumber, ticketPrice, startDate, endDate, previousGameId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

  const start = Number(startNumber);
  const end = Number(endNumber);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return res.status(400).json({ error: "startNumber and endNumber must be whole numbers, with endNumber >= startNumber" });
  }
  if (end - start + 1 > 20000) {
    return res.status(400).json({ error: "That's more than 20,000 tickets — double-check the ticket range" });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  const parsedStart = new Date(startDate);
  const parsedEnd = new Date(endDate);
  if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return res.status(400).json({ error: "startDate and endDate must be valid dates" });
  }
  if (parsedEnd < parsedStart) {
    return res.status(400).json({ error: "The closing date must be on or after the start date" });
  }
  const price = Number(ticketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: "ticketPrice must be a positive number" });
  }
  let resolvedPreviousGameId, eventFields;
  try {
    resolvedPreviousGameId = await resolvePreviousGameId(req.user.orgId, previousGameId, null);
    eventFields = resolveEventFields(req.body, end - start + 1);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const game = await prisma.raffleGame.create({
    data: {
      orgId: req.user.orgId, name: name.trim(), startNumber: start, endNumber: end,
      totalTickets: end - start + 1, ticketPrice: price,
      raffleStartDate: parsedStart, raffleEndDate: parsedEnd,
      previousGameId: resolvedPreviousGameId,
      ...eventFields,
    },
  });

  const ticketData = [];
  for (let n = start; n <= end; n++) ticketData.push({ orgId: req.user.orgId, gameId: game.id, number: n });
  await prisma.raffleTicket.createMany({ data: ticketData });

  await addRaffleLog(req.user.orgId, game.id, {
    type: "game_started",
    text: `"${game.name}" started: tickets #${start}–#${end} (${end - start + 1} total), ${fmtUsDate(parsedStart)} – ${fmtUsDate(parsedEnd)}`,
  });

  res.json(game);
});

router.get("/games/:gameId", requireReadAccess("raffle"), async (req, res) => {
  res.json(req.raffleGame);
});

// NYS evaluates the $30,000 raffle license threshold on YEAR-TO-DATE net
// proceeds across every raffle the org runs, not any single raffle in
// isolation (see computeRaffleFinancials's comment) — so this spans every
// RaffleGame in the org for the given year, not just one game.
router.get("/financials/:year", requireReadAccess("raffle"), async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isInteger(year)) return res.status(400).json({ error: "year must be a whole number" });

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const games = await prisma.raffleGame.findMany({
    where: { orgId: req.user.orgId, raffleEndDate: { gte: yearStart, lt: yearEnd } },
    orderBy: { raffleEndDate: "asc" },
  });

  const perGame = [];
  for (const game of games) {
    const [tickets, drawings, expenses] = await Promise.all([
      prisma.raffleTicket.findMany({ where: { gameId: game.id, orgId: req.user.orgId } }),
      prisma.raffleDrawing.findMany({ where: { gameId: game.id, orgId: req.user.orgId } }),
      prisma.raffleExpense.findMany({ where: { gameId: game.id, orgId: req.user.orgId } }),
    ]);
    const revenue = computeRaffleStats(tickets).revenue;
    const totalPrizeValue = drawings.reduce((sum, d) => sum + d.prizeAmount, 0);
    const actualExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    perGame.push({
      gameId: game.id, name: game.name, raffleEndDate: game.raffleEndDate, status: game.status,
      revenue, totalPrizeValue, actualExpenses, estimatedExpenses: game.estimatedExpenses,
    });
  }

  res.json({ year, financials: computeRaffleFinancials(perGame), games: perGame });
});

// Corrects a raffle's details after it's already been started — a typo'd
// ticket count, a closing date that needs to move, adding more tickets once
// the first batch is selling well. Locked once the raffle is closed, same as
// Bell Jar's closed-deal immutability (see deals.js).
//
// Shrinking the ticket range is allowed, but only where it's safe: any ticket
// number that would fall outside the new range must still be untouched
// ("available") — you can't shrink past a ticket someone's already reserved,
// sold, or received funds for. Expanding the range creates new ticket rows
// for just the added numbers; nothing about existing tickets is touched.
router.patch("/games/:gameId", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const game = req.raffleGame;
  const { name, startNumber, endNumber, ticketPrice, startDate, endDate, previousGameId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

  const start = Number(startNumber);
  const end = Number(endNumber);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return res.status(400).json({ error: "startNumber and endNumber must be whole numbers, with endNumber >= startNumber" });
  }
  if (end - start + 1 > 20000) {
    return res.status(400).json({ error: "That's more than 20,000 tickets — double-check the ticket range" });
  }
  if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate are required" });
  const parsedStart = new Date(startDate);
  const parsedEnd = new Date(endDate);
  if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return res.status(400).json({ error: "startDate and endDate must be valid dates" });
  }
  if (parsedEnd < parsedStart) return res.status(400).json({ error: "The closing date must be on or after the start date" });
  const price = Number(ticketPrice);
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "ticketPrice must be a positive number" });
  let resolvedPreviousGameId, eventFields;
  try {
    resolvedPreviousGameId = await resolvePreviousGameId(req.user.orgId, previousGameId, game.id);
    eventFields = resolveEventFields(req.body, end - start + 1);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const shrinkFromStart = start > game.startNumber ? { number: { gte: game.startNumber, lt: start } } : null;
  const shrinkFromEnd = end < game.endNumber ? { number: { gt: end, lte: game.endNumber } } : null;
  const shrinkRanges = [shrinkFromStart, shrinkFromEnd].filter(Boolean);
  if (shrinkRanges.length) {
    const touched = await prisma.raffleTicket.findFirst({
      where: { gameId: game.id, status: { not: "available" }, OR: shrinkRanges },
      orderBy: { number: "asc" },
    });
    if (touched) {
      return res.status(400).json({
        error: `Can't shrink the ticket range — #${touched.number} is already ${touched.status.replace("_", " ")} and would fall outside the new range`,
      });
    }
  }

  const newNumbers = [];
  if (start < game.startNumber) for (let n = start; n < game.startNumber; n++) newNumbers.push(n);
  if (end > game.endNumber) for (let n = game.endNumber + 1; n <= end; n++) newNumbers.push(n);

  await prisma.$transaction([
    ...(shrinkRanges.length ? [prisma.raffleTicket.deleteMany({ where: { gameId: game.id, OR: shrinkRanges } })] : []),
    ...(newNumbers.length
      ? [prisma.raffleTicket.createMany({ data: newNumbers.map((number) => ({ orgId: req.user.orgId, gameId: game.id, number })) })]
      : []),
    prisma.raffleGame.update({
      where: { id: game.id },
      data: {
        name: name.trim(), startNumber: start, endNumber: end, totalTickets: end - start + 1,
        ticketPrice: price, raffleStartDate: parsedStart, raffleEndDate: parsedEnd,
        previousGameId: resolvedPreviousGameId,
        ...eventFields,
      },
    }),
  ]);

  const changes = [];
  if (name.trim() !== game.name) changes.push("name");
  if (start !== game.startNumber || end !== game.endNumber) changes.push(`ticket range #${start}–#${end} (was #${game.startNumber}–#${game.endNumber})`);
  if (price !== game.ticketPrice) changes.push("ticket price");
  if (parsedStart.getTime() !== game.raffleStartDate.getTime() || parsedEnd.getTime() !== game.raffleEndDate.getTime()) changes.push("dates");
  await addRaffleLog(req.user.orgId, game.id, { type: "game_edited", text: `"${game.name}" edited: ${changes.join(", ") || "no changes"}` });

  const updated = await prisma.raffleGame.findUnique({ where: { id: game.id } });
  res.json(updated);
});

router.post("/games/:gameId/close", requirePermission("raffle", "Admin"), async (req, res) => {
  if (req.raffleGame.status === "closed") return res.status(400).json({ error: "This raffle is already closed" });
  const updated = await prisma.raffleGame.update({ where: { id: req.raffleGame.id }, data: { status: "closed", closedAt: new Date() } });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "game_closed", text: `"${req.raffleGame.name}" closed` });
  res.json(updated);
});

router.post("/games/:gameId/reopen", requirePermission("raffle", "Admin"), async (req, res) => {
  if (req.raffleGame.status === "active") return res.status(400).json({ error: "This raffle is already active" });
  const updated = await prisma.raffleGame.update({ where: { id: req.raffleGame.id }, data: { status: "active", closedAt: null } });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "game_reopened", text: `"${req.raffleGame.name}" reopened` });
  res.json(updated);
});

// Permanently removes a raffle logged in error — every ticket, sale, log
// entry, and drawing goes with it (all cascade-delete at the DB level via
// each child model's `game` relation, so no manual cleanup transaction is
// needed here, unlike Bell Jar's deal deletion). Locked once closed, same
// immutability rule as editing: a closed raffle's history is the record,
// not something to erase.
router.delete("/games/:gameId", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  await prisma.raffleGame.delete({ where: { id: req.raffleGame.id } });
  res.json({ ok: true });
});

// --- Historical imports ---
// Past-years ticket data, uploaded once so the cross-game "past buyers"
// lookup (see /games/:gameId/tickets/:number/history below) has real data to
// find instead of coming up empty until the org has run a few raffles inside
// this app. Each import becomes its own isHistorical RaffleGame + its tickets
// — reusing the existing game/ticket schema and the history lookup as-is —
// but is excluded from GET /games so it never shows up as a selectable,
// operational raffle.

router.get("/historical-imports", requireReadAccess("raffle"), async (req, res) => {
  const games = await prisma.raffleGame.findMany({
    where: { orgId: req.user.orgId, isHistorical: true },
    orderBy: { raffleStartDate: "desc" },
    include: { _count: { select: { tickets: true } } },
  });
  res.json(games.map((g) => ({ id: g.id, name: g.name, raffleStartDate: g.raffleStartDate, ticketCount: g._count.tickets, previousGameId: g.previousGameId })));
});

router.post("/historical-imports", requirePermission("raffle", "Admin"), async (req, res) => {
  const { year, name, csv, previousGameId } = req.body;
  const yearNum = Number(year);
  if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2200) {
    return res.status(400).json({ error: "A valid raffle year is required" });
  }
  if (!csv || !csv.trim()) return res.status(400).json({ error: "Paste or choose a CSV file first" });

  let rows, skipped;
  try {
    ({ rows, skipped } = parseHistoricalCsv(csv));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: "No usable rows found — each row needs at least a ticket number and buyer name" });
  }
  let resolvedPreviousGameId;
  try {
    resolvedPreviousGameId = await resolvePreviousGameId(req.user.orgId, previousGameId, null);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const numbers = rows.map((r) => r.number);
  const game = await prisma.raffleGame.create({
    data: {
      orgId: req.user.orgId,
      name: (name && name.trim()) || `${yearNum} 400 Club (imported)`,
      startNumber: Math.min(...numbers),
      endNumber: Math.max(...numbers),
      totalTickets: rows.length,
      ticketPrice: 0,
      raffleStartDate: new Date(Date.UTC(yearNum, 0, 1)),
      raffleEndDate: new Date(Date.UTC(yearNum, 11, 31)),
      status: "closed",
      closedAt: new Date(Date.UTC(yearNum, 11, 31)),
      isHistorical: true,
      previousGameId: resolvedPreviousGameId,
    },
  });
  await prisma.raffleTicket.createMany({
    data: rows.map((r) => ({
      orgId: req.user.orgId,
      gameId: game.id,
      number: r.number,
      status: "funds_received",
      buyer: r.buyer,
      phone: r.phone,
      email: r.email,
      address: r.address,
      assignedSellerName: r.sellerName,
      soldByName: "Historical import",
      tenderType: r.amount != null ? "cash" : null,
      tenderAmount: r.amount,
      soldAt: new Date(Date.UTC(yearNum, 5, 1)),
    })),
  });

  res.json({ ok: true, gameId: game.id, imported: rows.length, skipped });
});

router.delete("/historical-imports/:gameId", requirePermission("raffle", "Admin"), async (req, res) => {
  if (!req.raffleGame.isHistorical) return res.status(400).json({ error: "That raffle isn't a historical import" });
  await prisma.raffleGame.delete({ where: { id: req.raffleGame.id } });
  res.json({ ok: true });
});

// Lets an import's link be set/changed after the fact — a new import's
// "pull past buyers from" dropdown can only offer imports that already
// existed at the time it was created, so an older year imported later (or a
// chain being caught up after the fact) needs this to connect to it.
router.patch("/historical-imports/:gameId", requirePermission("raffle", "Admin"), async (req, res) => {
  if (!req.raffleGame.isHistorical) return res.status(400).json({ error: "That raffle isn't a historical import" });
  const { name, previousGameId } = req.body;
  let resolvedPreviousGameId;
  try {
    resolvedPreviousGameId = await resolvePreviousGameId(req.user.orgId, previousGameId, req.raffleGame.id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const updated = await prisma.raffleGame.update({
    where: { id: req.raffleGame.id },
    data: {
      ...(name && name.trim() ? { name: name.trim() } : {}),
      previousGameId: resolvedPreviousGameId,
    },
  });
  res.json({ id: updated.id, name: updated.name, previousGameId: updated.previousGameId });
});

// --- Tickets / log / stats (read) ---

router.get("/games/:gameId/tickets", requireReadAccess("raffle"), async (req, res) => {
  const tickets = await prisma.raffleTicket.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId },
    orderBy: { number: "asc" },
  });
  res.json(tickets.map((t) => maskRaffleTicket(t, req.user.userId, req.moduleGrants.raffle)));
});

// Cross-game lookup, not scoped to the current game's own tickets: "who
// bought this same ticket number in one of our other raffles." Powers the
// "previously purchased by / use this buyer" pick in the sell form. Gated at
// Helper (same tier as recording a sale) rather than requireReadAccess, and
// deliberately not run through maskRaffleTicket — a seller needs the actual
// contact info to call/re-sell to a past buyer.
// Walks the admin-chosen previousGameId chain (set at raffle creation or
// edit time — see resolvePreviousGameId) rather than guessing from the name.
// This is deliberate, not automatic: a raffle with no link set shows no past
// buyers, which is correct for an org's first-ever raffle or one that just
// doesn't want history carried over. Stops after 2 matches or 10 hops
// (a safety bound — an org would need 10 linked years before this ever
// matters).
router.get("/games/:gameId/tickets/:number/history", requirePermission("raffle", "Helper"), async (req, res) => {
  const number = Number(req.params.number);
  const matches = [];
  let cursorId = req.raffleGame.previousGameId;
  for (let hops = 0; cursorId && matches.length < 2 && hops < 10; hops++) {
    const game = await prisma.raffleGame.findFirst({ where: { id: cursorId, orgId: req.user.orgId } });
    if (!game) break;
    const ticket = await prisma.raffleTicket.findFirst({
      where: { gameId: game.id, orgId: req.user.orgId, number, status: { in: ["sold", "funds_received"] } },
    });
    if (ticket) {
      matches.push({
        buyer: ticket.buyer, phone: ticket.phone, email: ticket.email, address: ticket.address,
        gameId: game.id, gameName: game.name, raffleStartDate: game.raffleStartDate,
      });
    }
    cursorId = game.previousGameId;
  }
  res.json(matches);
});

router.get("/games/:gameId/log", requireReadAccess("raffle"), async (req, res) => {
  const logs = await prisma.raffleLog.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json(logs);
});

router.get("/games/:gameId/stats", requireReadAccess("raffle"), async (req, res) => {
  const tickets = await prisma.raffleTicket.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } });
  res.json(computeRaffleStats(tickets));
});

// --- Reports (PDF) ---

// One row per seller with any sold/funds_received ticket — "assigned" counts
// every ticket ever assigned to them regardless of current status, so it can
// exceed "sold" for a seller still holding unsold inventory.
router.get("/games/:gameId/reports/seller-activity.pdf", requireReadAccess("raffle"), async (req, res) => {
  const [soldTickets, assignedTickets, org] = await Promise.all([
    prisma.raffleTicket.findMany({
      where: { gameId: req.raffleGame.id, orgId: req.user.orgId, status: { in: ["sold", "funds_received"] }, assignedSellerName: { not: "" } },
    }),
    prisma.raffleTicket.findMany({
      where: { gameId: req.raffleGame.id, orgId: req.user.orgId, assignedSellerName: { not: "" } },
      select: { assignedSellerName: true },
    }),
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
  ]);

  const assignedCounts = new Map();
  for (const t of assignedTickets) assignedCounts.set(t.assignedSellerName, (assignedCounts.get(t.assignedSellerName) || 0) + 1);

  const bySeller = new Map();
  for (const t of soldTickets) {
    const key = t.assignedSellerName;
    if (!bySeller.has(key)) bySeller.set(key, { name: key, assigned: assignedCounts.get(key) || 0, sold: 0, fundsIn: 0, collected: 0 });
    const s = bySeller.get(key);
    s.sold += 1;
    if (t.status === "funds_received") s.fundsIn += 1;
    s.collected += Number(t.tenderAmount) || 0;
  }
  const sellers = Array.from(bySeller.values()).sort((a, b) => a.name.localeCompare(b.name));

  const pdfBytes = await buildSellerActivityReportPdf({ org, game: req.raffleGame, sellers });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${req.raffleGame.name.replace(/\s+/g, "_")}_Seller_Activity_Report.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

// Every sold/funds_received ticket, ordered by ticket number — includes
// tickets with no assigned seller (shown as "—").
router.get("/games/:gameId/reports/tickets-turned-in.pdf", requireReadAccess("raffle"), async (req, res) => {
  const [tickets, org] = await Promise.all([
    prisma.raffleTicket.findMany({
      where: { gameId: req.raffleGame.id, orgId: req.user.orgId, status: { in: ["sold", "funds_received"] } },
      orderBy: { number: "asc" },
    }),
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
  ]);

  const pdfBytes = await buildTicketsTurnedInReportPdf({ org, game: req.raffleGame, tickets });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${req.raffleGame.name.replace(/\s+/g, "_")}_Tickets_Turned_In_Report.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

// Season-kickoff marketing email, generated from this raffle's own fields
// and its Drawings. No sending mechanism yet (see collectSeriesRecipients
// below for the recipient list) — this renders the HTML for preview/
// download so it can be pasted into whatever the org sends bulk email with.
router.get("/games/:gameId/kickoff-email", requirePermission("raffle", "Admin"), async (req, res) => {
  const [org, drawings] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
    prisma.raffleDrawing.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } }),
  ]);
  const html = raffleKickoffEmailHtml({ org, game: req.raffleGame, drawings });
  res.json({ html });
});

// Walks the same admin-chosen previousGameId chain used for the "past
// buyers" ticket lookup, but collects EVERY sold/funds_received ticket with
// an email across the whole chain (not capped at 2) — this is what the
// kickoff email actually gets sent to. The chain walk starts at
// req.raffleGame.previousGameId, not the raffle itself: this season's own
// buyers already have a ticket and don't need an invitation back. Dedupes
// by email since the same person buying in multiple years is the normal
// case (see the seller-line change earlier in this project — the same
// buyer showing up 3 years running is exactly why a per-buyer seller isn't
// reliable). A ticket with no email on file can't be deduped meaningfully,
// so it's just counted, not listed.
async function collectSeriesRecipients(orgId, startGameId) {
  const seriesGames = [];
  const recipients = new Map();
  let missingEmailCount = 0;

  const startGame = await prisma.raffleGame.findFirst({ where: { id: startGameId, orgId } });
  let cursorId = startGame?.previousGameId || null;
  const visited = new Set();

  for (let hops = 0; cursorId && hops < 50; hops++) {
    if (visited.has(cursorId)) break;
    visited.add(cursorId);
    const game = await prisma.raffleGame.findFirst({ where: { id: cursorId, orgId } });
    if (!game) break;
    const year = new Date(game.raffleStartDate).getUTCFullYear();
    seriesGames.push({ id: game.id, name: game.name, year });

    const tickets = await prisma.raffleTicket.findMany({
      where: { gameId: game.id, orgId, status: { in: ["sold", "funds_received"] } },
    });
    for (const t of tickets) {
      const email = (t.email || "").trim().toLowerCase();
      if (!email) {
        missingEmailCount += 1;
        continue;
      }
      if (!recipients.has(email)) {
        recipients.set(email, {
          name: t.buyer, email: t.email.trim(), phone: t.phone || "",
          lastSellerName: t.assignedSellerName || "", lastYear: year, years: [year],
        });
      } else {
        recipients.get(email).years.push(year);
      }
    }
    cursorId = game.previousGameId;
  }

  const suppressed = await prisma.raffleEmailSuppression.findMany({ where: { orgId }, select: { email: true } });
  const suppressedSet = new Set(suppressed.map((s) => s.email));

  const list = Array.from(recipients.values())
    .map((r) => ({ ...r, suppressed: suppressedSet.has(normalizeEmail(r.email)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { recipients: list, missingEmailCount, seriesGames };
}

router.get("/games/:gameId/kickoff-email/recipients", requirePermission("raffle", "Admin"), async (req, res) => {
  const result = await collectSeriesRecipients(req.user.orgId, req.raffleGame.id);
  res.json(result);
});

// Sends one real copy to an address the admin chooses — for reviewing the
// actual email in a real inbox before committing to the full campaign.
// Deliberately bypasses the recipient list and suppression table entirely
// (this isn't a real buyer, so there's nothing to look up or skip) and
// never touches kickoff_email_sent's sent/total counts — a test send must
// not be mistakable for progress against the real campaign.
router.post("/games/:gameId/kickoff-email/send-test", requirePermission("raffle", "Admin"), async (req, res) => {
  const email = (req.body.email || "").trim();
  if (!email) return res.status(400).json({ error: "An email address is required" });

  const [org, drawings] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
    prisma.raffleDrawing.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } }),
  ]);
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const firstName = (req.callerUser?.name || "").trim().split(/\s+/)[0] || "there";
  const unsubscribeUrl = `${appUrl}/raffle-unsubscribe?token=${buildUnsubscribeToken(req.user.orgId, email)}`;
  const html = raffleKickoffEmailHtml({ org, game: req.raffleGame, drawings, recipientFirstName: firstName, unsubscribeUrl });

  try {
    await sendEmail({ to: email, toName: firstName, subject: `[TEST] ${req.raffleGame.name} is back — save your spot`, html, fromName: org.name, replyTo, unsubscribeUrl });
  } catch (err) {
    return res.status(502).json({ error: `Send failed: ${err.message}` });
  }

  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "kickoff_email_test_sent",
    text: `Test kickoff email sent to ${email}`,
  });

  res.json({ ok: true });
});

// Actually sends the kickoff email via Brevo — the one real send path in
// this feature, kept separate from preview/recipients on purpose (both of
// those are read-only). Recipients are recomputed here, never trusted from
// the client, since this is the one place a stale or tampered list would
// mean real email lands in the wrong place. Continue-on-error per
// recipient, same as the existing payment-reminder blast, so one bad
// address doesn't stop the rest of the send. Personalizes each email with
// the buyer's actual first name instead of the literal preview placeholder.
router.post("/games/:gameId/kickoff-email/send", requirePermission("raffle", "Admin"), async (req, res) => {
  const [org, drawings, { recipients: allRecipients }] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
    prisma.raffleDrawing.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } }),
    collectSeriesRecipients(req.user.orgId, req.raffleGame.id),
  ]);
  const recipients = allRecipients.filter((r) => !r.suppressed);
  const suppressedCount = allRecipients.length - recipients.length;
  if (recipients.length === 0) {
    return res.status(400).json({ error: "No recipients to send to — build the recipient list first" });
  }
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const subject = `${req.raffleGame.name} is back — save your spot`;
  const appUrl = process.env.APP_URL || "http://localhost:5173";

  let sent = 0;
  for (const recipient of recipients) {
    const firstName = recipient.name.trim().split(/\s+/)[0];
    const unsubscribeUrl = `${appUrl}/raffle-unsubscribe?token=${buildUnsubscribeToken(req.user.orgId, recipient.email)}`;
    const html = raffleKickoffEmailHtml({ org, game: req.raffleGame, drawings, recipientFirstName: firstName, unsubscribeUrl });
    try {
      await sendEmail({ to: recipient.email, toName: recipient.name, subject, html, fromName: org.name, replyTo, unsubscribeUrl });
      sent++;
    } catch (err) {
      console.error(`Kickoff email send failed for ${recipient.email}:`, err.message);
    }
  }

  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "kickoff_email_sent",
    text: `Kickoff email sent to ${sent} of ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}${suppressedCount ? ` (${suppressedCount} unsubscribed and skipped)` : ""}`,
  });

  res.json({ sent, total: recipients.length, suppressed: suppressedCount });
});

// --- Ticket state machine ---

router.post("/games/:gameId/tickets/:number/record", requirePermission("raffle", "Helper"), requireActiveGame, async (req, res) => {
  const number = Number(req.params.number);
  const { buyer, phone, email, address, status, tenderType, tenderAmount, checkNumber, assignToSellerId } = req.body;

  if (!["reserved", "sold", "funds_received"].includes(status)) {
    return res.status(400).json({ error: "status must be reserved, sold, or funds_received" });
  }
  const isAdmin = req.moduleGrants.raffle === "Admin";
  if (status === "funds_received" && !isAdmin) {
    return res.status(403).json({ error: "Only an Admin can record a ticket directly as funds received" });
  }
  if (tenderType === "check" && !checkNumber) {
    return res.status(400).json({ error: "Check number is required for check tender" });
  }
  if (!buyer) return res.status(400).json({ error: "Buyer name is required" });

  const ticket = await prisma.raffleTicket.findFirst({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status !== "available") {
    return res.status(400).json({ error: `Ticket ${number} is already ${ticket.status}` });
  }

  let credit;
  try {
    credit = await resolveCreditSeller(req, assignToSellerId, ticket);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const needsTender = status === "sold" || status === "funds_received";
  const updated = await prisma.raffleTicket.update({
    where: { id: ticket.id },
    data: {
      status, buyer, phone: phone || "", email: email || "", address: address || "",
      assignedSellerId: credit.assignedSellerId, assignedSellerName: credit.assignedSellerName,
      soldByUserId: req.user.userId, soldByName: req.callerUser?.name || "",
      soldAt: needsTender ? new Date() : null,
      tenderType: needsTender ? tenderType || null : null,
      tenderAmount: needsTender && tenderAmount != null ? Number(tenderAmount) : null,
      checkNumber: needsTender && tenderType === "check" ? checkNumber : null,
    },
  });

  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: status,
    text: `Ticket #${number} recorded as ${status.replace("_", " ")} for ${buyer}`,
    sellerName: credit.assignedSellerName, ticketNumber: number, assignedSellerId: credit.assignedSellerId,
  });
  res.json(maskRaffleTicket(updated, req.user.userId, req.moduleGrants.raffle));
});

// Any status -> available. Preserves assignedSellerId/assignedSellerName —
// releasing a no-show buyer shouldn't cost the seller their credit slot.
router.post("/games/:gameId/tickets/:number/release", requirePermission("raffle", "Helper"), requireActiveGame, async (req, res) => {
  const number = Number(req.params.number);
  const ticket = await prisma.raffleTicket.findFirst({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status === "available") return res.status(400).json({ error: "Ticket is already available" });

  const isAdmin = req.moduleGrants.raffle === "Admin";
  if (ticket.status === "funds_received" && !isAdmin) {
    return res.status(403).json({ error: "Only an Admin can release a ticket that has already received funds" });
  }

  const updated = await prisma.raffleTicket.update({
    where: { id: ticket.id },
    data: {
      status: "available", buyer: "", phone: "", email: "", address: "",
      soldByUserId: null, soldByName: "", soldAt: null,
      tenderType: null, tenderAmount: null, checkNumber: null,
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "released", text: `Ticket #${number} released back to available`,
    sellerName: ticket.assignedSellerName, ticketNumber: number, assignedSellerId: ticket.assignedSellerId,
  });
  res.json(maskRaffleTicket(updated, req.user.userId, req.moduleGrants.raffle));
});

router.post("/games/:gameId/tickets/:number/mark-sold", requirePermission("raffle", "Helper"), requireActiveGame, async (req, res) => {
  const number = Number(req.params.number);
  const { tenderType, tenderAmount, checkNumber } = req.body;
  if (tenderType === "check" && !checkNumber) {
    return res.status(400).json({ error: "Check number is required for check tender" });
  }

  const ticket = await prisma.raffleTicket.findFirst({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status !== "reserved") {
    return res.status(400).json({ error: "Only a reserved ticket can be marked sold" });
  }

  const updated = await prisma.raffleTicket.update({
    where: { id: ticket.id },
    data: {
      status: "sold", soldByUserId: req.user.userId, soldByName: req.callerUser?.name || "",
      soldAt: new Date(), tenderType: tenderType || null,
      tenderAmount: tenderAmount != null ? Number(tenderAmount) : null,
      checkNumber: tenderType === "check" ? checkNumber : null,
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "sold", text: `Ticket #${number} marked sold for ${ticket.buyer}`,
    sellerName: ticket.assignedSellerName, ticketNumber: number, assignedSellerId: ticket.assignedSellerId,
  });
  res.json(maskRaffleTicket(updated, req.user.userId, req.moduleGrants.raffle));
});

router.post("/games/:gameId/tickets/:number/mark-funds-received", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const number = Number(req.params.number);
  const { tenderType, tenderAmount, checkNumber } = req.body;
  if (tenderType === "check" && !checkNumber) {
    return res.status(400).json({ error: "Check number is required for check tender" });
  }

  const ticket = await prisma.raffleTicket.findFirst({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (!["sold", "reserved"].includes(ticket.status)) {
    return res.status(400).json({ error: "Only a sold or reserved ticket can be marked funds received" });
  }

  const updated = await prisma.raffleTicket.update({
    where: { id: ticket.id },
    data: {
      status: "funds_received",
      soldByUserId: ticket.soldByUserId || req.user.userId,
      soldByName: ticket.soldByName || req.callerUser?.name || "",
      soldAt: ticket.soldAt || new Date(),
      tenderType: tenderType || ticket.tenderType,
      tenderAmount: tenderAmount != null ? Number(tenderAmount) : ticket.tenderAmount,
      checkNumber: tenderType === "check" ? checkNumber : tenderType ? null : ticket.checkNumber,
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "funds_received", text: `Funds received for ticket #${number}`,
    sellerName: ticket.assignedSellerName, ticketNumber: number, assignedSellerId: ticket.assignedSellerId,
  });
  res.json(maskRaffleTicket(updated, req.user.userId, req.moduleGrants.raffle));
});

router.post("/games/:gameId/tickets/bulk-mark-funds-received", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const { ticketNumbers, tenderType, tenderAmount, checkNumber } = req.body;
  if (!Array.isArray(ticketNumbers) || ticketNumbers.length === 0) {
    return res.status(400).json({ error: "ticketNumbers must be a non-empty array" });
  }
  if (tenderType === "check" && !checkNumber) {
    return res.status(400).json({ error: "Check number is required for check tender" });
  }

  const tickets = await prisma.raffleTicket.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number: { in: ticketNumbers.map(Number) }, status: { in: ["sold", "reserved"] } },
  });

  const results = [];
  for (const ticket of tickets) {
    const updated = await prisma.raffleTicket.update({
      where: { id: ticket.id },
      data: {
        status: "funds_received",
        soldByUserId: ticket.soldByUserId || req.user.userId,
        soldByName: ticket.soldByName || req.callerUser?.name || "",
        soldAt: ticket.soldAt || new Date(),
        tenderType: tenderType || ticket.tenderType,
        tenderAmount: tenderAmount != null ? Number(tenderAmount) : ticket.tenderAmount,
        checkNumber: tenderType === "check" ? checkNumber : tenderType ? null : ticket.checkNumber,
      },
    });
    await addRaffleLog(req.user.orgId, req.raffleGame.id, {
      type: "funds_received", text: `Funds received for ticket #${ticket.number} (bulk)`,
      sellerName: ticket.assignedSellerName, ticketNumber: ticket.number, assignedSellerId: ticket.assignedSellerId,
    });
    results.push(updated);
  }
  res.json(results.map((t) => maskRaffleTicket(t, req.user.userId, req.moduleGrants.raffle)));
});

// --- Assignment ---

router.post("/games/:gameId/tickets/assign", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const { ticketNumbers, sellerId } = req.body;
  if (!Array.isArray(ticketNumbers) || ticketNumbers.length === 0) {
    return res.status(400).json({ error: "ticketNumbers must be a non-empty array" });
  }
  const seller = await prisma.user.findFirst({ where: { id: sellerId, orgId: req.user.orgId } });
  if (!seller) return res.status(404).json({ error: "Seller not found" });

  await prisma.raffleTicket.updateMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number: { in: ticketNumbers.map(Number) } },
    data: { assignedSellerId: seller.id, assignedSellerName: seller.name },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "reassigned", text: `Tickets ${ticketNumbers.join(", ")} assigned to ${seller.name}`,
    sellerName: seller.name, assignedSellerId: seller.id,
  });
  res.json({ ok: true });
});

router.post("/games/:gameId/tickets/unassign", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const { ticketNumbers } = req.body;
  if (!Array.isArray(ticketNumbers) || ticketNumbers.length === 0) {
    return res.status(400).json({ error: "ticketNumbers must be a non-empty array" });
  }
  await prisma.raffleTicket.updateMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number: { in: ticketNumbers.map(Number) } },
    data: { assignedSellerId: null, assignedSellerName: "" },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "reassigned", text: `Tickets ${ticketNumbers.join(", ")} unassigned`,
  });
  res.json({ ok: true });
});

// --- Drawings ---

router.get("/games/:gameId/drawings", requireReadAccess("raffle"), async (req, res) => {
  const drawings = await prisma.raffleDrawing.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId },
    orderBy: { drawingDate: "asc" },
  });
  res.json(drawings);
});

router.post("/games/:gameId/drawings", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const { name, drawingDate, drawingType, prizeAmount, notes } = req.body;
  if (!name || !drawingDate || !drawingType || prizeAmount == null) {
    return res.status(400).json({ error: "name, drawingDate, drawingType, and prizeAmount are required" });
  }
  const drawing = await prisma.raffleDrawing.create({
    data: {
      orgId: req.user.orgId, gameId: req.raffleGame.id, name,
      drawingDate: new Date(drawingDate), drawingType, prizeAmount: Number(prizeAmount),
      notes: notes || "",
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "drawing", text: `Drawing "${name}" created — ${fmtUsDate(new Date(drawingDate))}` });
  res.json(drawing);
});

// Locked once a winner exists — edit fields (esp. drawingDate, which drives
// eligibility) shouldn't move out from under an already-recorded winner.
router.patch("/games/:gameId/drawings/:id", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const drawing = await prisma.raffleDrawing.findFirst({ where: { id: req.params.id, gameId: req.raffleGame.id, orgId: req.user.orgId } });
  if (!drawing) return res.status(404).json({ error: "Drawing not found" });
  if (drawing.winningTicket != null) {
    return res.status(400).json({ error: "Cannot edit a drawing that already has a winner — clear it first" });
  }
  const { name, drawingDate, drawingType, prizeAmount, notes } = req.body;
  const updated = await prisma.raffleDrawing.update({
    where: { id: drawing.id },
    data: {
      name: name ?? drawing.name,
      drawingDate: drawingDate ? new Date(drawingDate) : drawing.drawingDate,
      drawingType: drawingType ?? drawing.drawingType,
      prizeAmount: prizeAmount != null ? Number(prizeAmount) : drawing.prizeAmount,
      notes: notes ?? drawing.notes,
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "drawing", text: `Drawing "${updated.name}" edited` });
  res.json(updated);
});

router.delete("/games/:gameId/drawings/:id", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const drawing = await prisma.raffleDrawing.findFirst({ where: { id: req.params.id, gameId: req.raffleGame.id, orgId: req.user.orgId } });
  if (!drawing) return res.status(404).json({ error: "Drawing not found" });
  if (drawing.winningTicket != null) {
    return res.status(400).json({ error: "Cannot delete a drawing that already has a winner — clear it first" });
  }
  await prisma.raffleDrawing.delete({ where: { id: drawing.id } });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "drawing", text: `Drawing "${drawing.name}" deleted` });
  res.json({ ok: true });
});

router.get("/games/:gameId/drawings/:id/eligible", requirePermission("raffle", "Admin"), async (req, res) => {
  const drawing = await prisma.raffleDrawing.findFirst({ where: { id: req.params.id, gameId: req.raffleGame.id, orgId: req.user.orgId } });
  if (!drawing) return res.status(404).json({ error: "Drawing not found" });
  const tickets = await prisma.raffleTicket.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } });
  const pool = eligibleTicketPool(tickets, drawing.drawingDate);
  res.json({ count: pool.length, tickets: pool.map((t) => t.number) });
});

// CSPRNG draw — crypto.randomInt is Node's equivalent to the source app's
// secrets.randbelow. Eligibility intentionally does NOT exclude prior
// winners this game (see eligibleTicketPool's comment).
router.post("/games/:gameId/drawings/:id/draw", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const drawing = await prisma.raffleDrawing.findFirst({ where: { id: req.params.id, gameId: req.raffleGame.id, orgId: req.user.orgId } });
  if (!drawing) return res.status(404).json({ error: "Drawing not found" });
  if (drawing.winningTicket != null) return res.status(400).json({ error: "This drawing already has a winner" });

  const tickets = await prisma.raffleTicket.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } });
  const pool = eligibleTicketPool(tickets, drawing.drawingDate);
  if (pool.length === 0) return res.status(400).json({ error: "No eligible tickets for this drawing" });

  const winner = pool[crypto.randomInt(0, pool.length)];
  const updated = await prisma.raffleDrawing.update({
    where: { id: drawing.id },
    data: {
      winningTicket: winner.number, winningBuyer: winner.buyer, winningPhone: winner.phone,
      eligibleCount: pool.length, drawnAt: new Date(), drawnByName: req.callerUser?.name || "",
      drawMode: "random",
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "drawing", text: `${drawing.name}: ticket #${winner.number} (${winner.buyer}) drawn at random`,
    ticketNumber: winner.number,
  });
  res.json(updated);
});

router.post("/games/:gameId/drawings/:id/draw-manual", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const drawing = await prisma.raffleDrawing.findFirst({ where: { id: req.params.id, gameId: req.raffleGame.id, orgId: req.user.orgId } });
  if (!drawing) return res.status(404).json({ error: "Drawing not found" });
  if (drawing.winningTicket != null) return res.status(400).json({ error: "This drawing already has a winner" });

  const { ticketNumber } = req.body;
  const tickets = await prisma.raffleTicket.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } });
  const pool = eligibleTicketPool(tickets, drawing.drawingDate);
  const winner = pool.find((t) => t.number === Number(ticketNumber));
  if (!winner) return res.status(400).json({ error: "That ticket is not in the eligible pool for this drawing" });

  const updated = await prisma.raffleDrawing.update({
    where: { id: drawing.id },
    data: {
      winningTicket: winner.number, winningBuyer: winner.buyer, winningPhone: winner.phone,
      eligibleCount: pool.length, drawnAt: new Date(), drawnByName: req.callerUser?.name || "",
      drawMode: "manual",
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "drawing", text: `${drawing.name}: ticket #${winner.number} (${winner.buyer}) drawn manually`,
    ticketNumber: winner.number,
  });
  res.json(updated);
});

router.post("/games/:gameId/drawings/:id/clear", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const drawing = await prisma.raffleDrawing.findFirst({ where: { id: req.params.id, gameId: req.raffleGame.id, orgId: req.user.orgId } });
  if (!drawing) return res.status(404).json({ error: "Drawing not found" });
  const updated = await prisma.raffleDrawing.update({
    where: { id: drawing.id },
    data: { winningTicket: null, winningBuyer: "", winningPhone: "", eligibleCount: 0, drawnAt: null, drawnByName: "", drawMode: null },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "drawing", text: `${drawing.name}: winner cleared for redraw` });
  res.json(updated);
});

// --- Expenses (raffle financial statement / GC-7R) ---
// Not locked to active games: real bills legitimately arrive after the
// drawing and before the 30-day GC-7R filing deadline.

const EXPENSE_CATEGORIES = ["tickets", "license_fee", "equipment_supplies", "services", "rent", "other"];

router.get("/games/:gameId/expenses", requireReadAccess("raffle"), async (req, res) => {
  const expenses = await prisma.raffleExpense.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId },
    orderBy: { date: "desc" },
  });
  res.json(expenses);
});

router.post("/games/:gameId/expenses", requirePermission("raffle", "Admin"), async (req, res) => {
  const { date, payee, checkNum, amount, category, receiptFile, receiptFileName } = req.body;
  if (!payee || !payee.trim()) return res.status(400).json({ error: "payee is required" });
  if (!EXPENSE_CATEGORIES.includes(category)) return res.status(400).json({ error: "Invalid category" });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

  const expense = await prisma.raffleExpense.create({
    data: {
      orgId: req.user.orgId, gameId: req.raffleGame.id, payee: payee.trim(),
      checkNum: checkNum || "", amount: amt, category,
      receiptFile: receiptFile || null, receiptFileName: receiptFileName || null,
      ...(date ? { date: new Date(date) } : {}),
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "expense_added", text: `Expense recorded: $${amt.toFixed(2)} to ${payee.trim()} (${category.replace(/_/g, " ")})`,
  });
  res.json(expense);
});

router.delete("/games/:gameId/expenses/:id", requirePermission("raffle", "Admin"), async (req, res) => {
  const expense = await prisma.raffleExpense.findFirst({ where: { id: req.params.id, gameId: req.raffleGame.id, orgId: req.user.orgId } });
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  await prisma.raffleExpense.delete({ where: { id: expense.id } });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "expense_deleted", text: `Expense removed: $${expense.amount.toFixed(2)} to ${expense.payee}`,
  });
  res.json({ ok: true });
});

// A single rough planning number, deliberately separate from the big
// PATCH /games/:gameId form-edit route so the Financial Statement page can
// update just this field without resending the whole game-edit payload.
router.patch("/games/:gameId/estimated-expenses", requirePermission("raffle", "Admin"), async (req, res) => {
  const amt = Number(req.body.estimatedExpenses);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: "estimatedExpenses must be a non-negative number" });
  const updated = await prisma.raffleGame.update({ where: { id: req.raffleGame.id }, data: { estimatedExpenses: amt } });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "estimated_expenses_updated", text: `Estimated expenses set to $${amt.toFixed(2)}` });
  res.json(updated);
});

// --- Renewal calls ---

router.get("/games/:gameId/renewal-calls", requireReadAccess("raffle"), async (req, res) => {
  const calls = await prisma.raffleRenewalCall.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId },
    orderBy: { calledAt: "desc" },
  });
  res.json(calls);
});

router.post("/games/:gameId/renewal-calls", requirePermission("raffle", "Helper"), requireActiveGame, async (req, res) => {
  const { ticketNumber, note } = req.body;
  if (!ticketNumber) return res.status(400).json({ error: "ticketNumber is required" });
  const call = await prisma.raffleRenewalCall.upsert({
    where: { gameId_ticketNumber: { gameId: req.raffleGame.id, ticketNumber: Number(ticketNumber) } },
    update: { calledByUserId: req.user.userId, calledByName: req.callerUser?.name || "", note: note || "", calledAt: new Date() },
    create: {
      orgId: req.user.orgId, gameId: req.raffleGame.id, ticketNumber: Number(ticketNumber),
      calledByUserId: req.user.userId, calledByName: req.callerUser?.name || "", note: note || "",
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "renewal_call_logged", text: `Renewal call logged for ticket #${ticketNumber}${note ? ` — ${note}` : ""}`, ticketNumber: Number(ticketNumber),
  });
  res.json(call);
});

// --- Check-in ---
// New — doesn't exist in the source app. Scoped per game: a person checks in
// once for raffle night regardless of how many drawings happen.

// Deliberately NOT run through maskRaffleTicket, unlike the general ticket
// list — verifying who's at the door is a different concern than "who gets
// sales credit," so any Helper sees the real buyer/phone here regardless of
// who actually sold that ticket. Only the fields check-in search actually
// needs, and only tickets someone could plausibly be holding (an "available"
// ticket has no buyer to search for).
router.get("/games/:gameId/checkin-search", requirePermission("raffle", "Helper"), async (req, res) => {
  const tickets = await prisma.raffleTicket.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId, status: { not: "available" } },
    select: { number: true, buyer: true, phone: true, status: true },
    orderBy: { number: "asc" },
  });
  res.json(tickets);
});

router.get("/games/:gameId/checkins", requireReadAccess("raffle"), async (req, res) => {
  const checkIns = await prisma.raffleCheckIn.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId },
    orderBy: { checkedInAt: "desc" },
  });
  res.json(checkIns);
});

// Toggle — calling it again on an already-checked-in ticket removes the
// check-in, so a mis-tap at the door doesn't need a separate "undo" action.
router.post("/games/:gameId/checkins/:ticketNumber", requirePermission("raffle", "Helper"), requireActiveGame, async (req, res) => {
  const ticketNumber = Number(req.params.ticketNumber);
  const { hasGuest } = req.body;

  const existing = await prisma.raffleCheckIn.findUnique({
    where: { gameId_ticketNumber: { gameId: req.raffleGame.id, ticketNumber } },
  });
  if (existing) {
    await prisma.raffleCheckIn.delete({ where: { id: existing.id } });
    await addRaffleLog(req.user.orgId, req.raffleGame.id, { type: "checkin", text: `Ticket #${ticketNumber} check-in removed`, ticketNumber });
    return res.json({ checkedIn: false });
  }

  const checkIn = await prisma.raffleCheckIn.create({
    data: {
      orgId: req.user.orgId, gameId: req.raffleGame.id, ticketNumber, hasGuest: !!hasGuest,
      checkedInByUserId: req.user.userId, checkedInByName: req.callerUser?.name || "",
    },
  });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "checkin", text: `Ticket #${ticketNumber} checked in${hasGuest ? " (+guest)" : ""}`, ticketNumber,
  });
  res.json({ checkedIn: true, checkIn });
});

// --- Buyer emails ---

router.post("/games/:gameId/reminders/send", requirePermission("raffle", "Admin"), requireActiveGame, async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const tickets = await prisma.raffleTicket.findMany({
    where: { gameId: req.raffleGame.id, orgId: req.user.orgId, status: { in: ["sold", "reserved"] }, email: { not: "" } },
  });

  let sent = 0;
  for (const ticket of tickets) {
    const html = paymentReminderHtml({ ticket, gameName: req.raffleGame.name, org });
    try {
      await sendEmail({ to: ticket.email, toName: ticket.buyer, subject: `Payment reminder — Ticket #${ticket.number}`, html, fromName: org.name, replyTo });
    } catch (err) {
      console.error(`Reminder send failed for ticket #${ticket.number}:`, err.message);
      continue;
    }
    sent++;
    await addRaffleLog(req.user.orgId, req.raffleGame.id, {
      type: "reminder_sent", text: `Payment reminder sent for ticket #${ticket.number} (${ticket.email})`,
      sellerName: ticket.assignedSellerName, ticketNumber: ticket.number, assignedSellerId: ticket.assignedSellerId,
    });
  }
  res.json({ sent, candidates: tickets.length });
});

// Mirrors the source app's real single-ticket resend-email action — not the
// one-click bulk blast Emergent's assessment incorrectly described.
router.post("/games/:gameId/tickets/:number/send-confirmation", requirePermission("raffle", "Helper"), async (req, res) => {
  const number = Number(req.params.number);
  const ticket = await prisma.raffleTicket.findFirst({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (!["sold", "funds_received"].includes(ticket.status)) {
    return res.status(400).json({ error: "This ticket hasn't been sold yet" });
  }
  if (!ticket.email) return res.status(400).json({ error: "This ticket has no buyer email on file" });

  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const html = saleConfirmationHtml({ ticket, sellerName: ticket.soldByName, gameName: req.raffleGame.name, org });
  await sendEmail({ to: ticket.email, toName: ticket.buyer, subject: `Payment confirmed — Ticket #${ticket.number}`, html, fromName: org.name, replyTo });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "email_sent", text: `Confirmation email sent for ticket #${number}`,
    sellerName: ticket.assignedSellerName, ticketNumber: number, assignedSellerId: ticket.assignedSellerId,
  });
  res.json({ ok: true });
});

router.post("/games/:gameId/tickets/:number/send-eticket", requirePermission("raffle", "Admin"), async (req, res) => {
  const number = Number(req.params.number);
  const ticket = await prisma.raffleTicket.findFirst({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId, number } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status !== "funds_received") {
    return res.status(400).json({ error: "The official ticket can only be sent once funds are received" });
  }
  if (!ticket.email) return res.status(400).json({ error: "This ticket has no buyer email on file" });

  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const replyTo = await resolveReplyTo(req.user.orgId, org);
  const drawings = await prisma.raffleDrawing.findMany({ where: { gameId: req.raffleGame.id, orgId: req.user.orgId } });
  const verificationCode = ticket.id.slice(-8).toUpperCase();
  // Public, unauthenticated page showing this exact ticket — see
  // publicRaffle.js's GET /ticket/:ticketId. ticket.id is already this
  // app's de facto access token for a ticket (it's what verificationCode
  // above is derived from), so it's reused directly as the URL token.
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const ticketUrl = `${appUrl}/raffle-ticket/${ticket.id}`;
  const html = electronicTicketHtml({ ticket, gameName: req.raffleGame.name, verificationCode, drawings, org, ticketUrl });
  await sendEmail({ to: ticket.email, toName: ticket.buyer, subject: `Your official ticket — #${ticket.number}`, html, fromName: org.name, replyTo });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "email_sent", text: `Electronic ticket sent for ticket #${number}`,
    sellerName: ticket.assignedSellerName, ticketNumber: number, assignedSellerId: ticket.assignedSellerId,
  });
  res.json({ ok: true });
});

module.exports = router;
