// Design tokens ported from the design_handoff_bell_jar_manager README/prototype.
export const colors = {
  bg: "#f7f7f9",
  surface: "#ffffff",
  border: "#ececef",
  borderStrong: "#d4d4db",
  borderLight: "#f2f2f4",
  textPrimary: "#18181b",
  textSecondary: "#8b8b95",
  textTertiary: "#9a9aa2",
  accent: "#6860dc",
  accentHover: "#4a42c2",
  success: "#16803c",
  successBg: "#e0f2ea",
  warning: "#92400e",
  warningBg: "#fef3c7",
  warningAmber: "#d97706",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  indigo: "#4338ca",
  indigoBg: "#eef0ff",
  nearBlack: "#18181b",
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
