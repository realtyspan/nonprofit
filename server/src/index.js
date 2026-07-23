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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/schedule1", schedule1Routes);
app.use("/api/disbursements", disbursementRoutes);
app.use("/api/gc7q", gc7qRoutes);
app.use("/api/org", orgRoutes);

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
app.listen(PORT, () => console.log(`Bell Jar Manager API listening on :${PORT}`));
