// Cross-org routes for the platform's own admins — the one deliberate
// exception to "every query scopes by req.user.orgId" that holds true
// everywhere else in this codebase. Nothing here is reachable without a
// platformRole (see requirePlatformAdmin in lib/auth.js), and nothing here
// writes to Organization itself — billing and support notes live on their
// own models specifically so GET /api/org/ (which returns the raw org row
// to that org's own users) can never accidentally leak them.
//
// Owner vs Support: everything below the admin-management section is open
// to both tiers (viewing/billing/support-notes) — only managing who else
// holds platform access is Owner-only (requirePlatformOwner).
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePlatformAdmin, requirePlatformOwner } = require("../lib/auth");

const router = express.Router();
router.use(requireAuth, loadPermissions, requirePlatformAdmin);

const PLATFORM_ROLES = ["Owner", "Support"];
const PLATFORM_ORG_NAME = "Charity Pulse Platform";

async function findOrCreatePlatformOrg() {
  const existing = await prisma.organization.findFirst({ where: { name: PLATFORM_ORG_NAME } });
  if (existing) return existing;
  return prisma.organization.create({ data: { name: PLATFORM_ORG_NAME } });
}

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

// --- Platform admin management ---
// Listing is open to both tiers (transparency about who else has access);
// creating, changing roles, and revoking are Owner-only.

router.get("/admins", async (req, res) => {
  const admins = await prisma.user.findMany({
    where: { platformRole: { not: null } },
    select: { id: true, name: true, email: true, platformRole: true, org: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  res.json(admins.map((a) => ({ id: a.id, name: a.name, email: a.email, platformRole: a.platformRole, orgName: a.org.name })));
});

// Mirrors the existing "add teammate" flow (server/src/routes/auth.js,
// POST /invite): the inviting Owner types the new person's initial password
// directly — no auto-generated temp password, no email invite link, since
// this app has no precedent for either and shouldn't invent one just here.
router.post("/admins", requirePlatformOwner, async (req, res) => {
  const { name, email, password, platformRole } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (!PLATFORM_ROLES.includes(platformRole)) {
    return res.status(400).json({ error: `platformRole must be one of ${PLATFORM_ROLES.join(", ")}` });
  }
  const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const org = await findOrCreatePlatformOrg();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { orgId: org.id, name: name.trim(), email: email.trim(), passwordHash, role: "Head", platformRole },
  });
  await prisma.orgMembership.upsert({
    where: { userId: user.id },
    update: {},
    create: { orgId: org.id, userId: user.id, tier: "Owner" },
  });

  res.json({ id: user.id, name: user.name, email: user.email, platformRole: user.platformRole, orgName: org.name });
});

// The platform must always have at least one Owner, same invariant already
// enforced for org-level Owners in permissions.js's PATCH /org-tier/:userId.
async function assertNotLastOwner(targetUserId) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { platformRole: true } });
  if (target?.platformRole !== "Owner") return; // not currently an Owner, nothing to protect
  const ownerCount = await prisma.user.count({ where: { platformRole: "Owner" } });
  if (ownerCount <= 1) {
    throw Object.assign(new Error("The platform must always have at least one Owner — promote someone else first"), { status: 400 });
  }
}

router.patch("/admins/:userId", requirePlatformOwner, async (req, res) => {
  const { platformRole } = req.body;
  if (!PLATFORM_ROLES.includes(platformRole)) {
    return res.status(400).json({ error: `platformRole must be one of ${PLATFORM_ROLES.join(", ")}` });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!target || !target.platformRole) return res.status(404).json({ error: "Platform admin not found" });

  if (target.platformRole === "Owner" && platformRole !== "Owner") {
    try {
      await assertNotLastOwner(target.id);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }

  const updated = await prisma.user.update({ where: { id: target.id }, data: { platformRole } });
  res.json({ id: updated.id, name: updated.name, email: updated.email, platformRole: updated.platformRole });
});

router.delete("/admins/:userId", requirePlatformOwner, async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!target || !target.platformRole) return res.status(404).json({ error: "Platform admin not found" });

  try {
    await assertNotLastOwner(target.id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  await prisma.user.update({ where: { id: target.id }, data: { platformRole: null } });
  res.json({ ok: true });
});

module.exports = router;
