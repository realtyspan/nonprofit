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
const { stripe, PRICE_IDS, PRICE_AMOUNTS } = require("../lib/stripe");

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
const DEFAULT_BILLING = {
  status: "trial", planName: null, billingAmount: null, billingCycle: null, renewalDate: null, lastPaymentDate: null, notes: null,
  stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null,
};

// Same fallback as resolveReplyTo in raffle.js: the org's own contact email
// if it's set one, else its Owner's login email.
async function resolveBillingEmail(orgId, org) {
  if (org.contactEmail) return org.contactEmail;
  const ownerMembership = await prisma.orgMembership.findFirst({
    where: { orgId, tier: "Owner" },
    include: { user: { select: { email: true, name: true } } },
  });
  return ownerMembership?.user?.email || null;
}

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
    include: { billing: true, orgCategory: true, _count: { select: { users: true } } },
  });
  res.json(orgs.map((o) => ({
    id: o.id, name: o.name, createdAt: o.createdAt, userCount: o._count.users,
    billing: o.billing || DEFAULT_BILLING,
    orgCategoryId: o.orgCategoryId, orgCategoryName: o.orgCategory?.name || null,
  })));
});

router.get("/organizations/:id", async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: {
      billing: true,
      orgCategory: true,
      users: { select: { id: true, name: true, email: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      platformSupportNotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  res.json({
    id: org.id, name: org.name, createdAt: org.createdAt, slug: org.slug, contactEmail: org.contactEmail,
    orgCategoryId: org.orgCategoryId, orgCategoryName: org.orgCategory?.name || null,
    users: org.users,
    billing: org.billing || DEFAULT_BILLING,
    supportNotes: org.platformSupportNotes,
  });
});

// Lets a platform admin set (or clear) an existing org's category — needed
// for orgs that signed up before this feature existed, or that skipped the
// dropdown, so they aren't stuck with restricted modules (e.g. Elks Tools)
// hidden forever just because no category was ever recorded.
router.patch("/organizations/:id/category", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  const { orgCategoryId } = req.body;
  if (orgCategoryId) {
    const category = await prisma.orgCategory.findUnique({ where: { id: orgCategoryId } });
    if (!category) return res.status(400).json({ error: "That category wasn't found" });
  }
  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: { orgCategoryId: orgCategoryId || null },
    include: { orgCategory: true },
  });
  res.json({ orgCategoryId: updated.orgCategoryId, orgCategoryName: updated.orgCategory?.name || null });
});

// --- Org categories (the signup dropdown's source list) ---
// Simple platform-admin-managed lookup list — see schema.prisma's
// OrgCategory comment for why this is just the name list, not a
// category-to-module matrix (that mapping is a small hardcoded table in the
// client instead, see modules.js's MODULE_CATEGORY_RESTRICTIONS).

router.get("/org-categories", async (req, res) => {
  const categories = await prisma.orgCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { organizations: true } } },
  });
  res.json(categories.map((c) => ({ id: c.id, name: c.name, orgCount: c._count.organizations })));
});

router.post("/org-categories", async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  const existing = await prisma.orgCategory.findUnique({ where: { name } });
  if (existing) return res.status(409).json({ error: "That category already exists" });
  const category = await prisma.orgCategory.create({ data: { name } });
  res.json(category);
});

router.patch("/org-categories/:id", async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  const category = await prisma.orgCategory.findUnique({ where: { id: req.params.id } });
  if (!category) return res.status(404).json({ error: "Category not found" });
  const updated = await prisma.orgCategory.update({ where: { id: category.id }, data: { name } });
  res.json(updated);
});

// Safe to allow even for a category currently in use — Organization.orgCategoryId
// is onDelete: SetNull, so any org using it just reverts to "not set" rather
// than being blocked or cascading.
router.delete("/org-categories/:id", async (req, res) => {
  const category = await prisma.orgCategory.findUnique({ where: { id: req.params.id } });
  if (!category) return res.status(404).json({ error: "Category not found" });
  await prisma.orgCategory.delete({ where: { id: category.id } });
  res.json({ ok: true });
});

