const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { computeGC7Q } = require("../lib/businessLogic");
const { fillGC7QPdf } = require("../lib/gc7qPdf");

const router = express.Router();
router.use(requireAuth, loadPermissions);

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

// Freezes a report to a fresh snapshot the moment all three signature slots
// are filled. Atomic conditional update so two signatures landing at once
// can't both race the write — exactly one performs the freeze, the other is
// a no-op. Also serves as a self-healing backstop: if the sign path's own
// freeze was ever missed (a narrow race between two near-simultaneous
// signatures), the next read of the report freezes it, rather than letting
// a fully-signed report keep drifting as the underlying ledger changes.
// Returns the frozen values if it froze (or found it already filed), else null.
async function freezeIfFullySigned(orgId, year, quarter, existing) {
  if (!existing || existing.status === "filed") return existing ? JSON.parse(existing.values) : null;
  if ((existing.signOffs?.length || 0) < 3) return null;
  const finalValues = await buildReport(orgId, year, quarter);
  await prisma.gC7QReport.updateMany({
    where: { id: existing.id, status: { not: "filed" } },
    data: { status: "filed", values: JSON.stringify(finalValues) },
  });
  return finalValues;
}

// Once a report is "filed", its values are frozen to whatever they were at the
// moment of the final signature — later ledger/deal edits must never silently
// change a report that's already been signed off and (presumably) mailed.
// While still "draft", values always reflect the live, current data.
async function getReportValues(orgId, year, quarter, existing) {
  if (existing && existing.status === "filed") {
    return JSON.parse(existing.values);
  }
  const frozen = await freezeIfFullySigned(orgId, year, quarter, existing);
  if (frozen) return frozen;
  return buildReport(orgId, year, quarter);
}

router.get("/:year/:quarter", requireReadAccess("bell-jar"), async (req, res) => {
  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);

  const existing = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
    include: { signOffs: { include: { user: true } } },
  });
  const values = await getReportValues(req.user.orgId, year, quarter, existing);
  // getReportValues may have just frozen a fully-signed report — reflect
  // that in the status this response reports rather than a stale "draft".
  const status = existing && existing.status !== "filed" && (existing.signOffs?.length || 0) >= 3
    ? "filed"
    : (existing?.status || "draft");

  res.json({
    year,
    quarter,
    values,
    status,
    signOffs: existing?.signOffs || [],
    interestEarned: existing?.interestEarned || 0,
    adjustments: existing?.adjustments || 0,
    adjustmentExplanation: existing?.adjustmentExplanation || "",
  });
});

// Sets the per-quarter manual inputs (C11 interest earned, C13 adjustments) that
// aren't derivable from any ledger/deal data, then recomputes and persists.
router.patch("/:year/:quarter/inputs", requirePermission("bell-jar", "Helper"), async (req, res) => {
  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);
  const { interestEarned, adjustments, adjustmentExplanation } = req.body;

  const current = await prisma.gC7QReport.findUnique({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
  });
  if (current?.status === "filed") {
    return res.status(400).json({ error: "Report is filed — unlock it for correction before editing" });
  }

  const inputData = {
    interestEarned: Number(interestEarned) || 0,
    adjustments: Number(adjustments) || 0,
    adjustmentExplanation: adjustmentExplanation || null,
  };
  // Prisma's upsert isn't atomic against a concurrent first insert of the
  // same unique key — on that collision, retry, which now takes the update
  // branch against the row the other request just created.
  try {
    await prisma.gC7QReport.upsert({
      where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
      update: inputData,
      create: { orgId: req.user.orgId, year, quarter, values: "{}", ...inputData },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err;
    await prisma.gC7QReport.update({
      where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
      data: inputData,
    });
  }

  const values = await buildReport(req.user.orgId, year, quarter);
  const report = await prisma.gC7QReport.update({
    where: { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } },
    data: { values: JSON.stringify(values) },
  });

  res.json(report);
});

// Fills the real NYS GC-7Q form with this quarter's computed values + sign-off info.
router.get("/:year/:quarter/pdf", requireReadAccess("bell-jar"), async (req, res) => {
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
      street: org.mailingAddress || org.address, // mailing address is what a filing should show; fall back to physical for an org that hasn't set one yet
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
  const { role } = req.body; // "Head" | "Preparer" | "Member" — a GC-7Q signature slot, not a module tier
  if (!["Head", "Preparer", "Member"].includes(role)) {
    return res.status(400).json({ error: "role must be Head, Preparer, or Member" });
  }
  const designation = await prisma.gC7QSignerDesignation.findUnique({
    where: { orgId_slot: { orgId: req.user.orgId, slot: role } },
  });
  if (!designation || designation.userId !== req.user.userId) {
    return res.status(403).json({ error: `You are not the designated signer for the ${role} slot` });
  }

  const year = Number(req.params.year);
  const quarter = Number(req.params.quarter);

  // Two designated signers signing at the same moment both see no report
  // row yet. Neither findUnique-then-create nor Prisma's own upsert is
  // atomic against that — the loser hits the orgId_year_quarter unique
  // constraint. Attempt the create, and on that specific collision fall
  // back to reading the row the other signer just made, so both requests
  // finish cleanly instead of one hanging on an unhandled rejection.
  const whereKey = { orgId_year_quarter: { orgId: req.user.orgId, year, quarter } };
  let report = await prisma.gC7QReport.findUnique({ where: whereKey });
  if (!report) {
    const initialValues = await buildReport(req.user.orgId, year, quarter);
    try {
      report = await prisma.gC7QReport.create({
        data: { orgId: req.user.orgId, year, quarter, values: JSON.stringify(initialValues), status: "draft" },
      });
    } catch (err) {
      if (err.code !== "P2002") throw err;
      report = await prisma.gC7QReport.findUnique({ where: whereKey });
    }
  }

  // Same non-atomic-upsert caveat — a double-submit of the same slot could
  // race two inserts; on that collision the row already exists, so update it.
  try {
    await prisma.signOff.upsert({
      where: { reportId_role: { reportId: report.id, role } },
      update: { userId: req.user.userId, signedAt: new Date() },
      create: { reportId: report.id, role, userId: req.user.userId },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err;
    await prisma.signOff.update({
      where: { reportId_role: { reportId: report.id, role } },
      data: { userId: req.user.userId, signedAt: new Date() },
    });
  }

  // Freeze the snapshot the moment the 3rd signature lands — the version
  // everyone affirmed, which must not drift after this. Atomic conditional
  // update so two signatures landing together can't both race the write.
  const signOffCount = await prisma.signOff.count({ where: { reportId: report.id } });
  if (signOffCount === 3 && report.status !== "filed") {
    const finalValues = await buildReport(req.user.orgId, year, quarter);
    await prisma.gC7QReport.updateMany({
      where: { id: report.id, status: { not: "filed" } },
      data: { status: "filed", values: JSON.stringify(finalValues) },
    });
  }

  const finalReport = await prisma.gC7QReport.findUnique({ where: { id: report.id }, select: { status: true } });
  res.json({ ok: true, status: finalReport.status });
});

// Reopens a filed report for correction: reverts to draft and clears all 3
// signatures, since changed numbers require everyone to re-affirm them.
// For a report already mailed to the Commission, correct it instead via a C13
// adjustment on a later quarter's report (see the "Adjustments" field) —
// don't rewrite a filing that's already gone out.
router.post("/:year/:quarter/unlock", requirePermission("bell-jar", "Admin"), async (req, res) => {
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
