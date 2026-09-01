// Mirrors client/src/lib/phone.js — phone numbers are stored as plain digits
// and only formatted at the edges. This side originally only needed
// formatting (for PDF output); stripPhone was added alongside it so an
// exact-match lookup (see publicGolf.js) can normalize a visitor-typed
// phone number the same way the client does before it was ever stored.
function stripPhone(value) {
  const digits = (value || "").replace(/\D/g, "");
  const trimmed = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  return trimmed.slice(0, 10);
}

function formatPhone(value) {
  const trimmed = stripPhone(value);
  if (trimmed.length === 0) return "";
  if (trimmed.length <= 3) return `(${trimmed}`;
  if (trimmed.length <= 6) return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`;
  return `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6, 10)}`;
}

module.exports = { formatPhone, stripPhone };
