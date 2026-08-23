const crypto = require("crypto");
const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { maskRaffleTicket, computeRaffleStats, eligibleTicketPool, fmtUsDate, computeRaffleFinancials } = require("../lib/raffleLogic");
const { saleConfirmationHtml, electronicTicketHtml, paymentReminderHtml } = require("../lib/raffleEmails");
const { sendEmail } = require("../lib/notifications");
const { buildSellerActivityReportPdf, buildTicketsTurnedInReportPdf } = require("../lib/raffleReportsPdf");
const { parseHistoricalCsv } = require("../lib/raffleHistoricalImport");

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

router.post("/games", requirePermission("raffle", "Admin"), async (req, res) => {
  const { name, startNumber, endNumber, ticketPrice, startDate, endDate } = req.body;
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

  const game = await prisma.raffleGame.create({
    data: {
      orgId: req.user.orgId, name: name.trim(), startNumber: start, endNumber: end,
      totalTickets: end - start + 1, ticketPrice: price,
      raffleStartDate: parsedStart, raffleEndDate: parsedEnd,
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
  const { name, startNumber, endNumber, ticketPrice, startDate, endDate } = req.body;
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
  res.json(games.map((g) => ({ id: g.id, name: g.name, raffleStartDate: g.raffleStartDate, ticketCount: g._count.tickets })));
});

router.post("/historical-imports", requirePermission("raffle", "Admin"), async (req, res) => {
  const { year, name, csv } = req.body;
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
router.get("/games/:gameId/tickets/:number/history", requirePermission("raffle", "Helper"), async (req, res) => {
  const number = Number(req.params.number);
  const rows = await prisma.raffleTicket.findMany({
    where: {
      orgId: req.user.orgId,
      number,
      gameId: { not: req.raffleGame.id },
      status: { in: ["sold", "funds_received"] },
    },
    include: { game: { select: { id: true, name: true, raffleStartDate: true } } },
    orderBy: { game: { raffleStartDate: "desc" } },
    take: 2,
  });
  res.json(rows.map((t) => ({
    buyer: t.buyer, phone: t.phone, email: t.email, address: t.address,
    gameId: t.game.id, gameName: t.game.name, raffleStartDate: t.game.raffleStartDate,
  })));
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
  const html = electronicTicketHtml({ ticket, gameName: req.raffleGame.name, verificationCode, drawings, org });
  await sendEmail({ to: ticket.email, toName: ticket.buyer, subject: `Your official ticket — #${ticket.number}`, html, fromName: org.name, replyTo });
  await addRaffleLog(req.user.orgId, req.raffleGame.id, {
    type: "email_sent", text: `Electronic ticket sent for ticket #${number}`,
    sellerName: ticket.assignedSellerName, ticketNumber: number, assignedSellerId: ticket.assignedSellerId,
  });
  res.json({ ok: true });
});

module.exports = router;
