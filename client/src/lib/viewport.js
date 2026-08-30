import { useEffect, useState } from "react";

// The one shared breakpoint for the whole app — below this, the Sidebar
// becomes a drawer, modals go full-screen, and multi-column layouts collapse
// to one column. Matches the point where the fixed 232px Sidebar (see
// Sidebar.jsx) would otherwise consume most of the viewport.
export const MOBILE_BREAKPOINT = 768;

// A phone's own browser can report a viewport wider than its physical
// screen — a larger phone held in landscape routinely exceeds 768px of
// logical width, and some browsers widen the viewport further still (e.g.
// "Request Desktop Site"). Width alone then says "desktop" for someone
// who's still holding a phone and has no way to reach the sidebar at all.
// Checking the device's own user agent catches that regardless of what
// width the browser claims. Deliberately excludes iPad — modern iPadOS
// reports itself identically to desktop Safari on purpose, and a
// tablet-sized screen genuinely has room for the desktop layout.
const MOBILE_USER_AGENT_RE = /Android|iPhone|iPod|Windows Phone|\bMobile\b/i;

function isMobileUserAgent() {
  return typeof navigator !== "undefined" && MOBILE_USER_AGENT_RE.test(navigator.userAgent);
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT) || isMobileUserAgent()
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches || isMobileUserAgent());
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
