import { icons } from "./icons";

// Each module contributes its own left-sidebar nav; the top bar switches between
// modules. Views not tied to any module (Profile, Team) are handled separately
// in App.jsx — Team used to live under Bell Jar, but permission management now
// spans the whole org (org tier + every module's grants), not just one module.
export const MODULES = [
  {
    key: "bell-jar",
    label: "Bell Jar",
    icon: icons.layers,
    blurb: "NYS Gaming Commission compliant · Bell Jar / Games of Chance",
    navItems: [
      { key: "dashboard", label: "Overview", icon: icons.grid, title: "Overview", subtitle: "At-a-glance compliance status" },
      { key: "worksheet", label: "Sales Worksheet", icon: icons.table, title: "Sales Worksheet", subtitle: "Log tickets sold and cash collected each time the machine is opened to retrieve funds and refill tickets" },
      { key: "deals", label: "Deals & Schedule 1", icon: icons.layers, title: "Deals & Schedule 1", subtitle: "Open deals, prize threshold, and close-deal history" },
      { key: "ledger", label: "Bank Ledger & Receipts", icon: icons.bank, title: "Bank Ledger & Receipts", subtitle: "Special Bell Jar Checking Account register" },
      { key: "reports", label: "GC-7Q Reports", icon: icons.fileCheck, title: "GC-7Q Reports", subtitle: "Quarterly aggregator, PDF overlay, and sign-off" },
    ],
  },
  {
    key: "rentals",
    label: "Rental Space",
    icon: icons.key,
    blurb: "Lodge facility rentals · Bookings, spaces & rates",
    navItems: [
      { key: "bookings", label: "Bookings", icon: icons.inbox, title: "Bookings", subtitle: "Review inquiries and manage confirmed rentals" },
      { key: "spaces", label: "Spaces & Rates", icon: icons.sliders, title: "Spaces & Rates", subtitle: "Manage rentable spaces, pricing, and your public booking link" },
      { key: "blocks", label: "Internal Blocks", icon: icons.ban, title: "Internal Blocks", subtitle: "Hold a space for the Lodge's own use" },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: icons.calendar,
    blurb: "Lodge calendar · Internal events & public schedule",
    navItems: [
      { key: "month", label: "Calendar", icon: icons.calendar, title: "Calendar", subtitle: "Lodge events plus everything published from other modules" },
    ],
  },
  {
    key: "raffle",
    label: "Raffle",
    icon: icons.ticket,
    blurb: "NYS Gaming Commission compliant · Raffle / Games of Chance",
    navItems: [
      { key: "manage", label: "Manage Raffles", icon: icons.layers, title: "Manage Raffles", subtitle: "Start, edit, close, or reopen a raffle", requiresTier: "Admin" },
      { key: "grid", label: "Ticket Grid", icon: icons.ticket, title: "Ticket Grid", subtitle: "Record sales, reservations, and payments" },
      { key: "checkin", label: "Check-In", icon: icons.checkCircle, title: "Check-In", subtitle: "Check in ticket holders on drawing night" },
      { key: "renewals", label: "Renewals", icon: icons.phoneCall, title: "Renewals", subtitle: "Track outreach calls to last year's buyers" },
      { key: "sellers", label: "Sellers", icon: icons.users, title: "Sellers", subtitle: "Everyone with raffle access and their sales" },
      { key: "log", label: "Activity Log", icon: icons.fileCheck, title: "Activity Log", subtitle: "Every ticket state change, in order" },
      { key: "report", label: "Report", icon: icons.table, title: "Report", subtitle: "Sales and revenue summary", requiresTier: "Admin" },
      { key: "drawings", label: "Drawings", icon: icons.dice, title: "Drawings", subtitle: "Set up drawings and draw winners", requiresTier: "Admin" },
      { key: "deposit", label: "Deposit", icon: icons.bank, title: "Deposit", subtitle: "Batch-record funds received from sellers", requiresTier: "Admin" },
      { key: "assign", label: "Assign", icon: icons.sliders, title: "Assign", subtitle: "Assign ticket ranges to sellers", requiresTier: "Admin" },
    ],
  },
];

// Strict per-module tier check, same convention every view already uses
// (e.g. Deals.jsx's isBellJarAdmin) — no org-wide Owner passthrough, matching
// the server's philosophy that Owner administers but doesn't auto-inherit
// module edit rights (see server/src/lib/auth.js).
const TIER_LEVEL = { Viewer: 1, Helper: 2, Admin: 3 };
export function hasModuleTier(permissions, moduleKey, minTier) {
  const tier = permissions?.moduleGrants?.[moduleKey];
  return !!tier && TIER_LEVEL[tier] >= TIER_LEVEL[minTier];
}

// Filters a module's navItems down to the ones the caller's tier can use —
// org-wide Owner/Viewer still see everything (they see every module at all
// per filterModulesForUser below), same read-everything spirit as the server.
export function filterNavItemsForUser(navItems, permissions, moduleKey) {
  if (permissions?.orgTier === "Owner" || permissions?.orgTier === "Viewer") return navItems;
  return navItems.filter((item) => !item.requiresTier || hasModuleTier(permissions, moduleKey, item.requiresTier));
}

// A module is visible if the user is an org-wide Owner/Viewer (see everything,
// at least read-only) or holds any grant (Admin or Helper) in that module.
// Someone with neither sees no modules at all — just Profile/Team.
export function filterModulesForUser(modules, permissions) {
  if (!permissions) return [];
  const { orgTier, moduleGrants } = permissions;
  if (orgTier === "Owner" || orgTier === "Viewer") return modules;
  return modules.filter((m) => !!moduleGrants?.[m.key]);
}
