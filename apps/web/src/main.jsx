import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { initTelegram } from "./lib/telegram.js";
import { authenticate } from "./lib/auth.js";

// Boot order:
// 1. Init Telegram WebApp (or dev mock if running outside Telegram)
// 2. Authenticate against our Render API (validates initData server-side)
// 3. Mount the React tree
async function boot() {
  initTelegram();
  // Fire-and-forget: auth runs in background, App can read session lazily.
  // We don't block the UI on it so the app feels instant.
  authenticate().catch((err) => {
    console.warn("[novamine] auth failed (will retry from app):", err);
  });

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

boot();
