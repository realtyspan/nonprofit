import React from "react";
import { colors } from "../../lib/tokens";
import { MARKETING_MODULES } from "../../lib/marketingContent";
import MarketingHeader from "../../components/marketing/MarketingHeader";
import Hero from "../../components/marketing/Hero";
import FeatureGrid from "../../components/marketing/FeatureGrid";
import HowItWorks from "../../components/marketing/HowItWorks";
import PricingCard from "../../components/marketing/PricingCard";
import MarketingFooter from "../../components/marketing/MarketingFooter";

// One generic page shell for every module — content comes entirely from
// marketingContent.js, so adding a 5th module later is a new config entry
// plus a route, not a new page file.
export default function ModulePage({ slug, onGetStarted, onLogin }) {
  const content = MARKETING_MODULES[slug];

  return (
    <div style={{ background: colors.bg, color: colors.textPrimary, minHeight: "100vh" }}>
      <MarketingHeader onGetStarted={onGetStarted} onLogin={onLogin} />
      <Hero badge={content.badge} headline={content.heroHeadline} subhead={content.heroSubhead} onGetStarted={onGetStarted} onLogin={onLogin} />
      <FeatureGrid features={content.features} />
      <HowItWorks steps={content.steps} />
      <PricingCard moduleName={content.name} pricing={content.pricing} onGetStarted={onGetStarted} />
      <MarketingFooter />
    </div>
  );
}
