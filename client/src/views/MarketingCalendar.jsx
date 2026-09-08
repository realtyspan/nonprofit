import React from "react";
import PublicLinkBox from "../components/PublicLinkBox";

// Calendar's one marketing tool — relocated out of CalendarView.jsx into
// the Marketing tab. No flyer, no marketing email — just the public link
// and website embed.
export default function MarketingCalendar() {
  return (
    <PublicLinkBox basePath="calendar" embedBasePath="calendar/embed" embedTitle="Calendar" description="Set a link so you can view or embed this calendar (public events only) on your website." />
  );
}
