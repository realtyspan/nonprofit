import React, { useEffect, useRef, useState } from "react";
import { publicApi } from "../lib/api";
import { colors } from "../lib/tokens";
import { parseThemeFromQuery, postEmbedResize } from "../lib/embedTheme";
import logo from "../assets/logo.png";

// This page's visual system now mirrors the app's own tokens.js palette
// and font (Inter, already loaded app-wide via index.html — no separate
// font loading needed here) rather than the commissioned design's original
// standalone cream/Caprasimo look. Scoped entirely under .pev (same
// technique as PublicGolf.jsx's own .evt-prefixed embed design system) so
// it can never leak into, or be leaked into by, the rest of the app. The
// query-param theme override (accent/bg/surface/text/textSecondary/border/
// font — see embedTheme.js) still applies on top via pevStyleVars below,
// so an org can still restyle this to match their own website when they
// embed it — same as every other public page already works.
//
// Color mapping, one hue family in for one hue family out (the design's
// own structural split, just re-hued): the design's single main "accent"
// (used broadly — buttons, selection, focus ring) becomes the app's own
// teal accent; its separate secondary "accent-2" (used only for the two
// tag flavors, e.g. the recurrence label) becomes the app's terracotta
// focus color.
const PEV_CSS = `
.pev {
  --pev-bg:            ${colors.bg};
  --pev-surface:       ${colors.surface};
  --pev-neutral-100:   ${colors.surface};
  --pev-neutral-500:   ${colors.textTertiary};
  --pev-neutral-600:   ${colors.textTertiary};
  --pev-neutral-700:   ${colors.textSecondary};
  --pev-neutral-800:   ${colors.textPrimary};
  --pev-text:          ${colors.textPrimary};
  --pev-divider:       ${colors.border};
  --pev-accent:        ${colors.accent};
  --pev-accent-100:    ${colors.accentSoft};
  --pev-accent-300:    ${colors.accentSoft};
  --pev-accent-400:    ${colors.accent};
  --pev-accent-700:    ${colors.accentHover};
  --pev-accent-2:      ${colors.focus};
  --pev-accent-2-100:  ${colors.focusBg};
  --pev-accent-2-700:  ${colors.focusHover};
  --pev-radius-sm:     8px;
  --pev-radius-md:     16px;
  --pev-radius-lg:     28px;
  --pev-shadow-sm:     0 1px 2px rgba(46,43,37,.14);
  --pev-shadow-md:     0 3px 10px rgba(46,43,37,.16);
  --pev-shadow-lg:     0 12px 32px rgba(46,43,37,.22);
  --pev-heading:       "Inter", system-ui, -apple-system, sans-serif;
  --pev-body:          "Inter", system-ui, -apple-system, sans-serif;

  background: var(--pev-bg);
  color: var(--pev-text);
  font-family: var(--pev-body);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.pev *, .pev *::before, .pev *::after { box-sizing: border-box; }
.pev h1, .pev h2, .pev p { margin: 0; }
.pev img { display: block; max-width: 100%; }
.pev a { color: inherit; text-decoration: none; }
.pev :focus-visible { outline: 2px solid var(--pev-accent); outline-offset: 2px; }

.pev-header {
  display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;
  background: var(--pev-neutral-100); border-bottom: 1px solid var(--pev-divider);
  padding: 18px 32px;
}
.pev-brand { display: flex; align-items: center; gap: 12px; }
.pev-brand-name { font-family: var(--pev-heading); font-weight: 700; font-size: 17px; line-height: 1.2; }
.pev-brand-sub { font-size: 12px; text-transform: uppercase; letter-spacing: .09em; color: var(--pev-neutral-700); }
.pev-nav { display: flex; gap: 22px; flex-wrap: wrap; }
.pev-nav a { font-size: 14px; font-weight: 600; color: var(--pev-neutral-700); }
.pev-nav a.active { color: var(--pev-accent-700); border-bottom: 2px solid var(--pev-accent); padding-bottom: 3px; }

.pev-main {
  max-width: 1280px; margin: 0 auto; padding: 48px 32px 72px;
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 48px;
}
.pev-content { flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 56px; scroll-margin-top: 24px; }
.pev-sidebar { flex: 0 1 300px; min-width: 260px; max-width: 340px; position: sticky; top: 24px; }

.pev-tag {
  display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700;
  padding: 5px 12px; border-radius: 999px; white-space: nowrap;
}
.pev-tag-accent { background: var(--pev-accent-100); color: var(--pev-accent-700); }
.pev-tag-accent-2 { background: var(--pev-accent-2-100); color: var(--pev-accent-2-700); }

.pev-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border-radius: 999px; font-family: var(--pev-body); font-weight: 600; font-size: 14px;
  padding: 12px 22px; border: none; cursor: pointer;
}
.pev-btn-primary { background: var(--pev-accent); color: #fff; }
.pev-btn-primary:hover { background: var(--pev-accent-700); }
.pev-btn-secondary { background: var(--pev-neutral-100); color: var(--pev-text); border: 1px solid var(--pev-divider); }
.pev-btn-secondary:hover { border-color: var(--pev-accent-400); }
.pev-btn-ghost {
  background: transparent; color: var(--pev-accent-700); border: 1px solid var(--pev-accent-300);
  padding: 6px 14px; font-size: 13px; font-weight: 600; gap: 7px;
}
.pev-btn-ghost:hover { background: var(--pev-accent-100); }

.pev-washed { border-radius: var(--pev-radius-lg); overflow: hidden; box-shadow: var(--pev-shadow-md); background: var(--pev-surface); }

.pev-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 40px; align-items: center; }
.pev-hero-left { display: flex; flex-direction: column; gap: 18px; }
.pev-hero-tags { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pev-title { font-family: var(--pev-heading); font-weight: 700; font-size: clamp(38px, 5.6vw, 64px); line-height: 1.02; letter-spacing: -.01em; text-wrap: balance; }
.pev-tagline { font-size: 19px; line-height: 1.55; max-width: 44ch; color: var(--pev-neutral-800); text-wrap: pretty; }
.pev-hero-photo { aspect-ratio: 4/3; }
.pev-hero-photo img { width: 100%; height: 100%; object-fit: cover; }

.pev-details {
  background: var(--pev-neutral-100); border-radius: var(--pev-radius-lg); box-shadow: var(--pev-shadow-sm);
  padding: 34px 36px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 34px; align-items: center;
}
.pev-details-left { display: flex; flex-direction: column; gap: 10px; }
.pev-date { font-family: var(--pev-heading); font-weight: 700; font-size: clamp(30px, 3.4vw, 42px); line-height: 1.1; }
.pev-time { font-size: 17px; font-weight: 600; color: var(--pev-neutral-800); }
.pev-status-note { font-size: 15px; line-height: 1.5; color: var(--pev-neutral-700); max-width: 38ch; }
.pev-details-right { display: flex; flex-direction: column; gap: 14px; }
.pev-price-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.pev-price { font-family: var(--pev-heading); font-weight: 700; font-size: 44px; color: var(--pev-accent-700); }
.pev-price-unit { font-size: 15px; font-weight: 600; color: var(--pev-neutral-700); }
.pev-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.pev-admission-note { font-size: 14px; color: var(--pev-neutral-700); }

.pev-includes { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 40px; align-items: start; }
.pev-includes-left { display: flex; flex-direction: column; gap: 18px; }
.pev-includes-heading { font-family: var(--pev-heading); font-weight: 700; font-size: 30px; }
.pev-includes-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.pev-includes-list li { display: flex; align-items: baseline; gap: 12px; font-size: 17px; line-height: 1.45; }
.pev-includes-list li::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--pev-accent); flex: none; transform: translateY(-2px); }
.pev-description { font-size: 17px; line-height: 1.6; max-width: 46ch; white-space: pre-wrap; color: var(--pev-text); }
.pev-includes-photo { aspect-ratio: 1/1; }
.pev-includes-photo img { width: 100%; height: 100%; object-fit: cover; }

.pev-sidebar-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.pev-sidebar-title { font-family: var(--pev-heading); font-weight: 700; font-size: 22px; }
.pev-sidebar-link { font-size: 13px; font-weight: 600; color: var(--pev-accent-700); }
.pev-sidebar-list { display: flex; flex-direction: column; gap: 8px; max-height: 64vh; overflow-y: auto; }
.pev-row {
  display: flex; align-items: center; gap: 14px; padding: 12px 13px; border-radius: var(--pev-radius-md);
  border: 1px solid var(--pev-divider); background: var(--pev-neutral-100); cursor: pointer;
}
.pev-row:hover { border-color: var(--pev-accent-400); }
.pev-row.selected { border-color: var(--pev-accent); background: var(--pev-accent-100); }
.pev-row-date { width: 44px; flex: none; text-align: center; }
.pev-row-month { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--pev-accent-700); }
.pev-row-day { font-family: var(--pev-heading); font-weight: 700; font-size: 22px; line-height: 1.1; }
.pev-row-body { flex: 1; min-width: 0; }
.pev-row-title { font-size: 15px; font-weight: 700; line-height: 1.25; }
.pev-row-meta { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--pev-neutral-700); margin-top: 3px; }
.pev-row-tag { font-size: 11.5px; flex: none; }
.pev-sidebar-footnote { font-size: 12.5px; line-height: 1.5; color: var(--pev-neutral-700); margin-top: 14px; }

.pev-footer {
  background: var(--pev-neutral-100); border-top: 1px solid var(--pev-divider);
  padding: 32px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
}
.pev-footer-links { display: flex; gap: 18px; flex-wrap: wrap; font-size: 14px; color: var(--pev-neutral-700); }
.pev-footer-copy { font-size: 13px; color: var(--pev-neutral-600); }

.pev-empty { max-width: 480px; margin: 80px auto; text-align: center; display: flex; flex-direction: column; gap: 10px; padding: 0 24px; }
.pev-empty-title { font-family: var(--pev-heading); font-weight: 700; font-size: 28px; }

@media (max-width: 640px) {
  .pev-main { padding: 32px 20px 56px; gap: 36px; }
  .pev-details { padding: 26px 22px; }
}
`;

