import React from "react";
import { colors } from "../lib/tokens";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Same prop shape and reusability intent as CalendarGrid (the month view) —
// week view trades the month's compact "+N more" day cells for one row per
// day showing every event's time in full, since a week only needs 7 columns
// instead of 42 cells to lay out. Navigation lives in CalendarToolbar above.
export default function CalendarWeekGrid({ anchorDate, events, onSelectDay, onSelectEvent, theme }) {
  const t = { surface: "#fff", bg: "#fafafa", ...colors, ...theme };
  const weekStart = startOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  function eventsForDay(day) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const dayEnd = addDays(dayStart, 1);
    return events
      .filter((e) => new Date(e.startAt) < dayEnd && new Date(e.endAt) >= dayStart)
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }

  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", color: t.textPrimary }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map((day, i) => {
          const isToday = sameDay(day, today);
          return (
            <div
              key={`h${i}`}
              style={{
                padding: "8px 6px", textAlign: "center", borderBottom: `1px solid ${t.borderLight}`,
                borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${t.borderLight}`,
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: t.textSecondary }}>{WEEKDAY_LABELS[i]}</div>
              <div
                style={{
                  fontSize: 13, fontWeight: isToday ? 700 : 500, marginTop: 3, width: 24, height: 24, borderRadius: 99,
                  display: "flex", alignItems: "center", justifyContent: "center", margin: "3px auto 0",
                  background: isToday ? t.accent : "transparent", color: isToday ? "#fff" : t.textPrimary,
                }}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
        {days.map((day, i) => {
          const dayEvents = eventsForDay(day);
          return (
            <div
              key={`d${i}`}
              onClick={() => onSelectDay?.(day)}
              style={{
                minHeight: 300, padding: 6, borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${t.borderLight}`,
                cursor: onSelectDay ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 4,
              }}
            >
              {dayEvents.map((e) => (
                <div
                  key={e.id}
                  onClick={(ev) => { ev.stopPropagation(); onSelectEvent?.(e); }}
                  title={e.title}
                  style={{
                    fontSize: 11, padding: "4px 6px", borderRadius: 6, cursor: onSelectEvent ? "pointer" : "default",
                    background: e.color || (e.source === "rental-booking" ? t.indigoBg : e.source === "rental-block" ? "#f0f0f3" : t.successBg),
                    color: e.source === "rental-block" ? t.textSecondary : t.indigo,
                  }}
                >
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                  <div style={{ fontSize: 10, opacity: 0.85 }}>
                    {e.allDay ? "All day" : `${formatTime(new Date(e.startAt))} – ${formatTime(new Date(e.endAt))}`}
                  </div>
                </div>
              ))}
              {dayEvents.length === 0 && <div style={{ fontSize: 10.5, color: t.textTertiary }}>—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
