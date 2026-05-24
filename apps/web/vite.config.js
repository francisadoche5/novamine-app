import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for NovaMine web (Telegram Mini App)
// - Outputs to dist/ for Vercel
// - Dev server on 5173, opens via ngrok / Vercel preview for Telegram
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2020",
  },
});
