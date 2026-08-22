// The URL of the actual app (as opposed to the marketing site at the bare
// domain) — set at build time via VITE_APP_URL in production. Falls back to
// the current origin so local dev (where there's no separate marketing
// domain) behaves exactly as it always has.
export const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

// The bare domain (+ www) is the public marketing site — no login, no PWA
// install prompt, nothing app-specific. Every other hostname (the app
// subdomain, localhost, Railway's own *.up.railway.app) is the real app.
export const MARKETING_HOSTNAMES = ["elkslodges.org", "www.elkslodges.org"];
