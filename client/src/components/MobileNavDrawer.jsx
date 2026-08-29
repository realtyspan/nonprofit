import React from "react";
import { colors } from "../lib/tokens";
import { icons } from "../lib/icons";
import { useAuth } from "../lib/AuthContext";
import { filterNavItemsForUser } from "../lib/modules";

// The mobile equivalent of TopBar's module-switcher pills + Sidebar's
// per-module nav, combined into one full-screen menu — there's no room for
// either on a phone-width header. Also houses Team/Profile/Log out, which on
// desktop live as small buttons in TopBar's corner.
export default function MobileNavDrawer({
  open, onClose, modules, activeModuleKey, onSwitchModule, moduleBadges,
  activeModule, view, setView, navBadges, permissions, canSeeTeam, onOpenTeam, onOpenProfile,
}) {
  const { session, logout } = useAuth();
  const user = session?.user;

  if (!open) return null;

  function go(fn) {
    fn();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 60, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${colors.border}` }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.orgName || "Your Lodge"}</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary }}>{user?.name}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          style={{ background: "transparent", border: "none", padding: 8, cursor: "pointer", color: colors.textSecondary }}
        >
          <span dangerouslySetInnerHTML={{ __html: icons.close }} style={{ width: 22, height: 22, display: "flex" }} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 24px" }}>
        <NavSection label="Modules">
          {modules.map((m) => (
            <NavRow
              key={m.key}
              icon={m.icon}
              label={m.label}
              badge={moduleBadges?.[m.key]}
              active={m.key === activeModuleKey}
              onClick={() => go(() => onSwitchModule(m.key))}
            />
          ))}
        </NavSection>

        {activeModule && (
          <NavSection label={activeModule.label}>
            {filterNavItemsForUser(activeModule.navItems, permissions, activeModule.key).map((item) => (
              <NavRow
                key={item.key}
                icon={item.icon}
                label={item.label}
                badge={navBadges?.[item.key]}
                active={view === item.key}
                onClick={() => go(() => setView(item.key))}
              />
            ))}
          </NavSection>
        )}

        <NavSection label="Account">
          {canSeeTeam && <NavRow icon={icons.users} label="Team" onClick={() => go(onOpenTeam)} />}
          <NavRow icon={icons.userCircle} label="My Profile" onClick={() => go(onOpenProfile)} />
          <NavRow icon={icons.close} label="Log out" onClick={() => go(logout)} />
        </NavSection>
      </div>
    </div>
  );
}

function NavSection({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", color: "#a3a3ac", textTransform: "uppercase", padding: "8px 10px 4px" }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </div>
  );
}

function NavRow({ icon, label, badge, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderRadius: 10,
        border: "none", background: active ? "#f4f4f6" : "transparent", cursor: "pointer",
        textAlign: "left", fontSize: 15, fontWeight: 500, color: active ? colors.textPrimary : "#3f3f46", width: "100%",
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: icon }} style={{ width: 20, height: 20, flex: "none", color: active ? colors.accent : "#756f63", display: "flex" }} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{ background: colors.warningAmber, color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99 }}>{badge}</span>
      )}
    </button>
  );
}
