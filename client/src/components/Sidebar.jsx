import React from "react";
import { colors } from "../lib/tokens";
import { icons } from "../lib/icons";
import { useAuth } from "../lib/AuthContext";
import logo from "../assets/logo.png";

const NAV_ITEMS = [
  { key: "dashboard", label: "Overview", icon: icons.grid },
  { key: "worksheet", label: "Sales Worksheet", icon: icons.table },
  { key: "deals", label: "Deals & Schedule 1", icon: icons.layers },
  { key: "ledger", label: "Bank Ledger & Receipts", icon: icons.bank },
  { key: "reports", label: "GC-7Q Reports", icon: icons.fileCheck },
  { key: "team", label: "Team", icon: icons.users },
  { key: "profile", label: "My Profile", icon: icons.userCircle },
];

export default function Sidebar({ view, setView, eligibleCount }) {
  const { session, logout } = useAuth();
  const user = session?.user;

  return (
    <div style={{ width: 248, flex: "none", background: "#ffffff", borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", padding: "20px 14px", gap: 22, position: "sticky", top: 0, height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 8px" }}>
        <img src={logo} alt="Bell Jar Manager" style={{ width: 32, height: 32, flex: "none", objectFit: "contain" }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: colors.textPrimary }}>Bell Jar Manager</div>
          <div style={{ fontSize: 11, color: colors.textSecondary }}>{user?.orgName || "Your Lodge"}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 8px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", color: "#a3a3ac", textTransform: "uppercase", padding: "0 2px" }}>Signed in as</div>
        <button
          onClick={() => setView("profile")}
          title="Open My Profile"
          style={{ padding: "8px 10px", borderRadius: 8, background: "#f4f4f6", fontSize: 12.5, fontWeight: 600, color: colors.textPrimary, border: "none", cursor: "pointer", textAlign: "left" }}
        >
          {user?.name} <span style={{ color: colors.textSecondary, fontWeight: 500 }}>· {user?.role}</span>
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 4px", flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = view === item.key;
          const badge = item.key === "deals" && eligibleCount > 0 ? eligibleCount : null;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8,
                border: "none", background: active ? "#f4f4f6" : "transparent", cursor: "pointer",
                textAlign: "left", fontSize: 13.5, fontWeight: 500, color: active ? colors.textPrimary : "#52525b",
              }}
            >
              <span dangerouslySetInnerHTML={{ __html: item.icon }} style={{ width: 18, height: 18, flex: "none", color: active ? colors.accent : "#8b8b95", display: "flex" }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {badge && (
                <span style={{ background: colors.warningAmber, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <button onClick={logout} style={{ background: "transparent", border: "none", color: colors.textSecondary, fontSize: 12, cursor: "pointer", textAlign: "left", padding: "0 8px" }}>
        Log out
      </button>

      <div style={{ padding: "10px 12px", borderRadius: 10, background: "#faf9f6", border: "1px solid #f0ede3", fontSize: 11, color: "#8a8168", lineHeight: 1.5 }}>
        NYS Gaming Commission compliant · Bell Jar / Games of Chance
      </div>
    </div>
  );
}
