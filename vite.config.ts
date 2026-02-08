import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*", "models/*", "mediapipe/wasm/*"],
      devOptions: {
        // Keep SW off in dev to avoid caching confusion; test offline via `npm run build && npm run preview`.
        enabled: false
      },
      // Avoids occasional terser/workbox issues on newer Node versions.
      minify: false,
      manifest: {
        name: "Gaze Direction Tracker",
        short_name: "GazeTracker",
        description: "On-device eye-direction tracker (left/right/up/down/center).",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
          {
            src: "/icons/icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // Workbox uses Rollup+Terser in production mode; on some environments this can
        // fail with "Unexpected early exit" from terser. Development mode keeps the
        // SW unminified but reliable.
        mode: "development",
        disableDevLogs: true,
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,task,wasm,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/models/") ||
              url.pathname.startsWith("/mediapipe/wasm/"),
            handler: "CacheFirst",
            options: {
              cacheName: "gaze-assets",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    host: "localhost",
    proxy: {
      "/api": {
        target: process.env.VITE_TTS_PROXY_TARGET || "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  }
});
