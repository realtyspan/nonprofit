import React, { useEffect, useState } from "react";
import { colors } from "../../lib/tokens";
import { APP_URL } from "../../lib/env";

// Detects the one case this banner exists for: the page was launched from a
// home-screen icon (installed as if it were the app) while sitting on the
// marketing domain — which never has a login or app navigation by design
// (see registerPwa.js — the marketing site doesn't even get a service
// worker). A prospective customer just browsing normally in an ordinary
// browser tab never sees this; it only fires for an install pointed at the
// wrong address, which otherwise looks like a broken app with no menu.
function isStandalone() {
  if (typeof window === "undefined") return false;
  // `?standalone-preview=1` is a local/dev-only escape hatch for verifying
  // this banner without an actual home-screen install — same spirit as
  // App.jsx's `?preview=marketing`. Harmless in production.
  if (new URLSearchParams(window.location.search).get("standalone-preview") === "1") return true;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true // iOS Safari's own flag — no matchMedia support there
  );
}

export default function StandaloneNudgeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isStandalone());
  }, []);

  if (!show) return null;

  return (
    <div style={{ background: colors.focus, color: "#fff", padding: "12px 20px", textAlign: "center", fontSize: 13.5, lineHeight: 1.5 }}>
      <strong>This looks like it was added to your home screen from the wrong page.</strong>{" "}
      The actual app lives at a different address —{" "}
      <a href={APP_URL} style={{ color: "#fff", fontWeight: 700, textDecoration: "underline" }}>
        tap here to open it
      </a>
      , then add that page to your home screen instead.
    </div>
  );
}
