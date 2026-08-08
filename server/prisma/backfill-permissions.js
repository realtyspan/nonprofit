// One-time (but safely re-runnable) backfill from the old flat User.role
// string onto the new permission model: OrgMembership (Owner/Viewer),
// ModuleGrant (Admin/Helper per module), and GC7QSignerDesignation (which of
// the GC-7Q form's 3 signature slots a user is designated to sign).
//
// Default mapping, confirmed with the org owner before building this:
//   Head                          -> Owner + Admin of every existing module
//   Chairperson | Preparer | Cashier -> Bell Jar Helper
// This exactly preserves who could do what before cutover — nobody loses
// access — and separately preserves today's effective GC-7Q sign-off
// behavior (old Head -> "Head" slot, old Preparer -> "Preparer" slot, old
// Chairperson -> "Member" slot, mirroring the old canSign() mapping).
//
// Every write here is an upsert keyed on the same unique constraint the
// permission tables enforce, so running this script twice is a no-op the
// second time — safe to re-run if interrupted.

const MODULES = ["bell-jar", "rentals", "calendar", "raffle"];

async function backfillUserPermissions(prisma, user) {
  if (user.role === "Head") {
    await prisma.orgMembership.upsert({
      where: { userId: user.id },
      update: {},
      create: { orgId: user.orgId, userId: user.id, tier: "Owner" },
    });
    for (const module of MODULES) {
      await prisma.moduleGrant.upsert({
        where: { userId_module: { userId: user.id, module } },
        update: {},
        create: { orgId: user.orgId, userId: user.id, module, tier: "Admin" },
      });
    }
    await prisma.gC7QSignerDesignation.upsert({
      where: { orgId_slot: { orgId: user.orgId, slot: "Head" } },
      update: {},
      create: { orgId: user.orgId, userId: user.id, slot: "Head" },
    });
    return;
  }

  if (["Chairperson", "Preparer", "Cashier"].includes(user.role)) {
    await prisma.moduleGrant.upsert({
      where: { userId_module: { userId: user.id, module: "bell-jar" } },
      update: {},
      create: { orgId: user.orgId, userId: user.id, module: "bell-jar", tier: "Helper" },
    });
    const slot = user.role === "Preparer" ? "Preparer" : user.role === "Chairperson" ? "Member" : null;
    if (slot) {
      await prisma.gC7QSignerDesignation.upsert({
        where: { orgId_slot: { orgId: user.orgId, slot } },
        update: {},
        create: { orgId: user.orgId, userId: user.id, slot },
      });
    }
  }
}

async function backfillAll(prisma) {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const perOrg = {};
  for (const user of users) {
    await backfillUserPermissions(prisma, user);
    perOrg[user.orgId] = (perOrg[user.orgId] || 0) + 1;
  }
  return { userCount: users.length, orgCount: Object.keys(perOrg).length, perOrg };
}

module.exports = { backfillUserPermissions, backfillAll, MODULES };

if (require.main === module) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  backfillAll(prisma)
    .then((summary) => {
      console.log(`Backfilled ${summary.userCount} users across ${summary.orgCount} orgs.`);
      for (const [orgId, count] of Object.entries(summary.perOrg)) {
        console.log(`  org ${orgId}: ${count} users`);
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
