import React, { useEffect, useRef, useState } from "react";
import { publicApi } from "../lib/api";
import { colors } from "../lib/tokens";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import { formatPhone, stripPhone } from "../lib/phone";
import { EVT_CSS, evtStyleVars } from "../components/TournamentVisual";
import { EventVisual, EventFooterContact, EVENT_EXTRA_CSS } from "../components/EventVisual";
import logo from "../assets/logo.png";

// PREVIEW BUILD — adapts Golf's/Tournaments' .evt design system (hero photo
// + stat rail + What's Included/Schedule body + footer CTA) onto Events,
// per the org's request to match that page's cleaner, easier-to-read look.
// Keeps this page's own sidebar picker (Golf has no equivalent — it just
// stacks every open tournament, where Events needs to let a visitor choose
// among several upcoming items) but re-themed onto the same --evt-* tokens
// so the whole page reads as one design instead of two. See EventVisual.jsx
// for the handful of adjustments Events' different field set needed.
const PAGE_CSS = `
.evt-page-header {
  display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
  padding: 18px 32px; border-bottom: 1px solid ${colors.border}; background: #fff;
}
.evt-page-brand { display: flex; align-items: center; gap: 10px; font-family: sans-serif; }
.evt-page-brand-name { font-weight: 700; font-size: 15px; }
.evt-page-nav a { font-size: 13.5px; font-weight: 600; color: ${colors.textSecondary}; text-decoration: none; }
.evt-page-nav a:hover { color: ${colors.textPrimary}; }

.evt-page-main { max-width: 1100px; margin: 0 auto; padding: 28px 20px 60px; display: flex; gap: 28px; align-items: flex-start; flex-wrap: wrap; }
.evt-page-content { flex: 1 1 480px; min-width: 0; display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 24px; }
.evt-page-content-top { display: flex; align-items: center; gap: 12px; }

.evt-side { flex: 0 1 300px; min-width: 260px; max-width: 340px; position: sticky; top: 24px; }
.evt-side-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.evt-side-title { font-size: 20px; font-weight: 600; color: var(--evt-ink); }
.evt-side-link { font-size: 12.5px; font-weight: 600; color: var(--evt-accent-deep); text-decoration: none; }
.evt-side-list { display: flex; flex-direction: column; gap: 8px; max-height: 64vh; overflow-y: auto; }
.evt-side-row {
  display: flex; align-items: center; gap: 13px; padding: 11px 13px; border-radius: var(--evt-radius-sm);
  border: 1px solid var(--evt-line); background: var(--evt-surface); cursor: pointer;
  text-align: left; width: 100%; font: inherit; color: inherit;
}
.evt-side-row:hover { border-color: var(--evt-accent); }
.evt-side-row.selected { border-color: var(--evt-accent); background: color-mix(in srgb, var(--evt-accent) 14%, white); }
.evt-side-row-date { width: 40px; flex: none; text-align: center; }
.evt-side-row-month { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--evt-accent-deep); }
.evt-side-row-day { font-size: 19px; font-weight: 700; color: var(--evt-ink); line-height: 1.1; }
.evt-side-row-body { flex: 1; min-width: 0; }
.evt-side-row-title { font-size: 13.5px; font-weight: 600; color: var(--evt-ink); line-height: 1.25; }
.evt-side-row-meta { font-size: 11.5px; color: var(--evt-ink-muted); margin-top: 2px; }
.evt-side-footnote { font-size: 12px; color: var(--evt-ink-muted); margin-top: 12px; line-height: 1.5; }

@media (max-width: 780px) {
  /* column-reverse keeps the "Coming up" picker above the detail on a
     narrow screen without flex-wrap:wrap-reverse, which on a wide screen
     was bottom-aligning the sticky sidebar (pushing the list to the bottom
     of the page whenever the selected event's detail was taller). */
  .evt-page-main { padding: 20px 16px 48px; flex-direction: column-reverse; }
  .evt-side { position: static; max-width: none; }
}
`;

