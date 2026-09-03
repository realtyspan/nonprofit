const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { dailyWorksheet, isEligibleToClose, prizePercent } = require("../lib/businessLogic");
const { scanGameLabel } = require("../lib/labelScan");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// closeThreshold arrives from the client as a fraction (0.75-1.0). 75% is the
// NYS minimum before a deal may legally be closed, so anything lower is rejected
// rather than silently clamped — an org can only tighten the bar, never loosen it.
function parseThreshold(value) {
  if (value === undefined || value === null || value === "") return { value: 0.75 };
  const n = Number(value);
  if (Number.isNaN(n) || n < 0.75 || n > 1) {
    return { error: "Close threshold must be between 75% and 100% (75% is the NYS minimum before a game can be closed)" };
  }
  return { value: n };
}

// List active + closed deals for the org, with computed threshold info.
router.get("/", requireReadAccess("bell-jar"), async (req, res) => {
  const deals = await prisma.deal.findMany({
    where: { orgId: req.user.orgId },
    include: { schedule1: true },
    orderBy: { createdAt: "asc" },
  });

  const enriched = deals.map((d) => ({
    ...d,
    prizePercent: prizePercent(d.prizesAwardedToDate, d.idealPayout),
    eligibleToClose: isEligibleToClose(d.prizesAwardedToDate, d.idealPayout, d.closeThreshold),
  }));

  res.json(enriched);
});

// Reads a photographed game label and returns the fields it could make out,
// to pre-fill the log-new-game form — doesn't touch the database itself.
router.post("/scan-label", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: "An image is required" });
  try {
    const fields = await scanGameLabel(image, req.user.orgId);
    res.json(fields);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post("/", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const { name, serialNum, formNum, ticketCount, ticketPrice, idealPayout, closeThreshold, labelImage } = req.body;
  if (!name || !serialNum || !formNum || !ticketCount || !ticketPrice || !idealPayout) {
    return res.status(400).json({ error: "Missing required game fields" });
  }
  const threshold = parseThreshold(closeThreshold);
  if (threshold.error) return res.status(400).json({ error: threshold.error });

  const deal = await prisma.deal.create({
    data: {
      orgId: req.user.orgId,
      name,
      serialNum,
      formNum,
      ticketCount: Number(ticketCount),
      ticketPrice: Number(ticketPrice),
      idealPayout: Number(idealPayout),
      closeThreshold: threshold.value,
      labelImage: labelImage || null,
      // status defaults to "received" — logged into inventory, not yet on the floor
    },
  });
  res.json(deal);
});

// Corrects a game's logged details (typo in name/serial/form #, wrong ticket
// count/price/payout at intake). Allowed for received or active games — never
// touches soldToDate/prizesAwardedToDate, so correcting details after a game is
// already on the machine can't disturb the running sales/prize totals. Closed
// deals are locked (that's what Schedule 1 close-out + the audit trail is for).
router.patch("/:id", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Game not found" });
  if (deal.status === "closed") {
    return res.status(400).json({ error: "Closed games can't be edited — they're locked in the Schedule 1 audit trail" });
  }

  const { name, serialNum, formNum, ticketCount, ticketPrice, idealPayout, closeThreshold, labelImage } = req.body;
  if (!name || !serialNum || !formNum || !ticketCount || !ticketPrice || !idealPayout) {
    return res.status(400).json({ error: "Missing required game fields" });
  }

  const newTicketCount = Number(ticketCount);
  if (newTicketCount < deal.soldToDate) {
    return res.status(400).json({ error: `Ticket count can't be less than the ${deal.soldToDate} tickets already recorded as sold` });
  }

  const threshold = parseThreshold(closeThreshold);
  if (threshold.error) return res.status(400).json({ error: threshold.error });

  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: {
      name,
      serialNum,
      formNum,
      ticketCount: newTicketCount,
      ticketPrice: Number(ticketPrice),
      idealPayout: Number(idealPayout),
      closeThreshold: threshold.value,
      labelImage: labelImage !== undefined ? labelImage || null : undefined,
    },
  });
  res.json(updated);
});

// Permanently removes a game logged in error — while it's received or active.
// Admin-only (a Helper can log/correct/activate a game, but not erase it
// outright). Closed deals can never be deleted: that's what the Schedule 1
// audit trail exists to lock in, same restriction as the correction route
// above. Any daily-sale rows already logged against the deal go with it —
// those are working data, not the compliance record itself.
router.delete("/:id", requirePermission("bell-jar", "Admin"), async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Game not found" });
  if (deal.status === "closed") {
    return res.status(400).json({ error: "Closed games can't be deleted — they're locked in the Schedule 1 audit trail" });
  }

  await prisma.$transaction([
    prisma.dailySale.deleteMany({ where: { dealId: deal.id } }),
    prisma.deal.delete({ where: { id: deal.id } }),
  ]);
  res.json({ ok: true });
});

// Puts a received game on the machine — the point at which it starts counting
// toward daily sales / its close threshold.
router.post("/:id/activate", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Game not found" });
  if (deal.status !== "received") {
    return res.status(400).json({ error: "Only a received (not yet active) game can be activated" });
  }
  const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: "active" } });
  res.json(updated);
});

