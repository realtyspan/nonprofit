// Every wall-clock time entered in this app (Calendar events, Rental bookings,
// recurring blocks) represents the lodge's own local time — not whichever
// timezone the browser or the server process happens to be running in. The
// client sends timezone-less strings like "2026-08-10T19:00"; converting them
// through a fixed IANA zone here means "7:00 PM" always lands on the same
// real-world moment regardless of where the server is hosted, and Daylight
// Saving is handled automatically instead of drifting mid-series.
const LODGE_TIME_ZONE = "America/New_York";

function offsetMinutesAt(utcGuess, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(utcGuess).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - utcGuess.getTime()) / 60000;
}

// dateStr: "YYYY-MM-DD", timeStr: "HH:MM" — both wall-clock in LODGE_TIME_ZONE.
function lodgeTimeToUtc(dateStr, timeStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = (timeStr || "00:00").split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = offsetMinutesAt(guess, LODGE_TIME_ZONE);
  return new Date(guess.getTime() - offset * 60000);
}

// Splits a "YYYY-MM-DDTHH:MM" datetime-local string (as sent by the client,
// no timezone suffix) into date/time parts for lodgeTimeToUtc.
function lodgeDateTimeStringToUtc(datetimeStr) {
  const [dateStr, timeStr] = datetimeStr.split("T");
  return lodgeTimeToUtc(dateStr, timeStr);
}

module.exports = { lodgeTimeToUtc, lodgeDateTimeStringToUtc };
