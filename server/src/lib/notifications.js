// Notification hooks. Currently no-ops — the org's transactional email
// platform (Brevo) isn't wired up yet; that's a separate task. These stubs
// exist so the call sites that need them (the Owner-set-change guardrail in
// permissions.js) are already in place and just need real sending dropped in.

async function notifyOwnerSetChanged(orgId) {
  // TODO: email every current Owner of orgId that the Owner set changed.
}

module.exports = { notifyOwnerSetChanged };
