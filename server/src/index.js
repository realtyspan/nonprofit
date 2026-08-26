require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const dealRoutes = require("./routes/deals");
const schedule1Routes = require("./routes/schedule1");
const disbursementRoutes = require("./routes/disbursements");
const gc7qRoutes = require("./routes/gc7q");
const orgRoutes = require("./routes/org");
const permissionRoutes = require("./routes/permissions");
const rentalRoutes = require("./routes/rentals");
const publicRentalRoutes = require("./routes/publicRentals");
const calendarRoutes = require("./routes/calendar");
const publicCalendarRoutes = require("./routes/publicCalendar");
const raffleRoutes = require("./routes/raffle");
const publicRaffleRoutes = require("./routes/publicRaffle");
const golfRoutes = require("./routes/golf");
const platformAdminRoutes = require("./routes/platformAdmin");
const elksToolsRoutes = require("./routes/elksTools");
const { stripeWebhookHandler } = require("./routes/stripeWebhook");

// Express 4 doesn't catch rejected promises from async route handlers, and Node
// terminates the process on an unhandled rejection by default — one bad request
// (e.g. a stale org reference) would otherwise take the whole API down.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

const app = express();
app.set("trust proxy", 1);
app.use(cors());

// Registered before the global JSON parser below, and deliberately given its
// own express.raw() instead — Stripe's webhook signature check needs the
// untouched raw request body, not JSON.parse'd output. Routes are matched in
// registration order, so a request to this exact path never reaches
// express.json() at all.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler);

// Default 100kb is too small for a signature image (base64 PNG from the
// Rental contract signing pad) or a compressed game-label photo.
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/schedule1", schedule1Routes);
app.use("/api/disbursements", disbursementRoutes);
app.use("/api/gc7q", gc7qRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/public/rentals", publicRentalRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/public/calendar", publicCalendarRoutes);
app.use("/api/raffle", raffleRoutes);
app.use("/api/public/raffle", publicRaffleRoutes);
app.use("/api/golf", golfRoutes);
app.use("/api/platform-admin", platformAdminRoutes);
app.use("/api/elks-tools", elksToolsRoutes);

// In production the client is built to ../../client/dist and served from here —
// no separate frontend service needed. In dev, this directory doesn't exist
// (Vite's own dev server handles the frontend instead), so this is a no-op.
const clientDist = path.join(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Charity Pulse API listening on :${PORT}`));
