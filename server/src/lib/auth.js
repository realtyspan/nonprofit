const jwt = require("jsonwebtoken");
const prisma = require("./prisma");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function signToken(user) {
  // orgId is the only claim baked into the token besides identity — tier and
  // module grants are deliberately NOT embedded here. A token lives up to 7
  // days; permissions must reflect the current DB state on every request (see
  // loadPermissions below), so a revoked grant takes effect immediately
  // instead of surviving until the token expires.
  return jwt.sign({ userId: user.id, orgId: user.orgId }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { userId, orgId }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Loads the caller's current org-wide tier (Owner | Viewer | null) and
// per-module grants (e.g. { "bell-jar": "Admin", "rentals": "Helper" }) fresh
// from the DB on every request. Always run this right after requireAuth.
async function loadPermissions(req, res, next) {
  const [membership, grants] = await Promise.all([
    prisma.orgMembership.findUnique({ where: { userId: req.user.userId } }),
    prisma.moduleGrant.findMany({ where: { userId: req.user.userId } }),
  ]);
  req.orgTier = membership?.tier || null;
  req.moduleGrants = Object.fromEntries(grants.map((g) => [g.module, g.tier]));
  next();
}

function requireOwner(req, res, next) {
  if (req.orgTier !== "Owner") return res.status(403).json({ error: "Owner only" });
  next();
}

const LEVEL = { Viewer: 1, Helper: 2, Admin: 3 };

// minLevel: "Helper" or "Admin". A module-level Viewer grant never passes
// (true read-only within that module — the raffle module's "viewer" role is
// what surfaced the need for this tier). Org-wide Viewer never passes either
// (read-only everywhere). Owner does NOT auto-pass — Owner's default is
// administer + view, not automatic edit rights in a module; an Owner who
// also needs to edit holds a normal module grant like anyone else.
function requirePermission(module, minLevel) {
  return (req, res, next) => {
    const tier = req.moduleGrants[module];
    if (!tier || LEVEL[tier] < LEVEL[minLevel]) {
      return res.status(403).json({ error: `Requires ${minLevel} on ${module}` });
    }
    next();
  };
}

// Read access: an org-wide Owner or Viewer sees everything read-only, or
// anyone holding any grant (Viewer, Helper, or Admin) in that specific module.
function requireReadAccess(module) {
  return (req, res, next) => {
    if (req.orgTier === "Owner" || req.orgTier === "Viewer") return next();
    if (req.moduleGrants[module]) return next();
    return res.status(403).json({ error: "No access to this module" });
  };
}

module.exports = {
  signToken,
  requireAuth,
  loadPermissions,
  requireOwner,
  requirePermission,
  requireReadAccess,
  JWT_SECRET,
};
