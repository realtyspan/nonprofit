// HTML emails for a public "reserve a meal / seat" submission — see
// publicEvents.js's POST /:slug/reserve. Two templates: a confirmation to
// the person who reserved, and an alert to the org's event admins. Same
// shell as eventInterestEmail.js.

const { formatPhone } = require("./phone");

function shell({ badge, badgeColor, heading, intro, rows, footer }) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F9F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#201F1E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F9F8F7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #E1DFDD;">
        <tr><td style="padding:8px 32px 4px 32px;padding-top:24px;">
          <div style="background:${badgeColor.bg};color:${badgeColor.text};font-weight:600;font-size:13px;padding:10px 14px;border-radius:6px;">${badge}</div>
        </td></tr>
        <tr><td style="padding:16px 32px 8px 32px;">
          <h1 style="margin:0 0 8px 0;font-size:18px;">${heading}</h1>
          <p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;">${intro}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px;">
            ${rows}
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #F1EFED;">
          <p style="margin:0;font-size:12px;color:#605E5C;line-height:1.5;">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function row(label, value) {
  return `<tr><td style="padding:6px 0;color:#605E5C;width:150px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-weight:600;">${value}</td></tr>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function whenLabel(event, timeZone) {
  const d = new Date(event.startAt);
  const date = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone });
  if (event.allDay) return date;
  const t = (x) => new Date(x).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const start = t(event.startAt);
  const end = t(event.endAt);
  return `${date} · ${start === end ? start : `${start} – ${end}`}`;
}

function serviceLabel(reservation) {
  if (reservation.serviceType === "eat-in") return "Eat in";
  if (reservation.serviceType === "take-out") {
    return reservation.pickupTime ? `Take out — pickup ${esc(reservation.pickupTime)}` : "Take out";
  }
  return null;
}

// To the person who reserved.
function eventReservationConfirmationHtml({ reservation, event, org, timeZone }) {
  const svc = serviceLabel(reservation);
  const rows = [
    row("Event", esc(event.title)),
    row("When", esc(whenLabel(event, timeZone))),
    event.location && row("Where", esc(event.location)),
    row("Reserved for", `${reservation.partySize} ${reservation.partySize === 1 ? "guest" : "guests"}`),
    svc && row("Service", svc),
    event.price && row("Cost", `${esc(event.price)}${event.priceUnit ? ` ${esc(event.priceUnit)}` : ""} — pay at the event`),
    reservation.note && row("Your note", esc(reservation.note)),
  ].filter(Boolean).join("");

  const contactBits = [event.contactName, event.reservePhone && formatPhone(event.reservePhone), event.contactEmail]
    .filter(Boolean).map(esc).join(" · ");

  return shell({
    badge: "Reservation confirmed",
    badgeColor: { bg: "#E4F1E4", text: "#0B5C0B" },
    heading: `You're on the list for ${esc(event.title)}`,
    intro: `Thanks, ${esc(reservation.name)} — your spot is reserved. There's nothing to pay now; payment is collected at the event. To change or cancel, ${contactBits ? `contact ${contactBits}.` : `reply to this email.`}`,
    rows,
    footer: `${esc(org.name)}`,
  });
}

// To the org's event admins.
function eventReservationAlertHtml({ reservation, event, org, timeZone }) {
  const svc = serviceLabel(reservation);
  const rows = [
    row("Event", esc(event.title)),
    row("When", esc(whenLabel(event, timeZone))),
    row("Name", esc(reservation.name)),
    reservation.email && row("Email", esc(reservation.email)),
    reservation.phone && row("Phone", esc(formatPhone(reservation.phone))),
    row("Guests", String(reservation.partySize)),
    svc && row("Service", svc),
    reservation.note && row("Note", esc(reservation.note)),
  ].filter(Boolean).join("");

  return shell({
    badge: "New meal reservation",
    badgeColor: { bg: "#FFF7DD", text: "#5A4900" },
    heading: `${esc(reservation.name)} reserved ${reservation.partySize} for ${esc(event.title)}`,
    intro: `Submitted from your public event page. See the full list in Events → Reservations.`,
    rows,
    footer: `${esc(org.name)} — Events module`,
  });
}

module.exports = { eventReservationConfirmationHtml, eventReservationAlertHtml };
