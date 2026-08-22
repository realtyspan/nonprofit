import React from "react";
import { colors } from "../../lib/tokens";

export default function MarketingFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${colors.border}`, padding: "28px 32px", textAlign: "center", fontSize: 12, color: colors.textTertiary }}>
      Charity Pulse · Not affiliated with the NYS Gaming Commission — built to match its official forms
    </footer>
  );
}
