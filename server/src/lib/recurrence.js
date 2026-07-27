// Materializes a CalendarRecurrence rule into individual {startAt, endAt} pairs.
// Occurrences are generated up front (not expanded at query time) so editing or
// deleting a single occurrence is a plain row operation — no exception tracking
// needed. Bounded by MAX_OCCURRENCES so a bad rule (e.g. daily forever) can't
// generate unbounded rows; endDate is required on the rule for the same reason.
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_OCCURRENCES = 500;

function withTime(date, timeStr, allDay) {
  const d = new Date(date);
  if (allDay) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

// All dates in `month`/`year` that fall on `weekday` (0=Sun..6=Sat), in order —
// used to resolve "2nd Tuesday" (index 1) or "last Tuesday" (index -1).
function weekdaysInMonth(year, month, weekday) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matches = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d);
    if (day.getDay() === weekday) matches.push(day);
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
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end && results.length < MAX_OCCURRENCES) {
      const matches = weekdaysInMonth(cursor.getFullYear(), cursor.getMonth(), weekdayNum);
      for (const ord of ordinals) {
        const day = ord === -1 ? matches[matches.length - 1] : matches[ord - 1];
        if (day) pushIfInRange(day);
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, 1);
    }
  } else if (freq === "weekly" && byWeekday) {
    const wanted = byWeekday.split(",").map((w) => WEEKDAYS.indexOf(w));
    let weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // back up to that week's Sunday
    while (weekStart <= end && results.length < MAX_OCCURRENCES) {
      for (const wd of wanted) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + wd);
        pushIfInRange(day);
      }
      weekStart.setDate(weekStart.getDate() + 7 * interval);
    }
  } else if (freq === "monthly") {
    let day = new Date(start);
    while (day <= end && results.length < MAX_OCCURRENCES) {
      pushIfInRange(day);
      day = new Date(day);
      day.setMonth(day.getMonth() + interval);
    }
  } else {
    // daily
    let day = new Date(start);
    while (day <= end && results.length < MAX_OCCURRENCES) {
      pushIfInRange(day);
      day = new Date(day);
      day.setDate(day.getDate() + interval);
    }
  }

  return results.sort((a, b) => a.startAt - b.startAt);
}

module.exports = { generateOccurrences, MAX_OCCURRENCES };
