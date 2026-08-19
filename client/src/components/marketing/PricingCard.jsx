import React from "react";
import { colors, button, mono } from "../../lib/tokens";

// `pricing` is either { free: true, blurb } or
// { amount, period, altPeriod, bullets, placeholder }. `placeholder: true`
// shows a visible "not final" flag so a real number never gets mistaken for
// one that's actually been decided.
export default function PricingCard({ moduleName, pricing, onGetStarted }) {
  return (
    <section style={{ maxWidth: 640, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>{pricing.free ? "Included free" : "Simple, flat pricing"}</h2>
      <p style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 36 }}>
        {pricing.free ? pricing.blurb : "One price for your whole lodge — every role, every feature. No per-seat games."}
      </p>
      <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 36 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.accent, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
          {moduleName}
        </div>

        {pricing.free ? (
          <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 800, margin: "10px 0 24px" }}>Free with any module</div>
        ) : (
          <>
            <div style={{ fontFamily: mono, fontSize: 44, fontWeight: 800, marginBottom: 2 }}>${pricing.amount}</div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>per {pricing.period}, per organization</div>
            {pricing.altPeriod && <div style={{ fontSize: 12.5, color: colors.textTertiary, marginBottom: pricing.placeholder ? 8 : 24 }}>{pricing.altPeriod}</div>}
            {pricing.placeholder && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.warning, background: colors.warningBg, borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                  Placeholder — price not final
                </div>
              </div>
            )}
          </>
        )}

        {pricing.bullets && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", textAlign: "left", display: "inline-block", fontSize: 13.5, color: colors.textPrimary, lineHeight: 2.1 }}>
            {pricing.bullets.map((b) => <li key={b}>✓ {b}</li>)}
          </ul>
        )}

        <div>
          <button style={{ ...button.primary, fontSize: 15, padding: "12px 28px", width: "100%" }} onClick={onGetStarted}>
            Start your free trial
          </button>
        </div>
      </div>
    </section>
  );
}
