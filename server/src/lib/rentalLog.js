const prisma = require("./prisma");

// Single canonical activity-log writer for rental bookings — every
// state-changing endpoint (in rentals.js and the public inquiry route) goes
// through this instead of writing RentalLog rows inline at each call site.
// Same purpose as raffle.js's addRaffleLog. actorName is "" for something a
// public visitor did (there's no staff actor); pass it explicitly otherwise.
async function addRentalLog(orgId, bookingId, { type, text, actorName }) {
  await prisma.rentalLog.create({ data: { orgId, bookingId, type, text, actorName: actorName ?? "" } });
}

module.exports = { addRentalLog };
