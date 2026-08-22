import { useEffect, useState } from "react";

// The one shared breakpoint for the whole app — below this, the Sidebar
// becomes a drawer, modals go full-screen, and multi-column layouts collapse
// to one column. Matches the point where the fixed 232px Sidebar (see
// Sidebar.jsx) would otherwise consume most of the viewport.
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
