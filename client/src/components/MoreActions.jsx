import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors } from "../lib/tokens";

// A "⋯" trigger that reveals a small dropdown of actions — for a busy action
// row (a rental booking, a golf roster entry) where every action rendered as
// its own button competes for attention with the one or two that actually
// matter most of the time. Items rarely clicked go here instead of sitting
// permanently in the row at full visual weight.
//
// The menu renders through a portal into document.body instead of as a
// normal absolutely-positioned child — every card list in this app clips its
// rows with overflow:hidden (for the rounded corners), which silently cuts
// off a dropdown the moment it's opened on the last/only row (mobile hits
// this constantly, since there's rarely room below). Rendering outside that
// ancestor and positioning from the trigger's own bounding rect sidesteps it
// entirely, on any screen size.
//
// items: [{ label, onClick, danger? }]
export default function MoreActions({ items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    // Scroll or resize invalidates the fixed-position coordinates computed
    // above — closing rather than re-tracking keeps this simple, and a
    // three-item menu is cheap to reopen.
    function onScrollOrResize() { setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  if (!items || items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
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
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: pos.top, right: pos.right, zIndex: 1000,
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
        </div>,
        document.body
      )}
    </>
  );
}
