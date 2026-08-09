// Materializes a CalendarRecurrence rule into individual {startAt, endAt} pairs.
// Occurrences are generated up front (not expanded at query time) so editing or
// deleting a single occurrence is a plain row operation — no exception tracking
// needed. Bounded by MAX_OCCURRENCES so a bad rule (e.g. daily forever) can't
// generate unbounded rows; endDate is required on the rule for the same reason.
const { lodgeTimeToUtc } = require("./timezone");

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_OCCURRENCES = 500;

// Formats a date's UTC calendar components as "YYYY-MM-DD" — `date` here is
// always a UTC-midnight value (date-only ISO strings parse as UTC), so UTC
// getters are the ones that actually match the calendar day it represents;
// local getters would roll it back a day whenever the server's own timezone
// isn't UTC.
function toDateStr(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function withTime(date, timeStr, allDay) {
  if (allDay) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  return lodgeTimeToUtc(toDateStr(date), timeStr || "00:00");
}

// All dates in `month`/`year` that fall on `weekday` (0=Sun..6=Sat), in order —
// used to resolve "2nd Tuesday" (index 1) or "last Tuesday" (index -1).
function weekdaysInMonth(year, month, weekday) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const matches = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(Date.UTC(year, month, d));
    if (day.getUTCDay() === weekday) matches.push(day);
  }
  return matches;
}

function generateOccurrences(rule) {
  const { freq, interval = 1, byWeekday, byWeekdayOrdinal, startDate, endDate, startTime, endTime, allDay } = rule;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const results = [];

  function pushIfInRange(day) {
    if (day < start || day > end || results.length >= MAX_OCCURRENCES) return;
    const dayEnd = new Date(day);
    results.push({ startAt: withTime(day, startTime, allDay), endAt: withTime(dayEnd, endTime, allDay) });
  }

  if (freq === "monthly" && byWeekdayOrdinal && byWeekday) {
    // "2nd and 4th Tuesday of every month" — a standing-meeting pattern most
    // fraternal lodges actually use, which a fixed day-of-month or a plain
    // biweekly interval can't represent (biweekly drifts off the intended
    // weekday-of-month in any month with 5 of that weekday).
    const weekdayNum = WEEKDAYS.indexOf(byWeekday);
    const ordinals = byWeekdayOrdinal.split(",").map(Number);
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end && results.length < MAX_OCCURRENCES) {
      const matches = weekdaysInMonth(cursor.getUTCFullYear(), cursor.getUTCMonth(), weekdayNum);
      for (const ord of ordinals) {
        const day = ord === -1 ? matches[matches.length - 1] : matches[ord - 1];
        if (day) pushIfInRange(day);
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + interval, 1));
    }
  } else if (freq === "weekly" && byWeekday) {
    const wanted = byWeekday.split(",").map((w) => WEEKDAYS.indexOf(w));
    let weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // back up to that week's Sunday
    while (weekStart <= end && results.length < MAX_OCCURRENCES) {
      for (const wd of wanted) {
        const day = new Date(weekStart);
        day.setUTCDate(weekStart.getUTCDate() + wd);
        pushIfInRange(day);
      }
      weekStart.setUTCDate(weekStart.getUTCDate() + 7 * interval);
    }
  } else if (freq === "monthly") {
    let day = new Date(start);
    while (day <= end && results.length < MAX_OCCURRENCES) {
      pushIfInRange(day);
      day = new Date(day);
      day.setUTCMonth(day.getUTCMonth() + interval);
    }
  } else {
    // daily
    let day = new Date(start);
    while (day <= end && results.length < MAX_OCCURRENCES) {
      pushIfInRange(day);
      day = new Date(day);
      day.setUTCDate(day.getUTCDate() + interval);
    }
  }

  return results.sort((a, b) => a.startAt - b.startAt);
}

module.exports = { generateOccurrences, MAX_OCCURRENCES };
