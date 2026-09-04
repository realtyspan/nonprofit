// Buyer-facing HTML email templates for the Raffle module, ported from the
// source app's email_templates.py (sale_confirmation_html, electronic_ticket_html).
// Unlike the source — hardcoded to one lodge and one fixed prize table — these
// take the org's real name/address and that org's actual RaffleDrawing rows,
// since this platform is multi-tenant. password_reset_html is dropped entirely;
// this platform's own auth already handles password reset.

const { fmtUsDate } = require("./raffleLogic");

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function saleConfirmationHtml({ ticket, sellerName, gameName, org }) {
  const amount = Number(ticket.tenderAmount || 0);
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F9F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#201F1E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F9F8F7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #E1DFDD;">
        <tr><td style="padding:24px 32px 12px 32px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="width:52px;padding-right:12px;"><div style="width:48px;height:48px;background:#185FA5;border-radius:6px;color:#fff;font-weight:700;font-size:14px;text-align:center;line-height:48px;">400</div></td>
            <td><div style="font-size:16px;font-weight:600;">${org.name}</div><div style="font-size:12px;color:#605E5C;">${gameName}</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 32px 4px 32px;">
          <div style="background:#E9F5EA;color:#22691A;font-weight:600;font-size:13px;padding:10px 14px;border-radius:6px;">Sale confirmed — ${gameName}</div>
        </td></tr>
        <tr><td style="padding:16px 32px 8px 32px;">
          <h1 style="margin:0 0 8px 0;font-size:18px;">Thank you for supporting the ${gameName} raffle!</h1>
          <p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;">Hi ${ticket.buyer || "there"}, this is your payment acknowledgement. Your official electronic ticket will follow once the funds are turned in to the organization.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#605E5C;width:130px;">Ticket #</td><td style="padding:6px 0;font-weight:700;color:#185FA5;">#${ticket.number}</td></tr>
            <tr><td style="padding:6px 0;color:#605E5C;">Buyer</td><td style="padding:6px 0;font-weight:600;">${ticket.buyer}</td></tr>
            <tr><td style="padding:6px 0;color:#605E5C;">Amount collected</td><td style="padding:6px 0;font-weight:600;">$${amount.toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#605E5C;">Collected by</td><td style="padding:6px 0;">${sellerName || "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#605E5C;">Date</td><td style="padding:6px 0;">${fmtUsDate(ticket.soldAt)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:8px 32px 16px 32px;">
          <div style="background:#FFF7DD;border:1px solid #F0E4A6;color:#5A4900;font-size:13px;line-height:1.55;padding:12px 14px;border-radius:6px;">
            <strong>Important:</strong> This is a payment acknowledgement, <strong>not</strong> your official ticket. Your official electronic ticket will be issued once your seller turns the funds in to the organization.
          </div>
        </td></tr>
        <tr><td style="padding:8px 32px 24px 32px;border-top:1px solid #F1EFED;">
          <p style="margin:0;font-size:12px;color:#605E5C;line-height:1.5;">Questions? Reply to this email. ${org.name}${org.address ? " · " + org.address : ""}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// `drawings` is that game's RaffleDrawing rows — the prize table and drawing
// date(s) shown are whatever the org has actually configured, not the
// source's hardcoded 14-prize/$10,000 structure.
function electronicTicketHtml({ ticket, gameName, verificationCode, drawings, org, ticketUrl }) {
  const amount = Number(ticket.tenderAmount || 0);
  const tender = ticket.tenderType ? ticket.tenderType[0].toUpperCase() + ticket.tenderType.slice(1) : "";
  const tenderLine = tender
    ? `${tender}${ticket.checkNumber ? " · #" + ticket.checkNumber : ""} · $${amount.toFixed(2)}`
    : `$${amount.toFixed(2)}`;

  const mainDrawing = drawings.find((d) => d.drawingType === "main");
  const mainLine = mainDrawing
    ? `<div style="margin:8px 0 0 0;font-size:14px;font-weight:600;">Drawing: ${fmtUsDate(mainDrawing.drawingDate)}</div>`
    : "";
  const mainDateKey = mainDrawing ? new Date(mainDrawing.drawingDate).toDateString() : null;
  const earlyBirdLines = drawings
    .filter((d) => d.drawingType !== "main" && new Date(d.drawingDate).toDateString() !== mainDateKey)
    .map((d) => `<span style="display:inline-block;background:#FFFBEA;color:#5A4900;font-size:12px;padding:4px 8px;border-radius:4px;margin:2px 4px 2px 0;border:1px solid #F0E4A6;">Early bird: ${fmtUsDate(d.drawingDate)} · $${Number(d.prizeAmount).toFixed(0)}</span>`)
    .join("");

  const sortedByPrize = [...drawings].sort((a, b) => b.prizeAmount - a.prizeAmount);
  const topPrize = sortedByPrize[0]?.prizeAmount || 0;
  const prizeRowCells = sortedByPrize.map((d, i) => `<td style="padding:2px 6px;">${ordinal(i + 1)} · $${Number(d.prizeAmount).toLocaleString()}</td>`);
  let prizeRows = "";
  for (let i = 0; i < prizeRowCells.length; i += 2) {
    prizeRows += `<tr>${prizeRowCells[i]}${prizeRowCells[i + 1] || "<td></td>"}</tr>`;
  }

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F9F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#201F1E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F9F8F7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="580" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#FFFFE8;border-radius:8px;border:2px solid #A32D2D;">
        <tr><td style="padding:20px 28px 8px 28px;text-align:center;">
          <div style="font-size:13px;font-weight:700;color:#A32D2D;letter-spacing:0.05em;">${(org.name || "").toUpperCase()}</div>
          ${org.address ? `<div style="font-size:11px;color:#605E5C;margin-top:2px;">${org.address}</div>` : ""}
        </td></tr>
        <tr><td style="padding:4px 28px 8px 28px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#000;letter-spacing:0.03em;">${(gameName || "").toUpperCase()}</div>
          ${topPrize ? `<div style="font-size:26px;font-weight:800;color:#A32D2D;margin-top:8px;">$${Number(topPrize).toLocaleString()} TOP PRIZE</div>` : ""}
        </td></tr>
        <tr><td style="padding:12px 28px 0 28px;text-align:center;">
          <div style="background:#ffffff;border:2px dashed #A32D2D;border-radius:6px;padding:16px 12px;">
            <div style="font-size:11px;color:#605E5C;letter-spacing:0.06em;text-transform:uppercase;">Ticket number</div>
            <div style="font-size:36px;font-weight:800;color:#A32D2D;line-height:1;">#${ticket.number}</div>
            <div style="font-size:15px;font-weight:700;margin-top:6px;text-transform:uppercase;letter-spacing:0.03em;">${ticket.buyer}</div>
          </div>
        </td></tr>
        ${ticketUrl ? `<tr><td style="padding:14px 28px 0 28px;text-align:center;">
          <a href="${ticketUrl}" style="display:inline-block;background:#A32D2D;color:#ffffff;font-weight:700;font-size:13px;padding:11px 22px;border-radius:6px;text-decoration:none;">View &amp; Download Your Ticket</a>
        </td></tr>` : ""}
        <tr><td style="padding:14px 28px 4px 28px;text-align:center;">${mainLine}</td></tr>
        <tr><td style="padding:8px 28px 4px 28px;text-align:center;">${earlyBirdLines}</td></tr>
        ${prizeRows ? `<tr><td style="padding:12px 28px 4px 28px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#605E5C;margin-bottom:6px;text-align:center;">Prizes</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;font-size:12px;">${prizeRows}</table>
        </td></tr>` : ""}
        <tr><td style="padding:12px 28px 12px 28px;text-align:center;">
          <div style="background:#ffffff;border:1px solid #E1DFDD;border-radius:4px;padding:8px 12px;font-size:11px;color:#605E5C;">
            <strong style="color:#201F1E;">Please retain</strong> · Present this ticket (print or on phone) at the door
          </div>
        </td></tr>
        <tr><td style="padding:8px 28px 20px 28px;font-size:11px;color:#605E5C;text-align:center;border-top:1px dashed #A32D2D;">
          Verification code: <strong style="color:#201F1E;">${verificationCode}</strong> · Paid ${tenderLine} · ${fmtUsDate(ticket.soldAt)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// New — not in the source app (which has no reminder feature at all).
function paymentReminderHtml({ ticket, gameName, org }) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F9F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#201F1E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F9F8F7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #E1DFDD;">
        <tr><td style="padding:24px 32px 12px 32px;">
          <div style="font-size:16px;font-weight:600;">${org.name}</div><div style="font-size:12px;color:#605E5C;">${gameName}</div>
        </td></tr>
        <tr><td style="padding:8px 32px 4px 32px;">
          <div style="background:#FFF3E0;color:#8A4B00;font-weight:600;font-size:13px;padding:10px 14px;border-radius:6px;">Payment reminder — Ticket #${ticket.number}</div>
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;">
          <p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;">Hi ${ticket.buyer || "there"}, this is a friendly reminder that payment for your ${gameName} raffle ticket #${ticket.number} hasn't been received yet. Please arrange payment with your seller${ticket.assignedSellerName ? ` (${ticket.assignedSellerName})` : ""} as soon as possible to keep your ticket active.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 24px 32px;border-top:1px solid #F1EFED;">
          <p style="margin:0;font-size:12px;color:#605E5C;line-height:1.5;">Questions? Reply to this email. ${org.name}${org.address ? " · " + org.address : ""}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { saleConfirmationHtml, electronicTicketHtml, paymentReminderHtml };
