import React from "react";
import { colors } from "../lib/tokens";
import { eventColorFor } from "../lib/calendarColors";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Generic month-grid renderer used by both the internal admin Calendar view and
// the public embed — behavior (click handlers) is entirely prop-driven so it
// stays reusable rather than each view rebuilding its own grid. Navigation
// (prev/next/today) lives in CalendarToolbar above this, not here. `theme`
// optionally overrides colors (embed use, to match a host site's palette);
// anything not overridden falls back to the app's own design tokens.
export default function CalendarGrid({ month, events, onSelectDay, onSelectEvent, theme }) {
  const t = { surface: "#fff", bg: "#f7f4ec", ...colors, ...theme };
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
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
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} style={{ padding: "8px 6px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: t.textSecondary, textAlign: "center", borderBottom: `1px solid ${t.borderLight}` }}>
            {w}
          </div>
        ))}
        {days.map((day, i) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = sameDay(day, today);
          const dayEvents = eventsForDay(day);
          const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              key={i}
              onClick={() => onSelectDay?.(day)}
              style={{
                minHeight: 92, minWidth: 0, padding: 6, borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${t.borderLight}`,
                borderBottom: `1px solid ${t.borderLight}`, background: inMonth ? t.surface : t.bg,
                cursor: onSelectDay ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 3, overflow: "hidden",
              }}
            >
              <div style={{
                fontSize: 11, fontWeight: isToday ? 700 : 500, color: inMonth ? t.textPrimary : t.textTertiary,
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 99, background: isToday ? t.accent : "transparent", color: isToday ? "#fff" : undefined,
              }}>
                {day.getDate()}
              </div>
              {visible.map((e) => {
                const ec = eventColorFor(e.source, e.visibility);
                return (
                  <div
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onSelectEvent?.(e); }}
                    title={e.title}
                    style={{
                      fontSize: 10.5, padding: "2px 5px", borderRadius: 5, cursor: onSelectEvent ? "pointer" : "default",
                      background: e.color || ec.bg, color: e.color ? t.textPrimary : ec.text, fontWeight: 600,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {e.title}
                  </div>
                );
              })}
              {overflow > 0 && <div style={{ fontSize: 10, color: t.textTertiary }}>+{overflow} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
