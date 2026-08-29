import React, { useEffect, useRef, useState } from "react";
import { colors } from "../lib/tokens";

// A "⋯" trigger that reveals a small dropdown of actions — for a busy action
// row (a rental booking, a golf roster entry) where every action rendered as
// its own button competes for attention with the one or two that actually
// matter most of the time. Items rarely clicked go here instead of sitting
// permanently in the row at full visual weight.
//
// items: [{ label, onClick, danger? }]
export default function MoreActions({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!items || items.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        aria-expanded={open}
        style={{
          background: colors.borderLight, color: colors.textSecondary, border: "none",
          borderRadius: 8, width: 34, height: 34, fontSize: 14, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20,
            background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10,
            boxShadow: "0 4px 16px rgba(35,48,47,.14)", minWidth: 168, padding: 6,
            display: "flex", flexDirection: "column", gap: 2,
          }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setOpen(false); item.onClick(); }}
              style={{
                background: "transparent", border: "none", borderRadius: 6, padding: "8px 10px",
                fontSize: 12.5, fontWeight: 600, textAlign: "left", cursor: "pointer",
                color: item.danger ? colors.danger : colors.textPrimary,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.borderLight; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
