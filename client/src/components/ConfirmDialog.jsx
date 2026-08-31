import React, { useEffect } from "react";
import { colors, button } from "../lib/tokens";
import Modal from "./Modal";

// The one shared confirm dialog for the whole app — see lib/ConfirmContext's
// useConfirm(), which every window.confirm() call site was switched to.
// Built on the existing Modal shell so it already gets the app's colors,
// mobile full-screen-sheet behavior, and click-outside-to-cancel for free.
export default function ConfirmDialog({ message, confirmLabel = "Delete", cancelLabel = "Cancel", danger = true, onConfirm, onCancel }) {
  // Enter/Escape parity with the native confirm() this replaces.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Enter") onConfirm();
      else if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onConfirm, onCancel]);

  return (
    <Modal onCancel={onCancel} width={420}>
      <div style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" style={button.ghost} onClick={onCancel}>{cancelLabel}</button>
        <button
          type="button"
          style={danger ? { ...button.primary, background: colors.danger } : button.primary}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
