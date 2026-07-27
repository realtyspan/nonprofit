import React from "react";
import { colors } from "../lib/tokens";
import { icons } from "../lib/icons";

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
// stays reusable rather than each view rebuilding its own grid. `theme`
// optionally overrides colors (embed use, to match a host site's palette);
// anything not overridden falls back to the app's own design tokens.
export default function CalendarGrid({ month, events, onPrevMonth, onNextMonth, onSelectDay, onSelectEvent, theme }) {
  const t = { surface: "#fff", bg: "#fafafa", ...colors, ...theme };
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const navBtnStyle = {
    width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textSecondary,
  };

  function eventsForDay(day) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const dayEnd = addDays(dayStart, 1);
    return events
      .filter((e) => new Date(e.startAt) < dayEnd && new Date(e.endAt) >= dayStart)
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }

  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", color: t.textPrimary }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${t.borderLight}` }}>
        <button onClick={onPrevMonth} style={navBtnStyle} aria-label="Previous month">
          <span dangerouslySetInnerHTML={{ __html: icons.chevronLeft }} style={{ width: 16, height: 16, display: "flex" }} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <button onClick={onNextMonth} style={navBtnStyle} aria-label="Next month">
          <span dangerouslySetInnerHTML={{ __html: icons.chevronRight }} style={{ width: 16, height: 16, display: "flex" }} />
        </button>
      </div>

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
                minHeight: 92, padding: 6, borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${t.borderLight}`,
                borderBottom: `1px solid ${t.borderLight}`, background: inMonth ? t.surface : t.bg,
                cursor: onSelectDay ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 3,
              }}
            >
              <div style={{
                fontSize: 11, fontWeight: isToday ? 700 : 500, color: inMonth ? t.textPrimary : t.textTertiary,
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 99, background: isToday ? t.accent : "transparent", color: isToday ? "#fff" : undefined,
              }}>
                {day.getDate()}
              </div>
              {visible.map((e) => (
                <div
                  key={e.id}
                  onClick={(ev) => { ev.stopPropagation(); onSelectEvent?.(e); }}
                  title={e.title}
                  style={{
                    fontSize: 10.5, padding: "2px 5px", borderRadius: 5, cursor: onSelectEvent ? "pointer" : "default",
                    background: e.color || (e.source === "rental-booking" ? t.indigoBg : e.source === "rental-block" ? "#f0f0f3" : t.successBg),
                    color: e.source === "rental-block" ? t.textSecondary : t.indigo,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {e.title}
                </div>
              ))}
              {overflow > 0 && <div style={{ fontSize: 10, color: t.textTertiary }}>+{overflow} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
