import React, { useState } from "react";
import { colors, button } from "../lib/tokens";
import { resizeImageFile } from "../lib/imageResize";

// A receipt can be a photo of a paper receipt or a PDF (an emailed invoice,
// a scanned copy) — images get downscaled the same way a game label photo
// does (see Deals.jsx's LabelPhotoField); a PDF can't be resized, so it's
// just read as-is, guarded by a size cap so a multi-page scan doesn't blow
// past the server's request body limit once base64-encoded (~33% larger
// than the raw file).
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the selected file"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// value/onChange work on { receiptFile, receiptFileName } — both empty
// strings when nothing's attached.
export default function ReceiptField({ receiptFile, receiptFileName, onChange, label = "Receipt (optional)" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isPdf = receiptFile?.startsWith("data:application/pdf");
  const isImage = receiptFile?.startsWith("data:image/");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      if (file.type === "application/pdf") {
        if (file.size > MAX_PDF_BYTES) {
          throw new Error("That PDF is over 5MB — try a smaller scan or a photo instead");
        }
        onChange({ receiptFile: await readFileAsDataUrl(file), receiptFileName: file.name });
      } else if (file.type.startsWith("image/")) {
        onChange({ receiptFile: await resizeImageFile(file), receiptFileName: file.name });
      } else {
        throw new Error("Attach an image or a PDF");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {isImage && (
          <img src={receiptFile} alt="Receipt" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: `1px solid ${colors.border}` }} />
        )}
        {isPdf && (
          <a href={receiptFile} download={receiptFileName || "receipt.pdf"} style={{ fontSize: 12, color: colors.accent, fontWeight: 600 }}>
            📄 {receiptFileName || "receipt.pdf"}
          </a>
        )}
        <label style={{ cursor: "pointer" }}>
          <input type="file" accept="image/*,application/pdf" onChange={handleFile} style={{ display: "none" }} />
          <span style={{ ...button.ghost, display: "inline-block", padding: "6px 12px", fontSize: 12.5 }}>
            {busy ? "Attaching…" : receiptFile ? "Replace receipt" : "Attach receipt"}
          </span>
        </label>
        {receiptFile && !busy && (
          <button type="button" style={{ ...button.ghost, padding: "6px 10px", fontSize: 12.5, color: colors.danger }} onClick={() => onChange({ receiptFile: "", receiptFileName: "" })}>
            Remove
          </button>
        )}
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 11.5 }}>{error}</div>}
    </div>
  );
}
