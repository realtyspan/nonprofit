import { useEffect } from "react";

// Shared by every module's embeddable public page (Calendar, Rental, and
// whatever comes after). Theme override params for embedding on a third-party
// site (e.g. a Brizy "HTML Code" block): ?accent=1a73e8&bg=ffffff&
// surface=ffffff&text=222222&textSecondary=666666&border=e5e5e5&font=Poppins
// — all optional, hex without the leading # (# has special meaning in URLs).
export function parseThemeFromQuery(params) {
  const theme = {};
  const hex = (name) => {
    const v = params.get(name);
    if (!v) return null;
    return v.startsWith("#") ? v : `#${v}`;
  };
  const accent = hex("accent");
  const bg = hex("bg");
  const surface = hex("surface");
  const text = hex("text");
  const textSecondary = hex("textSecondary");
  const border = hex("border");
  if (accent) { theme.accent = accent; theme.indigo = accent; }
  // `bg` is the one param most site owners will set — apply it to both the
  // main surface and any muted/secondary surface unless `surface` is given
  // separately, so the whole embed takes the site's color instead of leaving
  // a jarring mismatch between a themed background and default-white cards.
  if (bg) { theme.bg = bg; theme.surface = bg; }
  if (surface) theme.surface = surface;
  if (text) theme.textPrimary = text;
  if (textSecondary) theme.textSecondary = textSecondary;
  if (border) { theme.border = border; theme.borderLight = border; }
  return theme;
}

// The embed page posts its content height to the parent (watched by the
// listener script generated in PublicLinkBox), tagged with the iframe's own
// DOM id — read from ?embedId=... which the parent's generated <iframe> src
// sets — so one shared listener script works for any module's embed, and
// multiple different embeds can coexist on the same host page.
export function postEmbedResize(height) {
  const embedId = new URLSearchParams(window.location.search).get("embedId");
  if (!embedId) return;
  window.parent.postMessage({ type: "bjm-embed-resize", id: embedId, height }, "*");
}

// Injects a Google Font by name — the iframe is a separate document and can't
// otherwise inherit whatever font the host page has loaded.
export function useGoogleFont(font) {
  useEffect(() => {
    if (!font) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, [font]);
}
