const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../lib/auth");
const { computeGC7Q } = require("../lib/businessLogic");
const { fillGC7QPdf } = require("../lib/gc7qPdf");

const router = express.Router();
router.use(requireAuth);

// Who may sign each of the 3 sign-off slots (per prototype's role model —
// Chairperson stands in for Head + Member in Charge; Preparer signs their own row).
function canSign(userRole, slotRole) {
  if (slotRole === "Preparer") return userRole === "Preparer";
  if (slotRole === "Head") return userRole === "Head" || userRole === "Chairperson";
  if (slotRole === "Member") return userRole === "Chairperson";
  return false;
}

function previousQuarter(year, quarter) {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };
}

async function getPriorD17(orgId, year, quarter) {
  const prev = previousQuarter(year, quarter);
  const prevReport = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId, year: prev.year, quarter: prev.quarter } },
  });
  if (!prevReport) return 0;
  return JSON.parse(prevReport.values).D17 || 0;
}

async function buildReport(orgId, year, quarter) {
  const closedRecords = await prisma.schedule1Record.findMany({
    where: {
      deal: { orgId },
      closedDate: {
        gte: new Date(year, (quarter - 1) * 3, 1),
        lt: new Date(year, quarter * 3, 1),
      },
    },
    include: { deal: true },
  });

  const closedDeals = closedRecords.map((r) => ({
    idealValue: r.deal.ticketCount * r.deal.ticketPrice,
    cashPrizes: r.cashPrizes,
    unsoldValue: r.unsoldValue,
  }));

  const disbursements = await prisma.disbursement.findMany({
    where: { orgId, year, quarter },
  });

  const existing = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId, year, quarter } },
  });
  const priorD17 = await getPriorD17(orgId, year, quarter);

  return computeGC7Q(closedDeals, disbursements, {
    priorD17,
    interestEarned: existing?.interestEarned || 0,
    adjustments: existing?.adjustments || 0,
  });
}

// Once a report is "filed", its values are frozen to whatever they were at the
// moment of the final signature — later ledger/deal edits must never silently
// change a report that's already been signed off and (presumably) mailed.
// While still "draft", values always reflect the live, current data.
async function getReportValues(orgId, year, quarter, existing) {
  if (existing && existing.status === "filed") {
    return JSON.parse(existing.values);
  }
  return buildReport(orgId, year, quarter);
}

router.get("/:year/:quarter", async (req, res) => {
  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);

  const existing = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
    include: { signOffs: { include: { user: true } } },
  });
  const values = await getReportValues(req.user.orgId, year, quarter, existing);

  res.json({
    year,
    quarter,
    values,
    status: existing?.status || "draft",
    signOffs: existing?.signOffs || [],
    interestEarned: existing?.interestEarned || 0,
    adjustments: existing?.adjustments || 0,
    adjustmentExplanation: existing?.adjustmentExplanation || "",
  });
});

// Sets the per-quarter manual inputs (C11 interest earned, C13 adjustments) that
// aren't derivable from any ledger/deal data, then recomputes and persists.
router.patch("/:year/:quarter/inputs", requireRole("Head", "Chairperson", "Preparer"), async (req, res) => {
  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);
  const { interestEarned, adjustments, adjustmentExplanation } = req.body;

  const current = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
  });
  if (current?.status === "filed") {
    return res.status(400).json({ error: "Report is filed — unlock it for correction before editing" });
  }

  await prisma.gC7QReport.upsert({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
    update: {
      interestEarned: Number(interestEarned) || 0,
      adjustments: Number(adjustments) || 0,
      adjustmentExplanation: adjustmentExplanation || null,
    },
    create: {
      orgId: req.user.orgId,
      year,
      quarter,
      values: "{}",
      interestEarned: Number(interestEarned) || 0,
      adjustments: Number(adjustments) || 0,
      adjustmentExplanation: adjustmentExplanation || null,
    },
  });

  const values = await buildReport(req.user.orgId, year, quarter);
  const report = await prisma.gC7QReport.update({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
    data: { values: JSON.stringify(values) },
  });

  res.json(report);
});

// Fills the real NYS GC-7Q form with this quarter's computed values + sign-off info.
router.get("/:year/:quarter/pdf", async (req, res) => {
  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);

  const [org, report] = await Promise.all([
    prisma.organization.findUnique({ where: { id: req.user.orgId } }),
    prisma.gC7QReport.findUnique({
      where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
      include: { signOffs: { include: { user: true } } },
    }),
  ]);
  const values = await getReportValues(req.user.orgId, year, quarter, report);

  const signOffs = {};
  const slotKey = { Head: "head", Preparer: "preparer", Member: "member" };
  for (const s of report?.signOffs || []) {
    signOffs[slotKey[s.role]] = {
      name: s.user.name,
      email: s.user.email,
      signedAt: s.signedAt,
      title: s.user.title,
      phone: s.user.phone,
      homeAddress: s.user.homeAddress,
    };
  }

  const pdfBytes = await fillGC7QPdf({
    header: {
      year,
      orgName: org.name,
      gcId: org.licenseId,
      street: org.address,
      adjustmentExplanation: report?.adjustmentExplanation,
    },
    values,
    signOffs,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="GC7Q_Q${quarter}_${year}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

router.post("/:year/:quarter/sign", async (req, res) => {
  const { role } = req.body; // "Head" | "Preparer" | "Member"
  if (!["Head", "Preparer", "Member"].includes(role)) {
    return res.status(400).json({ error: "role must be Head, Preparer, or Member" });
  }
  if (!canSign(req.user.role, role)) {
    return res.status(403).json({ error: `Your role cannot sign the ${role} slot` });
  }

  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);
  let report = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
  });
  if (!report) {
    const values = await buildReport(req.user.orgId, year, quarter);
    report = await prisma.gC7QReport.create({
      data: { orgId: req.user.orgId, year, quarter, values: JSON.stringify(values), status: "draft" },
    });
  }

  await prisma.signOff.upsert({
    where: { reportId_role: { reportId: report.id, role } },
    update: { userId: req.user.userId, signedAt: new Date() },
    create: { reportId: report.id, role, userId: req.user.userId },
  });

  const signOffs = await prisma.signOff.findMany({ where: { reportId: report.id } });
  if (signOffs.length === 3) {
    // Freeze the snapshot at the exact moment the 3rd signature lands — this is
    // the version everyone affirmed, and it must not drift after this point.
    const finalValues = await buildReport(req.user.orgId, year, quarter);
    report = await prisma.gC7QReport.update({
      where: { id: report.id },
      data: { status: "filed", values: JSON.stringify(finalValues) },
    });
  }

  res.json({ ok: true, status: report.status });
});

// Reopens a filed report for correction: reverts to draft and clears all 3
// signatures, since changed numbers require everyone to re-affirm them.
// For a report already mailed to the Commission, correct it instead via a C13
// adjustment on a later quarter's report (see the "Adjustments" field) —
// don't rewrite a filing that's already gone out.
router.post("/:year/:quarter/unlock", requireRole("Head", "Chairperson"), async (req, res) => {
  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);

  const report = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
  });
  if (!report) return res.status(404).json({ error: "No report found for this quarter" });
  if (report.status !== "filed") return res.status(400).json({ error: "Report is not filed" });

  await prisma.signOff.deleteMany({ where: { reportId: report.id } });
  const updated = await prisma.gC7QReport.update({
    where: { id: report.id },
    data: { status: "draft" },
  });

  res.json({ ok: true, status: updated.status });
});

module.exports = router;
