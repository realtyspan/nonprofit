import React, { useEffect, useRef, useState } from "react";
import { publicApi } from "../lib/api";
import { colors, money } from "../lib/tokens";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import { EVT_CSS, evtStyleVars, TournamentVisual, FooterContact } from "../components/TournamentVisual";
import logo from "../assets/logo.png";

// One page listing everything currently public across every module, with
// a generated detail view for whichever one is selected shown right on
// this same page — no navigation, and no page for the org to build
// themselves. A golf tournament, a Tournaments-module tournament, and a
// published Event already have their own real registration/payment page;
// the detail shown here is a preview generated from that same record's
// own input, with a button handing off to the real page only once
// someone's ready to actually register or pay. Raffle and a plain manual
// Calendar entry have no page to hand off to — the generated card here
// *is* the page for those.
const PAC_CSS = `
.pac {
  --pac-bg: ${colors.bg};
  --pac-surface: #fff;
  --pac-border: ${colors.border};
  --pac-text: ${colors.textPrimary};
  --pac-text-secondary: ${colors.textSecondary};
  --pac-accent: ${colors.accent};
  --pac-accent-bg: ${colors.accentSoft};
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  background: var(--pac-bg);
  color: var(--pac-text);
  min-height: 100vh;
}
.pac-header {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 32px; border-bottom: 1px solid var(--pac-border); background: var(--pac-surface);
}
.pac-header-name { font-weight: 700; font-size: 15px; }
.pac-layout { max-width: 1040px; margin: 0 auto; padding: 32px 24px 72px; display: flex; flex-wrap: wrap-reverse; gap: 28px; align-items: flex-start; }
.pac-detail { flex: 1 1 420px; min-width: 0; }
.pac-list-col { flex: 0 1 300px; min-width: 260px; max-width: 340px; position: sticky; top: 24px; display: flex; flex-direction: column; gap: 8px; }
.pac-list-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--pac-text-secondary); margin-bottom: 2px; }
.pac-empty { text-align: center; color: var(--pac-text-secondary); font-size: 14px; padding: 60px 20px; }
.pac-row {
  display: flex; gap: 14px; align-items: flex-start; padding: 12px 14px;
  background: var(--pac-surface); border: 1px solid var(--pac-border); border-radius: 10px;
  cursor: pointer; text-align: left; width: 100%; font: inherit; color: inherit;
}
.pac-row:hover { border-color: var(--pac-accent); }
.pac-row.selected { border-color: var(--pac-accent); background: var(--pac-accent-bg); }
.pac-row-date { flex: none; width: 46px; text-align: center; }
.pac-row-month { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--pac-accent); }
.pac-row-day { font-size: 19px; font-weight: 700; line-height: 1.15; }
.pac-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pac-row-title { font-size: 14px; font-weight: 700; line-height: 1.25; }
.pac-badge {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  color: var(--pac-accent);
}
.pac-row-meta { font-size: 12px; color: var(--pac-text-secondary); }

.pac-card {
  background: var(--pac-surface); border: 1px solid var(--pac-border); border-radius: 12px;
  padding: 26px 28px; display: flex; flex-direction: column; gap: 12px;
}
.pac-card-badge {
  display: inline-block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 3px 10px; border-radius: 999px; background: var(--pac-accent-bg); color: var(--pac-accent); width: fit-content;
}
.pac-card-title { font-size: 24px; font-weight: 700; text-wrap: balance; }
.pac-card-meta { font-size: 13.5px; color: var(--pac-text-secondary); }
.pac-card-desc { font-size: 14px; line-height: 1.6; color: var(--pac-text); white-space: pre-wrap; }
.pac-card-image { width: 100%; max-height: 260px; object-fit: cover; border-radius: 10px; }
.pac-card-includes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
.pac-card-includes li::before { content: "• "; color: var(--pac-accent); font-weight: 700; }
.pac-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 22px; border-radius: 8px; font-size: 14px; font-weight: 600;
  background: var(--pac-accent); color: #fff; text-decoration: none; width: fit-content;
}
.pac-loading { color: var(--pac-text-secondary); font-size: 13.5px; padding: 40px 0; text-align: center; }

@media (max-width: 720px) {
  .pac-layout { padding: 20px 16px 48px; }
  .pac-list-col { position: static; max-width: none; }
}
`;

