import React, { useEffect, useRef, useState } from "react";
import { publicApi } from "../lib/api";
import { colors } from "../lib/tokens";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import logo from "../assets/logo.png";

// One page/embed listing everything currently public across every
// module — a golf tournament, a Tournaments-module tournament, a
// published Event, an active Raffle, or a manual public Calendar entry.
// Reads the shared feed calendarSync.js already keeps up to date
// (publicActivities.js's GET /:slug); this page has no logic of its own
// beyond presenting that list. Every row with a real page to go to
// (everything except a raffle announcement) is a link straight to that
// module's own existing page — registration, payment, and rosters all
// stay exactly where they already work.
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
.pac-main { max-width: 760px; margin: 0 auto; padding: 32px 24px 72px; display: flex; flex-direction: column; gap: 14px; }
.pac-empty { text-align: center; color: var(--pac-text-secondary); font-size: 14px; padding: 60px 20px; }
.pac-row {
  display: flex; gap: 18px; align-items: flex-start; padding: 18px 20px;
  background: var(--pac-surface); border: 1px solid var(--pac-border); border-radius: 12px;
  text-decoration: none; color: inherit;
}
a.pac-row:hover { border-color: var(--pac-accent); }
.pac-row-date { flex: none; width: 58px; text-align: center; }
.pac-row-month { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--pac-accent); }
.pac-row-day { font-size: 22px; font-weight: 700; line-height: 1.15; }
.pac-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.pac-row-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pac-row-title { font-size: 16px; font-weight: 700; }
.pac-badge {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 3px 9px; border-radius: 999px; background: var(--pac-accent-bg); color: var(--pac-accent); white-space: nowrap;
}
.pac-row-meta { font-size: 13px; color: var(--pac-text-secondary); }
.pac-row-desc { font-size: 13.5px; color: var(--pac-text-secondary); line-height: 1.5; }
`;

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

export default function PublicActivities({ slug, embed }) {
  const [orgName, setOrgName] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font);

  useEffect(() => {
    publicApi.getActivitiesPage(slug)
      .then((data) => { setOrgName(data.orgName); setActivities(data.activities); })
      .catch((err) => setError(err.message));
  }, [slug]);

  useEffect(() => {
    if (!embed || !containerRef.current) return;
    const el = containerRef.current;
    const post = () => postEmbedResize(el.scrollHeight);
    post();
    const observer = new ResizeObserver(post);
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed, activities]);

  if (error) return <Centered embed={embed}>This page isn't available.</Centered>;
  if (orgName === null) return <Centered embed={embed}>Loading…</Centered>;

  return (
    <div ref={containerRef} className="pac" style={{ fontFamily: font ? `"${font}", sans-serif` : undefined }}>
      <style>{PAC_CSS}</style>

      {!embed && (
        <header className="pac-header">
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div className="pac-header-name">{orgName} — Activities</div>
        </header>
      )}

      <main className="pac-main">
        {activities.length === 0 ? (
          <div className="pac-empty">Nothing coming up right now — check back soon.</div>
        ) : (
          activities.map((a) => <ActivityRow key={a.id} activity={a} />)
        )}
      </main>
    </div>
  );
}

function ActivityRow({ activity }) {
  const { month, day } = monthDay(activity.startAt);
  const badge = SOURCE_LABELS[activity.source];
  const body = (
    <>
      <div className="pac-row-date">
        <div className="pac-row-month">{month}</div>
        <div className="pac-row-day">{day}</div>
      </div>
      <div className="pac-row-body">
        <div className="pac-row-top">
          <div className="pac-row-title">{activity.title}</div>
          {badge && <span className="pac-badge">{badge}</span>}
        </div>
        {activity.location && <div className="pac-row-meta">{activity.location}</div>}
        {activity.description && <div className="pac-row-desc">{activity.description}</div>}
      </div>
    </>
  );

  // A raffle announcement has no page to send anyone to (see
  // calendarSync.js's publishRaffleGame) — every other source always
  // carries a linkUrl straight to its own real page.
  if (activity.linkUrl) {
    return <a className="pac-row" href={activity.linkUrl} target="_blank" rel="noreferrer">{body}</a>;
  }
  return <div className="pac-row">{body}</div>;
}

function Centered({ children, embed }) {
  return (
    <div style={{ minHeight: embed ? 200 : "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: colors.textSecondary, fontSize: 14, fontFamily: "sans-serif" }}>
      {children}
    </div>
  );
}
