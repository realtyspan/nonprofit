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
