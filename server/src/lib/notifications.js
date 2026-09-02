// Notification hooks, plus the platform's one real email-sending path
// (Brevo's transactional email API). notifyOwnerSetChanged is still a no-op —
// nothing in this codebase needs it sent yet — but sendEmail is real: the
// Raffle module's buyer emails (raffleEmails.js) are its first live caller.

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER = {
  name: process.env.BREVO_SENDER_NAME || "Charity Pulse",
  email: process.env.BREVO_SENDER_EMAIL || "no-reply@example.com",
};

async function notifyOwnerSetChanged(orgId) {
  // TODO: email every current Owner of orgId that the Owner set changed.
}

// No BREVO_API_KEY configured is a normal, expected state (most orgs haven't
// set one up yet) — log and skip rather than failing the caller's request.
//
// One shared Brevo account/key serves every org (per-org Brevo accounts would
// mean each lodge verifying its own sending domain — real setup friction for
// volunteer-run orgs). `fromName` lets a caller show the org's own name
// ("Red Hook Elks Lodge") instead of the platform's generic sender identity,
// and `replyTo` routes buyer replies to that org's own contact address —
// both without needing a distinct verified sending address per org.
//
// `unsubscribeUrl`, when passed, sets the RFC 8058 List-Unsubscribe(-Post)
// headers Gmail/Yahoo/Outlook now weigh as a real trust signal for anything
// that reads as marketing mail — a bulk send with no way to opt out short
// of the actual message body is exactly the pattern spam filters flag.
// Every caller that's an actual marketing send (golf/raffle kickoff emails)
// already computes a real per-recipient unsubscribe link; a pure
// transactional email (a receipt, a payment reminder) has no unsubscribe
// concept and should keep omitting this.
async function sendEmail({ to, toName, subject, html, fromName, replyTo, unsubscribeUrl }) {
  if (!BREVO_API_KEY) {
    console.warn(`Brevo not configured — skipping email "${subject}" to ${to}`);
    return { skipped: true };
  }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: fromName ? { ...BREVO_SENDER, name: fromName } : BREVO_SENDER,
      to: [{ email: to, name: toName || undefined }],
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject,
      htmlContent: html,
      headers: unsubscribeUrl ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Brevo send failed (${response.status}): ${text}`);
  }
  return response.json();
}

module.exports = { notifyOwnerSetChanged, sendEmail };
