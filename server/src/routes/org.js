const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requireOwner, requirePermission } = require("../lib/auth");

const router = express.Router();
router.use(requireAuth, loadPermissions);

router.get("/", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  res.json(org);
});

// The Bell Jar module's own GC-7Q compliance header fields (county, license
// #, etc.) — either the technical Owner or the Bell Jar module's Admin may
// edit these, since both have legitimate reason to. Org identity (name,
// contact, address, public slug) is a separate, Owner-only concern — see
// PATCH /identity below — so it isn't accepted here even from a Bell Jar Admin.
function requireOwnerOrBellJarAdmin(req, res, next) {
  if (req.orgTier === "Owner") return next();
  return requirePermission("bell-jar", "Admin")(req, res, next);
}
router.patch("/", requireOwnerOrBellJarAdmin, async (req, res) => {
  const { county, municipality, licenseCategory, licenseLast5, licenseId } = req.body;
  const org = await prisma.organization.update({
    where: { id: req.user.orgId },
    data: { county, municipality, licenseCategory, licenseLast5, licenseId },
  });
  res.json(org);
});

// Org identity — name, contact email, address, and the public slug shared
// across every module's public page (Rentals, Calendar, Golf). Deliberately
// Owner-only, unlike the compliance fields above: this is org-wide (not tied
// to any one module) and is the org's core identity, not a per-module
// operational detail — see Team.jsx's "Organization" section, the one place
// this is editable regardless of which modules an org even has.
router.patch("/identity", requireOwner, async (req, res) => {
  const { name, contactEmail, phone, address, mailingAddress, slug } = req.body;
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: "Organization name can't be blank" });
  }

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
    data: { name: name !== undefined ? name.trim() : undefined, contactEmail, phone, address, mailingAddress, slug: slug || undefined },
  });
  res.json(org);
});

// The actual external webpage where an org has pasted a module's embed code
// (see PublicLinkBox.jsx) — merged into the existing map by module key so
// setting golf's URL never touches any other module's. Owner-only, same as
// the rest of org identity above and matching PublicLinkBox's own edit gate
// (this field lives in that same "Public link" card).
router.patch("/identity/embed-page", requireOwner, async (req, res) => {
  const { module, url } = req.body;
  if (!module || typeof module !== "string") {
    return res.status(400).json({ error: "module is required" });
  }
  const trimmed = (url || "").trim();
  if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
    return res.status(400).json({ error: "Enter a full web address starting with http:// or https://" });
  }

  const existing = await prisma.organization.findUnique({ where: { id: req.user.orgId }, select: { embedPageUrls: true } });
  const embedPageUrls = { ...(existing.embedPageUrls || {}) };
  if (trimmed) embedPageUrls[module] = trimmed;
  else delete embedPageUrls[module];

  const org = await prisma.organization.update({
    where: { id: req.user.orgId },
    data: { embedPageUrls },
  });
  res.json(org);
});

// An org's own AI-assisted feature usage (the golf historical-import
// reader, the Bell Jar label scanner) — Owner-only, same reasoning as
// org identity above: this reads like a billing/cost concern, not a
// per-module operational detail any module Admin needs day to day.
router.get("/ai-usage", requireOwner, async (req, res) => {
  const logs = await prisma.aiUsageLog.findMany({ where: { orgId: req.user.orgId }, orderBy: { createdAt: "desc" } });

  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let totalCostUsd = 0;
  let last30DaysCostUsd = 0;
  const byFeature = {};
  for (const log of logs) {
    totalCostUsd += log.costUsd;
    if (log.createdAt >= last30) last30DaysCostUsd += log.costUsd;
    byFeature[log.feature] = (byFeature[log.feature] || 0) + log.costUsd;
  }

  res.json({ totalCalls: logs.length, totalCostUsd, last30DaysCostUsd, byFeature });
});

module.exports = router;
