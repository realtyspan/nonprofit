const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { closeDeal, isEligibleToClose } = require("../lib/businessLogic");
const { fillSchedule1Pdf } = require("../lib/schedule1Pdf");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// Closed-deal audit history for the org.
router.get("/", requireReadAccess("bell-jar"), async (req, res) => {
  const records = await prisma.schedule1Record.findMany({
    where: { deal: { orgId: req.user.orgId } },
    include: { deal: true },
    orderBy: { closedDate: "desc" },
  });
  res.json(records);
});

// Fills the real NYS Schedule 1 form with every deal closed in the given quarter.
router.get("/:year/:quarter/pdf", requireReadAccess("bell-jar"), async (req, res) => {
  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);

  const [org, records] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
    prisma.schedule1Record.findMany({
      where: {
        deal: { orgId: req.user.orgId },
        closedDate: {
          gte: new Date(year, (quarter - 1) * 3, 1),
          lt: new Date(year, quarter * 3, 1),
        },
      },
      include: { deal: true },
      orderBy: { closedDate: "asc" },
    }),
  ]);

  const deals = records.map((r) => ({
    name: r.deal.name,
    formNum: r.deal.formNum,
    serialNum: r.deal.serialNum,
    ticketCount: r.deal.ticketCount,
    ticketPrice: r.deal.ticketPrice,
    ticketValue: r.deal.ticketCount * r.deal.ticketPrice,
    idealPayout: r.deal.idealPayout,
    cashPrizes: r.cashPrizes,
    otherPrizes: r.otherPrizes,
    totalPrizes: r.cashPrizes + r.otherPrizes,
    unsoldCount: r.unsoldCount,
    unsoldValue: r.unsoldValue,
    profit: r.actualProfit,
  }));

  const pdfBytes = await fillSchedule1Pdf({
    deals,
    header: {
      quarter,
      year,
      county: org.county,
      municipality: org.municipality,
      category: org.licenseCategory,
      licenseLast5: org.licenseLast5,
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Schedule1_Q${quarter}_${year}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

// Only the Bell Jar module's Admin may close a deal (a finalize action, same tier
// as confirming a rental), and only once it's crossed its close threshold (75%
// minimum, org-configurable higher per deal).
router.post("/:dealId/close", requirePermission("bell-jar", "Admin"), async (req, res) => {
  const { unsoldCount } = req.body;
  if (unsoldCount === undefined || Number(unsoldCount) < 0) {
    return res.status(400).json({ error: "unsoldCount (N) is required and must be >= 0" });
  }

  const deal = await prisma.deal.findFirst({ where: { id: req.params.dealId, orgId: req.user.orgId } });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  if (deal.status !== "active") return res.status(400).json({ error: "Deal is already closed" });
  if (Number(unsoldCount) > deal.ticketCount) {
    return res.status(400).json({ error: "Unsold count cannot exceed the deal's total ticket count" });
  }
  if (!isEligibleToClose(deal.prizesAwardedToDate, deal.idealPayout, deal.closeThreshold)) {
    return res.status(400).json({ error: `Deal has not reached its ${Math.round(deal.closeThreshold * 100)}% prize-awarded threshold` });
  }

  const K = deal.prizesAwardedToDate; // cash prizes tracked via daily worksheet
  const L = 0; // non-cash/other prizes — not modeled in this build
  const { I, O, M, P, closedDate, retentionUntil } = closeDeal(deal, {
    unsoldCount: Number(unsoldCount),
    cashPrizes: K,
    otherPrizes: L,
  });

  const [record] = await prisma.$transaction([
    prisma.schedule1Record.create({
      data: {
        dealId: deal.id,
        closedDate,
        cashPrizes: K,
        otherPrizes: L,
        unsoldCount: Number(unsoldCount),
        unsoldValue: O,
        actualProfit: P,
        retentionUntil,
      },
    }),
    prisma.deal.update({ where: { id: deal.id }, data: { status: "closed" } }),
  ]);

  res.json({ ...record, idealValue: I, totalPrizes: M });
});

module.exports = router;
