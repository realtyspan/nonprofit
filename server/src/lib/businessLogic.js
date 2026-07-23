// Core Bell Jar / GC-7Q compliance formulas, ported as-is from source-spec.pdf.
// Do not "simplify" the arithmetic here — the variable names (G,H,I,K,L,M,N,O,P,
// A2-A7,B8,B9,C15,D16,D17) map directly to the official NYS forms.

function dailyWorksheet(ticketsSold, cashPaid, ticketPrice) {
  const cashCollected = ticketsSold * ticketPrice;
  const profitLoss = cashCollected - cashPaid;
  return { cashCollected, profitLoss };
}

function prizePercent(prizesAwarded, idealPayout) {
  if (idealPayout <= 0) return 0;
  return prizesAwarded / idealPayout;
}

// threshold is a per-deal fraction (0.75-1.0) — 75% is the NYS minimum before a
// deal may be closed; orgs may set a stricter (higher) threshold per deal.
function isEligibleToClose(prizesAwarded, idealPayout, threshold = 0.75) {
  return prizePercent(prizesAwarded, idealPayout) >= threshold;
}

// Schedule 1 close-out for a single deal.
// deal: { ticketCount (G), ticketPrice (H) }
// input: { unsoldCount (N), cashPrizes (K), otherPrizes (L) }
function closeDeal(deal, input) {
  const G = deal.ticketCount;
  const H = deal.ticketPrice;
  const N = input.unsoldCount;
  const K = input.cashPrizes;
  const L = input.otherPrizes;

  const I = G * H;
  const O = N * H;
  const M = K + L;
  const P = I - M - O;

  const closedDate = new Date();
  const retentionUntil = new Date(closedDate);
  retentionUntil.setMonth(retentionUntil.getMonth() + 12);

  return { I, O, M, P, closedDate, retentionUntil };
}

// Aggregates a quarter's closed deals + ledger into the full GC-7Q A-D line chain,
// per the official form (revised-form-gc-7q-8-24-fillable.pdf):
// C10 (this quarter's opening balance) = prior quarter's D17 — confirmed against the
// real form, which explicitly carries the balance forward quarter to quarter.
// C11 (interest earned) and C13 (adjustments) aren't derivable from any ledger/deal
// data — they're entered manually per quarter (adjustments require prior NYS Gaming
// Commission approval per the form's own instructions).
// closedDeals: Schedule1Record rows (idealValue, cashPrizes, unsoldValue) closed in-quarter
// disbursements: Disbursement rows for the org/quarter
// carry: { priorD17, interestEarned, adjustments }
function computeGC7Q(closedDeals, disbursements, carry = {}) {
  const priorD17 = carry.priorD17 || 0;
  const interestEarned = carry.interestEarned || 0;
  const adjustments = carry.adjustments || 0;

  const A1 = closedDeals.length;
  const A2 = sum(closedDeals.map((d) => d.idealValue));
  const A3 = sum(closedDeals.map((d) => d.cashPrizes));
  const A4 = sum(closedDeals.map((d) => d.unsoldValue));
  const A5 = sum(
    disbursements.filter((d) => d.category === "ticket_purchase").map((d) => d.amount)
  );
  const A6 = A3 + A4 + A5;
  const A7 = A2 - A6;

  const B8 = A7 * 0.05;
  const B9 = A7 - B8;

  const C10 = priorD17;
  const C11 = interestEarned;
  const C12 = C10 + C11;
  const C13 = adjustments;
  const C14 = C13 + C12;
  const C15 = B9 + C14;

  const D16 = sum(
    disbursements.filter((d) => d.category === "indirect").map((d) => d.amount)
  );
  const D17 = C15 - D16;

  return {
    A1, A2, A3, A4, A5, A6, A7,
    B8, B9,
    C10, C11, C12, C13, C14, C15,
    D16, D17,
    zeroFiling: A1 === 0,
  };
}

function sum(nums) {
  return nums.reduce((a, b) => a + b, 0);
}

function quarterOf(date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

module.exports = {
  dailyWorksheet,
  prizePercent,
  isEligibleToClose,
  closeDeal,
  computeGC7Q,
  quarterOf,
};
