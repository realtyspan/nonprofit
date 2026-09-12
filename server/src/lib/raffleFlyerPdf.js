// RaffleGame -> the generic flyer content shape (see golfFlyerPdf.js's
// buildEventFlyerPdf, which this reuses directly — same renderer
// eventFlyerPdf.js's buildEventRecordFlyerPdf and golfFlyerPdf.js's own
// buildGolfFlyerPdf already use).
//
// Unlike every other flyer this renderer produces, this one NEVER carries a
// payUrl or a "register/sign up" CTA — selling raffle or Bell Jar tickets
// online isn't permitted in New York without a NY Gaming Commission
// license (see events.js's Event.sellsRaffleTickets, which exists for the
// exact same reason). This flyer is announcement-only: what the raffle is,
// what a ticket costs, when the drawing is, and how to reach the org —
// buying happens in person, from a member.
const { buildEventFlyerPdf } = require("./golfFlyerPdf");
const { formatPhone } = require("./phone");

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

// "Sep 11" — read as UTC, matching raffleEndDate's bare-calendar-day
// convention (see the date tab's own comment below).
function shortUtcDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Wherever the org has actually told us this raffle is announced: a
// raffle-specific page on their own site (PublicLinkBox's "Where did you
// put this?" field under Marketing -> Raffle, org.embedPageUrls.raffle) if
// they've set one; else the Activities embed destination
// (org.embedPageUrls.activities), since Raffle has no public storefront
// page of its own and normally surfaces only through the Activities feed
// — see eventFlyerPdf.js's resolveEventFlyerUrl for the same reasoning;
// else our own hosted Activities page, deep-linked to this one raffle so
// scanning the flyer doesn't dump a visitor on "everything public" if this
// game isn't even the soonest thing listed.
function resolveRaffleFlyerUrl(org, game) {
  const ownSiteUrl = org.embedPageUrls?.raffle || org.embedPageUrls?.activities;
  if (ownSiteUrl) return ownSiteUrl;
  if (!org.slug) return null;
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  return `${appUrl}/activities/${org.slug}?source=raffle-game&id=${game.id}`;
}

async function buildRaffleFlyerPdf({ org, game, flyerUrl }) {
  // The date tab already shows the drawing date, but on its own in a
  // corner it read as disconnected from the "Drawing" stat next to a bare
  // time ("1:00 PM") — printing as if the date were missing. Pairing the
  // date with the time here makes the stat self-contained.
  const drawingWhen = [shortUtcDate(game.raffleEndDate), game.eventDoorsOpenTime].filter(Boolean).join(" · ");
  const stats = [
    { label: "Ticket", value: money(game.ticketPrice) },
    { label: "Drawing", value: drawingWhen || undefined },
    game.eventVenue && { label: "Venue", value: game.eventVenue },
  ].filter((s) => s && s.value);

  let registerUrlLabel;
  try {
    const u = new URL(flyerUrl);
    registerUrlLabel = `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    registerUrlLabel = flyerUrl;
  }

  const fineParts = [];
  if (game.admitsPerTicket > 1) fineParts.push(`Each ticket admits ${game.admitsPerTicket} guests`);
  if (game.minimumTicketsSold) fineParts.push(`Minimum sale of ${game.minimumTicketsSold} tickets or refund`);
  if (org.phone) fineParts.push(`Or call ${formatPhone(org.phone)}`);

  return buildEventFlyerPdf({
    orgName: org.name,
    orgPhone: org.phone,
    primaryColor: org.flyerPrimaryColor,
    accentColor: org.flyerAccentColor,
    eventName: game.name,
    subLine: game.eventVenue || null,
    // raffleEndDate is a bare calendar day (midnight UTC), same convention
    // as GolfTournament.date — read it with dateParts' UTC default, NOT the
    // org's timezone, or a Sept 11 drawing prints as "SEPTEMBER 10" the way
    // event start times originally did before that fix.
    date: game.raffleEndDate, // the drawing / closing date — the one day worth printing on the tab
    stats,
    description: game.eventDetails || null,
    contactPhone: org.phone,
    contactEmail: org.contactEmail,
    registerUrl: flyerUrl,
    registerUrlLabel,
    fineText: fineParts.join("  ·  "),
    // No payUrl, ever — see the file header comment.
    ctaEyebrow: "MORE DETAILS",
    ctaHeadline: "SCAN FOR DETAILS",
  });
}

module.exports = { buildRaffleFlyerPdf, resolveRaffleFlyerUrl };
