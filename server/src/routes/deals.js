const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");
const { dailyWorksheet, isEligibleToClose, prizePercent } = require("../lib/businessLogic");

const router = express.Router();
router.use(requireAuth);

// closeThreshold arrives from the client as a fraction (0.75-1.0). 75% is the
// NYS minimum before a deal may legally be closed, so anything lower is rejected
// rather than silently clamped — an org can only tighten the bar, never loosen it.
function parseThreshold(value) {
  if (value === undefined || value === null || value === "") return { value: 0.75 };
  const n = Number(value);
  if (Number.isNaN(n) || n < 0.75 || n > 1) {
    return { error: "Close threshold must be between 75% and 100% (75% is the NYS minimum before a deal can be closed)" };
  }
  return { value: n };
}

// List active + closed deals for the org, with computed threshold info.
router.get("/", async (req, res) => {
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

router.post("/", async (req, res) => {
  const { name, serialNum, formNum, ticketCount, ticketPrice, idealPayout, closeThreshold } = req.body;
  if (!name || !serialNum || !formNum || !ticketCount || !ticketPrice || !idealPayout) {
    return res.status(400).json({ error: "Missing required deal fields" });
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
router.patch("/:id", async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  if (deal.status === "closed") {
    return res.status(400).json({ error: "Closed deals can't be edited — they're locked in the Schedule 1 audit trail" });
  }

  const { name, serialNum, formNum, ticketCount, ticketPrice, idealPayout, closeThreshold } = req.body;
  if (!name || !serialNum || !formNum || !ticketCount || !ticketPrice || !idealPayout) {
    return res.status(400).json({ error: "Missing required deal fields" });
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
    },
  });
  res.json(updated);
});

// Puts a received game on the machine — the point at which it starts counting
// toward daily sales / its close threshold.
router.post("/:id/activate", async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  if (deal.status !== "received") {
    return res.status(400).json({ error: "Only a received (not yet active) game can be activated" });
  }
  const updated = await prisma.deal.update({ where: { id: deal.id }, data: { status: "active" } });
  res.json(updated);
});

// Cashier worksheet save: one row per game for "today".
router.post("/:id/daily-sales", async (req, res) => {
  const { ticketsSold, cashPaid } = req.body;
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  if (deal.status !== "active") return res.status(400).json({ error: "Deal is not active" });

  const { cashCollected, profitLoss } = dailyWorksheet(Number(ticketsSold), Number(cashPaid), deal.ticketPrice);

  const [sale] = await prisma.$transaction([
    prisma.dailySale.create({
      data: {
        dealId: deal.id,
        ticketsSold: Number(ticketsSold),
        cashPaid: Number(cashPaid),
        cashCollected,
        profitLoss,
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

router.get("/:id/daily-sales", async (req, res) => {
  const deal = await prisma.deal.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  const sales = await prisma.dailySale.findMany({ where: { dealId: deal.id }, orderBy: { date: "desc" } });
  res.json(sales);
});

module.exports = router;
