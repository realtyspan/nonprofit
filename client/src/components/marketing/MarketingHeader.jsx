import React, { useEffect, useRef, useState } from "react";
import { colors, button } from "../../lib/tokens";
import logo from "../../assets/logo.png";

const MODULE_NAV = [
  { slug: "bell-jar", label: "Bell Jar" },
  { slug: "rentals", label: "Rental Space" },
  { slug: "raffle", label: "Raffle" },
  { slug: "calendar", label: "Calendar" },
];

// Shared header for every marketing page (the hub and each module page) —
// includes a "Modules" nav so a visitor reading about one module can jump
// straight to another without backing out to the hub first.
export default function MarketingHeader({ onGetStarted, onLogin }) {
  const [modulesOpen, setModulesOpen] = useState(false);
  const wrapRef = useRef(null);

  // Click-to-toggle, click-outside-to-close — not hover, since a hover-only
  // dropdown doesn't work on mobile/touch at all and every other control on
  // this page is already click-driven.
  useEffect(() => {
    if (!modulesOpen) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setModulesOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [modulesOpen]);

  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff", position: "sticky", top: 0, zIndex: 10 }}>
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
        <img src={logo} alt="Bell Jar Manager" style={{ width: 32, height: 32, objectFit: "contain" }} />
        <span style={{ fontWeight: 700, fontSize: 15 }}>Bell Jar Manager</span>
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div ref={wrapRef} style={{ position: "relative" }}>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: colors.textSecondary, padding: "8px 2px" }}
            onClick={() => setModulesOpen((o) => !o)}
          >
            Modules ▾
          </button>
          {modulesOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.1)", padding: 6, minWidth: 160 }}>
              {MODULE_NAV.map((m) => (
                <a
                  key={m.slug}
                  href={`/${m.slug}`}
                  style={{ display: "block", padding: "8px 12px", fontSize: 13.5, color: colors.textPrimary, textDecoration: "none", borderRadius: 7 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {m.label}
                </a>
              ))}
            </div>
          )}
        </div>
        <button style={button.ghost} onClick={onLogin}>Log in</button>
        <button style={button.primary} onClick={onGetStarted}>Start free trial</button>
      </div>
    </header>
  );
}
