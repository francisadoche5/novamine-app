// Centralised env loading with hard fail on missing critical values in production.
import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`[config] Missing required env var: ${name}`);
    }
    console.warn(`[config] ${name} is not set — using empty string for dev`);
    return "";
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  allowDevAuth: process.env.ALLOW_DEV_AUTH === "true",

  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  bot: {
    token: required("BOT_TOKEN"),
    username: optional("BOT_USERNAME"),
    publicUrl: optional("PUBLIC_API_URL", "http://localhost:8080"),
    webhookSecret: optional("TELEGRAM_WEBHOOK_SECRET"),
  },

  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    jwtSecret: required("SUPABASE_JWT_SECRET"),
  },

  ton: {
    walletAddress: optional("TON_WALLET_ADDRESS"),
  },

  jwtExpiresInSec: Number(process.env.JWT_EXPIRES_IN ?? 60 * 60 * 24 * 7),
};
