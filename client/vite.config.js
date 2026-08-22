import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered manually (see src/lib/registerPwa.js) instead of the
      // default auto-injected <script> — the marketing site (elkslodges.org)
      // shares this same build but should never get a service worker: a
      // stale-cache bug there would greet first-time visitors evaluating
      // the product, not just an already-signed-up lodge officer.
      injectRegister: false,
      // App-shell caching only (fast loads, resilient to a flaky connection) —
      // deliberately not an offline-first data cache. API responses always
      // come from the network; only the built JS/CSS/HTML shell is cached.
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallbackDenylist: [/^\/api\//],
        // Without these, an updated service worker sits "waiting" until
        // every open tab for the origin is closed — on a fast-shipping app
        // (this one deploys on every push to main) that means a browser
        // left open can keep serving an increasingly stale cached bundle
        // indefinitely. This makes an update take over immediately instead.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: "Charity Pulse",
        short_name: "Charity Pulse",
        description: "Compliance and operations app for lodge Bell Jar, rentals, calendar, and raffle management.",
        theme_color: "#6860dc",
        background_color: "#f7f7f9",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
