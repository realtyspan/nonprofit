// Sponsor marketing email — invites a past tournament's sponsors back for
// this year's. Same visual language as golfKickoffEmail.js (dark hero band,
// dark contact block, org's own flyer colors) with sponsor-specific copy:
// states last year's tier/amount where known, as a natural "renew at the
// same level" prompt. There's no public self-serve sponsorship form in this
// app — sponsors are recruited by relationship, not a web form (see the
// admin-entered sponsorship flow in golf.js) — so the call to action is to
// reply or call, with a link to the tournament's public page for details
// rather than a signup button that doesn't exist.
const DEFAULT_PRIMARY = "#25555f";
const DEFAULT_ACCENT = "#cd715c";

function money(n) {
  return `$${Number(n || 0).toLocaleString("en-US")}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// content: { org, tournament, registerUrl, recipientName, lastTierName, lastAmount, unsubscribeUrl }
function golfSponsorEmailHtml({ org, tournament, registerUrl, recipientName, lastTierName, lastAmount, unsubscribeUrl }) {
  const primary = org.flyerPrimaryColor || DEFAULT_PRIMARY;
  const accent = org.flyerAccentColor || DEFAULT_ACCENT;

  const lastYearLine = lastTierName || lastAmount != null
    ? `<div style="font-size:13.5px;color:#23302f;margin-top:10px;padding:10px 14px;background:#f3efe4;border-radius:6px;">Last year, you sponsored at ${lastTierName ? `the <strong>${lastTierName}</strong> level` : "a level of"}${lastAmount != null ? ` (${money(lastAmount)})` : ""} — we'd love to have you back at the same level, or higher.</div>`
    : "";

  const factRows = [
    tournament.venueName && ["Venue", tournament.venueName],
    tournament.format && ["Format", tournament.format],
  ].filter(Boolean);
  const factsSection = factRows.length
    ? `<tr><td style="padding:4px 32px 20px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e0d4;border-radius:8px;">
          <tr>${factRows.map(([label, value]) => `<td style="padding:14px 16px;border-right:1px solid #e5e0d4;"><div style="font-size:10.5px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#8a8378;">${label}</div><div style="font-size:14px;font-weight:700;color:#23302f;margin-top:3px;">${value}</div></td>`).join("")}</tr>
        </table>
      </td></tr>`
    : "";

  const contactSection = tournament.contactName || tournament.contactPhone || tournament.contactEmail
    ? `<tr><td style="padding:0 32px 24px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${primary};border-radius:8px;">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:10.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#ffffff;opacity:0.75;">Let's talk sponsorship</div>
            ${tournament.contactName ? `<div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:6px;">${tournament.contactName}</div>` : ""}
            ${tournament.contactPhone ? `<div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:2px;">${tournament.contactPhone}</div>` : ""}
            ${tournament.contactEmail ? `<div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:2px;">${tournament.contactEmail}</div>` : ""}
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
          <div style="font-size:28px;font-weight:800;color:#ffffff;margin-top:10px;line-height:1.2;">${tournament.name || ""} — Sponsorship</div>
          <div style="font-size:14px;color:#ffffff;opacity:0.85;margin-top:6px;">${fmtDate(tournament.date)}</div>
        </td></tr>

        <tr><td style="padding:26px 32px 6px 32px;">
          <div style="font-size:16px;font-weight:700;color:#23302f;margin-bottom:10px;">Hi ${recipientName ? recipientName : "<em>[Name]</em>"},</div>
          <p style="margin:0 0 6px 0;font-size:14.5px;line-height:1.6;">Your sponsorship has made a real difference for ${org.name || "our lodge"}, and we're already planning ${tournament.name}. We'd love to have your support again this year.</p>
          ${lastYearLine}
        </td></tr>

        ${factsSection}
        ${contactSection}

        <tr><td style="padding:0 32px 30px 32px;" align="center">
          <a href="${registerUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;">View Tournament Details</a>
          <div style="font-size:12px;color:#756f63;margin-top:10px;">Just reply to this email or give us a call to talk through sponsorship levels.</div>
        </td></tr>

        <tr><td style="background:${primary};padding:22px 32px;text-align:center;">
          <div style="font-size:11.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;">${org.name || ""}</div>
          ${org.address ? `<div style="font-size:11px;color:#ffffff;opacity:0.7;margin-top:6px;">${org.address}</div>` : ""}
          <div style="font-size:10.5px;color:#ffffff;opacity:0.65;margin-top:14px;line-height:1.6;">
            You're receiving this because you've sponsored a past ${org.name || "our"} golf tournament.<br>
            ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#ffffff;">Unsubscribe from golf emails</a>` : `<span>Unsubscribe from golf emails</span>`}
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { golfSponsorEmailHtml };
