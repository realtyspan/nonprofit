const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { quarterOf } = require("../lib/businessLogic");
const { buildDisbursementsReportPdf } = require("../lib/disbursementsReportPdf");

const router = express.Router();
router.use(requireAuth, loadPermissions);

const VALID_CATEGORIES = ["ticket_purchase", "license_fee", "indirect"];
const CATEGORY_LABELS = {
  ticket_purchase: "Ticket purchase (A5)",
  license_fee: "License fee",
  indirect: "Indirect disbursement",
};

router.get("/", requireReadAccess("bell-jar"), async (req, res) => {
  const rows = await prisma.disbursement.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { date: "desc" },
  });
  res.json(rows);
});

// A plain, easy-to-read paper copy of the ledger for whatever category/
// date-range filter is currently showing on screen — same reasoning as the
// Sales Worksheet's and Schedule 1's own Print report buttons: members
// who'll never look at a screen still need a hard copy of this register.
router.get("/report", requireReadAccess("bell-jar"), async (req, res) => {
  const { from, to, category } = req.query;
  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of ${VALID_CATEGORIES.join(", ")}` });
  }

  const where = { orgId: req.user.orgId };
  if (category) where.category = category;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(`${to}T23:59:59.999Z`);
  }

  const [rows, org] = await Promise.all([
    prisma.disbursement.findMany({ where, orderBy: { date: "desc" } }),
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
  ]);

  const bytes = await buildDisbursementsReportPdf({
    org,
    from,
    to,
    categoryLabel: category ? CATEGORY_LABELS[category] : "All categories",
    rows,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Bank_Ledger_Report.pdf"`);
  res.send(Buffer.from(bytes));
});

router.post("/", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const { date, payee, checkNum, amount, category, receiptFile, receiptFileName } = req.body;
  if (!payee || !checkNum || amount === undefined || !category) {
    return res.status(400).json({ error: "payee, checkNum, amount, category are required" });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of ${VALID_CATEGORIES.join(", ")}` });
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ error: "amount must be > 0" });
  }

  const d = date ? new Date(date) : new Date();
  const row = await prisma.disbursement.create({
    data: {
      orgId: req.user.orgId,
      date: d,
      payee,
      checkNum,
      amount: Number(amount),
      category,
      quarter: quarterOf(d),
      year: d.getFullYear(),
      receiptFile: receiptFile || null,
      receiptFileName: receiptFileName || null,
    },
  });
  res.json(row);
});

module.exports = router;
