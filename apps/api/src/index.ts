// NovaMine API — entry point.
// Hosts:
//   1. Express HTTP API (consumed by the Vercel-hosted Mini App)
//   2. Telegram bot (grammy) — receives updates via webhook in prod, long-poll in dev
//
// Both share the same process so Render only needs one web service.
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { miningRouter } from "./routes/mining.js";
import { gamesRouter } from "./routes/games.js";
import { tasksRouter } from "./routes/tasks.js";
import { swapRouter } from "./routes/swap.js";
import { withdrawRouter } from "./routes/withdraw.js";
import { shopRouter } from "./routes/shop.js";
import { referralsRouter } from "./routes/referrals.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { adminRouter } from "./routes/admin.js";
import { errorHandler } from "./middleware/error.js";
import { startBot } from "./bot/index.js";

const app = express();

// Behind Render's load balancer
app.set("trust proxy", 1);

app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / curl (no origin header)
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      // Allow any Vercel preview deployment of our project
      if (/\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// Healthcheck (Render pings this)
app.get("/", (_req, res) => res.json({ ok: true, service: "novamine-api" }));
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Public routes
app.use("/auth", authRouter);
app.use("/leaderboard", leaderboardRouter);

// Authenticated routes
app.use("/me", meRouter);
app.use("/mining", miningRouter);
app.use("/games", gamesRouter);
app.use("/tasks", tasksRouter);
app.use("/swap", swapRouter);
app.use("/withdraw", withdrawRouter);
app.use("/shop", shopRouter);
app.use("/referrals", referralsRouter);
app.use("/admin", adminRouter);

app.use(errorHandler);

// Boot the Telegram bot alongside the HTTP server.
// In production we use a webhook (mounted on this same Express app).
// In development we long-poll so you don't need a public URL.
startBot(app).catch((err) => {
  console.error("[bot] failed to start:", err);
});

app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port} (env=${config.nodeEnv})`);
});
