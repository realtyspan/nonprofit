// AI-assisted first-draft description for an Event — same philosophy as
// labelScan.js/golfHistoricalImportAi.js: the result only ever pre-fills a
// field the admin reviews and can rewrite before saving, so an imperfect
// draft here is a UX cost, not a data-integrity risk. Its own small,
// self-contained file rather than a shared "callClaude" helper — same
// convention those two follow (each AI feature owns its own call, prompt,
// and extraction rather than a shared abstraction, since the three have
// almost nothing in common beyond the HTTP call shape).
const { logAiUsage } = require("./aiUsage");
const { sanitizeDescriptionHtml } = require("./richText");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5";

// startAt/endAt are real UTC instants (not a bare calendar day the way a
// GolfTournament/RaffleGame date is) — formatted in the org's own zone for
// the same reason eventFlyerPdf.js's formatTimeRange is: this runs on the
// server, with no browser-local timezone to fall back on.
function formatEventDateTime({ startAt, endAt, allDay }, timeZone) {
  if (!startAt) return null;
  const start = new Date(startAt);
  if (isNaN(start.getTime())) return null;
  const dateStr = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone });
  if (allDay) return dateStr;
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const end = endAt ? new Date(endAt) : null;
  if (!end || isNaN(end.getTime())) return `${dateStr}, ${startTime}`;
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return startTime === endTime ? `${dateStr}, ${startTime}` : `${dateStr}, ${startTime} – ${endTime}`;
}

// De-dupes priceUnit when it just repeats price — mirrors eventFlyerPdf.js's
// own priceParts logic so the draft doesn't read "$25 $25".
function formatPrice(price, priceUnit) {
  if (!price) return null;
  const unit = priceUnit && priceUnit.trim();
  return unit && unit !== price.trim() ? `${price} ${unit}` : price;
}

function buildFieldsSummary(fields, timeZone) {
  const lines = [];
  if (fields.title) lines.push(`Title: ${fields.title}`);
  if (fields.tagline) lines.push(`One-line tagline already shown elsewhere on the page: ${fields.tagline}`);
  const when = formatEventDateTime(fields, timeZone);
  if (when) lines.push(`When: ${when}`);
  if (fields.location) lines.push(`Location: ${fields.location}`);
  const price = formatPrice(fields.price, fields.priceUnit);
  if (price) lines.push(`Price: ${price}`);
  const includes = (fields.includes || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (includes.length) lines.push(`What's included: ${includes.join(", ")}`);
  return lines.join("\n");
}

const PROMPT_PREFIX = `You are drafting a short public-facing description for a community nonprofit's event listing — an Elks lodge, VFW post, fire department, or similar volunteer organization's own members-and-neighbors event page, not a corporate or wedding listing.

Using ONLY the facts below, write 2-4 sentences in a warm, inviting, plain-spoken voice.

Event details:
`;

const PROMPT_SUFFIX = `

Rules:
- Don't invent any fact not given above — no made-up menu items, activities, guests, or prices.
- Don't restate the date, time, price, or location as prose — those already show elsewhere on the page. Write about the event itself: what it is, who it's for, why someone would want to come.
- Output format: plain minimal HTML using only <p>, <strong>, <ul>, <li> tags. Wrap each paragraph in its own <p>. Use <strong> sparingly, only for one genuinely important phrase if any. Only use a <ul> if the "what's included" list above has 3 or more items worth restating as bullets — otherwise write prose only, don't invent a list.
- Respond with ONLY the HTML — no markdown, no code fences, no preamble or explanation.`;

async function callClaude(prompt, { orgId, feature }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("AI drafting isn't configured for this deployment (missing ANTHROPIC_API_KEY)");
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`AI drafting failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  // Logged as soon as we know tokens were actually spent — even if the
  // extraction below then fails, the org still incurred this call's cost.
  await logAiUsage({
    orgId, feature, model: MODEL,
    inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens,
  });
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock || !textBlock.text.trim()) throw new Error("AI drafting returned no text — try again");
  return textBlock.text.trim();
}

// fields: whatever's currently filled into the event editor form — see
// events.js's POST /draft-description. Works for a brand-new, not-yet-saved
// event just as well as an edit, since this never touches the DB itself; it
// only ever returns a draft for the client to drop into the description
// field, same "pre-fill, never auto-save" contract as the historical import.
async function draftEventDescription(fields, orgId, timeZone) {
  if (!fields.title || !fields.title.trim()) {
    throw Object.assign(new Error("Add a title first — the draft needs at least that to work from"), { status: 400 });
  }
  const prompt = `${PROMPT_PREFIX}${buildFieldsSummary(fields, timeZone)}${PROMPT_SUFFIX}`;
  const rawHtml = await callClaude(prompt, { orgId, feature: "event-description-draft" });
  // Sanitized here too, not just on save (events.js's resolveEventFields
  // already does that independently) — this is the same "sanitize is the
  // real trust boundary, never assume a caller already did it" posture, and
  // it also strips anything odd a model response might include despite the
  // prompt (a stray code fence, a wrapping tag outside the allowlist).
  const clean = sanitizeDescriptionHtml(rawHtml);
  if (!clean) throw new Error("The AI draft came back empty — try again");
  return clean;
}

module.exports = { draftEventDescription };
