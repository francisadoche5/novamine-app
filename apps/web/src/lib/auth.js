// Auth flow:
// 1. Read initData from the Telegram WebApp (or dev mock)
// 2. POST it to our Render API → server validates HMAC against BOT_TOKEN
// 3. Server returns { accessToken, refreshToken, user, isNewUser, giftClaimed, welcomeTon }
// 4. We store the access token for the API client and prime the Supabase session
//    so subsequent supabase.from(...) calls run as the authenticated user.
import { getInitData, getTelegramUser } from "./telegram.js";
import { setApiToken, api } from "./api.js";
import { setSupabaseSession } from "./supabase.js";

let currentSession = null;

export function getSession() {
  return currentSession;
}

export async function authenticate() {
  const initData = getInitData();
  if (!initData) {
    throw new Error("No Telegram initData available — open this app inside Telegram or set up dev mode");
  }

  // Telegram passes the bot's start_param (referral code) via WebApp.initDataUnsafe.start_param
  const startParam =
    typeof window !== "undefined"
      ? window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null
      : null;

  const result = await api.authTelegram(initData, startParam);

  // result shape: { accessToken, refreshToken, user, isNewUser, giftClaimed, welcomeTon }
  setApiToken(result.accessToken);
  await setSupabaseSession(result.accessToken, result.refreshToken);

  currentSession = {
    accessToken: result.accessToken,
    user:        result.user ?? getTelegramUser(),
    isNewUser:   result.isNewUser   ?? false,  // FIX: was silently dropped before
    giftClaimed: result.giftClaimed ?? true,   // FIX: was silently dropped before
    welcomeTon:  result.welcomeTon  ?? 1.5,    // FIX: was silently dropped before
  };
  return currentSession;
}
