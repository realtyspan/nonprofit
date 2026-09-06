const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, loadPermissions, requirePermission, requireReadAccess } = require("../lib/auth");
const { publishEvent, removeCalendarEventFor } = require("../lib/calendarSync");
const { buildEventRecordFlyerPdf, resolveEventFlyerUrl } = require("../lib/eventFlyerPdf");

const router = express.Router();
router.use(requireAuth, loadPermissions);

// Denormalized createdByName needs the caller's current display name — the
// JWT only carries userId/orgId (see auth.js) — same pattern as golf.js.
router.use(async (req, res, next) => {
  req.callerUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, name: true } });
  next();
});

// Same real ceiling as golf.js's MAX_FLYER_IMAGE_CHARS — this string
// round-trips through the public events page on every visit, not just an
// admin-only view, so it's capped well under what the client's own resize
// step already targets.
const MAX_EVENT_IMAGE_CHARS = 600000;

function cleanIncludes(items) {
  if (!Array.isArray(items)) return null;
  const cleaned = items.map((s) => String(s || "").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

// Lowercase-hyphenated, same shape org.js requires of the shared org slug.
// De-duped within the org (not globally — each org's events are their own
// namespace) by appending "-2", "-3", etc. on collision.
function slugify(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "event";
}

async function uniqueSlug(orgId, title) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (await prisma.event.findUnique({ where: { orgId_slug: { orgId, slug } } })) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function resolveEventFields(body) {
  const {
    title, tagline, description, location, startAt, endAt, allDay,
    shortTitle, recurrenceLabel, heroImage, secondaryImage,
    price, priceUnit, payUrl, reservePhone, statusNote, admissionNote,
    includesHeading, includes,
  } = body;

  if (!title || !title.trim()) throw Object.assign(new Error("title is required"), { status: 400 });

  const parsedStart = new Date(startAt);
  if (isNaN(parsedStart.getTime())) throw Object.assign(new Error("startAt must be a valid date"), { status: 400 });
  const parsedEnd = endAt ? new Date(endAt) : parsedStart;
  if (isNaN(parsedEnd.getTime())) throw Object.assign(new Error("endAt must be a valid date"), { status: 400 });

  if (heroImage && heroImage.length > MAX_EVENT_IMAGE_CHARS) {
    throw Object.assign(new Error("That hero photo is too large — choose a smaller or simpler image"), { status: 400 });
  }
  if (secondaryImage && secondaryImage.length > MAX_EVENT_IMAGE_CHARS) {
    throw Object.assign(new Error("That second photo is too large — choose a smaller or simpler image"), { status: 400 });
  }

  return {
    title: title.trim(),
    shortTitle: shortTitle?.trim() || null,
    tagline: tagline?.trim() || null,
    description: description?.trim() || null,
    location: location?.trim() || null,
    startAt: parsedStart,
    endAt: parsedEnd,
    allDay: !!allDay,
    recurrenceLabel: recurrenceLabel?.trim() || null,
    heroImage: heroImage || null,
    secondaryImage: secondaryImage || null,
    price: price?.trim ? price.trim() || null : price || null,
    priceUnit: priceUnit?.trim() || null,
    payUrl: payUrl?.trim() || null,
    reservePhone: reservePhone?.trim() || null,
    statusNote: statusNote?.trim() || null,
    admissionNote: admissionNote?.trim() || null,
    includesHeading: includesHeading?.trim() || null,
    includes: cleanIncludes(includes),
  };
}

router.get("/", requireReadAccess("events"), async (req, res) => {
  const events = await prisma.event.findMany({ where: { orgId: req.user.orgId }, orderBy: { startAt: "asc" } });
  res.json(events);
});

// Print-ready flyer PDF with a QR code — see resolveEventFlyerUrl for the
// QR's destination. Same shape/permission level as golf.js's own tournament
// flyer route.
router.get("/:id/flyer", requireReadAccess("events"), async (req, res) => {
  const event = await prisma.event.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  const flyerUrl = resolveEventFlyerUrl(org, event);
  if (!flyerUrl) {
    return res.status(400).json({ error: "Set up your organization's public link first (Events → Public link), then download the flyer." });
  }

  let bytes;
  try {
    bytes = await buildEventRecordFlyerPdf({ org, event, flyerUrl });
  } catch (err) {
    return res.status(500).json({ error: "Couldn't generate the flyer: " + err.message });
  }

  const fileSafeName = event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "event";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileSafeName}-flyer.pdf"`);
  res.send(Buffer.from(bytes));
});

router.post("/", requirePermission("events", "Admin"), async (req, res) => {
  let fields;
  try {
    fields = resolveEventFields(req.body);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const slug = await uniqueSlug(req.user.orgId, fields.title);
  const event = await prisma.event.create({
    data: {
      orgId: req.user.orgId,
      slug,
      status: "draft",
      createdByUserId: req.user.userId,
      createdByName: req.callerUser?.name || "",
      ...fields,
    },
  });
  res.json(event);
});

// Slug is deliberately immutable once set — it's baked into the event's
// public deep link and its synced CalendarEvent's linkUrl (see
// calendarSync.js's publishEvent); regenerating it on a title edit would
// silently break both.
router.patch("/:id", requirePermission("events", "Admin"), async (req, res) => {
  const event = await prisma.event.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });

  let fields;
  try {
    fields = resolveEventFields(req.body);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const updated = await prisma.event.update({ where: { id: event.id }, data: fields });
  if (updated.status === "published") {
    const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
    await publishEvent(req.user.orgId, updated, org);
  }
  res.json(updated);
});

router.post("/:id/publish", requirePermission("events", "Admin"), async (req, res) => {
  const event = await prisma.event.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const updated = await prisma.event.update({ where: { id: event.id }, data: { status: "published" } });
  const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
  await publishEvent(req.user.orgId, updated, org);
  res.json(updated);
});

router.post("/:id/unpublish", requirePermission("events", "Admin"), async (req, res) => {
  const event = await prisma.event.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const updated = await prisma.event.update({ where: { id: event.id }, data: { status: "draft" } });
  await removeCalendarEventFor("event", event.id);
  res.json(updated);
});

router.post("/:id/cancel", requirePermission("events", "Admin"), async (req, res) => {
  const event = await prisma.event.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const updated = await prisma.event.update({ where: { id: event.id }, data: { status: "cancelled" } });
  await removeCalendarEventFor("event", event.id);
  res.json(updated);
});

router.delete("/:id", requirePermission("events", "Admin"), async (req, res) => {
  const event = await prisma.event.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!event) return res.status(404).json({ error: "Event not found" });

  await prisma.event.delete({ where: { id: event.id } });
  await removeCalendarEventFor("event", event.id);
  res.json({ ok: true });
});

module.exports = router;
