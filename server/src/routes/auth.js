const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { signToken, requireAuth, requireRole } = require("../lib/auth");

const router = express.Router();

const VALID_ROLES = ["Cashier", "Chairperson", "Preparer", "Head"];

// Creates a brand new organization (tenant) + its first user (Head).
// licenseId (the NYS Games of Chance license #) is optional here — required to file
// but a lodge may not have it in hand yet when first setting up; it can be added or
// updated later from the org profile (Reports > Form details).
router.post("/signup-org", async (req, res) => {
  const { orgName, name, email, password, licenseId } = req.body;
  if (!orgName || !name || !email || !password) {
    return res.status(400).json({ error: "orgName, name, email, password are required" });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const org = await prisma.organization.create({ data: { name: orgName, licenseId: licenseId || null } });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { orgId: org.id, name, email, passwordHash, role: "Head" },
  });

  const token = signToken(user);
  res.json({ token, user: { ...publicUser(user), orgName: org.name }, org });
});

// Adds a user to the caller's own org. Only Head/Chairperson may invite,
// and orgId always comes from the authenticated caller — never from the request body —
// so one tenant can never create users in another tenant.
router.post("/invite", requireAuth, requireRole("Head", "Chairperson"), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, role are required" });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${VALID_ROLES.join(", ")}` });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { orgId: req.user.orgId, name, email, passwordHash, role } });
  res.json({ user: publicUser(user) });
});

// Lists teammates in the caller's own org. Any authenticated role can view the roster;
// only invite (above) is restricted to Head/Chairperson.
router.get("/users", requireAuth, async (req, res) => {
  const users = await prisma.user.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { createdAt: "asc" },
  });
  res.json(users.map(publicUser));
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { org: true } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token, user: { ...publicUser(user), orgName: user.org.name } });
});

// Own-profile view/edit. Role is intentionally not editable here — role changes
// are an org-admin action (invite flow), not self-service.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(publicUser(user));
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
  res.json(publicUser(updated));
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

function publicUser(user) {
  return {
    id: user.id,
    orgId: user.orgId,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
    phone: user.phone,
    homeAddress: user.homeAddress,
    createdAt: user.createdAt,
  };
}

module.exports = router;
