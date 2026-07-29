const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requireOwner, requirePermission } = require("../lib/auth");

const router = express.Router();
router.use(requireAuth, loadPermissions);

router.get("/", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  res.json(org);
});

// The org's compliance-form profile (county, license #, etc.) and its public
// slug both live here — either the technical Owner or the Bell Jar module's
// Admin may edit it, since both have legitimate reason to (Owner for org
// identity/slug, Bell Jar Admin for the compliance header fields).
function requireOwnerOrBellJarAdmin(req, res, next) {
  if (req.orgTier === "Owner") return next();
  return requirePermission("bell-jar", "Admin")(req, res, next);
}
router.patch("/", requireOwnerOrBellJarAdmin, async (req, res) => {
  const { county, municipality, licenseCategory, licenseLast5, licenseId, address, slug } = req.body;

  if (slug !== undefined && slug !== null && slug !== "") {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({ error: "Slug can only contain lowercase letters, numbers, and hyphens" });
    }
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing && existing.id !== req.user.orgId) {
      return res.status(400).json({ error: "That link is already taken by another organization" });
    }
  }

  const org = await prisma.organization.update({
    where: { id: req.user.orgId },
    data: { county, municipality, licenseCategory, licenseLast5, licenseId, address, slug: slug || undefined },
  });
  res.json(org);
});

module.exports = router;
