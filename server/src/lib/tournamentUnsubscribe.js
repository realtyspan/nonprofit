// Stateless unsubscribe tokens for tournament marketing email (both the
// player and sponsor tracks share one suppression list — see
// TournamentEmailSuppression). Direct port of golfUnsubscribe.js.
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./auth");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildUnsubscribeToken(orgId, email) {
  return jwt.sign({ orgId, email: normalizeEmail(email), purpose: "tournament-unsubscribe" }, JWT_SECRET);
}

// Returns { orgId, email } or throws if the token is malformed, tampered
// with, or wasn't issued for this purpose.
function verifyUnsubscribeToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== "tournament-unsubscribe" || !payload.orgId || !payload.email) {
    throw new Error("Not a valid unsubscribe link");
  }
  return { orgId: payload.orgId, email: payload.email };
}

module.exports = { buildUnsubscribeToken, verifyUnsubscribeToken, normalizeEmail };
