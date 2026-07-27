const express = require("express");
const prisma = require("../lib/prisma");
const { rateLimit } = require("../lib/rateLimit");

const router = express.Router();

const PUBLIC_SPACE_FIELDS = {
  id: true, name: true, capacity: true, blockHours: true,
  baseRateMember: true, baseRateNonMember: true,
  overageRateMember: true, overageRateNonMember: true,
  offersBartender: true, bartenderBaseRate: true, bartenderOverageRate: true,
  roundTableFee: true, longTableFee: true, chairFee: true,
  kitchenNoOvenFee: true, kitchenWithOvenFee: true, chafingDishFee: true,
  depositAmount: true,
};

// Org info + active spaces + a busy-window list (no renter info) so the public
// page can show what's already taken without exposing anyone's booking details.
router.get("/:slug", async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
  if (!org) return res.status(404).json({ error: "Not found" });

  const spaces = await prisma.rentalSpace.findMany({
    where: { orgId: org.id, active: true },
    select: PUBLIC_SPACE_FIELDS,
    orderBy: { name: "asc" },
  });

  const spaceIds = spaces.map((s) => s.id);
  const from = new Date();
  const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

  const [bookings, blocks] = await Promise.all([
    prisma.rentalBooking.findMany({
      where: { spaceId: { in: spaceIds }, status: { in: ["confirmed", "completed"] }, startAt: { lte: to }, endAt: { gte: from } },
      select: { spaceId: true, startAt: true, endAt: true },
    }),
    prisma.rentalBlock.findMany({
      where: { spaceId: { in: spaceIds }, startAt: { lte: to }, endAt: { gte: from } },
      select: { spaceId: true, startAt: true, endAt: true },
    }),
  ]);

  res.json({ orgName: org.name, spaces, busy: [...bookings, ...blocks] });
});

// Always creates an "inquiry" — never auto-confirms. `website` is a honeypot
// field: real visitors never see or fill it, so a non-empty value means a bot.
router.post(
  "/:slug/inquiries",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
    if (!org) return res.status(404).json({ error: "Not found" });

    if (req.body.website) {
      return res.json({ ok: true }); // silently drop suspected bot submissions
    }

    const { spaceId, renterName, renterEmail, renterPhone, renterAddress, isMember, eventType, expectedGuests, startAt, endAt, wantsBartender, roundTables, longTables, chairs, kitchenUse, chafingDishes, notes } = req.body;

    if (!spaceId || !renterName || !renterEmail || !startAt || !endAt) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const space = await prisma.rentalSpace.findFirst({ where: { id: spaceId, orgId: org.id, active: true } });
    if (!space) return res.status(404).json({ error: "Space not found" });

    const booking = await prisma.rentalBooking.create({
      data: {
        orgId: org.id,
        spaceId: space.id,
        renterName, renterEmail, renterPhone, renterAddress,
        isMember: !!isMember,
        eventType,
        expectedGuests: expectedGuests ? Number(expectedGuests) : null,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        wantsBartender: !!wantsBartender,
        roundTables: Number(roundTables) || 0,
        longTables: Number(longTables) || 0,
        chairs: Number(chairs) || 0,
        kitchenUse: kitchenUse || null,
        chafingDishes: Number(chafingDishes) || 0,
        notes,
      },
    });
    res.json({ ok: true, id: booking.id });
  }
);

module.exports = router;
