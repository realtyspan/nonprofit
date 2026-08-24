// Cross-org routes for the single platform owner — the one deliberate
// exception to "every query scopes by req.user.orgId" that holds true
// everywhere else in this codebase. Nothing here is reachable without
// isPlatformAdmin (see requirePlatformAdmin in lib/auth.js), and nothing
// here writes to Organization itself — billing and support notes live on
// their own models specifically so GET /api/org/ (which returns the raw org
// row to that org's own users) can never accidentally leak them.
const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePlatformAdmin } = require("../lib/auth");

const router = express.Router();
router.use(requireAuth, loadPermissions, requirePlatformAdmin);

const BILLING_STATUSES = ["trial", "active", "past_due", "canceled"];
const DEFAULT_BILLING = { status: "trial", planName: null, billingAmount: null, billingCycle: null, renewalDate: null, lastPaymentDate: null, notes: null };

router.get("/summary", async (req, res) => {
  const [orgCount, billings] = await Promise.all([
    prisma.organization.count(),
    prisma.orgBilling.findMany({ select: { status: true, renewalDate: true } }),
  ]);
  const billedOrgCount = billings.length;
  const counts = { trial: orgCount - billedOrgCount, active: 0, past_due: 0, canceled: 0 };
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let renewalsDueSoon = 0;
  for (const b of billings) {
    counts[b.status] = (counts[b.status] || 0) + 1;
    if (b.renewalDate && new Date(b.renewalDate) >= now && new Date(b.renewalDate) <= in30Days) renewalsDueSoon++;
  }
  res.json({ totalOrgs: orgCount, ...counts, renewalsDueSoon });
});

router.get("/organizations", async (req, res) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { billing: true, _count: { select: { users: true } } },
  });
  res.json(orgs.map((o) => ({
    id: o.id, name: o.name, createdAt: o.createdAt, userCount: o._count.users,
    billing: o.billing || DEFAULT_BILLING,
  })));
});

router.get("/organizations/:id", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: {
      billing: true,
      users: { select: { id: true, name: true, email: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      platformSupportNotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({
    id: org.id, name: org.name, createdAt: org.createdAt, slug: org.slug, contactEmail: org.contactEmail,
    users: org.users,
    billing: org.billing || DEFAULT_BILLING,
    supportNotes: org.platformSupportNotes,
  });
});

router.patch("/organizations/:id/billing", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const { status, planName, billingAmount, billingCycle, renewalDate, lastPaymentDate, notes } = req.body;
  if (status && !BILLING_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${BILLING_STATUSES.join(", ")}` });
  }

  const data = {
    status: status || "trial",
    planName: planName?.trim() || null,
    billingAmount: billingAmount != null && billingAmount !== "" ? Number(billingAmount) : null,
    billingCycle: billingCycle?.trim() || null,
    renewalDate: renewalDate ? new Date(renewalDate) : null,
    lastPaymentDate: lastPaymentDate ? new Date(lastPaymentDate) : null,
    notes: notes?.trim() || null,
  };
  const billing = await prisma.orgBilling.upsert({
    where: { orgId: org.id },
    update: data,
    create: { orgId: org.id, ...data },
  });
  res.json(billing);
});

router.post("/organizations/:id/support-notes", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  const { subject, body } = req.body;
  if (!subject?.trim() || !body?.trim()) return res.status(400).json({ error: "subject and body are required" });

  const caller = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { name: true } });
  const note = await prisma.platformSupportNote.create({
    data: { orgId: org.id, subject: subject.trim(), body: body.trim(), createdByName: caller?.name || "" },
  });
  res.json(note);
});

router.patch("/organizations/:id/support-notes/:noteId", async (req, res) => {
  const note = await prisma.platformSupportNote.findFirst({ where: { id: req.params.noteId, orgId: req.params.id } });
  if (!note) return res.status(404).json({ error: "Note not found" });
  const { status } = req.body;
  if (!["open", "resolved"].includes(status)) return res.status(400).json({ error: "status must be open or resolved" });

  const updated = await prisma.platformSupportNote.update({
    where: { id: note.id },
    data: { status, resolvedAt: status === "resolved" ? new Date() : null },
  });
  res.json(updated);
});

module.exports = router;
