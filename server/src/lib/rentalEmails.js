// HTML email templates for the Rental Space module's public inquiry flow —
// same visual language as raffleEmails.js (this app's first live email
// sender) so every outgoing email looks like it comes from one product.

function fmtDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function detailRows({ booking, space, quote }) {
  const rows = [
    ["Space", space.name],
    ["Start", fmtDateTime(booking.startAt)],
    ["End", fmtDateTime(booking.endAt)],
  ];
  if (booking.eventType) rows.push(["Event type", booking.eventType]);
  if (booking.expectedGuests) rows.push(["Expected guests", String(booking.expectedGuests)]);
  rows.push(["Member", booking.isMember ? "Yes" : "No"]);
  const equipment = [];
  if (booking.roundTables) equipment.push(`${booking.roundTables} round table(s)`);
  if (booking.longTables) equipment.push(`${booking.longTables} 8' table(s)`);
  if (booking.chairs) equipment.push(`${booking.chairs} chair(s)`);
  if (booking.kitchenUse) equipment.push(booking.kitchenUse === "with_oven" ? "Kitchen (with oven)" : "Kitchen (no oven)");
  if (booking.chafingDishes) equipment.push(`${booking.chafingDishes} chafing dish(es)`);
  if (booking.wantsBartender) equipment.push("Bartender");
  if (equipment.length) rows.push(["Equipment", equipment.join(", ")]);
  if (quote) rows.push(["Estimated total", `$${quote.total.toFixed(2)}`]);
  if (booking.notes) rows.push(["Notes", booking.notes]);
  return rows
    .map(([label, value]) => `<tr><td style="padding:6px 0;color:#605E5C;width:150px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-weight:600;">${value}</td></tr>`)
    .join("");
}

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

function rentalInquiryConfirmationHtml({ booking, space, org, quote }) {
  return shell({
    badge: `Request received — ${space.name}`,
    badgeColor: { bg: "#E9F5EA", text: "#22691A" },
    heading: `Thanks for your request, ${booking.renterName}!`,
    intro: `${org.name} has received your facility rental request and will be in touch to confirm availability and next steps. Nothing is booked yet — here's what you submitted:`,
    rows: detailRows({ booking, space, quote }),
    footer: `Questions? Reply to this email. ${org.name}`,
  });
}

function rentalInquiryAlertHtml({ booking, space, org }) {
  return shell({
    badge: `New rental inquiry — ${space.name}`,
    badgeColor: { bg: "#FFF7DD", text: "#5A4900" },
    heading: `New request from ${booking.renterName}`,
    intro: `Review it in Rental Space → Bookings to confirm or decline.`,
    rows: detailRows({ booking, space }) + `
      <tr><td style="padding:6px 0;color:#605E5C;width:150px;">Email</td><td style="padding:6px 0;font-weight:600;">${booking.renterEmail}</td></tr>
      ${booking.renterPhone ? `<tr><td style="padding:6px 0;color:#605E5C;">Phone</td><td style="padding:6px 0;font-weight:600;">${booking.renterPhone}</td></tr>` : ""}`,
    footer: `${org.name} — Rental Space module`,
  });
}

module.exports = { rentalInquiryConfirmationHtml, rentalInquiryAlertHtml };
