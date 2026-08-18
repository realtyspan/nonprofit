import React from "react";
import { colors } from "../lib/tokens";
import { icons } from "../lib/icons";

// Shared nav bar for both the internal admin Calendar and the public embed:
// prev/next + Today on the left, the current period's label in the middle,
// and the Month/Week switcher (plus any view-specific action, e.g. "+ Add
// event") on the right. `theme` lets the public embed recolor it to match a
// host site, same pattern as CalendarGrid/CalendarWeekGrid.
export default function CalendarToolbar({ periodLabel, onPrev, onNext, onToday, viewMode, onChangeViewMode, theme, right }) {
  const t = { surface: "#fff", bg: "#fafafa", ...colors, ...theme };

  const navBtnStyle = {
    width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textSecondary,
  };
  const todayBtnStyle = {
    padding: "0 12px", height: 28, borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface,
    fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: t.textSecondary,
  };

  function toggleBtn(mode, label) {
    return (
      <button
        key={mode}
        type="button"
        onClick={() => onChangeViewMode(mode)}
        style={{
          padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          background: viewMode === mode ? t.surface : "transparent",
          boxShadow: viewMode === mode ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
          color: viewMode === mode ? t.textPrimary : t.textSecondary,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onPrev} style={navBtnStyle} aria-label="Previous">
          <span dangerouslySetInnerHTML={{ __html: icons.chevronLeft }} style={{ width: 16, height: 16, display: "flex" }} />
        </button>
        <button onClick={onNext} style={navBtnStyle} aria-label="Next">
          <span dangerouslySetInnerHTML={{ __html: icons.chevronRight }} style={{ width: 16, height: 16, display: "flex" }} />
        </button>
        <button onClick={onToday} style={todayBtnStyle}>Today</button>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>{periodLabel}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 3, background: t.bg, borderRadius: 9, padding: 3 }}>
          {toggleBtn("month", "Month")}
          {toggleBtn("week", "Week")}
        </div>
        {right}
      </div>
    </div>
  );
}
