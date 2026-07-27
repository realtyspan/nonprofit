// Minimal in-memory IP rate limiter for the app's first public (unauthenticated)
// write endpoints. Good enough for a single-instance deploy; not distributed.
function rateLimit({ windowMs, max }) {
  const hits = new Map(); // ip -> [timestamps]

  return (req, res, next) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: "Too many requests — please try again later" });
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

module.exports = { rateLimit };
