// Client-side mirror of server/src/lib/rentalLogic.js's computeRentalQuote, used
// only for live preview (staff confirm modal, public inquiry form). The server
// is the source of truth and recomputes independently when a booking is confirmed.
const MS_PER_HOUR = 1000 * 60 * 60;

export function computeRentalQuote(space, booking) {
  if (!space || !booking.startAt || !booking.endAt) return null;
  const hours = (new Date(booking.endAt) - new Date(booking.startAt)) / MS_PER_HOUR;
  if (!(hours > 0)) return null;
  const overageHours = Math.max(0, hours - space.blockHours);

  const baseRate = booking.isMember ? space.baseRateMember : space.baseRateNonMember;
  const overageRate = booking.isMember ? space.overageRateMember : space.overageRateNonMember;
  const spaceCost = baseRate + overageHours * overageRate;

  const bartenderCost = booking.wantsBartender ? space.bartenderBaseRate + overageHours * space.bartenderOverageRate : 0;

  const kitchenFee =
    booking.kitchenUse === "no_oven" ? space.kitchenNoOvenFee : booking.kitchenUse === "with_oven" ? space.kitchenWithOvenFee : 0;

  const equipmentCost =
    (Number(booking.roundTables) || 0) * space.roundTableFee +
    (Number(booking.longTables) || 0) * space.longTableFee +
    (Number(booking.chairs) || 0) * space.chairFee +
    (Number(booking.chafingDishes) || 0) * space.chafingDishFee +
    kitchenFee;

  const total = spaceCost + bartenderCost + equipmentCost;

  return { hours, overageHours, spaceCost, bartenderCost, equipmentCost, total };
}
