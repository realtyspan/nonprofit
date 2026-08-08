import React, { useEffect, useState } from "react";
import { colors } from "../lib/tokens";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { filterNavItemsForUser } from "../lib/modules";

function effectiveLabel(permissions, labels, moduleKey) {
  if (!permissions) return "";
  if (permissions.orgTier === "Owner") return labels?.ownerLabel || "Owner";
  if (permissions.orgTier === "Viewer") return labels?.viewerLabel || "Viewer";
  const tier = permissions.moduleGrants?.[moduleKey];
  if (tier === "Admin") return labels?.adminLabel || "Admin";
  if (tier === "Helper") return labels?.helperLabel || "Helper";
  if (tier === "Viewer") return "Viewer";
  return "";
}

export default function Sidebar({ module, view, setView, badges, permissions }) {
  const { session } = useAuth();
  const user = session?.user;
  const [labels, setLabels] = useState(null);

  useEffect(() => {
    api.getTierLabels().then(setLabels).catch(() => {});
  }, []);

  return (
    <div style={{ width: 232, flex: "none", background: "#ffffff", borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", padding: "18px 14px", gap: 18, position: "sticky", top: 0, height: "calc(100vh - 53px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 6px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", color: "#a3a3ac", textTransform: "uppercase" }}>{module.label}</div>
        <div style={{ fontSize: 11, color: colors.textSecondary }}>
          {user?.name} <span style={{ color: colors.textTertiary }}>· {effectiveLabel(permissions, labels, module.key)}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 4px", flex: 1 }}>
        {filterNavItemsForUser(module.navItems, permissions, module.key).map((item) => {
          const active = view === item.key;
          const badge = badges?.[item.key];
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
              {badge > 0 && (
                <span style={{ background: colors.warningAmber, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "10px 12px", borderRadius: 10, background: "#faf9f6", border: "1px solid #f0ede3", fontSize: 11, color: "#8a8168", lineHeight: 1.5 }}>
        NYS Gaming Commission compliant · Bell Jar / Games of Chance
      </div>
    </div>
  );
}
