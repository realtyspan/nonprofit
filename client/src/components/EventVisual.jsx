import React from "react";
import { EVT_CSS, RailCell, CalendarIcon, CheckIcon, FlagIcon } from "./TournamentVisual";
import { formatPhone } from "../lib/phone";
import defaultHeroImage from "../assets/event-default-hero.jpg";

// Adapts the same .evt design system TournamentVisual already renders for
// Golf/Tournaments onto an Event — reusing EVT_CSS/RailCell/icons directly
// (shared visual infrastructure, same as PublicActivities.jsx already does)
// rather than duplicating the stylesheet, but with its own shaping function
// since Events carries a different field set (a freeform description and a
// secondary photo that Tournaments has no equivalent for; no format/venue/
// schedule-timeline that Events has no equivalent for). A few small
// additions on top of EVT_CSS below cover exactly that gap — nothing here
// touches TournamentVisual.jsx or Golf's/Tournaments' own rendering.
export const EVENT_EXTRA_CSS = `
.evt-title-sub { font-size: 15px; color: var(--evt-surface); opacity: .85; margin-top: -2px; }
.evt-pill {
  display: inline-flex; align-items: center; width: fit-content;
  background: color-mix(in srgb, var(--evt-accent) 18%, white); color: var(--evt-accent-deep);
  border-radius: 999px; padding: 5px 12px; font-size: 11px; font-weight: 700;
  letter-spacing: .02em;
}
.evt-description { font-size: 14.5px; line-height: 1.65; color: var(--evt-ink-2); white-space: pre-wrap; }
.evt-about-photo { flex: none; width: 220px; border-radius: var(--evt-radius-sm); overflow: hidden; }
.evt-about-photo img { width: 100%; height: 100%; object-fit: cover; }

@media (max-width: 780px) {
  .evt-about-row { flex-direction: column; }
  .evt-about-photo { width: 100%; aspect-ratio: 16/9; }
}
`;

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function EventVisual({ event, notice }) {
  const dateLabel = new Date(event.startAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeLabel = event.allDay ? "All day" : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`;
  const railCells = [event.location && "location", event.price && "price"].filter(Boolean);

  // Every event shows a hero photo now — the org's own upload if they have
  // one, otherwise Charity Pulse's own default event graphic, same fallback
  // convention Golf already uses for a tournament with no flyer image.
  const heroImage = event.heroImage || defaultHeroImage;

  return (
    <>
      <div className="evt-hero">
        <img className="evt-hero-img" src={heroImage} alt="" />
        <div className="evt-hero-scrim" />
        <div className="evt-hero-text">
          <h2 className="evt-title">{event.title}</h2>
          {event.tagline && <p className="evt-title-sub">{event.tagline}</p>}
        </div>
      </div>

      {notice && <div className="evt-notice">{notice}</div>}

      {railCells.length > 0 && (
        <div className="evt-rail" style={{ gridTemplateColumns: `repeat(${railCells.length}, minmax(0, 1fr))` }}>
          <RailCell label="Where" value={event.location} />
          <RailCell label="Price" value={event.price ? `${event.price}${event.priceUnit ? ` ${event.priceUnit}` : ""}` : null} />
        </div>
      )}

      <div className="evt-body">
        <div className="evt-top-row">
          {event.includes?.length > 0 && (
            <div className="evt-included-col evt-section">
              <p className="evt-section-title"><FlagIcon /><strong className="evt-strong">{event.includesHeading || "What's Included"}</strong></p>
              <div className="evt-included-grid">
                {event.includes.map((item, i) => <div key={i} className="evt-included-item"><CheckIcon />{item}</div>)}
              </div>
            </div>
          )}
          <div className="evt-schedule-col evt-section">
            <p className="evt-section-title"><CalendarIcon /><strong className="evt-strong">When</strong></p>
            <div className="evt-date-pill">{dateLabel}{!event.allDay && ` · ${timeLabel}`}</div>
            {event.scheduleItems?.length > 0 && (
              <div className="evt-timeline">
                {event.scheduleItems.map((item, i) => (
                  <div key={i} className="evt-timeline-row">
                    <span className="evt-timeline-time">{item.time}</span>
                    <span className="evt-timeline-rule" />
                    <span className="evt-timeline-label">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {(event.description || event.secondaryImage) && (
          <div className="evt-section evt-about-row" style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
            {event.description && <p className="evt-description" style={{ flex: 1, minWidth: 0 }}>{event.description}</p>}
            {event.secondaryImage && (
              <div className="evt-about-photo"><img src={event.secondaryImage} alt="" /></div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// The event's footer contact block — mirrors TournamentVisual's FooterContact
// (name / phone shown as text + tap-to-call / email), plus the admission note
// underneath. Rendered inside the page's own `.evt-footer` alongside the
// "Order & pay online" action. Returns null when there's nothing to show.
export function EventFooterContact({ event }) {
  const hasContact = !!(event.contactName || event.reservePhone || event.contactEmail);
  if (!hasContact && !event.admissionNote) return null;
  return (
    <div className="evt-footer-contact">
      {hasContact && <p className="evt-footer-contact-label">Questions or reservations?</p>}
      {event.contactName && <p className="evt-footer-contact-name">{event.contactName}</p>}
      {event.reservePhone && (
        <a href={`tel:${String(event.reservePhone).replace(/[^\d+]/g, "")}`}>{formatPhone(event.reservePhone)}</a>
      )}
      {event.contactEmail && <a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a>}
      {event.admissionNote && (
        <p style={{ fontSize: 12.5, color: "var(--evt-ink-muted)", marginTop: hasContact ? 6 : 0 }}>{event.admissionNote}</p>
      )}
    </div>
  );
}

export { EVT_CSS };
