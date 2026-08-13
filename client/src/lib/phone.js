// Phone numbers are stored as plain digits (see stripPhone) and only ever
// formatted at the edges — display and input — never in the database. That
// way a stored value survives regardless of which format was in fashion when
// it was entered, and formatting logic lives in exactly one place per side
// (this file on the client, server/src/lib/phone.js on the server).

// Digits only, capped at 10. A leading "1" on an 11-digit number (someone
// pastes a full +1 number) is dropped rather than treated as part of the
// area code.
export function stripPhone(value) {
  const digits = (value || "").replace(/\D/g, "");
  const trimmed = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  return trimmed.slice(0, 10);
}

// Formats progressively as digits accumulate, so it doubles as an input mask
// (bind an input's value to formatPhone(rawDigits) and its onChange to
// stripPhone) as well as a static display formatter.
export function formatPhone(value) {
  const d = stripPhone(value);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}
