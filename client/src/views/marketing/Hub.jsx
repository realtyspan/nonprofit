import React from "react";
import { colors } from "../../lib/tokens";
import { MARKETING_MODULES, MARKETING_MODULE_ORDER } from "../../lib/marketingContent";
import MarketingHeader from "../../components/marketing/MarketingHeader";
import MarketingFooter from "../../components/marketing/MarketingFooter";

export default function Hub({ onGetStarted, onLogin }) {
  return (
    <div style={{ background: colors.bg, color: colors.textPrimary, minHeight: "100vh" }}>
      <MarketingHeader activeSlug="home" onGetStarted={onGetStarted} onLogin={onLogin} />

      <section style={{ maxWidth: 780, margin: "0 auto", padding: "80px 32px 50px", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: colors.indigoBg, color: colors.indigo, fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 99, marginBottom: 20 }}>
          Built for NYS Lodge compliance and operations
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.15, margin: "0 0 18px" }}>
          Run your lodge's compliance and operations in one place
        </h1>
        <p style={{ fontSize: 16.5, color: colors.textSecondary, lineHeight: 1.6, maxWidth: 600, margin: "0 auto" }}>
          Bell Jar, facility rentals, your annual raffle and golf tournament, and one shared calendar — pick the modules your lodge needs, each priced on its own.
        </p>
      </section>

      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "10px 32px 90px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {MARKETING_MODULE_ORDER.map((slug) => {
            const m = MARKETING_MODULES[slug];
            return (
              <a
                key={slug}
                href={`/${slug}`}
                style={{ display: "block", background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 26, textDecoration: "none", color: "inherit" }}
              >
                <div dangerouslySetInnerHTML={{ __html: m.icon }} style={{ width: 30, height: 30, color: colors.accent, marginBottom: 16, display: "flex" }} />
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{m.name}</div>
                <div style={{ fontSize: 13.5, color: colors.textSecondary, lineHeight: 1.5, marginBottom: 16 }}>{m.tagline}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.accent }}>
                  {m.pricing.free ? "Included free" : `From $${m.pricing.amount}/mo`} — Learn more →
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
