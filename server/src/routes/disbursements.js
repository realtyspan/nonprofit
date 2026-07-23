const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../lib/auth");
const { quarterOf } = require("../lib/businessLogic");

const router = express.Router();
router.use(requireAuth);

const VALID_CATEGORIES = ["ticket_purchase", "license_fee", "indirect"];

router.get("/", async (req, res) => {
  const rows = await prisma.disbursement.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { date: "desc" },
  });
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { date, payee, checkNum, amount, category } = req.body;
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
    },
  });
  res.json(row);
});

module.exports = router;
