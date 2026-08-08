// A "date only" value (a drawing date, a raffle start/end date) is stored as
// UTC midnight (it comes from an <input type="date">). Reading it back with
// local-time methods (toLocaleDateString(), getDate()) on a browser east of
// UTC... west of UTC, actually — rolls the displayed date back one day. Use
// this instead of calling toLocaleDateString() directly on such a value.
export function formatUtcDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });
}
