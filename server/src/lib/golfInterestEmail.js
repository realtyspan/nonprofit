// HTML email template for the "notify me" interest signup submitted from
// the public golf page when no tournament is currently open — see
// publicGolf.js's POST /:slug/interest. Same visual shell as
// rentalEmails.js's alert emails, copied rather than shared since neither
// file exports its shell() helper today.

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

function golfInterestAlertHtml({ signup, org }) {
  const rows = [
    row("Name", signup.name),
    signup.email && row("Email", signup.email),
    signup.phone && row("Phone", formatPhone(signup.phone)),
    row("Interested as", signup.role === "sponsor" ? "Sponsor" : "Player"),
    signup.companyName && row("Company", signup.companyName),
    signup.note && row("Note", signup.note),
  ].filter(Boolean).join("");

  return shell({
    badge: "New golf tournament interest signup",
    badgeColor: { bg: "#FFF7DD", text: "#5A4900" },
    heading: `${signup.name} wants to hear when your next tournament opens`,
    intro: `Submitted from your public golf page while no tournament was open for registration. Review it in Golf → Interest Signups to mark it contacted once you've followed up.`,
    rows,
    footer: `${org.name} — Golf module`,
  });
}

module.exports = { golfInterestAlertHtml };
