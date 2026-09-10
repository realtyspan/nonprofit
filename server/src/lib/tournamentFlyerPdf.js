// Tournament -> the generic flyer content shape (see golfFlyerPdf.js's
// buildEventFlyerPdf, which this reuses directly rather than duplicating
// the PDF-drawing code — the same renderer golfFlyerPdf.js's own
// buildGolfFlyerPdf and eventFlyerPdf.js's buildEventRecordFlyerPdf
// already use).
const { buildEventFlyerPdf } = require("./golfFlyerPdf");
const { formatPhone } = require("./phone");

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

// Wherever the org has actually told us this module's public page lives
// (PublicLinkBox's "Where did you put this?" field, org.embedPageUrls.
// tournaments) if they've set one, else our own /tournaments/:orgSlug/
// :tournamentSlug page — deep-linked to this specific tournament, since
// more than one can be open at once. Same reasoning as golf.js's
// resolveGolfRegisterUrl and events.js's resolveEventFlyerUrl.
function resolveTournamentFlyerUrl(org, tournament) {
  const ownSiteUrl = org.embedPageUrls?.tournaments;
  if (ownSiteUrl) return ownSiteUrl;
  if (!org.slug) return null;
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  return `${appUrl}/tournaments/${org.slug}/${tournament.slug}`;
}

async function buildTournamentFlyerPdf({ org, tournament, type, flyerUrl }) {
  const stats = [
    tournament.format && { label: "Format", value: tournament.format },
    tournament.costPerPlayer != null && { label: "Cost", value: `${money(tournament.costPerPlayer)} / player` },
    tournament.venueName && { label: "Venue", value: tournament.venueName },
  ].filter(Boolean);

  const subParts = [type?.name, tournament.venueName].filter(Boolean);

  let registerUrlLabel;
  try {
    const u = new URL(flyerUrl);
    registerUrlLabel = `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    registerUrlLabel = flyerUrl;
  }

  const fineParts = [];
  if (tournament.costPerPlayer != null) fineParts.push(`Teams pay ${money(tournament.costPerPlayer)}/player`);
  if (tournament.contactPhone) fineParts.push(`Or call ${formatPhone(tournament.contactPhone)}`);

  return buildEventFlyerPdf({
    orgName: org.name,
    orgPhone: org.phone || tournament.contactPhone,
    primaryColor: org.flyerPrimaryColor,
    accentColor: org.flyerAccentColor,
    eventName: tournament.name,
    subLine: subParts.join(" · "),
    heroImage: tournament.flyerImage || null,
    date: tournament.date,
    stats,
    includedItems: tournament.includedItems || [],
    scheduleItems: tournament.scheduleItems || [],
    contactName: tournament.contactName,
    contactPhone: tournament.contactPhone,
    contactEmail: tournament.contactEmail,
    registerUrl: flyerUrl,
    registerUrlLabel,
    fineText: fineParts.join("  ·  "),
  });
}

module.exports = { buildTournamentFlyerPdf, resolveTournamentFlyerUrl };
