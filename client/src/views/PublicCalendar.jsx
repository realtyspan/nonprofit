import React, { useCallback, useEffect, useRef, useState } from "react";
import { colors } from "../lib/tokens";
import { publicApi } from "../lib/api";
import CalendarGrid from "../components/CalendarGrid";
import CalendarWeekGrid from "../components/CalendarWeekGrid";
import CalendarToolbar from "../components/CalendarToolbar";
import { monthLabel, weekLabel } from "../lib/calendarLabels";
import { parseThemeFromQuery, postEmbedResize, useGoogleFont } from "../lib/embedTheme";
import logo from "../assets/logo.png";

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - r.getDay());
  return r;
}

export default function PublicCalendar({ slug, embed }) {
  const [viewMode, setViewMode] = useState("month"); // "month" | "week"
  const [month, setMonth] = useState(() => new Date()); // anchor date — a day within the displayed month or week
  const [orgName, setOrgName] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const containerRef = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const theme = parseThemeFromQuery(params);
  const font = params.get("font");
  useGoogleFont(font);

  const refresh = useCallback(() => {
    let rangeStart, rangeEnd;
    if (viewMode === "week") {
      rangeStart = startOfWeek(month);
      rangeEnd = addDays(rangeStart, 7);
    } else {
      rangeStart = new Date(month.getFullYear(), month.getMonth(), -7);
      rangeEnd = new Date(month.getFullYear(), month.getMonth() + 1, 7);
    }
    publicApi.getCalendarPage(slug, rangeStart, rangeEnd)
      .then((data) => { setOrgName(data.orgName); setEvents(data.events); })
      .catch((err) => setError(err.message));
  }, [slug, month, viewMode]);

  useEffect(refresh, [refresh]);

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
  }, [embed, events, month, viewMode]);

  function changePeriod(delta) {
    if (viewMode === "week") {
      setMonth((m) => addDays(m, delta * 7));
    } else {
      setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
    }
  }

  const pageStyle = { minHeight: embed ? "auto" : "100vh", fontFamily: font ? `"${font}", sans-serif` : undefined };

  if (error) {
    return <Centered embed={embed}>This calendar isn't available.</Centered>;
  }
  if (orgName === null) {
    return <Centered embed={embed}>Loading…</Centered>;
  }

  return (
    <div ref={containerRef} style={{ ...pageStyle, background: embed ? (theme.bg || "transparent") : colors.bg }}>
      {!embed && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 32px", borderBottom: `1px solid ${colors.border}`, background: "#fff" }}>
          <img src={logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>{orgName} — Calendar</div>
        </header>
      )}

      <div style={embed ? { padding: 4 } : { maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ marginBottom: 12 }}>
          <CalendarToolbar
            periodLabel={viewMode === "week" ? weekLabel(month) : monthLabel(month)}
            onPrev={() => changePeriod(-1)}
            onNext={() => changePeriod(1)}
            onToday={() => setMonth(new Date())}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            theme={theme}
          />
        </div>

        {viewMode === "month" ? (
          <CalendarGrid month={month} events={events} theme={theme} onSelectEvent={setSelectedEvent} />
        ) : (
          <CalendarWeekGrid anchorDate={month} events={events} theme={theme} onSelectEvent={setSelectedEvent} />
        )}
      </div>

      {selectedEvent && <EventInfoModal event={selectedEvent} theme={theme} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

function formatTimeRange(event) {
  if (event.allDay) return "All day";
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${new Date(event.startAt).toLocaleTimeString(undefined, opts)} – ${new Date(event.endAt).toLocaleTimeString(undefined, opts)}`;
}

// Deliberately just title + time + description — no date, since the visitor
// already clicked a specific day to get here and repeating it adds nothing.
function EventInfoModal({ event, theme, onClose }) {
  const t = { ...colors, ...theme };
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 340, maxWidth: "100%", background: t.surface || "#fff", color: t.textPrimary, borderRadius: 14, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{event.title}</div>
        <div style={{ fontSize: 13, color: t.textSecondary, marginBottom: 4 }}>{formatTimeRange(event)}</div>
        {event.location && <div style={{ fontSize: 13, color: t.textSecondary, marginBottom: 12 }}>📍 {event.location}</div>}
        {event.description && <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{event.description}</div>}
        {event.linkUrl && (
          <div style={{ marginTop: 10 }}>
            <a href={event.linkUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: t.accent, fontWeight: 600 }}>
              More info ↗
            </a>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textSecondary, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children, embed }) {
  return <div style={{ minHeight: embed ? 200 : "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: colors.textSecondary, fontSize: 14 }}>{children}</div>;
}
