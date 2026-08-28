const prisma = require("./prisma");

// Who gets rental money/inquiry alerts: every user holding a rentals
// Admin/Helper grant — the same permission check that already decides who
// can see Bookings, so an alert reaches whoever'd actually act on it rather
// than a single address someone has to remember to keep current. Owner is
// deliberately NOT auto-included (an Owner with no rentals grant can't even
// see Bookings today — see modules.js's filterModulesForUser). Falls back to
// the org's contactEmail, then the Owner's login email, only if literally no
// one currently holds rentals access — so an alert never lands with zero
// recipients. Shared by publicRentals.js (new inquiry) and rentals.js
// (payment collected, still owed a turnover).
async function resolveRentalAlertRecipients(orgId, org) {
  const grants = await prisma.moduleGrant.findMany({
    where: { orgId, module: "rentals", tier: { in: ["Admin", "Helper"] } },
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

module.exports = { resolveRentalAlertRecipients };