function formatTimeLabel(startAt, endAt, allDay) {
  if (allDay) return "All day";
  const opts = { hour: "numeric", minute: "2-digit" };
  const start = new Date(startAt).toLocaleTimeString(undefined, opts);
  const end = new Date(endAt).toLocaleTimeString(undefined, opts);
  return start === end ? start : `${start} – ${end}`;
}
function monthDay(iso) {
  const d = new Date(iso);
  return { month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(), day: d.getDate() };
}

export default function PublicEvents({ slug, embed }) {
  const [orgName, setOrgName] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const initialized = useRef(false);
  const contentRef = useRef(null);
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font);

  useEffect(() => {
    publicApi.getEventsPage(slug)
      .then((data) => {
        setOrgName(data.orgName);
        setEvents(data.events);
        if (!initialized.current) {
          initialized.current = true;
          const wanted = params.get("event");
          const idx = wanted ? data.events.findIndex((e) => e.slug === wanted) : -1;
          setSelectedIndex(idx >= 0 ? idx : 0);
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!embed || !containerRef.current) return;
    const el = containerRef.current;
    const post = () => postEmbedResize(el.scrollHeight);
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed, events, selectedIndex, notifyOpen]);

  const clampedIndex = Math.min(selectedIndex, Math.max(events.length - 1, 0));
  const event = events[clampedIndex];
  const isDefault = clampedIndex === 0;

  function selectEvent(i) {
    setSelectedIndex(i);
    const next = new URLSearchParams(window.location.search);
    if (i === 0) next.delete("event");
    else next.set("event", events[i].slug);
    const qs = next.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    // Only scroll when the content's top is actually out of view (above
    // it, or below the fold) — never unconditionally, or every click nudges
    // the page by a small, pointless amount even on a wide layout where
    // the sidebar sits beside the content and nothing needs to move.
    const el = contentRef.current;
    if (el) {
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight - 80) {
        window.scrollTo({ top: Math.max(window.scrollY + top - 24, 0), behavior: "auto" });
      }
    }
  }

  if (error) return <Centered embed={embed}>This page isn't available.</Centered>;
  if (orgName === null) return <Centered embed={embed}>Loading…</Centered>;

  return (
    <div
      ref={containerRef}
      style={{ minHeight: embed ? "auto" : "100vh", background: embed ? (theme.bg || "transparent") : colors.bg }}
    >
      <style>{EVT_CSS}</style>
      <style>{EVENT_EXTRA_CSS}</style>
      <style>{PAGE_CSS}</style>

      {!embed && (
        <header className="evt-page-header">
          <div className="evt-page-brand">
            <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
            <div className="evt-page-brand-name">{orgName} — Events</div>
          </div>
          <nav className="evt-page-nav">
            <a href={`/calendar/${slug}`}>Full calendar</a>
          </nav>
        </header>
      )}

      <div className="evt" style={evtStyleVars(theme, font)}>
        {events.length === 0 ? (
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: embed ? 4 : "28px 20px 60px" }}>
            <div className="evt-card" style={{ padding: "48px 44px", textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
              <h2 className="evt-title" style={{ fontSize: 28 }}>No upcoming events right now</h2>
              <p style={{ color: "var(--evt-ink-muted)", fontSize: 14.5, maxWidth: 420 }}>Check back soon — new events are posted here as they're scheduled.</p>
              {!notifyOpen ? (
                <button type="button" className="evt-btn" onClick={() => setNotifyOpen(true)}>Notify me</button>
              ) : (
                <div style={{ width: "100%", maxWidth: 380, textAlign: "left" }}>
                  <NotifyForm slug={slug} onCancel={() => setNotifyOpen(false)} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="evt-page-main">
            <div className="evt-page-content" ref={contentRef}>
              {(event.recurrenceLabel || !isDefault) && (
                <div className="evt-page-content-top">
                  {event.recurrenceLabel && <span className="evt-pill">{event.recurrenceLabel}</span>}
                  {!isDefault && (
                    <button type="button" className="evt-btn-ghost" onClick={() => selectEvent(0)}>← Back to the next event</button>
                  )}
                </div>
              )}

              <div className="evt-card">
                <EventVisual event={event} notice={event.statusNote} />
                {(event.admissionNote || event.payUrl || event.reservePhone || event.contactName || event.contactEmail) && (
                  <div className="evt-footer">
                    <EventFooterContact event={event} />
                    {event.payUrl && (
                      <div className="evt-footer-actions">
                        <a className="evt-btn" href={event.payUrl} target="_blank" rel="noreferrer">Order &amp; pay online</a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <aside className="evt-side">
              <div className="evt-side-header">
                <h2 className="evt-side-title">Coming up</h2>
                <a className="evt-side-link" href={`/calendar/${slug}`}>Full calendar</a>
              </div>
              <div className="evt-side-list">
                {events.map((e, i) => {
                  const { month, day } = monthDay(e.startAt);
                  const selected = i === clampedIndex;
                  return (
                    <button
                      key={e.slug} type="button"
                      className={`evt-side-row${selected ? " selected" : ""}`}
                      onClick={() => selectEvent(i)}
                    >
                      <div className="evt-side-row-date">
                        <div className="evt-side-row-month">{month}</div>
                        <div className="evt-side-row-day">{day}</div>
                      </div>
                      <div className="evt-side-row-body">
                        <div className="evt-side-row-title">{e.shortTitle || e.title}</div>
                        {!e.allDay && <div className="evt-side-row-meta">{formatTimeLabel(e.startAt, e.endAt, e.allDay)}</div>}
                        {e.location && <div className="evt-side-row-meta">{e.location}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="evt-side-footnote">Click any event above to see its full details.</div>
            </aside>
          </div>
        )}
      </div>

      {!embed && (
        <footer style={{ borderTop: `1px solid ${colors.border}`, background: "#fff", padding: 32, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontFamily: "sans-serif" }}>
          <a href={`/calendar/${slug}`} style={{ fontSize: 14, color: colors.textSecondary }}>Calendar</a>
          <div style={{ fontSize: 13, color: colors.textTertiary }}>© {new Date().getFullYear()} {orgName}</div>
        </footer>
      )}
    </div>
  );
}

// The "notify me" lead-capture form shown under the empty-state message —
// restyled onto the .evt-form-panel system (same classes Golf's own
// NotifyForm already uses) instead of this page's old cream/pev styling.
function NotifyForm({ slug, onCancel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real visitors never see this field
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    if (!email.trim() && !phone.trim()) return setError("Enter an email or phone number so we can reach you");
    setBusy(true);
    setError("");
    try {
      await publicApi.submitEventInterest(slug, { name, email, phone, note, website });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="evt-form-success">
        <div className="evt-form-success-title">You're on the list!</div>
        <div style={{ fontSize: 13 }}>
          We'll reach out to {email.trim() || formatPhone(phone) || "you"} as soon as a new event is posted.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="evt-form-panel">
      <input
        type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true"
      />
      <input className="evt-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="evt-form-row">
        <input className="evt-input" style={{ flex: "1 1 160px" }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="evt-input" style={{ flex: "1 1 120px" }} placeholder="Phone" value={formatPhone(phone)} onChange={(e) => setPhone(stripPhone(e.target.value))} />
      </div>
      <input className="evt-input" placeholder="Anything else we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="evt-form-error">{error}</div>}
      <div className="evt-form-row">
        <button type="submit" className="evt-btn-sm" disabled={busy}>{busy ? "Submitting…" : "Notify me"}</button>
        <button type="button" className="evt-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Centered({ children, embed }) {
  return (
    <div style={{ minHeight: embed ? "auto" : "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: embed ? "transparent" : colors.bg, padding: embed ? 20 : 0 }}>
      <div style={{ fontSize: 13.5, color: colors.textSecondary, fontFamily: "sans-serif" }}>{children}</div>
    </div>
  );
}
