import React from "react";
import { colors, card } from "../lib/tokens";
import PublicLinkBox from "../components/PublicLinkBox";

// Unlike every other Marketing sub-page, there's nothing to author here —
// this page just reflects whatever's already public/open elsewhere (an
// open Golf tournament, an open Tournament, a published Event, an active
// Raffle, or a manual public Calendar entry — see calendarSync.js). So
// this is just the public link/embed panel plus a short explanation, no
// data card below it.
export default function MarketingActivities() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PublicLinkBox
        basePath="activities"
        embedBasePath="activities/embed"
        embedTitle="Activities"
        description="One public page/embed listing everything currently open or published — golf, tournaments, events, raffles, and any manual calendar entries you've marked public."
      />
      <div style={{ ...card, fontSize: 12.5, color: colors.textSecondary, lineHeight: 1.6 }}>
        There's nothing to manage here directly — this page automatically shows whatever's already public elsewhere. Open a tournament, publish an event, start a raffle, or mark a Calendar entry "Public," and it shows up here on its own. Closing or unpublishing it removes it from this page the same way.
      </div>
    </div>
  );
}
