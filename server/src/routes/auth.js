const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { signToken, requireAuth, loadPermissions } = require("../lib/auth");
const { MODULE_KEYS } = require("../lib/moduleKeys");
const { sendEmail } = require("../lib/notifications");
const { resetPasswordHtml } = require("../lib/authEmails");

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Legacy flat roles, kept only so an invite from a not-yet-updated client
// still works during rollout — mapped through the exact same table the
// one-time backfill script used, so behavior stays consistent either way.
const LEGACY_ROLE_GRANTS = {
  Head: { orgTier: "Owner", moduleGrants: MODULE_KEYS.map((module) => ({ module, tier: "Admin" })) },
  Chairperson: { orgTier: null, moduleGrants: [{ module: "bell-jar", tier: "Helper" }] },
  Preparer: { orgTier: null, moduleGrants: [{ module: "bell-jar", tier: "Helper" }] },
  Cashier: { orgTier: null, moduleGrants: [{ module: "bell-jar", tier: "Helper" }] },
};

// Unauthenticated — the signup form needs this before any login exists.
// Read-only; the list itself is managed from the platform admin dashboard
// (see platformAdmin.js's /org-categories routes).
router.get("/org-categories", async (req, res) => {
  const categories = await prisma.orgCategory.findMany({ orderBy: { name: "asc" } });
  res.json(categories);
});

// Creates a brand new organization (tenant) + its first user, who becomes the
// org's technical Owner (administers users/permissions, views everything —
// see server/src/lib/auth.js for what Owner does and doesn't grant by default).
// licenseId (the NYS Games of Chance license #) is optional here — required to file
// but a lodge may not have it in hand yet when first setting up; it can be added or
// updated later from the org profile (Reports > Form details). orgCategoryId is
// likewise optional — drives which modules are relevant to this org (see
// modules.js's MODULE_CATEGORY_RESTRICTIONS) but signup shouldn't hard-block on it.
router.post("/signup-org", async (req, res) => {
  const { orgName, name, email, password, licenseId, orgCategoryId } = req.body;
  if (!orgName || !name || !email || !password) {
    return res.status(400).json({ error: "orgName, name, email, password are required" });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  let validCategoryId = null;
  if (orgCategoryId) {
    const category = await prisma.orgCategory.findUnique({ where: { id: orgCategoryId } });
    if (category) validCategoryId = category.id;
  }
  const org = await prisma.organization.create({ data: { name: orgName, licenseId: licenseId || null, orgCategoryId: validCategoryId } });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { orgId: org.id, name, email, passwordHash, role: "Head" }, // role column is a frozen legacy field, see auth.js dual-read note
  });
  await prisma.orgMembership.create({ data: { orgId: org.id, userId: user.id, tier: "Owner" } });

  const token = signToken(user);
  res.json({ token, user: { ...(await publicUser(user)), orgName: org.name }, org });
});

// Adds a user to the caller's own org, and grants them an org tier and/or
// module grants. Delegation rule: an Owner may set anything (org tier, any
// module at any level); a plain module Admin may only grant Helper, and only
// within modules they themselves administer — enforced below, never trusted
// from the client alone. orgId always comes from the authenticated caller,
// never the request body, so one tenant can never create users in another.
//
// Accepts either the new shape ({ orgTier, moduleGrants }) or the legacy flat
// `role` string, mapped through LEGACY_ROLE_GRANTS above — a safety net for a
// client that hasn't been updated to the new invite form yet.
router.post("/invite", requireAuth, loadPermissions, async (req, res) => {
  const { name, email, password, role } = req.body;
  let { orgTier, moduleGrants } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password are required" });
  }

  if (orgTier === undefined && moduleGrants === undefined && role !== undefined) {
    const legacy = LEGACY_ROLE_GRANTS[role];
    if (!legacy) return res.status(400).json({ error: `role must be one of ${Object.keys(LEGACY_ROLE_GRANTS).join(", ")}` });
    orgTier = legacy.orgTier;
    moduleGrants = legacy.moduleGrants;
  }
  orgTier = orgTier || null;
  moduleGrants = moduleGrants || [];

  const isOwner = req.orgTier === "Owner";
  if (!isOwner) {
    if (orgTier) return res.status(403).json({ error: "Only an Owner can set Owner/Viewer" });
    for (const g of moduleGrants) {
      if (g.tier === "Admin") return res.status(403).json({ error: "Only an Owner can appoint a module Admin" });
      if (req.moduleGrants[g.module] !== "Admin") return res.status(403).json({ error: `You are not Admin of ${g.module}` });
    }
    if (moduleGrants.length === 0) {
      return res.status(403).json({ error: "Only an Owner or a module Admin may invite" });
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { orgId: req.user.orgId, name, email, passwordHash, role: "Cashier" }, // role column is a frozen legacy field, see auth.js dual-read note
  });

  if (orgTier) {
    await prisma.orgMembership.create({ data: { orgId: req.user.orgId, userId: user.id, tier: orgTier } });
  }
  for (const g of moduleGrants) {
    await prisma.moduleGrant.create({
      data: { orgId: req.user.orgId, userId: user.id, module: g.module, tier: g.tier, grantedBy: req.user.userId },
    });
  }

  res.json({ user: await publicUser(user) });
});

