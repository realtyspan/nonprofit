const prisma = require("./prisma");

// Who gets a golf interest-signup alert: every user holding a golf
// Admin/Helper grant — the same permission check that already decides who
// can see tournament management, so an alert reaches whoever'd actually
// follow up rather than a single address someone has to remember to keep
// current. Owner is deliberately NOT auto-included (an Owner with no golf
// grant can't even see the golf module today — see modules.js's
// filterModulesForUser). Falls back to the org's contactEmail, then the
// Owner's login email, only if literally no one currently holds golf
// access — so an alert never lands with zero recipients. Mirrors
// rentalAlerts.js's resolveRentalAlertRecipients exactly.
async function resolveGolfAlertRecipients(orgId, org) {
  const grants = await prisma.moduleGrant.findMany({
    where: { orgId, module: "golf", tier: { in: ["Admin", "Helper"] } },
    include: { user: { select: { name: true, email: true } } },
  });
  const seen = new Set();
  const recipients = [];
  for (const g of grants) {
    if (seen.has(g.user.email)) continue;
    seen.add(g.user.email);
    recipients.push({ email: g.user.email, name: g.user.name });
  }
  if (recipients.length > 0) return recipients;

  if (org.contactEmail) return [{ email: org.contactEmail, name: org.name }];
  const ownerMembership = await prisma.orgMembership.findFirst({
    where: { orgId, tier: "Owner" },
    include: { user: { select: { name: true, email: true } } },
  });
  return ownerMembership ? [{ email: ownerMembership.user.email, name: ownerMembership.user.name }] : [];
}

module.exports = { resolveGolfAlertRecipients };
