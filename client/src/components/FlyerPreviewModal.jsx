import React, { useEffect } from "react";
import Modal from "./Modal";
import { button, colors } from "../lib/tokens";

// Shown right after a "Preview flyer" click (Events/Golf/Tournaments/Raffle
// Marketing tabs) so the admin can check the design/content before deciding
// to keep it, instead of a file just silently landing in their downloads
// folder — see api.js's fetchPdfPreview for why this is an in-page <iframe>
// rather than a new browser tab (popup blockers). Chromium renders a PDF
// blob URL inline via its built-in viewer, so no PDF-rendering library is
// needed here either.
//
// Owns revoking the blob URL: it's created fresh per preview (api.js never
// reuses one) and only this modal knows when the admin is done looking at
// it, so this is the one place that's both correct and convenient to clean
// it up.
export default function FlyerPreviewModal({ flyer, onClose }) {
  useEffect(() => {
    return () => URL.revokeObjectURL(flyer.url);
  }, [flyer.url]);

  return (
    <Modal onCancel={onClose} width={860} title="Flyer preview">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <iframe
          src={flyer.url}
          title="Flyer preview"
          style={{ width: "100%", height: "74vh", border: `1px solid ${colors.border}`, borderRadius: 8 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" style={button.ghost} onClick={onClose}>Close</button>
          <a
            href={flyer.url} download={flyer.filename}
            style={{ ...button.primary, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            Download PDF
          </a>
        </div>
      </div>
    </Modal>
  );
}
