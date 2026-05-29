import React from "react";
import { createRoot } from "react-dom/client";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import App from "./App.jsx";
import { initTelegram } from "./lib/telegram.js";
import { authenticate } from "./lib/auth.js";

// The manifest must be publicly accessible. Host at /tonconnect-manifest.json on your domain.
const MANIFEST_URL =
  (import.meta.env.VITE_APP_URL
    ? `${import.meta.env.VITE_APP_URL}/tonconnect-manifest.json`
    : `${window.location.origin}/tonconnect-manifest.json`);

async function boot() {
  initTelegram();
  authenticate().catch((err) => {
    console.warn("[novamine] auth failed (will retry from app):", err);
  });

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
        <App />
      </TonConnectUIProvider>
    </React.StrictMode>
  );
}

boot();
