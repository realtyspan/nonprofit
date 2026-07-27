const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../lib/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  res.json(org);
});

// Only Head/Chairperson may edit the org's compliance-form profile (county, license #, etc).
router.patch("/", requireRole("Head", "Chairperson"), async (req, res) => {
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
