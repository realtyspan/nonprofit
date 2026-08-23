// Stateless unsubscribe tokens for the raffle kickoff email — no DB row per
// token issuance (unlike password reset), since these need to be generated
// once per recipient on every send and never expire. Reuses the same
// JWT_SECRET as login tokens; a distinct `purpose` claim keeps this from
// being usable as (or confusable with) an auth token.
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./auth");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildUnsubscribeToken(orgId, email) {
  return jwt.sign({ orgId, email: normalizeEmail(email), purpose: "raffle-unsubscribe" }, JWT_SECRET);
}

// Returns { orgId, email } or throws if the token is malformed, tampered
// with, or wasn't issued for this purpose.
function verifyUnsubscribeToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== "raffle-unsubscribe" || !payload.orgId || !payload.email) {
    throw new Error("Not a valid unsubscribe link");
  }
  return { orgId: payload.orgId, email: payload.email };
}

module.exports = { buildUnsubscribeToken, verifyUnsubscribeToken, normalizeEmail };