// Maps the shared embed-theme query params (see embedTheme.js) onto this
// page's own CSS variables — same pattern as PublicEvents.jsx's
// pevStyleVars. Applied as an inline style on the root element so it wins
// over PAC_CSS's baked-in defaults.
function pacStyleVars(theme, font) {
  const vars = {};
  if (theme.accent) vars["--pac-accent"] = theme.accent;
  if (theme.bg) vars["--pac-bg"] = theme.bg;
  if (theme.surface) vars["--pac-surface"] = theme.surface;
  if (theme.textPrimary) vars["--pac-text"] = theme.textPrimary;
  if (theme.textSecondary) vars["--pac-text-secondary"] = theme.textSecondary;
  if (theme.border) vars["--pac-border"] = theme.border;
  if (font) vars.fontFamily = `"${font}", sans-serif`;
  return vars;
}

const SOURCE_LABELS = {
  "golf-tournament": "Golf Tournament",
  tournament: "Tournament",
  event: "Event",
  "raffle-game": "Raffle",
};

function monthDay(iso) {
  const d = new Date(iso);
  return { month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(), day: d.getDate() };
}

function activityKey(a) {
  return `${a.source}:${a.source === "manual" ? a.id : a.sourceId}`;
}

export default function PublicActivities({ slug, embed }) {
  const [orgName, setOrgName] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailBusyKey, setDetailBusyKey] = useState(null);
  const [detailError, setDetailError] = useState("");
  const initialized = useRef(false);
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font);

  useEffect(() => {
    publicApi.getActivitiesPage(slug)
      .then((data) => {
        setOrgName(data.orgName);
        setActivities(data.activities);
        if (!initialized.current) {
          initialized.current = true;
          const wantedSource = params.get("source");
          const wantedId = params.get("id");
          const wanted = wantedSource && wantedId ? data.activities.find((a) => a.source === wantedSource && (a.source === "manual" ? a.id : a.sourceId) === wantedId) : null;
          setSelectedKey(wanted ? activityKey(wanted) : (data.activities[0] ? activityKey(data.activities[0]) : null));
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const selected = activities.find((a) => activityKey(a) === selectedKey) || null;

  // Fetch (and cache) the generated detail for whichever item is
  // selected — a manual entry needs no extra request, the list row
  // already has everything it has.
  useEffect(() => {
    if (!selected || selected.source === "manual" || detailCache[selectedKey]) return;
    setDetailBusyKey(selectedKey);
    setDetailError("");
    publicApi.getActivityDetail(slug, selected.source, selected.sourceId)
      .then((data) => setDetailCache((c) => ({ ...c, [selectedKey]: data })))
      .catch((err) => setDetailError(err.message))
      .finally(() => setDetailBusyKey(null));
  }, [selected, selectedKey, slug, detailCache]);

  useEffect(() => {
    if (!embed || !containerRef.current) return;
    const el = containerRef.current;
    const post = () => postEmbedResize(el.scrollHeight);
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed, activities, selectedKey, detailCache]);

  function selectActivity(a) {
    setSelectedKey(activityKey(a));
    const next = new URLSearchParams(window.location.search);
    next.set("source", a.source);
    next.set("id", a.source === "manual" ? a.id : a.sourceId);
    window.history.replaceState({}, "", `${window.location.pathname}?${next.toString()}`);
  }

  if (error) return <Centered embed={embed}>This page isn't available.</Centered>;
  if (orgName === null) return <Centered embed={embed}>Loading…</Centered>;

  return (
    <div ref={containerRef} className="pac" style={pacStyleVars(theme, font)}>
      <style>{PAC_CSS}</style>
      <style>{EVT_CSS}</style>

      {!embed && (
        <header className="pac-header">
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div className="pac-header-name">{orgName} — Activities</div>
        </header>
      )}

      <div className="pac-layout">
        <div className="pac-detail">
          {activities.length === 0 ? (
            <div className="pac-empty">Nothing coming up right now — check back soon.</div>
          ) : !selected ? null : selected.source === "manual" ? (
            <ManualDetail activity={selected} />
          ) : detailBusyKey === selectedKey ? (
            <div className="pac-loading">Loading…</div>
          ) : detailError ? (
            <div className="pac-loading">{detailError}</div>
          ) : detailCache[selectedKey] ? (
            <ActivityDetail activity={selected} detail={detailCache[selectedKey]} theme={theme} font={font} />
          ) : null}
        </div>

        {activities.length > 0 && (
          <div className="pac-list-col">
            <div className="pac-list-title">Coming up</div>
            {activities.map((a) => {
              const { month, day } = monthDay(a.startAt);
              const key = activityKey(a);
              return (
                <button key={key} type="button" className={`pac-row${key === selectedKey ? " selected" : ""}`} onClick={() => selectActivity(a)}>
                  <div className="pac-row-date">
                    <div className="pac-row-month">{month}</div>
                    <div className="pac-row-day">{day}</div>
                  </div>
                  <div className="pac-row-body">
                    <div className="pac-row-title">{a.title}</div>
                    {SOURCE_LABELS[a.source] && <div className="pac-badge">{SOURCE_LABELS[a.source]}</div>}
                    {a.location && <div className="pac-row-meta">{a.location}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// A tournament/golf-tournament detail is generated from the exact same
// input its own real page renders — TournamentVisual is reused as-is,
// unmodified, rather than reimplemented here.
function TournamentDetail({ activity, detail, theme, font }) {
  return (
    <div className="evt" style={evtStyleVars(theme, font)}>
      <div className="evt-card">
        <TournamentVisual tournament={detail} />
        <div className="evt-footer">
          <FooterContact tournament={detail} />
          {activity.linkUrl && (
            <div className="evt-footer-actions">
              <a className="evt-btn" href={activity.linkUrl} target="_blank" rel="noreferrer">Register</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventDetail({ detail }) {
  return (
    <div className="pac-card">
      <span className="pac-card-badge">Event</span>
      {detail.heroImage && <img className="pac-card-image" src={detail.heroImage} alt="" />}
      <div className="pac-card-title">{detail.title}</div>
      {detail.tagline && <div className="pac-card-meta">{detail.tagline}</div>}
      <div className="pac-card-meta">
        {new Date(detail.startAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        {!detail.allDay && ` · ${new Date(detail.startAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
        {detail.location ? ` · ${detail.location}` : ""}
      </div>
      {detail.statusNote && <div className="pac-card-meta">{detail.statusNote}</div>}
      {detail.price && (
        <div className="pac-card-meta"><strong style={{ color: "var(--pac-text)" }}>{detail.price}</strong>{detail.priceUnit ? ` ${detail.priceUnit}` : ""}</div>
      )}
      {/* Events have no registration form to protect — reserving is just a
          link or a phone number, so it renders right here instead of
          sending anyone to the separate Events page for it. */}
      {(detail.payUrl || detail.reservePhone) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {detail.payUrl && <a className="pac-btn" href={detail.payUrl} target="_blank" rel="noreferrer">Order &amp; pay online</a>}
          {detail.reservePhone && <a className="pac-btn" href={`tel:${detail.reservePhone}`}>Reserve by phone</a>}
        </div>
      )}
      {detail.admissionNote && <div className="pac-card-meta">{detail.admissionNote}</div>}
      {detail.includes?.length > 0 && (
        <ul className="pac-card-includes">
          {detail.includesHeading && <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>{detail.includesHeading}</div>}
          {detail.includes.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
      {detail.description && <div className="pac-card-desc">{detail.description}</div>}
    </div>
  );
}

function RaffleDetail({ detail }) {
  return (
    <div className="pac-card">
      <span className="pac-card-badge">Raffle</span>
      <div className="pac-card-title">{detail.name}</div>
      <div className="pac-card-meta">
        {money(detail.ticketPrice)}/ticket · {new Date(detail.raffleStartDate).toLocaleDateString()} – {new Date(detail.raffleEndDate).toLocaleDateString()}
      </div>
      {detail.eventVenue && <div className="pac-card-meta">{detail.eventVenue}</div>}
      {detail.eventDetails && <div className="pac-card-desc">{detail.eventDetails}</div>}
    </div>
  );
}

function ManualDetail({ activity }) {
  return (
    <div className="pac-card">
      <div className="pac-card-title">{activity.title}</div>
      <div className="pac-card-meta">
        {new Date(activity.startAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        {!activity.allDay && ` · ${new Date(activity.startAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
        {activity.location ? ` · ${activity.location}` : ""}
      </div>
      {activity.description && <div className="pac-card-desc">{activity.description}</div>}
    </div>
  );
}

function ActivityDetail({ activity, detail, theme, font }) {
  if (activity.source === "golf-tournament" || activity.source === "tournament") {
    return <TournamentDetail activity={activity} detail={detail} theme={theme} font={font} />;
  }
  if (activity.source === "event") return <EventDetail detail={detail} />;
  if (activity.source === "raffle-game") return <RaffleDetail detail={detail} />;
  return null;
}

function Centered({ children, embed }) {
  return (
    <div style={{ minHeight: embed ? 200 : "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: colors.textSecondary, fontSize: 14, fontFamily: "sans-serif" }}>
      {children}
    </div>
  );
}