router.patch("/organizations/:id/billing", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id }, include: { billing: true } });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  if (org.billing?.stripeSubscriptionId) {
    return res.status(400).json({ error: "This org is billed through Stripe — use the billing portal link instead of editing it manually." });
  }

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

// Generates a Stripe Checkout link for this org, in subscription mode, at
// the chosen cadence. You copy the returned URL and send it to the org
// directly — there's no self-serve billing screen inside an org's own
// account (see project decision). client_reference_id carries the org id
// through to the webhook so checkout.session.completed can map back to the
// right org without guessing from the email alone.
router.post("/organizations/:id/stripe/checkout-link", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id }, include: { billing: true } });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  const { cadence } = req.body;
  if (!PRICE_IDS[cadence]) return res.status(400).json({ error: "cadence must be monthly or annual" });

  const email = await resolveBillingEmail(org.id, org);
  if (!email) return res.status(400).json({ error: "This org has no contact email and no Owner — add one before generating a checkout link" });

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: org.billing?.stripeCustomerId ? undefined : email,
    customer: org.billing?.stripeCustomerId || undefined,
    client_reference_id: org.id,
    line_items: [{ price: PRICE_IDS[cadence], quantity: 1 }],
    success_url: `${appUrl}/?billing=success`,
    cancel_url: `${appUrl}/`,
  });
  res.json({ url: session.url });
});

// Only meaningful once the org already has a Stripe customer — this is the
// "manage my subscription" link (update card, switch cadence, cancel), all
// on Stripe's own hosted page.
router.post("/organizations/:id/stripe/portal-link", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.params.id }, include: { billing: true } });
  if (!org) return res.status(404).json({ error: "Organization not found" });
  if (!org.billing?.stripeCustomerId) {
    return res.status(400).json({ error: "This org isn't on Stripe yet — generate a checkout link first" });
  }

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const session = await stripe.billingPortal.sessions.create({
    customer: org.billing.stripeCustomerId,
    return_url: `${appUrl}/`,
  });
  res.json({ url: session.url });
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

// Cross-org AI usage/cost, for deciding whether a heavy user of an
// AI-assisted feature (the golf historical-import reader, the Bell Jar
// label scanner) needs a billing conversation. Aggregated in JS from the
// raw log rather than a SQL group-by — this app's usual "simple until
// volume says otherwise" approach, matching every other stats computation
// here (computeRaffleStats, golf's /stats, etc.).
router.get("/ai-usage", async (req, res) => {
  const [logs, orgs] = await Promise.all([
    prisma.aiUsageLog.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.organization.findMany({ select: { id: true, name: true } }),
  ]);
  const orgNames = Object.fromEntries(orgs.map((o) => [o.id, o.name]));

  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const byOrg = new Map();
  for (const log of logs) {
    if (!byOrg.has(log.orgId)) {
      byOrg.set(log.orgId, { orgId: log.orgId, orgName: orgNames[log.orgId] || "(deleted org)", totalCalls: 0, totalCostUsd: 0, last30DaysCostUsd: 0, byFeature: {} });
    }
    const entry = byOrg.get(log.orgId);
    entry.totalCalls += 1;
    entry.totalCostUsd += log.costUsd;
    if (log.createdAt >= last30) entry.last30DaysCostUsd += log.costUsd;
    entry.byFeature[log.feature] = (entry.byFeature[log.feature] || 0) + log.costUsd;
  }

  const rows = Array.from(byOrg.values()).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  const platformTotalCostUsd = rows.reduce((sum, r) => sum + r.totalCostUsd, 0);
  const platformLast30DaysCostUsd = rows.reduce((sum, r) => sum + r.last30DaysCostUsd, 0);

  res.json({ rows, platformTotalCostUsd, platformLast30DaysCostUsd, totalCalls: logs.length });
});

module.exports = router;