// Lists teammates in the caller's own org, including their current org tier
// and module grants, so the Team screen can render and manage them. Any
// authenticated user can view the roster; only invite (above) is restricted.
router.get("/users", requireAuth, async (req, res) => {
  const users = await prisma.user.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { createdAt: "asc" },
  });
  res.json(await Promise.all(users.map(publicUser)));
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { org: true } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token, user: { ...(await publicUser(user)), orgName: user.org.name } });
});

// Own-profile view/edit. Role is intentionally not editable here — permission
// changes are an org-admin action (Team screen), not self-service.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(await publicUser(user));
});

router.patch("/me", requireAuth, async (req, res) => {
  const { name, email, title, phone, homeAddress } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== req.user.userId) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const updated = await prisma.user.update({
    where: { id: req.user.userId },
    data: { name, email, title: title || null, phone: phone || null, homeAddress: homeAddress || null },
  });
  res.json(await publicUser(updated));
});

// Changes the caller's own password — requires the current password, not an
// admin override. A "forgot password" (email-link) flow is a separate feature
// this doesn't cover, since it needs outbound email delivery we don't have set up.
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

// Starts a self-service "forgot password" flow — no auth required, since the
// whole point is recovering an account you're locked out of. Always responds
// the same way whether or not the email matches an account, so this can't be
// used to probe which email addresses have accounts.
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const user = await prisma.user.findUnique({ where: { email }, include: { org: true } });
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    try {
      await sendEmail({
        to: user.email,
        toName: user.name,
        subject: "Reset your Charity Pulse password",
        html: resetPasswordHtml({ resetUrl, orgName: user.org.name }),
      });
    } catch (err) {
      // Logged, not surfaced — the response below stays identical either way,
      // so a delivery failure can't be used to tell real accounts from fake ones.
      console.error("Failed to send password reset email:", err.message);
    }
  }

  res.json({ ok: true, message: "If an account exists for that email, a reset link is on its way." });
});

// Completes a reset from the emailed link. The token is single-use (marked
// via usedAt) and expires after RESET_TOKEN_TTL_MS — both checked here.
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: "token and newPassword are required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const reset = await prisma.passwordReset.findUnique({ where: { token } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired — request a new one." });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    // Any other outstanding reset requests for this user are invalidated too —
    // one successful reset should retire every link that was ever sent out.
    prisma.passwordReset.updateMany({
      where: { userId: reset.userId, usedAt: null, id: { not: reset.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  res.json({ ok: true });
});

// Joins in the new permission model for API responses. `role` is kept only as
// a frozen legacy field (see the dual-read note in server/src/lib/auth.js) —
// nothing should read it going forward; orgTier/moduleGrants are the source
// of truth now.
async function publicUser(user) {
  const [membership, grants] = await Promise.all([
    prisma.orgMembership.findUnique({ where: { userId: user.id } }),
    prisma.moduleGrant.findMany({ where: { userId: user.id } }),
  ]);
  return {
    id: user.id,
    orgId: user.orgId,
    name: user.name,
    email: user.email,
    role: user.role,
    orgTier: membership?.tier || null,
    moduleGrants: Object.fromEntries(grants.map((g) => [g.module, g.tier])),
    title: user.title,
    phone: user.phone,
    homeAddress: user.homeAddress,
    createdAt: user.createdAt,
  };
}

module.exports = router;
