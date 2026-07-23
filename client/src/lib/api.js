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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
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

  listDeals: () => request("/deals"),
  createDeal: (payload) => request("/deals", { method: "POST", body: payload }),
  updateDeal: (dealId, payload) => request(`/deals/${dealId}`, { method: "PATCH", body: payload }),
  activateDeal: (dealId) => request(`/deals/${dealId}/activate`, { method: "POST" }),
  saveDailySale: (dealId, payload) => request(`/deals/${dealId}/daily-sales`, { method: "POST", body: payload }),
  listDailySales: (dealId) => request(`/deals/${dealId}/daily-sales`),

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
