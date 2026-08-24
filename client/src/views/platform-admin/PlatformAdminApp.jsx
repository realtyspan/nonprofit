import React, { useEffect, useState } from "react";
import { colors, card, button } from "../../lib/tokens";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import logo from "../../assets/logo.png";
import OrganizationsList from "./OrganizationsList";

// Top-level app, not a module inside any org's Shell — this is cross-tenant
// and single-person, structurally unlike everything else in the client,
// which is always scoped to the logged-in user's one org. Wired into
// App.jsx as an alternative to <Shell/> for the /platform-admin path.
export default function PlatformAdminApp() {
  const { session, logout } = useAuth();
  const [permissions, setPermissions] = useState(undefined); // undefined = loading

  useEffect(() => {
    if (!session) {
      window.location.href = "/";
      return;
    }
    api.getMyPermissions().then(setPermissions).catch(() => setPermissions(null));
  }, [session]);

  if (!session || permissions === undefined) return null;

  if (!permissions?.isPlatformAdmin) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg }}>
        <div style={{ ...card, width: 380, padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Not available</div>
          <div style={{ fontSize: 13, color: colors.textSecondary }}>This page isn't available for your account.</div>
          <a href="/" style={{ ...button.primary, textAlign: "center", textDecoration: "none" }}>Back to Charity Pulse</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: colors.bg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src={logo} alt="Charity Pulse" style={{ width: 26, height: 26, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 13.5, color: colors.textPrimary }}>Platform Admin</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ fontSize: 12, color: colors.textSecondary, textDecoration: "none" }}>Back to my lodge</a>
          <button onClick={logout} style={{ background: "transparent", border: "none", color: colors.textSecondary, fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>
      </div>
      <div style={{ padding: "28px 32px 60px", maxWidth: 1100, margin: "0 auto" }}>
        <OrganizationsList />
      </div>
    </div>
  );
}
