const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { generateFrsReport } = require("../lib/frsReport");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// Same data-URL shape every file upload in this app uses (ReceiptField, the
// contract upload, label photos).
function decodeDataUrl(dataUrl) {
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

router.post("/frs-report", requirePermission("elks-tools", "Helper"), async (req, res) => {
  const { file, fileName } = req.body;
  if (!file) return res.status(400).json({ error: "An .xlsx file is required" });
  const buffer = decodeDataUrl(file);
  if (!buffer) return res.status(400).json({ error: "Couldn't read that file" });

  let result;
  try {
    result = generateFrsReport(buffer);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const caller = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { name: true } });
  // One saved run per lodge per month — regenerating a month (correcting a
  // mistake, re-uploading) replaces the prior save, since only one file per
  // month is ever the real submission.
  const saved = await prisma.frsReportRun.upsert({
    where: { orgId_year_month: { orgId: req.user.orgId, year: result.year, month: result.month } },
    create: {
      orgId: req.user.orgId,
      year: result.year,
      month: result.month,
      monthLabel: result.monthLabel,
      sourceFile: file,
      sourceFileName: fileName || "source.xlsx",
      csvFile: result.csv,
      csvFileName: result.filename,
      transactionCount: result.transactionCount,
      totalDebits: result.totalDebits,
      totalCredits: result.totalCredits,
      generatedByName: caller?.name || "",
    },
    update: {
      sourceFile: file,
      sourceFileName: fileName || "source.xlsx",
      csvFile: result.csv,
      csvFileName: result.filename,
      transactionCount: result.transactionCount,
      totalDebits: result.totalDebits,
      totalCredits: result.totalCredits,
      generatedByName: caller?.name || "",
      generatedAt: new Date(),
    },
  });

  res.json({ ...result, savedId: saved.id });
});

// List saved runs, newest first — file blobs omitted to keep the payload small.
router.get("/frs-report/runs", requireReadAccess("elks-tools"), async (req, res) => {
  const runs = await prisma.frsReportRun.findMany({
    where: { orgId: req.user.orgId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      id: true, year: true, month: true, monthLabel: true,
      sourceFileName: true, csvFileName: true,
      transactionCount: true, totalDebits: true, totalCredits: true,
      generatedByName: true, generatedAt: true,
    },
  });
  res.json(runs);
});

router.get("/frs-report/runs/:id/source-file", requireReadAccess("elks-tools"), async (req, res) => {
  const run = await prisma.frsReportRun.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!run) return res.status(404).json({ error: "Report not found" });
  const buffer = decodeDataUrl(run.sourceFile);
  if (!buffer) return res.status(500).json({ error: "Couldn't read the saved source file" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${run.sourceFileName}"`);
  res.send(buffer);
});

router.get("/frs-report/runs/:id/csv", requireReadAccess("elks-tools"), async (req, res) => {
  const run = await prisma.frsReportRun.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!run) return res.status(404).json({ error: "Report not found" });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${run.csvFileName}"`);
  res.send(run.csvFile);
});

module.exports = router;
