import React from "react";
import { colors } from "../../lib/tokens";

export default function FeatureGrid({ features }) {
  return (
    <section style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 32px 80px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        {features.map((f) => (
          <div key={f.title} style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 12, padding: 22 }}>
            <div
              dangerouslySetInnerHTML={{ __html: f.icon }}
              style={{ width: 26, height: 26, color: colors.accent, marginBottom: 14, display: "flex" }}
            />
            <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>{f.title}</div>
            <div style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 1.55 }}>{f.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