// Cashier worksheet save: one row per game, normally for "today" but may be
// backdated when someone logs a machine check after the fact.
router.post("/:id/daily-sales", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const { ticketsSold, cashPaid, date } = req.body;
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Game not found" });
  if (deal.status !== "active") return res.status(400).json({ error: "Game is not active" });

  let saleDate;
  if (date) {
    saleDate = new Date(date);
    if (Number.isNaN(saleDate.getTime())) return res.status(400).json({ error: "Invalid entry date" });
    if (saleDate.getTime() > Date.now()) return res.status(400).json({ error: "Entry date can't be in the future" });
  }

  const { cashCollected, profitLoss } = dailyWorksheet(Number(ticketsSold), Number(cashPaid), deal.ticketPrice);

  const [sale] = await prisma.$transaction([
    prisma.dailySale.create({
      data: {
        dealId: deal.id,
        ticketsSold: Number(ticketsSold),
        cashPaid: Number(cashPaid),
        cashCollected,
        profitLoss,
        ...(saleDate ? { date: saleDate } : {}),
      },
    }),
    prisma.deal.update({
      where: { id: deal.id },
      data: {
        soldToDate: { increment: Number(ticketsSold) },
        prizesAwardedToDate: { increment: Number(cashPaid) },
      },
    }),
  ]);

  res.json(sale);
});

// Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD bounds the query at the database level —
// the Worksheet's "Recent entries" table defaults to a 90-day window instead of
// pulling an org's entire sales history on every page load, and widens the query
// as needed when the user picks a different date range rather than filtering an
// already-fetched (and potentially huge) result set client-side.
router.get("/:id/daily-sales", requireReadAccess("bell-jar"), async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Game not found" });

  const { from, to } = req.query;
  const where = { dealId: deal.id };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(`${to}T23:59:59.999Z`);
  }

  const sales = await prisma.dailySale.findMany({ where, orderBy: { date: "desc" } });
  res.json(sales);
});

// Corrects a worksheet entry logged in error (wrong tickets sold / cash paid,
// or the wrong backdated date) — same "Helper can log/correct" tier as the
// worksheet save itself. The deal's running soldToDate/prizesAwardedToDate
// are adjusted by the *difference* between the old and new values in the
// same transaction, so they stay in sync with the corrected entry rather
// than needing a full recount. Closed games are locked — same restriction
// as correcting the game record itself, since Schedule 1 close-out is what
// finalizes the audit trail for everything logged against it.
router.patch("/:id/daily-sales/:saleId", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Game not found" });
  if (deal.status === "closed") {
    return res.status(400).json({ error: "Entries on a closed game can't be edited — they're locked in the Schedule 1 audit trail" });
  }
  const sale = await prisma.dailySale.findFirst({ where: { id: req.params.saleId, dealId: deal.id } });
  if (!sale) return res.status(404).json({ error: "Entry not found" });

  const { ticketsSold, cashPaid, date } = req.body;
  const newTicketsSold = Number(ticketsSold);
  const newCashPaid = Number(cashPaid);
  if (!Number.isFinite(newTicketsSold) || newTicketsSold < 0 || !Number.isFinite(newCashPaid) || newCashPaid < 0) {
    return res.status(400).json({ error: "Tickets sold and cash paid must be zero or more" });
  }

  let saleDate = sale.date;
  if (date) {
    saleDate = new Date(date);
    if (Number.isNaN(saleDate.getTime())) return res.status(400).json({ error: "Invalid entry date" });
    if (saleDate.getTime() > Date.now()) return res.status(400).json({ error: "Entry date can't be in the future" });
  }

  const ticketsDelta = newTicketsSold - sale.ticketsSold;
  const newSoldToDate = deal.soldToDate + ticketsDelta;
  if (newSoldToDate < 0 || newSoldToDate > deal.ticketCount) {
    return res.status(400).json({ error: `Tickets sold can't put this game's total outside 0–${deal.ticketCount}` });
  }
  const cashDelta = newCashPaid - sale.cashPaid;

  const { cashCollected, profitLoss } = dailyWorksheet(newTicketsSold, newCashPaid, deal.ticketPrice);

  const [updated] = await prisma.$transaction([
    prisma.dailySale.update({
      where: { id: sale.id },
      data: { ticketsSold: newTicketsSold, cashPaid: newCashPaid, cashCollected, profitLoss, date: saleDate },
    }),
    prisma.deal.update({
      where: { id: deal.id },
      data: { soldToDate: { increment: ticketsDelta }, prizesAwardedToDate: { increment: cashDelta } },
    }),
  ]);
  res.json(updated);
});

// Permanently removes a worksheet entry logged in error — Admin-only, same
// "Helper can correct, Admin must erase outright" split used for the game
// record's own delete route above. Reverses this entry's effect on the
// deal's running totals in the same transaction, so removing a mistaken
// entry doesn't leave its tickets/cash stranded in soldToDate/
// prizesAwardedToDate. Closed games are locked, same as editing above.
router.delete("/:id/daily-sales/:saleId", requirePermission("bell-jar", "Admin"), async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Game not found" });
  if (deal.status === "closed") {
    return res.status(400).json({ error: "Entries on a closed game can't be deleted — they're locked in the Schedule 1 audit trail" });
  }
  const sale = await prisma.dailySale.findFirst({ where: { id: req.params.saleId, dealId: deal.id } });
  if (!sale) return res.status(404).json({ error: "Entry not found" });

  await prisma.$transaction([
    prisma.dailySale.delete({ where: { id: sale.id } }),
    prisma.deal.update({
      where: { id: deal.id },
      data: {
        soldToDate: { increment: -sale.ticketsSold },
        prizesAwardedToDate: { increment: -sale.cashPaid },
      },
    }),
  ]);
  res.json({ ok: true });
});

module.exports = router;
