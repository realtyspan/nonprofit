import React from "react";
import { colors, button } from "../../lib/tokens";
import logo from "../../assets/logo.png";

const NAV_ITEMS = [
  { slug: "home", label: "Home", href: "/" },
  { slug: "bell-jar", label: "Bell Jar", href: "/bell-jar" },
  { slug: "rentals", label: "Rental Space", href: "/rentals" },
  { slug: "raffle", label: "Raffle", href: "/raffle" },
  { slug: "calendar", label: "Calendar", href: "/calendar" },
];

// Shared header for every marketing page (the hub and each module page) —
// an always-visible top nav, not a dropdown, so a visitor can see every
// module and get back to Home at a glance instead of having to go hunting
// for a menu tucked in a corner. `activeSlug` highlights the current page.
export default function MarketingHeader({ activeSlug, onGetStarted, onLogin }) {
  return (
    <header style={{ borderBottom: `1px solid ${colors.border}`, background: "#fff", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", flexWrap: "wrap", gap: 14 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <img src={logo} alt="Charity Pulse" style={{ width: 32, height: 32, objectFit: "contain" }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Charity Pulse</span>
        </a>

        <nav style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.slug === (activeSlug || "home");
            return (
              <a
                key={item.slug}
                href={item.href}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: "none",
                  color: isActive ? colors.accent : colors.textSecondary,
                  background: isActive ? colors.indigoBg : "transparent",
                }}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={button.ghost} onClick={onLogin}>Log in</button>
          <button style={button.primary} onClick={onGetStarted}>Start free trial</button>
        </div>
      </div>
    </header>
  );
}
