import React, { useEffect, useState } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { api } from "../lib/api";

// One org slug drives every module's public page (/rentals/:slug, /calendar/:slug,
// etc.) — editing it here updates it everywhere, which is the point: one public
// identity per org rather than a separate link to manage per module.
//
// `embedBasePath`, when given (e.g. "calendar/embed"), adds an "Embed on your
// website" panel that builds a themed <iframe> snippet — for dropping into a
// site builder's HTML/embed block (Brizy, Wix, WordPress, etc. all support this
// the same way). Theme is passed via query params since the iframe is a
// separate document and can't otherwise inherit the host site's styling.
export default function PublicLinkBox({ basePath, description, embedBasePath, embedTitle = "Embed" }) {
  const [org, setOrg] = useState(null);
  const [slug, setSlug] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showEmbed, setShowEmbed] = useState(false);
  const [theme, setTheme] = useState({ accent: "5b52d6", bg: "ffffff", text: "18181b", font: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getOrg().then((o) => { setOrg(o); setSlug(o.slug || ""); }).catch(() => {});
  }, []);

  const publicUrl = org?.slug ? `${window.location.origin}/${basePath}/${org.slug}` : null;
  const embedUrl = org?.slug ? `${window.location.origin}/${embedBasePath}/${org.slug}` : null;

  async function save() {
    setError("");
    setBusy(true);
    try {
      const updated = await api.updateOrg({ slug: slug.trim().toLowerCase() });
      setOrg(updated);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function setThemeField(k, v) {
    setTheme((t) => ({ ...t, [k]: v }));
    setCopied(false);
  }

  // Unique per module (e.g. "bjm-calendar-embed", "bjm-rentals-embed") so the
  // one generic listener script can resize whichever embed posts to it, and
  // multiple different embeds can coexist on the same host page.
  const embedElementId = embedBasePath ? `bjm-${embedBasePath.split("/")[0]}-embed` : null;

  function buildEmbedSrc() {
    const params = new URLSearchParams();
    if (theme.accent) params.set("accent", theme.accent.replace(/^#/, ""));
    if (theme.bg) params.set("bg", theme.bg.replace(/^#/, ""));
    if (theme.text) params.set("text", theme.text.replace(/^#/, ""));
    if (theme.font) params.set("font", theme.font);
    if (embedElementId) params.set("embedId", embedElementId);
    const qs = params.toString();
    return `${embedUrl}${qs ? `?${qs}` : ""}`;
  }

  // The iframe posts its content height back to us on load and whenever it
  // changes (data loading, navigating within the embed) — this listener
  // resizes the iframe to match instead of leaving it at a fixed height that
  // clips content or wastes space. Brizy's Embed element runs inline <script>
  // tags like this one directly, so no separate site-wide code injection is
  // needed. The same script works for any module's embed on the same page —
  // it matches on the id the embed itself reports, not a hardcoded one.
  const iframeCode = embedBasePath
    ? `<iframe id="${embedElementId}" src="${buildEmbedSrc()}" style="width:100%; height:650px; border:none;" title="${embedTitle}"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e.data && e.data.type === "bjm-embed-resize" && e.data.id) {
    var el = document.getElementById(e.data.id);
    if (el) el.style.height = e.data.height + "px";
  }
});
</script>`
    : `<iframe src="${buildEmbedSrc()}" style="width:100%; height:650px; border:none;" title="${embedTitle}"></iframe>`;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(iframeCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Public link</div>
          {publicUrl && !editing ? (
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>
              Share or embed: <span style={{ fontFamily: "monospace" }}>{publicUrl}</span>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: colors.textSecondary }}>{description}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {editing ? (
            <>
              <span style={{ fontSize: 12.5, color: colors.textSecondary }}>{window.location.origin}/{basePath}/</span>
              <input style={{ ...inputStyle, width: 180 }} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="red-hook-lodge-2022" />
              <button style={button.primary} disabled={busy || !slug.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
              <button style={button.ghost} onClick={() => setEditing(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button style={button.ghost} onClick={() => setEditing(true)}>{publicUrl ? "Edit link" : "Set up link"}</button>
              {embedBasePath && publicUrl && (
                <button style={button.ghost} onClick={() => setShowEmbed((s) => !s)}>{showEmbed ? "Hide embed code" : "Embed on your website"}</button>
              )}
            </>
          )}
        </div>
      </div>
      {error && <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>}

      {showEmbed && embedUrl && (
        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11.5, color: colors.textSecondary }}>
            Paste this into an HTML/Embed block on your site (Brizy's "Code" element works the same way). Colors and font are optional — leave them to match your site, or adjust to match it exactly.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <ThemeField label="Accent"><input style={inputStyle} value={theme.accent} onChange={(e) => setThemeField("accent", e.target.value)} placeholder="5b52d6" /></ThemeField>
            <ThemeField label="Background"><input style={inputStyle} value={theme.bg} onChange={(e) => setThemeField("bg", e.target.value)} placeholder="ffffff" /></ThemeField>
            <ThemeField label="Text color"><input style={inputStyle} value={theme.text} onChange={(e) => setThemeField("text", e.target.value)} placeholder="18181b" /></ThemeField>
            <ThemeField label="Font (Google Fonts name)"><input style={inputStyle} value={theme.font} onChange={(e) => setThemeField("font", e.target.value)} placeholder="Poppins" /></ThemeField>
          </div>
          <pre style={{ background: "#18181b", color: "#e5e5e5", borderRadius: 8, padding: 12, fontSize: 11.5, overflowX: "auto", margin: 0 }}>{iframeCode}</pre>
          <div>
            <button style={button.primary} onClick={copyCode}>{copied ? "Copied!" : "Copy code"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeField({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: "#52525b" }}>
      {label}
      {children}
    </label>
  );
}