// Maps the app's existing embed-theme query params onto this design's
// --pev-* surface — only params actually present in the URL are set,
// everything else falls through to PEV_CSS's own commissioned defaults.
function pevStyleVars(theme, font) {
  const vars = {};
  if (theme.accent) { vars["--pev-accent"] = theme.accent; vars["--pev-accent-700"] = theme.accent; }
  if (theme.bg) vars["--pev-bg"] = theme.bg;
  if (theme.surface) { vars["--pev-neutral-100"] = theme.surface; vars["--pev-surface"] = theme.surface; }
  if (theme.textPrimary) vars["--pev-text"] = theme.textPrimary;
  if (theme.textSecondary) { vars["--pev-neutral-700"] = theme.textSecondary; vars["--pev-neutral-800"] = theme.textSecondary; }
  if (theme.border) vars["--pev-divider"] = theme.border;
  if (font) vars["--pev-body"] = `"${font}", system-ui, -apple-system, sans-serif`;
  return vars;
}

function ClockIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
}
function PinIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>;
}
function ResetIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>;
}

function formatDateLong(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
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
  const initialized = useRef(false);
  const contentRef = useRef(null);
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");

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
  }, [embed, events, selectedIndex]);

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
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) return <PevCentered>This page isn't available.</PevCentered>;
  if (orgName === null) return <PevCentered>Loading…</PevCentered>;

  return (
    <div ref={containerRef} className="pev" style={pevStyleVars(theme, font)}>
      <style>{PEV_CSS}</style>

      {!embed && (
        <header className="pev-header">
          <div className="pev-brand">
            <img src={logo} alt="" style={{ width: 38, height: 38, objectFit: "contain" }} />
            <div>
              <div className="pev-brand-name">{orgName}</div>
              <div className="pev-brand-sub">Events</div>
            </div>
          </div>
          <nav className="pev-nav">
            <a href={`/calendar/${slug}`}>Calendar</a>
            <a className="active" href={`/events/${slug}`}>Events</a>
          </nav>
        </header>
      )}

      {events.length === 0 ? (
        <div className="pev-empty">
          <div className="pev-empty-title">No upcoming events right now</div>
          <p style={{ color: "var(--pev-neutral-700)", fontSize: 15 }}>Check back soon — new events are posted here as they're scheduled.</p>
        </div>
      ) : (
        <main className="pev-main">
          <div className="pev-content" ref={contentRef}>
            <section className="pev-hero">
              <div className="pev-hero-left">
                <div className="pev-hero-tags">
                  {event.recurrenceLabel && <span className="pev-tag pev-tag-accent-2">{event.recurrenceLabel}</span>}
                  {!isDefault && (
                    <button type="button" className="pev-btn pev-btn-ghost" onClick={() => selectEvent(0)}>
                      <ResetIcon /> Back to the next event
                    </button>
                  )}
                </div>
                <h1 className="pev-title">{event.title}</h1>
                {event.tagline && <p className="pev-tagline">{event.tagline}</p>}
              </div>
              {event.heroImage && (
                <div className="pev-washed pev-hero-photo">
                  <img src={event.heroImage} alt="" />
                </div>
              )}
            </section>

            <section className="pev-details">
              <div className="pev-details-left">
                <span className={`pev-tag ${isDefault ? "pev-tag-accent-2" : "pev-tag-accent"}`}>
                  {isDefault ? "Next up" : "Later this season"}
                </span>
                <div className="pev-date">{formatDateLong(event.startAt)}</div>
                <div className="pev-time">{formatTimeLabel(event.startAt, event.endAt, event.allDay)}</div>
                {event.statusNote && <div className="pev-status-note">{event.statusNote}</div>}
              </div>
              <div className="pev-details-right">
                {event.price && (
                  <div className="pev-price-row">
                    <span className="pev-price">{event.price}</span>
                    {event.priceUnit && <span className="pev-price-unit">{event.priceUnit}</span>}
                  </div>
                )}
                {(event.payUrl || event.reservePhone) && (
                  <div className="pev-actions">
                    {event.payUrl && <a className="pev-btn pev-btn-primary" href={event.payUrl} target="_blank" rel="noreferrer">Order &amp; pay online</a>}
                    {event.reservePhone && <a className="pev-btn pev-btn-secondary" href={`tel:${event.reservePhone}`}>Reserve by phone</a>}
                  </div>
                )}
                {event.admissionNote && <div className="pev-admission-note">{event.admissionNote}</div>}
              </div>
            </section>

            {(event.includesHeading || (event.includes && event.includes.length > 0) || event.description || event.secondaryImage) && (
              <section className="pev-includes">
                <div className="pev-includes-left">
                  {event.includesHeading && <h2 className="pev-includes-heading">{event.includesHeading}</h2>}
                  {event.includes && event.includes.length > 0 && (
                    <ul className="pev-includes-list">
                      {event.includes.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  )}
                  {event.description && <p className="pev-description">{event.description}</p>}
                </div>
                {event.secondaryImage && (
                  <div className="pev-washed pev-includes-photo">
                    <img src={event.secondaryImage} alt="" />
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="pev-sidebar">
            <div className="pev-sidebar-header">
              <h2 className="pev-sidebar-title">Coming up</h2>
              <a className="pev-sidebar-link" href={`/calendar/${slug}`}>Full calendar</a>
            </div>
            <div className="pev-sidebar-list">
              {events.map((e, i) => {
                const { month, day } = monthDay(e.startAt);
                const selected = i === clampedIndex;
                return (
                  <div
                    key={e.slug}
                    role="button" tabIndex={0}
                    className={`pev-row${selected ? " selected" : ""}`}
                    onClick={() => selectEvent(i)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectEvent(i); } }}
                  >
                    <div className="pev-row-date">
                      <div className="pev-row-month">{month}</div>
                      <div className="pev-row-day">{day}</div>
                    </div>
                    <div className="pev-row-body">
                      <div className="pev-row-title">{e.shortTitle || e.title}</div>
                      {!e.allDay && (
                        <div className="pev-row-meta"><ClockIcon /> {formatTimeLabel(e.startAt, e.endAt, e.allDay)}</div>
                      )}
                      {e.location && <div className="pev-row-meta"><PinIcon /> {e.location}</div>}
                    </div>
                    <span className={`pev-tag ${selected ? "pev-tag-accent" : "pev-tag-accent-2"} pev-row-tag`}>
                      {selected ? "Showing" : (e.price || "")}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="pev-sidebar-footnote">Click any event above to see its full details.</div>
          </aside>
        </main>
      )}

      {!embed && (
        <footer className="pev-footer">
          <div className="pev-footer-links">
            <a href={`/calendar/${slug}`}>Calendar</a>
          </div>
          <div className="pev-footer-copy">© {new Date().getFullYear()} {orgName}</div>
        </footer>
      )}
    </div>
  );
}

function PevCentered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5ead8", color: "#645c50", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      {children}
    </div>
  );
}
