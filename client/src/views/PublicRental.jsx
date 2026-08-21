import React, { useEffect, useMemo, useRef, useState } from "react";
import { colors, card, button, input as inputStyle } from "../lib/tokens";
import { publicApi } from "../lib/api";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import DateTimeField from "../components/DateTimeField";
import { formatPhone, stripPhone } from "../lib/phone";
import logo from "../assets/logo.png";

const MS_PER_HOUR = 1000 * 60 * 60;
const EMPTY_FORM = {
  spaceId: "", renterName: "", renterEmail: "", renterPhone: "", renterAddress: "",
  isMember: false, eventType: "", expectedGuests: "", startAt: "", endAt: "",
  roundTables: "", longTables: "", chairs: "", kitchenUse: "", chafingDishes: "", wantsLinen: false, notes: "",
  website: "", // honeypot — real visitors never see this field
};

function overlapsBuffered(startAt, endAt, busy) {
  if (!startAt || !endAt) return false;
  const holdStart = new Date(new Date(startAt).getTime() - 2 * MS_PER_HOUR);
  const holdEnd = new Date(new Date(endAt).getTime() + 1 * MS_PER_HOUR);
  return busy.some((b) => holdStart < new Date(b.endAt) && new Date(b.startAt) < holdEnd);
}

export default function PublicRental({ slug, embed }) {
  const [page, setPage] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const t = { ...colors, ...theme };
  const font = params.get("font");
  useGoogleFont(font);

  useEffect(() => {
    publicApi.getRentalPage(slug).then(setPage).catch((err) => setLoadError(err.message));
  }, [slug]);

  // Tells the host page how tall the content actually is, so its listener
  // script (see PublicLinkBox's generated snippet) can resize the iframe
  // instead of leaving it at a fixed height that clips or wastes space.
  useEffect(() => {
    if (!embed || !containerRef.current) return;
    const el = containerRef.current;
    const post = () => postEmbedResize(el.scrollHeight);
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed, page, form.spaceId, submitted]);

  const space = useMemo(() => page?.spaces.find((s) => s.id === form.spaceId), [page, form.spaceId]);
  const busyForSpace = useMemo(() => (page?.busy || []).filter((b) => b.spaceId === form.spaceId), [page, form.spaceId]);
  const conflictWarning = space && form.startAt && form.endAt && overlapsBuffered(form.startAt, form.endAt, busyForSpace);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitError("");
    setSubmitting(true);
    try {
      await publicApi.submitRentalInquiry(slug, form);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle = { ...card, background: t.surface, border: `1px solid ${t.border}`, color: t.textPrimary };
  const primaryBtn = { ...button.primary, background: t.accent };

  if (loadError) {
    return <Centered embed={embed} t={t}>This booking page isn't available.</Centered>;
  }
  if (!page) {
    return <Centered embed={embed} t={t}>Loading…</Centered>;
  }

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: embed ? "auto" : "100vh", background: embed ? (theme.bg || "transparent") : colors.bg,
        color: t.textPrimary, fontFamily: font ? `"${font}", sans-serif` : undefined,
      }}
    >
      {!embed && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>{page.orgName} — Facility Rental Request</div>
        </header>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>
        {submitted ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Request received</div>
            <div style={{ fontSize: 13.5, color: t.textSecondary }}>
              Thanks — someone from {page.orgName} will follow up to confirm availability and next steps. Nothing is booked yet.
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Choose a space</div>
              <div style={{ fontSize: 12, color: t.textSecondary, marginBottom: 12 }}>
                Pricing depends on event type and guest count — contact us and we'll work out the details together.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {page.spaces.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => set("spaceId", s.id)}
                    style={{
                      textAlign: "left", padding: 14, borderRadius: 10, cursor: "pointer",
                      border: form.spaceId === s.id ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
                      background: form.spaceId === s.id ? t.indigoBg : t.surface, color: t.textPrimary,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                    {s.capacity && <div style={{ fontSize: 11.5, color: t.textSecondary }}>Up to {s.capacity} guests</div>}
                  </button>
                ))}
              </div>
            </div>

            {space && (
              <>
                <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>Your event</div>
                      <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
                        Requesting the <strong>{space.name}</strong> — pick a different space above if that's not right.
                      </div>
                    </div>
                    <button type="button" style={{ ...button.ghost, flexShrink: 0 }} onClick={() => set("spaceId", "")}>
                      Cancel
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <DateTimeField label="Start" value={form.startAt} onChange={(v) => set("startAt", v)} t={t} />
                    <DateTimeField label="End" value={form.endAt} onChange={(v) => set("endAt", v)} t={t} />
                    <Field label="Event type" t={t}><input style={inputStyle} value={form.eventType} onChange={(e) => set("eventType", e.target.value)} placeholder="Birthday, memorial, corporate…" /></Field>
                    <Field label="Expected guests" t={t}><input style={inputStyle} type="number" min="0" value={form.expectedGuests} onChange={(e) => set("expectedGuests", e.target.value)} /></Field>
                  </div>
                  {conflictWarning && (
                    <div style={{ fontSize: 12, color: colors.warning, background: colors.warningBg, borderRadius: 8, padding: 10 }}>
                      Heads up — this time overlaps a date the Lodge already has booked or held. You can still submit; we'll confirm actual availability.
                    </div>
                  )}

                  <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: t.textSecondary, marginTop: 6 }}>Equipment (optional)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
                    <Field label="60&quot; round tables" t={t}><input style={inputStyle} type="number" min="0" value={form.roundTables} onChange={(e) => set("roundTables", e.target.value)} /></Field>
                    <Field label="8' tables" t={t}><input style={inputStyle} type="number" min="0" value={form.longTables} onChange={(e) => set("longTables", e.target.value)} /></Field>
                    <Field label="Chairs" t={t}><input style={inputStyle} type="number" min="0" value={form.chairs} onChange={(e) => set("chairs", e.target.value)} /></Field>
                    <Field label="Kitchen use" t={t}>
                      <select style={inputStyle} value={form.kitchenUse} onChange={(e) => set("kitchenUse", e.target.value)}>
                        <option value="">None</option>
                        <option value="no_oven">No oven</option>
                        <option value="with_oven">With oven</option>
                      </select>
                    </Field>
                    <Field label="Chafing dishes" t={t}><input style={inputStyle} type="number" min="0" value={form.chafingDishes} onChange={(e) => set("chafingDishes", e.target.value)} /></Field>
                  </div>
                  {space.offersLinen && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={form.wantsLinen} onChange={(e) => set("wantsLinen", e.target.checked)} />
                      Add linen service
                    </label>
                  )}
                </div>

                <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Your info</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <Field label="Name" t={t}><input style={inputStyle} required value={form.renterName} onChange={(e) => set("renterName", e.target.value)} /></Field>
                    <Field label="Email" t={t}><input style={inputStyle} type="email" required value={form.renterEmail} onChange={(e) => set("renterEmail", e.target.value)} /></Field>
                    <Field label="Phone" t={t}><input style={inputStyle} value={formatPhone(form.renterPhone)} onChange={(e) => set("renterPhone", stripPhone(e.target.value))} /></Field>
                    <Field label="Address" t={t}><input style={inputStyle} value={form.renterAddress} onChange={(e) => set("renterAddress", e.target.value)} /></Field>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={form.isMember} onChange={(e) => set("isMember", e.target.checked)} />
                    I'm a Lodge member
                  </label>
                  <Field label="Anything else we should know?" t={t}><input style={inputStyle} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

                  {/* Honeypot — hidden from real visitors via CSS, not from screen readers via aria. */}
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(e) => set("website", e.target.value)}
                    style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
                  />

                  {submitError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{submitError}</div>}
                  <button style={primaryBtn} type="submit" disabled={submitting}>
                    {submitting ? "Sending…" : "Request this space"}
                  </button>
                  <div style={{ fontSize: 11, color: t.textTertiary }}>This is a request, not a confirmed booking — the Lodge will follow up.</div>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, t }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, fontWeight: 600, color: t ? t.textSecondary : "#52525b" }}>
      {label}
      {children}
    </label>
  );
}

function Centered({ children, embed, t }) {
  return <div style={{ minHeight: embed ? 200 : "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: t ? t.textSecondary : colors.textSecondary, fontSize: 14 }}>{children}</div>;
}
