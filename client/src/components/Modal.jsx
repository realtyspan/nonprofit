import React from "react";
import { button } from "../lib/tokens";
import { icons } from "../lib/icons";
import { useIsMobile } from "../lib/viewport";

// The one shared modal shell for the whole app — replaces the ad-hoc
// ModalShell/overlay-div pattern that used to be copy-pasted per view (each
// with its own width, some missing a maxWidth fallback entirely). Above the
// breakpoint it's the same centered box as before (caller-supplied width);
// below it, it becomes a full-screen sheet, since the multi-field forms in
// this app (booking review, event create/edit, space setup) are unusable in
// a cramped centered box on a phone.
//
// Closing is DELIBERATE ONLY — the "X" in the corner (always shown) or a
// Cancel/Close button the caller puts in the form. A click on the dimmed
// backdrop does nothing: these modals hold half-filled forms, and losing a
// booking or an event you were typing to a stray click off the edge of the
// card is a real bug people hit repeatedly.
export default function Modal({ children, onCancel, width = 460, title }) {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", zIndex: 50,
        display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center",
        overflowY: isMobile ? "hidden" : "auto", padding: isMobile ? 0 : 24,
      }}
    >
      <div
        style={{
          width: isMobile ? "100%" : width,
          maxWidth: "100%",
          height: isMobile ? "100%" : undefined,
          maxHeight: isMobile ? "100%" : "88vh",
          background: "#fff",
          borderRadius: isMobile ? 0 : 14,
          padding: isMobile ? 18 : 22,
          boxShadow: isMobile ? "none" : "0 20px 60px rgba(0,0,0,.25)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Header row is always present so there is always a visible "X" to
            close by — the backdrop no longer closes on click. When the
            caller passes no title, it's just the X, right-aligned. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flex: "none", marginBottom: title ? 14 : 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <CloseButton onCancel={onCancel} />
        </div>
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onCancel }) {
  return (
    <button
      type="button"
      onClick={onCancel}
      aria-label="Close"
      style={{ ...button.ghost, padding: 8, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}
    >
      <span dangerouslySetInnerHTML={{ __html: icons.close }} style={{ width: 18, height: 18, display: "flex" }} />
    </button>
  );
}
