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

module.exports = { maskRaffleTicket, computeRaffleStats, eligibleTicketPool, fmtUsDate };
