// Rental Space pricing + scheduling rules, modeled off the lodge's real paper
// "Facility Event Space Rental Agreement": each space rents in a flat block
// (blockHours) plus a per-hour overage rate, split by member/non-member, with
// an optional bartender add-on (same block+overage shape) and itemized equipment fees.

const MS_PER_HOUR = 1000 * 60 * 60;

// A booking's visible start/end (what the renter sees on the agreement) isn't
// what actually occupies the space — the real hold includes 2 hours before for
// setup and 1 hour after for cleanup, per the lodge's reservation schedule.
const SETUP_BUFFER_HOURS = 2;
const CLEANUP_BUFFER_HOURS = 1;

function holdWindow(startAt, endAt) {
  return {
    holdStart: new Date(new Date(startAt).getTime() - SETUP_BUFFER_HOURS * MS_PER_HOUR),
    holdEnd: new Date(new Date(endAt).getTime() + CLEANUP_BUFFER_HOURS * MS_PER_HOUR),
  };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// booking: { startAt, endAt, isMember, wantsBartender, wantsLinen, expectedGuests, roundTables, longTables, chairs, kitchenUse, chafingDishes }
function computeRentalQuote(space, booking) {
  const hours = (new Date(booking.endAt) - new Date(booking.startAt)) / MS_PER_HOUR;
  const overageHours = Math.max(0, hours - space.blockHours);

  const baseRate = booking.isMember ? space.baseRateMember : space.baseRateNonMember;
  const overageRate = booking.isMember ? space.overageRateMember : space.overageRateNonMember;
  const spaceCost = baseRate + overageHours * overageRate;

  const bartenderCost = booking.wantsBartender
    ? space.bartenderBaseRate + overageHours * space.bartenderOverageRate
    : 0;

  const linenCost = booking.wantsLinen
    ? (booking.roundTables || 0) * space.linenRoundTableFee +
      (booking.longTables || 0) * space.linenLongTableFee +
      (booking.expectedGuests || 0) * space.linenPerGuestFee
    : 0;

  const kitchenFee =
    booking.kitchenUse === "no_oven"
      ? space.kitchenNoOvenFee
      : booking.kitchenUse === "with_oven"
      ? space.kitchenWithOvenFee
      : 0;

  const equipmentCost =
    (booking.roundTables || 0) * space.roundTableFee +
    (booking.longTables || 0) * space.longTableFee +
    (booking.chairs || 0) * space.chairFee +
    (booking.chafingDishes || 0) * space.chafingDishFee +
    kitchenFee;

  const total = spaceCost + bartenderCost + linenCost + equipmentCost;

  return { hours, overageHours, spaceCost, bartenderCost, linenCost, equipmentCost, total };
}

// booking.payments: that booking's RentalPayment rows. balanceDue is
// deliberately never floored at 0 — an overpayment (or an adjustment applied
// after the balance was already covered) shows as negative so it reads as a
// credit rather than silently disappearing.
function computeBookingBalance(booking) {
  const payments = booking.payments || [];
  const totalPaid = payments.filter((p) => p.type === "payment").reduce((s, p) => s + p.amount, 0);
  const totalAdjustments = payments.filter((p) => p.type === "adjustment").reduce((s, p) => s + p.amount, 0);
  const balanceDue = (booking.quotedTotal || 0) - totalPaid - totalAdjustments;
  return { totalPaid, totalAdjustments, balanceDue };
}

// existingBookings: confirmed/completed RentalBooking rows for the same space
// existingBlocks: RentalBlock rows for the same space
function hasConflict(startAt, endAt, existingBookings, existingBlocks, excludeBookingId) {
  const { holdStart, holdEnd } = holdWindow(startAt, endAt);

  const bookingConflict = existingBookings.some((b) => {
    if (b.id === excludeBookingId) return false;
    const other = holdWindow(b.startAt, b.endAt);
    return overlaps(holdStart, holdEnd, other.holdStart, other.holdEnd);
  });
  if (bookingConflict) return true;

  return existingBlocks.some((blk) => overlaps(holdStart, holdEnd, new Date(blk.startAt), new Date(blk.endAt)));
}

module.exports = { holdWindow, computeRentalQuote, hasConflict, computeBookingBalance };
