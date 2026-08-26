import { registerSW } from "virtual:pwa-register";
import { MARKETING_HOSTNAMES } from "./env";

// Only the real app gets a service worker — the public marketing site
// (charitypulse.org) shares this same build but has no install prompt and no
// reason to accept the risk of a stale-cache bug hitting a first-time
// visitor. Same hostname check App.jsx already uses to route between them.
const isMarketingSite =
  MARKETING_HOSTNAMES.includes(window.location.hostname) ||
  new URLSearchParams(window.location.search).get("preview") === "marketing";

if (!isMarketingSite) {
  registerSW({ immediate: true });
}
