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
  const { county, municipality, licenseCategory, licenseLast5, licenseId, address } = req.body;
  const org = await prisma.organization.update({
    where: { id: req.user.orgId },
    data: { county, municipality, licenseCategory, licenseLast5, licenseId, address },
  });
  res.json(org);
});

module.exports = router;
