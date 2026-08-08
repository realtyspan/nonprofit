// The URL of the actual app (as opposed to the marketing site at the bare
// domain) — set at build time via VITE_APP_URL in production. Falls back to
// the current origin so local dev (where there's no separate marketing
// domain) behaves exactly as it always has.
export const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
