// The live, current list of valid module keys — grows every time a new
// module is added. Deliberately separate from prisma/backfill-permissions.js's
// own MODULES constant, which is frozen to "modules that existed at cutover"
// for that one-time historical backfill and must NOT grow to match this list.
const MODULE_KEYS = ["bell-jar", "rentals", "calendar", "raffle", "elks-tools"];

module.exports = { MODULE_KEYS };
