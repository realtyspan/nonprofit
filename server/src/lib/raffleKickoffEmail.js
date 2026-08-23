// Season-kickoff marketing email — invites past buyers back for a new raffle
// season. Table-based/inline-style like the rest of raffleEmails.js (no CSS
// variables, flexbox, or web fonts — those don't survive real email clients),
// but themed as a ticket stub to match the approved design mockup.
//
// Recipient personalization: pass recipientFirstName when sending to a real
// buyer (the /kickoff-email/send route does); the standalone preview leaves
// it unset and gets a literal, italicized [First Name] placeholder instead.
const { fmtUsDate } = require("./raffleLogic");

function money(n) {
  return `$${Number(n || 0).toLocaleString("en-US")}`;
}

function raffleKickoffEmailHtml({ org, game, drawings, recipientFirstName }) {
  const sortedDrawings = [...drawings].sort((a, b) => b.prizeAmount - a.prizeAmount || new Date(a.drawingDate) - new Date(b.drawingDate));
  const prizeRows = sortedDrawings
    .map(
      (d) => `<tr>
        <td style="padding:9px 0;border-top:1px dashed #D9C79A;font-size:14px;font-weight:600;color:#2B1D22;">${d.name}</td>
        <td style="padding:9px 0;border-top:1px dashed #D9C79A;font-size:13px;color:#7C5D6E;text-align:center;">${fmtUsDate(d.drawingDate)}</td>
        <td style="padding:9px 0;border-top:1px dashed #D9C79A;font-size:14px;font-weight:700;color:#3B1236;text-align:right;">${money(d.prizeAmount)}</td>
      </tr>`
    )
    .join("");

  const mainDrawingDate =
    sortedDrawings.length > 0
      ? new Date(Math.max(...sortedDrawings.map((d) => new Date(d.drawingDate).getTime())))
      : game.raffleEndDate;

  const admits = game.admitsPerTicket || 1;
  const admitsLine = admits > 1 ? `Please retain this ticket — good for ${admits} guests` : "Please retain this ticket";

  const eventRows = [];
  if (game.eventVenue) eventRows.push(["Where", game.eventVenue]);
  if (game.eventDoorsOpenTime) eventRows.push(["Doors open", game.eventDoorsOpenTime]);
  const eventSection = eventRows.length
    ? `<tr><td style="padding:0 34px 6px 34px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;font-size:14px;">
          ${eventRows.map(([label, value]) => `<tr><td style="padding:4px 0;color:#7C5D6E;width:110px;">${label}</td><td style="padding:4px 0;font-weight:600;color:#2B1D22;">${value}</td></tr>`).join("")}
        </table>
        ${game.eventDetails ? `<div style="margin-top:8px;font-size:13.5px;line-height:1.6;color:#2B1D22;">${game.eventDetails}</div>` : ""}
      </td></tr>`
    : "";

  const minimumNote = game.minimumTicketsSold
    ? `<div style="margin-top:10px;font-size:11.5px;color:#7C5D6E;font-style:italic;">Per minimum sale of ${game.minimumTicketsSold} tickets, or ticket price refunded.</div>`
    : "";

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#E4D7BC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2B1D22;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#E4D7BC;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#EFE6D3;border-radius:8px;overflow:hidden;">

        <tr><td style="background:#3B1236;padding:22px 32px;text-align:center;border-bottom:3px solid #C6952F;">
          <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#F5EEDD;">${(org.name || "").toUpperCase()}</div>
        </td></tr>

        <tr><td style="padding:28px 32px 6px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:2px dashed #B79A63;border-radius:6px;">
            <tr>
              <td style="padding:24px 20px;text-align:center;">
                <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#7C5D6E;">It's that time again</div>
                <div style="font-size:34px;font-weight:800;color:#3B1236;letter-spacing:0.5px;margin-top:6px;">${(game.name || "").toUpperCase()}</div>
                <div style="font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#2B1D22;margin-top:4px;">Drawing ${fmtUsDate(mainDrawingDate)}</div>
              </td>
              <td width="70" style="background:#3B1236;text-align:center;padding:16px 0;">
                <div style="color:#E0B24F;font-size:12px;font-weight:700;letter-spacing:1px;">ADMIT<br>${admits > 1 ? admits : "ONE"}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:26px 32px 4px 32px;">
          <div style="font-size:18px;font-weight:700;color:#3B1236;margin-bottom:12px;">Hi ${recipientFirstName ? recipientFirstName : "<em>[First Name]</em>"},</div>
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">Another ${game.name} season is almost here, and we didn't want you to hear about it last. You've backed the raffle before — that's exactly the kind of support that keeps this lodge doing what it does — so we're holding a spot for you before tickets go out to everyone else.</p>
        </td></tr>

        <tr><td style="padding:8px 32px 20px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1.5px solid #C9B384;border-radius:8px;background:#FBF6EA;">
            <tr><td style="padding:14px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;">
                <tr><td style="padding:5px 0;color:#7C5D6E;width:150px;">Ticket price</td><td style="padding:5px 0;font-weight:700;color:#2B1D22;">${money(game.ticketPrice)} each</td></tr>
                <tr><td style="padding:5px 0;color:#7C5D6E;">Tickets available</td><td style="padding:5px 0;font-weight:700;color:#2B1D22;">Starting ${fmtUsDate(game.raffleStartDate)}</td></tr>
                <tr><td style="padding:5px 0;color:#7C5D6E;">Admits</td><td style="padding:5px 0;font-weight:700;color:#2B1D22;">${admits} guest${admits === 1 ? "" : "s"} per ticket</td></tr>
              </table>
              <div style="margin-top:8px;font-size:12.5px;color:#7C5D6E;font-style:italic;">${admitsLine}</div>
              ${minimumNote}
            </td></tr>
          </table>
        </td></tr>

        ${eventSection}

        ${
          prizeRows
            ? `<tr><td style="padding:10px 32px 4px 32px;">
                <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7C5D6E;margin-bottom:6px;">Prizes this season</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${prizeRows}</table>
              </td></tr>`
            : ""
        }

        <tr><td style="padding:26px 32px 6px 32px;">
          <p style="margin:0 0 12px 0;font-size:14.5px;line-height:1.6;">Contact your seller from last year, or someone from the lodge will reach out to help you get set up. You can also contact the raffle chairman directly to arrange your purchase.</p>
          <p style="margin:0;font-size:14.5px;line-height:1.6;">See you at the drawing,<br><strong>${org.name}</strong></p>
        </td></tr>

        <tr><td style="background:#240B22;padding:22px 32px;text-align:center;">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#F5EEDD;">${org.name}</div>
          ${org.address ? `<div style="font-size:11.5px;color:#B79BB2;margin-top:6px;">${org.address}</div>` : ""}
          <div style="font-size:10.5px;color:#8C6E88;margin-top:14px;line-height:1.6;">
            You're receiving this because you've purchased a ${game.name} ticket in a past season.<br>
            <a href="#" style="color:#C9A6C4;">Unsubscribe from raffle emails</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { raffleKickoffEmailHtml };
