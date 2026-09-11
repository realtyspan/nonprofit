import React, { useState } from "react";
import { EVT_CSS, RailCell, CalendarIcon, CheckIcon, FlagIcon } from "./TournamentVisual";
import { formatPhone, stripPhone } from "../lib/phone";
import { publicApi } from "../lib/api";
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
.evt-btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  padding: 13px 29px; border-radius: var(--evt-radius-sm);
  font-size: 15px; font-weight: 500; line-height: 1; letter-spacing: -.005em;
  font-family: inherit; cursor: pointer; text-decoration: none;
  background: transparent; color: var(--evt-accent-deep); border: 1px solid var(--evt-accent-deep);
  transition: background .16s;
}
.evt-btn-secondary:hover { background: color-mix(in srgb, var(--evt-accent) 14%, white); }
.evt-btn-secondary:disabled { opacity: .6; cursor: default; }
.evt-reservations-closed { font-size: 12.5px; color: var(--evt-ink-muted); }

@media (max-width: 780px) {
  .evt-about-row { flex-direction: column; }
  .evt-about-photo { width: 100%; aspect-ratio: 16/9; }
}
`;

// De-dupes priceUnit when it just repeats price — several events store e.g.
// price:"$100" / priceUnit:"$100", which otherwise renders "$100 $100".
// Mirrors eventFlyerPdf.js's own priceParts logic so the web page and the
// flyer never disagree.
function priceLabel(event) {
  const unit = event.priceUnit && event.priceUnit.trim();
  return unit && unit !== (event.price || "").trim() ? `${event.price} ${unit}` : event.price;
}

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
          <RailCell label="Price" value={event.price ? priceLabel(event) : null} />
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

// Whether an event's reservation window is still open — no deadline set
// means "until the event starts" (the public route enforces the same,
// server-side); a deadline that's passed closes the form.
export function reservationsOpen(event) {
  if (!event.reservationsEnabled) return false;
  if (!event.reservationDeadline) return true;
  return new Date() < new Date(event.reservationDeadline);
}

// The "Reserve a meal" form — a public, no-payment headcount reservation
// for one event (see publicEvents.js's POST /:slug/reserve). Rendered in
// place of the reserve trigger button once someone clicks it. Mirrors
// TournamentVisual's own NotifyForm shape (name + email/phone + honeypot +
// success screen) plus a headcount and, when the event offersTakeout, an
// eat-in/take-out choice with a pickup-time note.
export function ReserveForm({ event, slug, onCancel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [serviceType, setServiceType] = useState(event.offersTakeout ? "eat-in" : "");
  const [pickupTime, setPickupTime] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
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
      await publicApi.submitEventReservation(slug, {
        eventSlug: event.slug, name, email, phone, partySize,
        serviceType: event.offersTakeout ? serviceType : undefined,
        pickupTime: event.offersTakeout && serviceType === "take-out" ? pickupTime : undefined,
        note, website,
      });
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
          Reserved for {partySize} {partySize === 1 ? "guest" : "guests"}. Nothing to pay now — you'll pay at the event.
          {email.trim() && ` A confirmation is on its way to ${email.trim()}.`}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="evt-form-panel" style={{ width: "100%" }}>
      <input
        type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} aria-hidden="true"
      />
      <input className="evt-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="evt-form-row">
        <input className="evt-input" style={{ flex: "1 1 160px" }} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="evt-input" style={{ flex: "1 1 120px" }} placeholder="Phone" value={formatPhone(phone)} onChange={(e) => setPhone(stripPhone(e.target.value))} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
          Guests
          <input
            className="evt-input" type="number" min={1} max={50} style={{ width: 64 }}
            value={partySize} onChange={(e) => setPartySize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          />
        </label>
      </div>
      {event.offersTakeout && (
        <div className="evt-form-row">
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
            <input type="radio" name="serviceType" checked={serviceType === "eat-in"} onChange={() => setServiceType("eat-in")} /> Eat in
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
            <input type="radio" name="serviceType" checked={serviceType === "take-out"} onChange={() => setServiceType("take-out")} /> Take out
          </label>
          {serviceType === "take-out" && (
            <input className="evt-input" style={{ flex: "1 1 140px" }} placeholder="Pickup time (optional)" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
          )}
        </div>
      )}
      <input className="evt-input" placeholder="Anything else we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {event.reservationDeadline && (
        <div style={{ fontSize: 11.5, color: "var(--evt-ink-muted)" }}>
          Reservations close {new Date(event.reservationDeadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
        </div>
      )}
      {error && <div className="evt-form-error">{error}</div>}
      <div className="evt-form-row">
        <button type="submit" className="evt-btn-sm" disabled={busy}>{busy ? "Reserving…" : "Reserve"}</button>
        <button type="button" className="evt-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

export { EVT_CSS };
