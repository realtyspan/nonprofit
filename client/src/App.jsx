import React, { useEffect, useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { api } from "./lib/api";
import { colors } from "./lib/tokens";
import Sidebar from "./components/Sidebar";
import Login from "./views/Login";
import Dashboard from "./views/Dashboard";
import Worksheet from "./views/Worksheet";
import Deals from "./views/Deals";
import Ledger from "./views/Ledger";
import Reports from "./views/Reports";
import Team from "./views/Team";
import Profile from "./views/Profile";

const TITLES = {
  dashboard: ["Overview", "At-a-glance compliance status"],
  worksheet: ["Daily Sales Worksheet", "Log today's tickets sold and cash paid in prizes"],
  deals: ["Deals & Schedule 1", "Open deals, prize threshold, and close-deal history"],
  ledger: ["Bank Ledger & Receipts", "Special Bell Jar Checking Account register"],
  reports: ["GC-7Q Reports", "Quarterly aggregator, PDF overlay, and sign-off"],
  team: ["Team", "Everyone with access to this organization"],
  profile: ["My Profile", "Update your details or change your password"],
};

function Shell() {
  const { session } = useAuth();
  const [view, setView] = useState("dashboard");
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshDeals = useCallback(() => {
    api.listDeals().then(setDeals).catch(() => {});
  }, []);

  useEffect(() => {
    if (!session) return;
    refreshDeals();
    setLoading(false);
  }, [session, refreshDeals]);

  if (!session) return <Login />;

  const eligibleCount = deals.filter((d) => d.status === "active" && d.eligibleToClose).length;
  const [title, subtitle] = TITLES[view];

  return (
    <div style={{ display: "flex", width: "100%", minHeight: "100vh", background: colors.bg, color: colors.textPrimary }}>
      <Sidebar view={view} setView={setView} eligibleCount={eligibleCount} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.textPrimary }}>{title}</div>
            <div style={{ fontSize: 12.5, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setView("profile")}
              title="My Profile"
              style={{ width: 32, height: 32, borderRadius: 99, background: "#efeaff", color: colors.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              {initials(session.user.name)}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px 32px 60px", overflow: "auto" }}>
          {!loading && (
            <>
              {view === "dashboard" && <Dashboard deals={deals} />}
              {view === "worksheet" && <Worksheet deals={deals} onSaved={refreshDeals} />}
              {view === "deals" && <Deals deals={deals} onChanged={refreshDeals} />}
              {view === "ledger" && <Ledger />}
              {view === "reports" && <Reports />}
              {view === "team" && <Team />}
              {view === "profile" && <Profile />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name) {
  return (name || "")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
