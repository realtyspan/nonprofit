import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // App-shell caching only (fast loads, resilient to a flaky connection) —
      // deliberately not an offline-first data cache. API responses always
      // come from the network; only the built JS/CSS/HTML shell is cached.
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallbackDenylist: [/^\/api\//],
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
