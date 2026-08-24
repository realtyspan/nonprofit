const BASE = "/api";

function getToken() {
  return localStorage.getItem("bj_token");
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  // A 401 means the token itself is missing/invalid/expired — nothing short of
  // logging back in fixes that, so force back to the login screen right away
  // instead of leaving the app in a half-authenticated state.
  if (res.status === 401) {
    clearSession();
    window.location.reload();
    throw new Error("Session expired — please log in again");
  }
  if (res.status === 403) {
    const err = new Error(data.error || "You don't have access to do that");
    err.isForbidden = true;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Triggers a browser save-as for text content already in hand (e.g. a CSV
// returned inside a JSON response), same blob-URL-click mechanics as download().
function downloadTextFile(content, filename, mimeType = "text/csv") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Downloads a binary (PDF) response and triggers a browser save-as, instead of parsing JSON.
async function download(path, filename) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  signupOrg: (payload) => request("/auth/signup-org", { method: "POST", body: payload }),
  listUsers: () => request("/auth/users"),
  inviteUser: (payload) => request("/auth/invite", { method: "POST", body: payload }),
  getMe: () => request("/auth/me"),
  updateMe: (payload) => request("/auth/me", { method: "PATCH", body: payload }),
  changePassword: (payload) => request("/auth/change-password", { method: "POST", body: payload }),
  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, newPassword) => request("/auth/reset-password", { method: "POST", body: { token, newPassword } }),

  getMyPermissions: () => request("/permissions/me"),
  setOrgTier: (userId, tier) => request(`/permissions/org-tier/${userId}`, { method: "PATCH", body: { tier } }),
  setModuleGrant: (userId, module, tier) => request(`/permissions/module-grant/${userId}/${module}`, { method: "PUT", body: { tier } }),
  removeModuleGrant: (userId, module) => request(`/permissions/module-grant/${userId}/${module}`, { method: "DELETE" }),
  getTierLabels: () => request("/permissions/labels"),
  updateTierLabels: (payload) => request("/permissions/labels", { method: "PATCH", body: payload }),
  getGC7QSigners: () => request("/permissions/gc7q-signers"),
  assignGC7QSigner: (slot, userId) => request(`/permissions/gc7q-signers/${slot}`, { method: "PUT", body: { userId } }),
  getRaffleSigners: () => request("/permissions/raffle-signers"),
  assignRaffleSigner: (slot, userId) => request(`/permissions/raffle-signers/${slot}`, { method: "PUT", body: { userId } }),

  listDeals: () => request("/deals"),
  scanGameLabel: (image) => request("/deals/scan-label", { method: "POST", body: { image } }),
  createDeal: (payload) => request("/deals", { method: "POST", body: payload }),
  updateDeal: (dealId, payload) => request(`/deals/${dealId}`, { method: "PATCH", body: payload }),
  deleteDeal: (dealId) => request(`/deals/${dealId}`, { method: "DELETE" }),
  activateDeal: (dealId) => request(`/deals/${dealId}/activate`, { method: "POST" }),
  saveDailySale: (dealId, payload) => request(`/deals/${dealId}/daily-sales`, { method: "POST", body: payload }),
  listDailySales: (dealId, { from, to } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request(`/deals/${dealId}/daily-sales${qs ? `?${qs}` : ""}`);
  },

  listSchedule1: () => request("/schedule1"),
  closeDeal: (dealId, unsoldCount) => request(`/schedule1/${dealId}/close`, { method: "POST", body: { unsoldCount } }),
  downloadSchedule1Pdf: (year, quarter) => download(`/schedule1/${year}/${quarter}/pdf`, `Schedule1_Q${quarter}_${year}.pdf`),

  listDisbursements: () => request("/disbursements"),
  createDisbursement: (payload) => request("/disbursements", { method: "POST", body: payload }),

  getGC7Q: (year, quarter) => request(`/gc7q/${year}/${quarter}`),
  signGC7Q: (year, quarter, role) => request(`/gc7q/${year}/${quarter}/sign`, { method: "POST", body: { role } }),
  updateGC7QInputs: (year, quarter, payload) => request(`/gc7q/${year}/${quarter}/inputs`, { method: "PATCH", body: payload }),
  unlockGC7Q: (year, quarter) => request(`/gc7q/${year}/${quarter}/unlock`, { method: "POST" }),
  downloadGC7QPdf: (year, quarter) => download(`/gc7q/${year}/${quarter}/pdf`, `GC7Q_Q${quarter}_${year}.pdf`),

  getOrg: () => request("/org"),
  updateOrg: (payload) => request("/org", { method: "PATCH", body: payload }),

  listRentalSpaces: () => request("/rentals/spaces"),
  createRentalSpace: (payload) => request("/rentals/spaces", { method: "POST", body: payload }),
  updateRentalSpace: (id, payload) => request(`/rentals/spaces/${id}`, { method: "PATCH", body: payload }),

  listRentalBookings: (status) => request(`/rentals/bookings${status ? `?status=${status}` : ""}`),
  createRentalBooking: (payload) => request("/rentals/bookings", { method: "POST", body: payload }),
  updateRentalBooking: (id, payload) => request(`/rentals/bookings/${id}`, { method: "PATCH", body: payload }),
  confirmRentalBooking: (id, payload) => request(`/rentals/bookings/${id}/confirm`, { method: "POST", body: payload }),
  declineRentalBooking: (id, declineReason) => request(`/rentals/bookings/${id}/decline`, { method: "POST", body: { declineReason } }),
  cancelRentalBooking: (id) => request(`/rentals/bookings/${id}/cancel`, { method: "POST" }),
  completeRentalBooking: (id) => request(`/rentals/bookings/${id}/complete`, { method: "POST" }),
  restoreRentalBooking: (id) => request(`/rentals/bookings/${id}/restore`, { method: "POST" }),
  markRentalBookingFundsDeposited: (id) => request(`/rentals/bookings/${id}/mark-funds-deposited`, { method: "POST" }),
  unlockRentalBooking: (id) => request(`/rentals/bookings/${id}/unlock`, { method: "POST" }),
  listRentalBookingLogs: (id) => request(`/rentals/bookings/${id}/logs`),
  deleteRentalBooking: (id) => request(`/rentals/bookings/${id}`, { method: "DELETE" }),
  signRentalBooking: (id, signedName, signatureImage) => request(`/rentals/bookings/${id}/sign`, { method: "POST", body: { signedName, signatureImage } }),
  uploadRentalContract: (id, payload) => request(`/rentals/bookings/${id}/contract-upload`, { method: "POST", body: payload }),
  listRentalPayments: (bookingId) => request(`/rentals/bookings/${bookingId}/payments`),
  addRentalPayment: (bookingId, payload) => request(`/rentals/bookings/${bookingId}/payments`, { method: "POST", body: payload }),
  deleteRentalPayment: (bookingId, paymentId) => request(`/rentals/bookings/${bookingId}/payments/${paymentId}`, { method: "DELETE" }),
  downloadRentalContractPdf: (id, renterName) => download(`/rentals/bookings/${id}/contract.pdf`, `Rental_${(renterName || "agreement").replace(/\s+/g, "_")}.pdf`),

  listRentalBlocks: () => request("/rentals/blocks"),
  createRentalBlock: (payload) => request("/rentals/blocks", { method: "POST", body: payload }),
  updateRentalBlock: (id, payload) => request(`/rentals/blocks/${id}`, { method: "PATCH", body: payload }),
  deleteRentalBlock: (id) => request(`/rentals/blocks/${id}`, { method: "DELETE" }),
  getRentalBlockRecurrence: (id) => request(`/rentals/block-recurrences/${id}`),
  updateRentalBlockRecurrence: (id, payload) => request(`/rentals/block-recurrences/${id}`, { method: "PATCH", body: payload }),
  deleteRentalBlockRecurrence: (id) => request(`/rentals/block-recurrences/${id}`, { method: "DELETE" }),

  listCalendarEvents: (start, end) => request(`/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`),
  createCalendarEvent: (payload) => request("/calendar/events", { method: "POST", body: payload }),
  updateCalendarEvent: (id, payload) => request(`/calendar/events/${id}`, { method: "PATCH", body: payload }),
  deleteCalendarEvent: (id) => request(`/calendar/events/${id}`, { method: "DELETE" }),
  getCalendarRecurrence: (id) => request(`/calendar/recurrences/${id}`),
  updateCalendarRecurrence: (id, payload) => request(`/calendar/recurrences/${id}`, { method: "PATCH", body: payload }),
  deleteCalendarRecurrence: (id) => request(`/calendar/recurrences/${id}`, { method: "DELETE" }),

  listRaffleGames: () => request("/raffle/games"),
  createRaffleGame: (payload) => request("/raffle/games", { method: "POST", body: payload }),
  getRaffleGame: (gameId) => request(`/raffle/games/${gameId}`),
  updateRaffleGame: (gameId, payload) => request(`/raffle/games/${gameId}`, { method: "PATCH", body: payload }),
  deleteRaffleGame: (gameId) => request(`/raffle/games/${gameId}`, { method: "DELETE" }),
  closeRaffleGame: (gameId) => request(`/raffle/games/${gameId}/close`, { method: "POST" }),
  reopenRaffleGame: (gameId) => request(`/raffle/games/${gameId}/reopen`, { method: "POST" }),

  getRaffleKickoffEmail: (gameId) => request(`/raffle/games/${gameId}/kickoff-email`),
  getRaffleKickoffRecipients: (gameId) => request(`/raffle/games/${gameId}/kickoff-email/recipients`),
  sendRaffleKickoffEmail: (gameId) => request(`/raffle/games/${gameId}/kickoff-email/send`, { method: "POST" }),
  sendRaffleKickoffTestEmail: (gameId, email) => request(`/raffle/games/${gameId}/kickoff-email/send-test`, { method: "POST", body: { email } }),

  getRaffleUnsubscribeInfo: (token) => request(`/public/raffle/unsubscribe-info?token=${encodeURIComponent(token)}`),
  confirmRaffleUnsubscribe: (token) => request("/public/raffle/unsubscribe", { method: "POST", body: { token } }),

  listHistoricalRaffleImports: () => request("/raffle/historical-imports"),
  importHistoricalRaffleData: (payload) => request("/raffle/historical-imports", { method: "POST", body: payload }),
  updateHistoricalRaffleImport: (gameId, payload) => request(`/raffle/historical-imports/${gameId}`, { method: "PATCH", body: payload }),
  deleteHistoricalRaffleImport: (gameId) => request(`/raffle/historical-imports/${gameId}`, { method: "DELETE" }),

  listRaffleTickets: (gameId) => request(`/raffle/games/${gameId}/tickets`),
  getRaffleTicketHistory: (gameId, number) => request(`/raffle/games/${gameId}/tickets/${number}/history`),
  recordRaffleTicket: (gameId, number, payload) => request(`/raffle/games/${gameId}/tickets/${number}/record`, { method: "POST", body: payload }),
  releaseRaffleTicket: (gameId, number) => request(`/raffle/games/${gameId}/tickets/${number}/release`, { method: "POST" }),
  markRaffleTicketSold: (gameId, number, payload) => request(`/raffle/games/${gameId}/tickets/${number}/mark-sold`, { method: "POST", body: payload }),
  markRaffleTicketFundsReceived: (gameId, number, payload) => request(`/raffle/games/${gameId}/tickets/${number}/mark-funds-received`, { method: "POST", body: payload }),
  bulkMarkRaffleFundsReceived: (gameId, payload) => request(`/raffle/games/${gameId}/tickets/bulk-mark-funds-received`, { method: "POST", body: payload }),
  assignRaffleTickets: (gameId, ticketNumbers, sellerId) => request(`/raffle/games/${gameId}/tickets/assign`, { method: "POST", body: { ticketNumbers, sellerId } }),
  unassignRaffleTickets: (gameId, ticketNumbers) => request(`/raffle/games/${gameId}/tickets/unassign`, { method: "POST", body: { ticketNumbers } }),
  sendRaffleConfirmation: (gameId, number) => request(`/raffle/games/${gameId}/tickets/${number}/send-confirmation`, { method: "POST" }),
  sendRaffleETicket: (gameId, number) => request(`/raffle/games/${gameId}/tickets/${number}/send-eticket`, { method: "POST" }),

  listRaffleLog: (gameId) => request(`/raffle/games/${gameId}/log`),
  getRaffleStats: (gameId) => request(`/raffle/games/${gameId}/stats`),
  downloadRaffleSellerActivityPdf: (gameId, gameName) => download(`/raffle/games/${gameId}/reports/seller-activity.pdf`, `${(gameName || "Raffle").replace(/\s+/g, "_")}_Seller_Activity_Report.pdf`),
  downloadRaffleTicketsTurnedInPdf: (gameId, gameName) => download(`/raffle/games/${gameId}/reports/tickets-turned-in.pdf`, `${(gameName || "Raffle").replace(/\s+/g, "_")}_Tickets_Turned_In_Report.pdf`),

  listRaffleDrawings: (gameId) => request(`/raffle/games/${gameId}/drawings`),
  createRaffleDrawing: (gameId, payload) => request(`/raffle/games/${gameId}/drawings`, { method: "POST", body: payload }),
  updateRaffleDrawing: (gameId, id, payload) => request(`/raffle/games/${gameId}/drawings/${id}`, { method: "PATCH", body: payload }),
  deleteRaffleDrawing: (gameId, id) => request(`/raffle/games/${gameId}/drawings/${id}`, { method: "DELETE" }),
  getRaffleDrawingEligible: (gameId, id) => request(`/raffle/games/${gameId}/drawings/${id}/eligible`),
  drawRaffleDrawing: (gameId, id) => request(`/raffle/games/${gameId}/drawings/${id}/draw`, { method: "POST" }),
  drawRaffleDrawingManual: (gameId, id, ticketNumber) => request(`/raffle/games/${gameId}/drawings/${id}/draw-manual`, { method: "POST", body: { ticketNumber } }),
  clearRaffleDrawing: (gameId, id) => request(`/raffle/games/${gameId}/drawings/${id}/clear`, { method: "POST" }),

  listRaffleExpenses: (gameId) => request(`/raffle/games/${gameId}/expenses`),
  createRaffleExpense: (gameId, payload) => request(`/raffle/games/${gameId}/expenses`, { method: "POST", body: payload }),
  deleteRaffleExpense: (gameId, id) => request(`/raffle/games/${gameId}/expenses/${id}`, { method: "DELETE" }),
  updateRaffleEstimatedExpenses: (gameId, estimatedExpenses) => request(`/raffle/games/${gameId}/estimated-expenses`, { method: "PATCH", body: { estimatedExpenses } }),
  getRaffleFinancials: (year) => request(`/raffle/financials/${year}`),

  listRaffleRenewalCalls: (gameId) => request(`/raffle/games/${gameId}/renewal-calls`),
  logRaffleRenewalCall: (gameId, ticketNumber, note) => request(`/raffle/games/${gameId}/renewal-calls`, { method: "POST", body: { ticketNumber, note } }),

  searchRaffleCheckIn: (gameId) => request(`/raffle/games/${gameId}/checkin-search`),
  listRaffleCheckIns: (gameId) => request(`/raffle/games/${gameId}/checkins`),
  toggleRaffleCheckIn: (gameId, ticketNumber, hasGuest) => request(`/raffle/games/${gameId}/checkins/${ticketNumber}`, { method: "POST", body: { hasGuest } }),

  sendRaffleReminders: (gameId) => request(`/raffle/games/${gameId}/reminders/send`, { method: "POST" }),

  generateFrsReport: (file, fileName) => request("/elks-tools/frs-report", { method: "POST", body: { file, fileName } }),
  listFrsReportRuns: () => request("/elks-tools/frs-report/runs"),
  downloadFrsReportSource: (id, filename) => download(`/elks-tools/frs-report/runs/${id}/source-file`, filename),
  downloadFrsReportCsv: (id, filename) => download(`/elks-tools/frs-report/runs/${id}/csv`, filename),
  deleteFrsReportRun: (id) => request(`/elks-tools/frs-report/runs/${id}`, { method: "DELETE" }),

  getPlatformSummary: () => request("/platform-admin/summary"),
  listPlatformOrganizations: () => request("/platform-admin/organizations"),
  getPlatformOrganization: (id) => request(`/platform-admin/organizations/${id}`),
  updatePlatformOrgBilling: (id, payload) => request(`/platform-admin/organizations/${id}/billing`, { method: "PATCH", body: payload }),
  addPlatformSupportNote: (id, payload) => request(`/platform-admin/organizations/${id}/support-notes`, { method: "POST", body: payload }),
  resolvePlatformSupportNote: (id, noteId, status) => request(`/platform-admin/organizations/${id}/support-notes/${noteId}`, { method: "PATCH", body: { status } }),
};

export { downloadTextFile };

// Unauthenticated endpoints for the public rental inquiry page — no token, separate base path.
export const publicApi = {
  async getRentalPage(slug) {
    const res = await fetch(`/api/public/rentals/${slug}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Not found");
    return data;
  },
  async submitRentalInquiry(slug, payload) {
    const res = await fetch(`/api/public/rentals/${slug}/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  },
  async getCalendarPage(slug, start, end) {
    const res = await fetch(`/api/public/calendar/${slug}?start=${start.toISOString()}&end=${end.toISOString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Not found");
    return data;
  },
};

export function saveSession(token, user) {
  localStorage.setItem("bj_token", token);
  localStorage.setItem("bj_user", JSON.stringify(user));
}

export function loadSession() {
  const token = localStorage.getItem("bj_token");
  const userRaw = localStorage.getItem("bj_user");
  if (!token || !userRaw) return null;
  return { token, user: JSON.parse(userRaw) };
}

export function clearSession() {
  localStorage.removeItem("bj_token");
  localStorage.removeItem("bj_user");
}
