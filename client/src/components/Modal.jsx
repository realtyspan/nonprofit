import React from "react";
import { colors, button } from "../lib/tokens";
import { icons } from "../lib/icons";
import { useIsMobile } from "../lib/viewport";

// The one shared modal shell for the whole app — replaces the ad-hoc
// ModalShell/overlay-div pattern that used to be copy-pasted per view (each
// with its own width, some missing a maxWidth fallback entirely). Above the
// breakpoint it's the same centered box as before (caller-supplied width);
// below it, it becomes a full-screen sheet, since the multi-field forms in
// this app (booking review, event create/edit, space setup) are unusable in
// a cramped centered box on a phone.
export default function Modal({ children, onCancel, width = 460, title }) {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", zIndex: 50,
        display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center",
        overflowY: isMobile ? "hidden" : "auto", padding: isMobile ? 0 : 24,
      }}
      onClick={onCancel}
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
        onClick={(e) => e.stopPropagation()}
      >
        {(title || isMobile) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              style={{ ...button.ghost, padding: 8, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto" }}
            >
              <span dangerouslySetInnerHTML={{ __html: icons.close }} style={{ width: 18, height: 18, display: "flex" }} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
