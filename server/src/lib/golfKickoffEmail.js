// Player marketing email — invites a past tournament's players back for
// this year's. Table-based/inline-style like raffleKickoffEmail.js (email
// clients don't render flexbox, CSS variables, or web fonts), but themed
// with the golf module's own visual language (dark hero band, checkmark
// included-items list, schedule timeline, dark contact block) instead of
// raffle's ticket-stub look — the same structure PublicGolf.jsx's embed and
// golfFlyerPdf.js's flyer already share, so flyer/embed/email read as one
// system. Colors come from the org's own flyerPrimaryColor/flyerAccentColor
// when set, falling back to the same teal/terracotta defaults the flyer
// uses when they aren't.
//
// Recipient personalization: pass recipientFirstName when sending to a real
// past player (the /kickoff-email/send route does); the standalone preview
// leaves it unset and gets an italicized [First Name] placeholder instead.
const DEFAULT_PRIMARY = "#25555f";
const DEFAULT_ACCENT = "#cd715c";

function money(n) {
  return `$${Number(n || 0).toLocaleString("en-US")}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// content: { org, tournament, registerUrl, recipientFirstName, unsubscribeUrl }
function golfKickoffEmailHtml({ org, tournament, registerUrl, recipientFirstName, unsubscribeUrl }) {
  const primary = org.flyerPrimaryColor || DEFAULT_PRIMARY;
  const accent = org.flyerAccentColor || DEFAULT_ACCENT;

  const factRows = [
    tournament.format && ["Format", tournament.format],
    tournament.costPerPlayer != null && ["Cost", `${money(tournament.costPerPlayer)} / player`],
    tournament.venueName && ["Venue", tournament.venueName],
  ].filter(Boolean);
  const factsSection = factRows.length
    ? `<tr><td style="padding:4px 32px 20px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e0d4;border-radius:8px;">
          <tr>${factRows.map(([label, value]) => `<td style="padding:14px 16px;border-right:1px solid #e5e0d4;"><div style="font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#8a8378;">${label}</div><div style="font-size:14px;font-weight:700;color:#23302f;margin-top:3px;">${value}</div></td>`).join("")}</tr>
        </table>
      </td></tr>`
    : "";

  const includedItems = Array.isArray(tournament.includedItems) ? tournament.includedItems : [];
  const includedSection = includedItems.length
    ? `<tr><td style="padding:0 32px 20px 32px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${primary};margin-bottom:10px;">What's Included</div>
        ${includedItems.map((item) => `<div style="padding:5px 0;font-size:14px;color:#23302f;"><span style="color:${primary};font-weight:700;">&#10003;&nbsp;&nbsp;</span>${item}</div>`).join("")}
      </td></tr>`
    : "";

  const scheduleItems = Array.isArray(tournament.scheduleItems) ? tournament.scheduleItems : [];
  const scheduleSection = scheduleItems.length
    ? `<tr><td style="padding:0 32px 20px 32px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${primary};margin-bottom:10px;">Schedule</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${scheduleItems.map((item) => `<tr><td style="padding:6px 0;border-top:1px solid #ece6d9;font-size:13px;font-weight:700;color:${accent};width:90px;">${item.time || ""}</td><td style="padding:6px 0;border-top:1px solid #ece6d9;font-size:14px;color:#23302f;">${item.label || ""}</td></tr>`).join("")}
        </table>
      </td></tr>`
    : "";

  const contactSection = tournament.contactName || tournament.contactPhone
    ? `<tr><td style="padding:0 32px 24px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${primary};border-radius:8px;">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:10.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#ffffff;opacity:0.75;">Have Questions?</div>
            ${tournament.contactName ? `<div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:6px;">${tournament.contactName}</div>` : ""}
            ${tournament.contactPhone ? `<div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:2px;">${tournament.contactPhone}</div>` : ""}
          </td></tr>
        </table>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e9e4d6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#23302f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#e9e4d6;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#faf8f2;border-radius:10px;overflow:hidden;">

        <tr><td style="background:${primary};padding:26px 32px;">
          <div style="font-size:11.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;opacity:0.75;">${(org.name || "").toUpperCase()}</div>
          <div style="font-size:28px;font-weight:800;color:#ffffff;margin-top:10px;line-height:1.2;">${tournament.name || ""}</div>
          <div style="font-size:14px;color:#ffffff;opacity:0.85;margin-top:6px;">${fmtDate(tournament.date)}</div>
        </td></tr>

        <tr><td style="padding:26px 32px 6px 32px;">
          <div style="font-size:16px;font-weight:700;color:#23302f;margin-bottom:10px;">Hi ${recipientFirstName ? recipientFirstName : "<em>[First Name]</em>"},</div>
          <p style="margin:0 0 14px 0;font-size:14.5px;line-height:1.6;">You played with us before, and that's exactly the kind of support that makes this tournament work — so we wanted you to hear about ${tournament.name} before anyone else does. Come get your team back together.</p>
        </td></tr>

        ${factsSection}
        ${includedSection}
        ${scheduleSection}
        ${contactSection}

        <tr><td style="padding:0 32px 30px 32px;" align="center">
          <a href="${registerUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;">Register Your Team</a>
        </td></tr>

        <tr><td style="background:${primary};padding:22px 32px;text-align:center;">
          <div style="font-size:11.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;">${org.name || ""}</div>
          ${org.address ? `<div style="font-size:11px;color:#ffffff;opacity:0.7;margin-top:6px;">${org.address}</div>` : ""}
          <div style="font-size:10.5px;color:#ffffff;opacity:0.65;margin-top:14px;line-height:1.6;">
            You're receiving this because you've played in a past ${org.name || "our"} golf tournament.<br>
            ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#ffffff;">Unsubscribe from golf emails</a>` : `<span>Unsubscribe from golf emails</span>`}
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { golfKickoffEmailHtml };
