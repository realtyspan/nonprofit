const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requireOwner, requirePermission } = require("../lib/auth");
const { notifyOwnerSetChanged } = require("../lib/notifications");
const { MODULE_KEYS } = require("../lib/moduleKeys");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// What the caller themself can see/do — the client uses this to filter nav
// and to know which GC-7Q signature slots (if any) it's designated to sign.
router.get("/me", async (req, res) => {
  const [signerRows, org] = await Promise.all([
    prisma.gC7QSignerDesignation.findMany({ where: { orgId: req.user.orgId, userId: req.user.userId } }),
    prisma.organization.findUnique({ where: { id: req.user.orgId }, include: { orgCategory: true } }),
  ]);
  res.json({
    orgTier: req.orgTier,
    moduleGrants: req.moduleGrants,
    gc7qSignerSlots: signerRows.map((r) => r.slot),
    platformRole: req.platformRole,
    orgCategory: org?.orgCategory?.name || null,
  });
});

// Sets or clears a user's org-wide tier (Owner | Viewer | null). Owner-only.
// Guards against ever reaching zero Owners — that would permanently lock the
// org out of user/permission management.
router.patch("/org-tier/:userId", requireOwner, async (req, res) => {
  const { tier } = req.body; // "Owner" | "Viewer" | null
  if (tier !== null && tier !== "Owner" && tier !== "Viewer") {
    return res.status(400).json({ error: "tier must be Owner, Viewer, or null" });
  }
  const target = await prisma.user.findFirst({ where: { id: req.params.userId, orgId: req.user.orgId } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const current = await prisma.orgMembership.findUnique({ where: { userId: target.id } });
  const wasOwner = current?.tier === "Owner";
  const willBeOwner = tier === "Owner";

  if (wasOwner && !willBeOwner) {
    const ownerCount = await prisma.orgMembership.count({ where: { orgId: req.user.orgId, tier: "Owner" } });
    if (ownerCount <= 1) {
      return res.status(400).json({ error: "The organization must always have at least one Owner — promote someone else first" });
    }
  }

  if (tier === null) {
    await prisma.orgMembership.deleteMany({ where: { userId: target.id } });
  } else {
    await prisma.orgMembership.upsert({
      where: { userId: target.id },
      update: { tier },
      create: { orgId: req.user.orgId, userId: target.id, tier },
    });
  }

  if (wasOwner !== willBeOwner) {
    await notifyOwnerSetChanged(req.user.orgId);
  }
  res.json({ ok: true });
});

// Sets a user's grant for one module (Admin | Helper | Viewer). Owner may set
// any tier for anyone; a plain module Admin may only grant Helper or Viewer
// (never Admin), and only within a module they themselves administer — never
// trusted from the client alone, enforced here regardless of what the UI offers.
router.put("/module-grant/:userId/:module", async (req, res) => {
  const { module } = req.params;
  const { tier } = req.body; // "Admin" | "Helper" | "Viewer"
  if (!MODULE_KEYS.includes(module)) return res.status(400).json({ error: `module must be one of ${MODULE_KEYS.join(", ")}` });
  if (!["Admin", "Helper", "Viewer"].includes(tier)) return res.status(400).json({ error: "tier must be Admin, Helper, or Viewer" });

  const isOwner = req.orgTier === "Owner";
  const target = await prisma.user.findFirst({ where: { id: req.params.userId, orgId: req.user.orgId } });
  if (!target) return res.status(404).json({ error: "User not found" });

  if (!isOwner) {
    if (tier === "Admin") return res.status(403).json({ error: "Only an Owner can appoint a module Admin" });
    if (req.moduleGrants[module] !== "Admin") return res.status(403).json({ error: `You are not Admin of ${module}` });
    const currentTarget = await prisma.moduleGrant.findUnique({ where: { userId_module: { userId: target.id, module } } });
    if (currentTarget?.tier === "Admin") {
      return res.status(403).json({ error: "Only an Owner can change or remove another Admin" });
    }
  }

  const grant = await prisma.moduleGrant.upsert({
    where: { userId_module: { userId: target.id, module } },
    update: { tier, grantedBy: req.user.userId },
    create: { orgId: req.user.orgId, userId: target.id, module, tier, grantedBy: req.user.userId },
  });
  res.json(grant);
});

// Removes a user's grant for one module. Same authority rule as granting —
// a module Admin manages the module's *entire current* roster, not just
// people they personally invited (committees turn over, chairmen change).
router.delete("/module-grant/:userId/:module", async (req, res) => {
  const { module } = req.params;
  const isOwner = req.orgTier === "Owner";
  const target = await prisma.user.findFirst({ where: { id: req.params.userId, orgId: req.user.orgId } });
  if (!target) return res.status(404).json({ error: "User not found" });

  if (!isOwner) {
    if (req.moduleGrants[module] !== "Admin") return res.status(403).json({ error: `You are not Admin of ${module}` });
    const currentTarget = await prisma.moduleGrant.findUnique({ where: { userId_module: { userId: target.id, module } } });
    if (currentTarget?.tier === "Admin") {
      return res.status(403).json({ error: "Only an Owner can change or remove another Admin" });
    }
  }

  await prisma.moduleGrant.deleteMany({ where: { userId: target.id, module } });
  res.json({ ok: true });
});

// Purely cosmetic per-org display-label overrides — readable by anyone in
// the org (everyone needs them to render the UI correctly), writable only
// by the Owner. Never consulted by any permission check.
router.get("/labels", async (req, res) => {
  const labels = await prisma.tierLabel.findUnique({ where: { orgId: req.user.orgId } });
  res.json(labels || { ownerLabel: null, viewerLabel: null, adminLabel: null, helperLabel: null });
});

router.patch("/labels", requireOwner, async (req, res) => {
  const { ownerLabel, viewerLabel, adminLabel, helperLabel } = req.body;
  const labels = await prisma.tierLabel.upsert({
    where: { orgId: req.user.orgId },
    update: { ownerLabel, viewerLabel, adminLabel, helperLabel },
    create: { orgId: req.user.orgId, ownerLabel, viewerLabel, adminLabel, helperLabel },
  });
  res.json(labels);
});

// Current designations for all 3 slots, with the signer's name/email, so the
// Team screen can show who's assigned before changing anything.
router.get("/gc7q-signers", requirePermission("bell-jar", "Admin"), async (req, res) => {
  const rows = await prisma.gC7QSignerDesignation.findMany({
    where: { orgId: req.user.orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(rows);
});

// Assigns the designated signer for one of the GC-7Q form's 3 legally-specific
// signature slots. Assignable by the Bell Jar module's Admin to ANY user,
// regardless of that user's own module tier — the real form requires
// specific named officer signatures, independent of who does day-to-day
// Bell Jar data entry (see schema.prisma's GC7QSignerDesignation comment).
router.put("/gc7q-signers/:slot", requirePermission("bell-jar", "Admin"), async (req, res) => {
  const { slot } = req.params;
  if (!["Head", "Preparer", "Member"].includes(slot)) {
    return res.status(400).json({ error: "slot must be Head, Preparer, or Member" });
  }
  const { userId } = req.body;
  const target = await prisma.user.findFirst({ where: { id: userId, orgId: req.user.orgId } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const designation = await prisma.gC7QSignerDesignation.upsert({
    where: { orgId_slot: { orgId: req.user.orgId, slot } },
    update: { userId: target.id },
    create: { orgId: req.user.orgId, userId: target.id, slot },
  });
  res.json(designation);
});

// Same pattern as the gc7q-signers pair above, but for GC-7R (raffle)
// filings — a separate table so an org can name different officers for the
// raffle filing than the quarterly Bell Jar one (see schema.prisma's
// RaffleSignerDesignation comment).
router.get("/raffle-signers", requirePermission("raffle", "Admin"), async (req, res) => {
  const rows = await prisma.raffleSignerDesignation.findMany({
    where: { orgId: req.user.orgId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(rows);
});

router.put("/raffle-signers/:slot", requirePermission("raffle", "Admin"), async (req, res) => {
  const { slot } = req.params;
  if (!["Head", "Preparer", "Member"].includes(slot)) {
    return res.status(400).json({ error: "slot must be Head, Preparer, or Member" });
  }
  const { userId } = req.body;
  const target = await prisma.user.findFirst({ where: { id: userId, orgId: req.user.orgId } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const designation = await prisma.raffleSignerDesignation.upsert({
    where: { orgId_slot: { orgId: req.user.orgId, slot } },
    update: { userId: target.id },
    create: { orgId: req.user.orgId, userId: target.id, slot },
  });
  res.json(designation);
});

module.exports = router;
