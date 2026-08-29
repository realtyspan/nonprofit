// Design tokens — refreshed to draw from the actual logo mark (teal ring,
// terracotta center, warm cream gear) instead of an unrelated violet+cool-gray
// palette. One accent pairing for the whole app, deliberately not a different
// color per module (see the design proposal thread) — accent (teal) covers
// structural/default actions everywhere, focus (terracotta) is reserved for
// the one action per screen that should read as the obvious next step.
// Semantic colors (success/warning/danger) are untouched — they're a separate
// system from brand accent and were never the complaint.
export const colors = {
  bg: "#faf8f2",
  surface: "#ffffff",
  border: "#ece6d9",
  borderStrong: "#d9d2c2",
  borderLight: "#f1ece0",
  textPrimary: "#23302f",
  textSecondary: "#756f63",
  textTertiary: "#a39c8d",
  accent: "#25555f",
  accentHover: "#1a3f47",
  accentSoft: "#e2ebea", // soft teal tint — secondary buttons, active nav state
  focus: "#cd715c", // terracotta — the one loud action per screen, used sparingly
  focusHover: "#b35943",
  focusBg: "#fbe9e4",
  success: "#16803c",
  successBg: "#e0f2ea",
  warning: "#92400e",
  warningBg: "#fef3c7",
  warningAmber: "#d97706",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  indigo: "#25555f", // "info" pills now match the brand teal rather than a leftover violet
  indigoBg: "#e2ebea",
  nearBlack: "#23302f",
};

export const mono = "'JetBrains Mono', monospace";
export const sans = "'Inter', system-ui, sans-serif";

export const card = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 18,
};

export const pill = (bg, color) => ({
  background: bg,
  color,
  fontSize: 11.5,
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: 99,
  display: "inline-block",
  whiteSpace: "nowrap",
});

export const button = {
  primary: {
    background: colors.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  // Reserved for the one action per screen that should outrank every other
  // primary button on it (e.g. a compliance deadline, a "pay now" CTA) — not
  // a wholesale replacement for `primary`. Sparing use is what makes it work.
  focus: {
    background: colors.focus,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  // A real middle tier — a soft-tinted fill, quieter than primary/focus but
  // more visible than ghost's outline. For a busy row of actions, this is
  // where the "common enough to want as its own button" ones land, once the
  // single most important one has been promoted to primary or focus.
  secondary: {
    background: colors.accentSoft,
    color: colors.accentHover,
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  ghost: {
    background: "transparent",
    color: colors.textSecondary,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  disabled: {
    background: colors.borderLight,
    color: colors.textTertiary,
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "not-allowed",
  },
};

export const input = {
  border: `1px solid ${colors.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: sans,
  width: "100%",
};

export const money = (n) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
