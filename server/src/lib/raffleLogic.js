// Pure logic for the Raffle module, ported from the source app's `mask_ticket`
// and stats helpers (server.py). Kept free of Prisma/Express so it's easy to
// verify in isolation, matching this project's existing lib/*.js convention.

// A module-level Viewer (or Admin) sees every ticket's full buyer info; a
// Helper (seller) only sees full info on tickets assigned to them — everyone
// else's tickets show blanked contact fields. `canEdit` additionally requires
// being Admin or the assigned seller — a Viewer never gets canEdit even
// though they can see full details, matching the source's is_admin-or-is_owner
// edit rule (a viewer role is neither).
function maskRaffleTicket(ticket, userId, tier) {
  const isOwner = ticket.assignedSellerId === userId;
  const seesFullDetails = tier === "Admin" || tier === "Viewer" || isOwner;
  const canEdit = tier === "Admin" || isOwner;

  if (seesFullDetails) {
    return { ...ticket, canEdit };
  }
  return {
    ...ticket,
    buyer: "", phone: "", email: "", address: "",
    soldByName: "", tenderType: null, tenderAmount: null, checkNumber: null,
    canEdit: false,
  };
}

function computeRaffleStats(tickets) {
  const available = tickets.filter((t) => t.status === "available").length;
  const reserved = tickets.filter((t) => t.status === "reserved").length;
  const sold = tickets.filter((t) => t.status === "sold").length;
  const fundsReceived = tickets.filter((t) => t.status === "funds_received").length;
  const revenue = tickets
    .filter((t) => t.status === "funds_received")
    .reduce((sum, t) => sum + (t.tenderAmount || 0), 0);
  return { total: tickets.length, available, reserved, sold, fundsReceived, revenue };
}

// A ticket is eligible for a drawing once its funds have been received and
// that happened on or before the drawing's date. Replicated as-is from the
// source app: a ticket that already won an earlier drawing this year is NOT
// excluded from later drawings — confirmed with the user as real, intended
// production behavior, not a bug to silently fix.
function eligibleTicketPool(tickets, drawingDate) {
  const cutoff = new Date(drawingDate);
  return tickets.filter((t) => t.status === "funds_received" && t.soldAt && new Date(t.soldAt) <= cutoff);
}

// Uses UTC getters, not local-time ones — a date-only value (a drawing date,
// a raffle start/end date) arrives as UTC midnight, and reading it back with
// local getters on a server west of UTC rolls it back a calendar day/year.
function fmtUsDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

// NYS Games of Chance raffle license thresholds (General Municipal Law /
// GC-2 & GC-7R) — fixed by statute, not an org policy choice. Per the
// Raffle Guidelines (Rev. 8/24):
//   Category 1A: cumulative net raffle proceeds >= $30,000 for the calendar
//     year — full license (GC-2) + GC-7R financial statement + 2% fee on
//     the amount over $30,000.
//   Category 1B: not 1A, but *any single raffle* nets $5,000–$29,999 —
//     GCVS-1 verified statement.
//   Category 2: every single raffle nets < $5,000 AND the cumulative
//     year-to-date is < $30,000 — minimal, self-certifying.
// The 1B/2 split turns on the largest *single* raffle, not the cumulative
// figure (Guidelines: "less than $5,000 in net raffle proceeds from any
// single raffle and less than $30,000 ... from all raffles"); the 1A line
// is the cumulative figure. Verified against the Guidelines' worked
// examples A/B/C ($100 / $40 / $0).
const CATEGORY_2_MAX = 5000; // a single raffle at/over this is at least Category 1B
const CATEGORY_1A_MIN = 30000; // cumulative at/over this: Category 1A — GC-7R + 2% fee
const ADDITIONAL_FEE_RATE = 0.02;

// `games` is one entry per RaffleGame in the target year, each already
// summed by the caller: { revenue, totalPrizeValue, actualExpenses, estimatedExpenses }.
// `revenue` should be computeRaffleStats().revenue (actual cash collected,
// not an aspirational ticket-count × price figure). Blends actual-if-present
// -else-estimate per game for the projection, so a game with real expense
// rows already entered doesn't get muddied by its own leftover estimate.
function computeRaffleFinancials(games) {
  let totalReceipts = 0;
  let totalPrizeValue = 0;
  let totalActualExpenses = 0;
  let totalEstimatedExpenses = 0;
  let netProceedsActual = 0;
  let netProceedsProjected = 0;

  const perGameNetActual = [];
  const perGameNetProjected = [];

  for (const g of games) {
    const revenue = g.revenue || 0;
    const prizeValue = g.totalPrizeValue || 0;
    const actualExpenses = g.actualExpenses || 0;
    const estimatedExpenses = g.estimatedExpenses || 0;
    const hasActuals = actualExpenses > 0;

    totalReceipts += revenue;
    totalPrizeValue += prizeValue;
    totalActualExpenses += actualExpenses;
    totalEstimatedExpenses += estimatedExpenses;

    const netActual = revenue - prizeValue - actualExpenses;
    const netProjected = revenue - prizeValue - (hasActuals ? actualExpenses : estimatedExpenses);
    perGameNetActual.push(netActual);
    perGameNetProjected.push(netProjected);
    netProceedsActual += netActual;
    netProceedsProjected += netProjected;
  }

  // 1A is the cumulative line; the 1B/2 split is the largest single raffle.
  function classify(cumulativeNet, perGameNet) {
    if (cumulativeNet >= CATEGORY_1A_MIN) return "category_1a";
    if (perGameNet.some((n) => n >= CATEGORY_2_MAX)) return "category_1b";
    return "category_2";
  }

  const category = classify(netProceedsActual, perGameNetActual);
  const additionalFee = category === "category_1a" ? (netProceedsActual - CATEGORY_1A_MIN) * ADDITIONAL_FEE_RATE : 0;

  return {
    totalReceipts, totalPrizeValue, totalActualExpenses, totalEstimatedExpenses,
    netProceedsActual, netProceedsProjected,
    category, categoryProjected: classify(netProceedsProjected, perGameNetProjected),
    additionalFee,
    gameCount: games.length,
  };
}

module.exports = {
  maskRaffleTicket, computeRaffleStats, eligibleTicketPool, fmtUsDate,
  computeRaffleFinancials, CATEGORY_2_MAX, CATEGORY_1A_MIN, ADDITIONAL_FEE_RATE,
};
