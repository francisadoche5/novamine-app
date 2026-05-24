// Validate the `initData` string Telegram passes to Mini Apps.
//
// Algorithm (per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//   1. Parse initData as URL-encoded form data.
//   2. Extract the `hash` field; collect remaining fields.
//   3. Build `data_check_string` = entries sorted by key, joined as "k=v" with "\n".
//   4. secretKey = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN)
//   5. expectedHash = HMAC_SHA256(key=secretKey, message=data_check_string) → hex
//   6. Constant-time compare expectedHash against the provided hash.
//
// We additionally enforce a freshness window so old initData strings can't be replayed.
import crypto from "node:crypto";
import { config } from "../config.js";

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
}

const MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

export function validateInitData(initData: string): ValidatedInitData {
  if (!initData || typeof initData !== "string") {
    throw httpError(400, "Missing initData");
  }

  // Dev escape hatch — allows the dev mock initData. NEVER enable in production.
  if (config.allowDevAuth && !config.isProd) {
    const parsed = new URLSearchParams(initData);
    if (parsed.get("hash") === "DEV_NO_HMAC") {
      const user = safeJsonParse<TelegramUser>(parsed.get("user"));
      if (!user) throw httpError(400, "Dev initData missing user");
      return {
        user,
        authDate: Number(parsed.get("auth_date")) || Math.floor(Date.now() / 1000),
        queryId: parsed.get("query_id") ?? undefined,
        startParam: parsed.get("start_param") ?? undefined,
      };
    }
  }

  if (!config.bot.token) {
    throw httpError(500, "BOT_TOKEN not configured");
  }

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash");
  if (!providedHash) throw httpError(400, "initData missing hash");
  params.delete("hash");

  // Sort and build data_check_string
  const entries = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(config.bot.token).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!timingSafeEqualHex(expectedHash, providedHash)) {
    throw httpError(401, "Invalid initData signature");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) {
    throw httpError(401, "initData expired");
  }

  const user = safeJsonParse<TelegramUser>(params.get("user"));
  if (!user || typeof user.id !== "number") {
    throw httpError(400, "initData missing user");
  }

  return {
    user,
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
  };
}

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
