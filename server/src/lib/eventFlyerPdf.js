// Event -> the generic flyer content shape (see golfFlyerPdf.js's
// buildEventFlyerPdf, which this reuses directly rather than duplicating
// the PDF-drawing code — that file's own header comment anticipated exactly
// this: "A future Events module can call buildEventFlyerPdf() directly with
// its own mapping.").
const { buildEventFlyerPdf } = require("./golfFlyerPdf");
const { formatPhone } = require("./phone");

// Wherever the org has actually told us this event's public page lives:
// their own external website (PublicLinkBox's "Where did you put this?"
// field, org.embedPageUrls.events) if they've set one, else our own
// /events/:slug page, deep-linked straight to this one event so scanning
// the flyer doesn't dump a visitor on "soonest event" if this isn't it.
// Same reasoning as golf.js's resolveGolfRegisterUrl.
function resolveEventFlyerUrl(org, event) {
  const ownSiteUrl = org.embedPageUrls?.events;
  if (ownSiteUrl) return ownSiteUrl;
  if (!org.slug) return null;
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  return `${appUrl}/events/${org.slug}?event=${event.slug}`;
}

function formatTimeRange(event) {
  if (event.allDay) return "All day";
  const opts = { hour: "numeric", minute: "2-digit" };
  const start = new Date(event.startAt).toLocaleTimeString("en-US", opts);
  const end = new Date(event.endAt).toLocaleTimeString("en-US", opts);
  return start === end ? start : `${start} – ${end}`;
}

async function buildEventRecordFlyerPdf({ org, event, flyerUrl }) {
  // De-dup priceUnit when it just repeats the price — several events store
  // e.g. price "$100" / priceUnit "$100", which otherwise prints "$100 $100".
  const priceParts = [event.price];
  if (event.priceUnit && event.priceUnit.trim() && event.priceUnit.trim() !== (event.price || "").trim()) {
    priceParts.push(event.priceUnit.trim());
  }
  const stats = [
    event.price && { label: "Price", value: priceParts.filter(Boolean).join(" ") },
    { label: "Time", value: formatTimeRange(event) },
    event.location && { label: "Location", value: event.location },
  ].filter(Boolean);

  // The tagline is the event's own one-liner; fall back to the recurrence
  // label ("Second Friday monthly") only when there's no tagline. Location
  // already has its own stat box, so it's dropped from this line.
  const subLine = event.tagline || event.recurrenceLabel || null;

  let registerUrlLabel;
  try {
    const u = new URL(flyerUrl);
    registerUrlLabel = `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    registerUrlLabel = flyerUrl;
  }

  const fineParts = [];
  if (event.admissionNote) fineParts.push(event.admissionNote);
  if (event.reservePhone) fineParts.push(`Or call ${formatPhone(event.reservePhone)}`);

  return buildEventFlyerPdf({
    orgName: org.name,
    orgPhone: org.phone || event.reservePhone,
    primaryColor: org.flyerPrimaryColor,
    accentColor: org.flyerAccentColor,
    eventName: event.title,
    subLine,
    heroImage: event.heroImage || null,
    secondaryImage: event.secondaryImage || null,
    description: event.description || null,
    statusNote: event.statusNote || null,
    date: event.startAt,
    stats,
    includedItems: event.includes || [],
    includedItemsHeading: event.includesHeading,
    scheduleItems: event.scheduleItems || [],
    contactName: event.contactName || null,
    contactPhone: event.reservePhone,
    contactEmail: event.contactEmail || null,
    contactHeading: "QUESTIONS OR RESERVATIONS?",
    payUrl: event.payUrl || null,
    registerUrl: flyerUrl,
    registerUrlLabel,
    fineText: fineParts.join("  ·  "),
    ctaEyebrow: "MORE DETAILS",
    ctaHeadline: "SCAN FOR DETAILS",
  });
}

module.exports = { buildEventRecordFlyerPdf, resolveEventFlyerUrl };
