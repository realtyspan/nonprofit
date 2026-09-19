// The live, current list of valid module keys — grows every time a new
// module is added. Deliberately separate from prisma/backfill-permissions.js's
// own MODULES constant, which is frozen to "modules that existed at cutover"
// for that one-time historical backfill and must NOT grow to match this list.
const MODULE_KEYS = ["bell-jar", "rentals", "calendar", "raffle", "elks-tools", "events", "tournaments"];

// Mirrors client/src/lib/modules.js's MODULE_CATEGORY_RESTRICTIONS — a module
// listed here is only relevant to the named organization categories (Elks
// Tools is Elks-Lodge-specific). Anything not listed is open to every org.
// Kept in sync by hand: it's two lines, and the client one only decides what
// to *show*, while this one decides what a brand-new Owner is *granted*.
const MODULE_CATEGORY_RESTRICTIONS = {
  "elks-tools": ["Elks Lodge"],
};

// Every module an org of this category may use. Under the flat plan every
// module is included, so a new org's Owner is granted Admin on all of them at
// signup (see auth.js's /signup-org) rather than landing in an app where every
// create/edit action is refused until they hunt down the Team screen.
function modulesForCategory(categoryName) {
  return MODULE_KEYS.filter((key) => {
    const allowed = MODULE_CATEGORY_RESTRICTIONS[key];
    return !allowed || (!!categoryName && allowed.includes(categoryName));
  });
}

module.exports = { MODULE_KEYS, MODULE_CATEGORY_RESTRICTIONS, modulesForCategory };
