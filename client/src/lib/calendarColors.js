// Solid, saturated colors for the calendar's 3 event categories — used by
// both grid event chips (CalendarGrid/CalendarWeekGrid) and the Legend
// swatches in CalendarView, so the two always match. Previously these used
// the app's pale *Bg wash tokens (colors.successBg/indigoBg/"#f0f0f3") for
// both the chips and the tiny 10px legend squares — at that lightness the
// legend swatches were nearly indistinguishable from the page background.
// `theme` (embed use) can still override via CalendarGrid's own `t`, these
// are just the app's own defaults.
export const EVENT_COLORS = {
  manual: { bg: "#1f9d55", text: "#ffffff" }, // Lodge events
  "rental-booking": { bg: "#4338ca", text: "#ffffff" }, // Rental bookings
  "rental-block": { bg: "#6b7280", text: "#ffffff" }, // Internal holds
  private: { bg: "#a855f7", text: "#ffffff" }, // Private items — only visible to their creator (plus calendar Admin/Owner)
};

// Private items get their own color regardless of source (they're always
// source "manual") — pass the event's visibility, not just its source.
export function eventColorFor(source, visibility) {
  if (visibility === "private") return EVENT_COLORS.private;
  return EVENT_COLORS[source] || EVENT_COLORS.manual;
}
