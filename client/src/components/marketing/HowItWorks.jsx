import React from "react";
import { colors, mono } from "../../lib/tokens";

export default function HowItWorks({ steps }) {
  return (
    <section style={{ background: "#fff", borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "70px 32px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", marginBottom: 48 }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 32 }}>
          {steps.map((s) => (
            <div key={s.n} style={{ textAlign: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 99, background: colors.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontWeight: 700, margin: "0 auto 16px" }}>
                {s.n}
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 1.55 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
