import React from "react";
import { colors, button } from "../../lib/tokens";

export default function Hero({ badge, headline, subhead, onGetStarted, onLogin, ctaLabel = "Start your free 30-day trial", note = "No credit card required" }) {
  return (
    <section style={{ maxWidth: 880, margin: "0 auto", padding: "80px 32px 60px", textAlign: "center" }}>
      {badge && (
        <div style={{ display: "inline-block", background: colors.indigoBg, color: colors.indigo, fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 99, marginBottom: 20 }}>
          {badge}
        </div>
      )}
      <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15, margin: "0 0 18px" }}>{headline}</h1>
      <p style={{ fontSize: 17, color: colors.textSecondary, lineHeight: 1.6, maxWidth: 640, margin: "0 auto 32px" }}>{subhead}</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button style={{ ...button.primary, fontSize: 15, padding: "12px 24px" }} onClick={onGetStarted}>{ctaLabel}</button>
        <button style={{ ...button.ghost, fontSize: 15, padding: "12px 24px" }} onClick={onLogin}>Log in</button>
      </div>
      {note && <div style={{ fontSize: 12.5, color: colors.textTertiary, marginTop: 12 }}>{note}</div>}
    </section>
  );
}
