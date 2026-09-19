import React, { useEffect } from "react";
import { colors } from "../lib/tokens";
import { TERMS, PRIVACY, TERMS_UPDATED_LABEL } from "../lib/legalContent";
import logo from "../assets/logo.png";

// /terms and /privacy — plain reading pages, reachable while logged out and
// on both the marketing domain and the app domain (see App.jsx, which
// resolves them before anything else), since signup has to link to them.
export default function Legal({ doc }) {
  const content = doc === "privacy" ? PRIVACY : TERMS;
  const other = doc === "privacy" ? { href: "/terms", label: "Terms of Service" } : { href: "/privacy", label: "Privacy Policy" };

  useEffect(() => {
    const previous = document.title;
    document.title = `${content.title} — Charity Pulse`;
    return () => { document.title = previous; };
  }, [content.title]);

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.textPrimary }}>
      <header style={{ background: "#fff", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
            <img src={logo} alt="" style={{ width: 30, height: 30, objectFit: "contain" }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Charity Pulse</span>
          </a>
          <nav style={{ display: "flex", gap: 16, fontSize: 13 }}>
            <a href="/terms" style={{ color: doc === "privacy" ? colors.textSecondary : colors.accent, textDecoration: "none", fontWeight: 600 }}>Terms</a>
            <a href="/privacy" style={{ color: doc === "privacy" ? colors.accent : colors.textSecondary, textDecoration: "none", fontWeight: 600 }}>Privacy</a>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 72px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 6px" }}>{content.title}</h1>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>Last updated {TERMS_UPDATED_LABEL}</div>
        <p style={{ fontSize: 15, lineHeight: 1.7, margin: "0 0 28px" }}>{content.intro}</p>

        {content.sections.map((s) => (
          <section key={s.heading} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>{s.heading}</h2>
            {s.body.map((para, i) => (
              <p key={i} style={{ fontSize: 14.5, lineHeight: 1.7, margin: "0 0 10px", color: colors.textPrimary }}>{para}</p>
            ))}
          </section>
        ))}

        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 18, fontSize: 13, color: colors.textSecondary }}>
          Also see our <a href={other.href} style={{ color: colors.accent }}>{other.label}</a>.
        </div>
      </main>
    </div>
  );
}
