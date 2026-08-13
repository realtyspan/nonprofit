// Mirrors client/src/lib/phone.js — phone numbers are stored as plain digits
// and only formatted at the edges. This side only needs formatting (for PDF
// output); the client side also needs stripPhone for its input masks.
function formatPhone(value) {
  const digits = (value || "").replace(/\D/g, "");
  const d = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  const trimmed = d.slice(0, 10);
  if (trimmed.length === 0) return "";
  if (trimmed.length <= 3) return `(${trimmed}`;
  if (trimmed.length <= 6) return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`;
  return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6, 10)}`;
}

module.exports = { formatPhone };
