import React from "react";
import { colors } from "../lib/tokens";
import { useAuth } from "../lib/AuthContext";
import logo from "../assets/logo.png";

export default function TopBar({ modules, activeModuleKey, onSwitchModule, moduleBadges, onOpenProfile, onOpenTeam }) {
  const { session, logout } = useAuth();
  const user = session?.user;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src={logo} alt="Bell Jar Manager" style={{ width: 26, height: 26, objectFit: "contain" }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: colors.textPrimary }}>{user?.orgName || "Your Lodge"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: colors.bg, borderRadius: 10, padding: 3 }}>
          {modules.map((m) => {
            const active = m.key === activeModuleKey;
            const badge = moduleBadges?.[m.key];
            return (
              <button
                key={m.key}
                onClick={() => onSwitchModule(m.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 8,
                  border: "none", background: active ? "#fff" : "transparent",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: active ? colors.textPrimary : colors.textSecondary,
                }}
              >
                <span dangerouslySetInnerHTML={{ __html: m.icon }} style={{ width: 15, height: 15, display: "flex", color: active ? colors.accent : colors.textTertiary }} />
                {m.label}
                {badge > 0 && (
                  <span style={{ background: colors.warningAmber, color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "1px 5px", borderRadius: 99 }}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onOpenTeam}
          style={{ background: "transparent", border: "none", color: colors.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          Team
        </button>
        <button
          onClick={onOpenProfile}
          title="My Profile"
          style={{ width: 30, height: 30, borderRadius: 99, background: "#efeaff", color: colors.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          {initials(user?.name)}
        </button>
        <button onClick={logout} style={{ background: "transparent", border: "none", color: colors.textSecondary, fontSize: 12, cursor: "pointer" }}>
          Log out
        </button>
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
