// Bump this whenever the Terms of Service or Privacy Policy change in a way
// that needs re-acceptance — it's stored on User.termsVersion at signup so
// there's a record of exactly which text someone agreed to. The client's
// legal pages display the same date (client/src/lib/legalContent.js); keep
// the two in step by hand.
const TERMS_VERSION = "2026-09-19";

module.exports = { TERMS_VERSION };
