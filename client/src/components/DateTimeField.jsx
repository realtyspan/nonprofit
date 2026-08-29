import React from "react";
import { input as inputStyle } from "../lib/tokens";
import { useIsMobile } from "../lib/viewport";

// A native <input type="datetime-local" step="1800"> only changes spinner-arrow
// behavior and submit-time validity — it doesn't stop anyone from typing or
// scrolling to an arbitrary minute in the picker itself, so it doesn't actually
// read as "half-hour increments" to a user. An explicit dropdown does. Shared
// between the internal Calendar view and the public/embed rental request form
// so both present the same real half-hour picker.
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h24 = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  const value = `${String(h24).padStart(2, "0")}:${m}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const label = `${h12}:${m} ${h24 < 12 ? "AM" : "PM"}`;
  return { value, label };
});

// value/onChange work on a "YYYY-MM-DDTHH:mm" string. `t` is an optional
// theme override (public/embed pages pass their host-site-matched palette).
export default function DateTimeField({ label, value, onChange, t }) {
  const isMobile = useIsMobile();
  const datePart = value.slice(0, 10);
  const timePart = value.slice(11, 16);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: t ? t.textSecondary : "#5c564c" }}>
      {label}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 6 }}>
        <input style={{ ...inputStyle, flex: isMobile ? undefined : 1.3 }} type="date" required value={datePart} onChange={(e) => onChange(`${e.target.value}T${timePart}`)} />
        <select style={{ ...inputStyle, flex: isMobile ? undefined : 1 }} required value={timePart} onChange={(e) => onChange(`${datePart}T${e.target.value}`)}>
          <option value="" disabled hidden>Time</option>
          {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </label>
  );
}
