import React, { useEffect, useState } from "react";
import { colors, card, button } from "../lib/tokens";
import { api } from "../lib/api";
import { formatPhone } from "../lib/phone";
import DataList from "../components/DataList";
import PublicLinkBox from "../components/PublicLinkBox";

// Events' marketing tools — public link/embed plus a per-event flyer
// download — relocated out of ManageEvents.jsx into the Marketing tab.
// Events has no "selected event" concept the way Golf/Tournaments have a
// selected tournament (the flyer button was always a per-row action in the
// full events list, not behind a picker), so this fetches that same list
// itself rather than needing anything passed down from App.jsx.
export default function MarketingEvents() {
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [flyerBusyId, setFlyerBusyId] = useState(null);
  const [flyerError, setFlyerError] = useState("");

  useEffect(() => {
    api.listEvents().then((rows) => { setEvents(rows); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  async function downloadFlyer(event) {
    setFlyerBusyId(event.id);
    setFlyerError("");
    try {
      await api.downloadEventFlyerPdf(event.id, event.title);
    } catch (err) {
      setFlyerError(err.message);
    } finally {
      setFlyerBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PublicLinkBox
        basePath="events"
        embedBasePath="events/embed"
        embedTitle="Events"
        description="Set a link so visitors can see your published events and how to reserve or pay."
      />

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Flyers</div>
          <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>Download a printable flyer for any event.</div>
        </div>

        {flyerError && <div style={{ padding: "10px 18px 0", color: colors.danger, fontSize: 12.5, fontWeight: 600 }}>{flyerError}</div>}

        {loaded && (
          <DataList
            rows={events}
            emptyMessage="No events yet."
            columns={[
              {
                key: "title", label: "Event", grid: "1.8fr", primary: true,
                render: (e) => (
                  <>
                    <div style={{ fontWeight: 600 }}>{e.title}</div>
                    {e.location && <div style={{ fontSize: 11.5, fontWeight: 400, color: colors.textSecondary, marginTop: 1 }}>{e.location}</div>}
                  </>
                ),
              },
              {
                key: "when", label: "When", grid: "1.3fr",
                render: (e) => new Date(e.startAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: e.allDay ? undefined : "short" }),
              },
              {
                key: "actions", label: "", grid: "1fr", footerRow: true,
                render: (e) => {
                  const flyerBusy = flyerBusyId === e.id;
                  return (
                    <button style={{ ...button.ghost, padding: "5px 10px", fontSize: 12 }} disabled={flyerBusy} onClick={() => downloadFlyer(e)}>
                      {flyerBusy ? "Preparing…" : "Download flyer"}
                    </button>
                  );
                },
              },
            ]}
          />
        )}
      </div>

      <InterestSignupsCard />
    </div>
  );
}

// Org-wide leads captured from the public Events page's "Notify me" form
// while nothing was published (see PublicEvents.jsx's empty-state
// NotifyForm). Direct port of MarketingTournaments.jsx's own
// InterestSignupsCard, minus the "Interested in" type column — Events has
// no type concept.
function InterestSignupsCard() {
  const [signups, setSignups] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  function reload() {
    api.listEventInterestSignups().then(setSignups).catch((err) => setError(err.message));
  }
  useEffect(reload, []);

  async function toggleContacted(signup) {
    setBusyId(signup.id);
    setError("");
    try {
      const updated = await api.setEventInterestSignupContacted(signup.id, !signup.contactedAt);
      setSignups((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${colors.borderLight}` }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Interest signups</div>
        <div style={{ fontSize: 11.5, color: colors.textSecondary, marginTop: 2 }}>
          People who asked to be notified when your next event is posted.
        </div>
        {error && <div style={{ color: colors.danger, fontSize: 12.5, marginTop: 6 }}>{error}</div>}
      </div>
      <DataList
        rows={signups}
        emptyMessage="No one has signed up for a notification yet."
        columns={[
          { key: "name", label: "Name", grid: "1.2fr", primary: true, render: (s) => s.name },
          {
            key: "contact", label: "Contact", grid: "1.4fr",
            render: (s) => [s.email, s.phone && formatPhone(s.phone)].filter(Boolean).join(" · ") || "—",
          },
          { key: "note", label: "Note", grid: "1.2fr", render: (s) => s.note || "—" },
          { key: "submitted", label: "Submitted", grid: "1fr", render: (s) => new Date(s.createdAt).toLocaleString() },
          {
            key: "actions", label: "", footerRow: true,
            render: (s) => (
              <button
                style={{ ...button.ghost, padding: "5px 10px", fontSize: 12, color: s.contactedAt ? colors.textSecondary : undefined }}
                disabled={busyId === s.id}
                onClick={() => toggleContacted(s)}
              >
                {busyId === s.id ? "Working…" : s.contactedAt ? "Contacted ✓" : "Mark contacted"}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}
