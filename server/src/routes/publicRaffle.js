// Public (no login) landing for the raffle kickoff email's unsubscribe
// link. Split into a read-only "who is this" lookup and a separate POST to
// actually record the opt-out, so an email client or security scanner that
// preemptively GETs every link in an inbox can't silently unsubscribe
// people — only the page's own "confirm" button does that.
const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../lib/rateLimit");
const { verifyUnsubscribeToken, normalizeEmail } = require("../lib/raffleUnsubscribe");

const router = express.Router();

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

// The public "view & download your ticket" page's data — see
// raffle.js's send-eticket route for where the link itself is built and
// raffleEmails.js's electronicTicketHtml for the email version of this
// same information. The prize/early-bird derivation here is intentionally
// the same small logic as that email (find the main drawing, sort the rest
// by prize descending, ordinal-label them) so the two can never disagree
// about ranking — kept as its own copy rather than a shared import since
// the email's version is baked into fixed HTML strings and this route
// needs it as plain data for the client to lay out itself.
router.get(
  "/ticket/:ticketId",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 60 }),
  async (req, res) => {
    const ticket = await prisma.raffleTicket.findUnique({ where: { id: req.params.ticketId } });
    // Same gate as send-eticket: "the official ticket can only be sent
    // once funds are received" — a reserved/unpaid ticket's info (buyer
    // name, etc.) is never exposed here even if a link somehow leaked
    // before that point. One generic "not available" for both a missing
    // ticket and a not-yet-paid one, so the response never confirms
    // whether a given id even exists.
    if (!ticket || ticket.status !== "funds_received") {
      return res.status(404).json({ error: "This ticket isn't available." });
    }

    const [game, org, drawings] = await Promise.all([
      prisma.raffleGame.findUnique({ where: { id: ticket.gameId } }),
      prisma.organization.findUnique({ where: { id: ticket.orgId } }),
      prisma.raffleDrawing.findMany({ where: { gameId: ticket.gameId, orgId: ticket.orgId } }),
    ]);

    const mainDrawing = drawings.find((d) => d.drawingType === "main") || null;
    const mainDateKey = mainDrawing ? new Date(mainDrawing.drawingDate).toDateString() : null;
    const earlyBirdDrawings = drawings
      .filter((d) => d.drawingType !== "main" && new Date(d.drawingDate).toDateString() !== mainDateKey)
      .map((d) => ({ drawingDate: d.drawingDate, prizeAmount: d.prizeAmount }));

    const sortedByPrize = [...drawings].sort((a, b) => b.prizeAmount - a.prizeAmount);
    const prizes = sortedByPrize.map((d, i) => ({ rank: ordinal(i + 1), amount: d.prizeAmount }));

    res.json({
      orgName: org.name,
      orgAddress: org.address || "",
      flyerPrimaryColor: org.flyerPrimaryColor || null,
      flyerAccentColor: org.flyerAccentColor || null,
      gameName: game.name,
      ticketNumber: ticket.number,
      buyerName: ticket.buyer,
      admitsPerTicket: game.admitsPerTicket,
      eventVenue: game.eventVenue || "",
      eventDoorsOpenTime: game.eventDoorsOpenTime || "",
      eventDetails: game.eventDetails || "",
      mainDrawingDate: mainDrawing ? mainDrawing.drawingDate : null,
      earlyBirdDrawings,
      prizes,
      tenderType: ticket.tenderType || null,
      tenderAmount: ticket.tenderAmount || 0,
      checkNumber: ticket.checkNumber || null,
      soldAt: ticket.soldAt,
      verificationCode: ticket.id.slice(-8).toUpperCase(),
    });
  }
);

router.get("/unsubscribe-info", rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }), async (req, res) => {
  let payload;
  try {
    payload = verifyUnsubscribeToken(req.query.token);
  } catch {
    return res.status(400).json({ error: "This link is invalid or has expired." });
  }
  const org = await prisma.organization.findUnique({ where: { id: payload.orgId }, select: { name: true } });
  if (!org) return res.status(404).json({ error: "This link is invalid or has expired." });

  const existing = await prisma.raffleEmailSuppression.findUnique({
    where: { orgId_email: { orgId: payload.orgId, email: payload.email } },
  });
  res.json({ orgName: org.name, email: payload.email, alreadyUnsubscribed: !!existing });
});

router.post("/unsubscribe", rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  let payload;
  try {
    payload = verifyUnsubscribeToken(req.body.token);
  } catch {
    return res.status(400).json({ error: "This link is invalid or has expired." });
  }
  const org = await prisma.organization.findUnique({ where: { id: payload.orgId }, select: { name: true } });
  if (!org) return res.status(404).json({ error: "This link is invalid or has expired." });

  await prisma.raffleEmailSuppression.upsert({
    where: { orgId_email: { orgId: payload.orgId, email: normalizeEmail(payload.email) } },
    update: {},
    create: { orgId: payload.orgId, email: normalizeEmail(payload.email) },
  });
  res.json({ ok: true, orgName: org.name, email: payload.email });
});

module.exports = router;
