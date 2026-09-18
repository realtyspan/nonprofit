// GolfTournament -> the generic flyer content shape. Kept as its own file so
// the shared renderer (flyerPdf.js) carries no golf-specific mapping.
const { buildEventFlyerPdf } = require("./flyerPdf");
const { formatPhone } = require("./phone");

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

async function buildGolfFlyerPdf({ org, tournament, registerUrl }) {
  const stats = [
    tournament.format && { label: "Format", value: tournament.format },
    tournament.costPerPlayer != null && { label: "Cost", value: `${money(tournament.costPerPlayer)} / player` },
    tournament.venueName && { label: "Venue", value: tournament.venueName },
  ].filter(Boolean);

  const subParts = [tournament.format, tournament.venueName].filter(Boolean);

  let registerUrlLabel;
  try {
    const u = new URL(registerUrl);
    registerUrlLabel = `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    registerUrlLabel = registerUrl;
  }

  const fineParts = [];
  if (tournament.costPerPlayer != null) fineParts.push(`Teams pay ${money(tournament.costPerPlayer)}/player`);
  if (tournament.contactPhone) fineParts.push(`Or call ${formatPhone(tournament.contactPhone)}`);

  return buildEventFlyerPdf({
    orgName: org.name,
    orgPhone: org.phone || tournament.contactPhone, // prefer the org's own number; fall back to the tournament's contact if the org hasn't set one yet
    primaryColor: org.flyerPrimaryColor,
    accentColor: org.flyerAccentColor,
    eventName: tournament.name,
    subLine: subParts.join(" · "),
    heroImage: tournament.flyerImage || null,
    heroImagePosition: tournament.flyerImagePosition || "center",
    date: tournament.date,
    stats,
    includedItems: tournament.includedItems || [],
    scheduleItems: tournament.scheduleItems || [],
    contactName: tournament.contactName,
    contactPhone: tournament.contactPhone,
    contactEmail: tournament.contactEmail,
    registerUrl,
    registerUrlLabel,
    fineText: fineParts.join("  ·  "),
  });
}

module.exports = { buildGolfFlyerPdf };
