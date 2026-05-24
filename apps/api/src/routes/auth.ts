// POST /auth/telegram
// Body: { initData: string, startParam?: string|null }
// Validates the Telegram-signed initData, upserts the user in Supabase,
// records the referrer (if any & not already set), and mints a JWT.
import { Router } from "express";
import { z } from "zod";
import { validateInitData } from "../auth/telegram.js";
import { signUserJwt } from "../auth/jwt.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const authRouter = Router();

const Body = z.object({
  initData: z.string().min(1),
  startParam: z.string().nullish(),
});

authRouter.post("/telegram", async (req, res, next) => {
  try {
    const { initData, startParam } = Body.parse(req.body);
    const validated = validateInitData(initData);

    const tg = validated.user;
    const ref = startParam ?? validated.startParam ?? null;
    const referrerTelegramId = parseReferral(ref);

    // Upsert user by telegram_id. The DB default fills in `id` (uuid) and timestamps.
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("users")
      .select("id, telegram_id, username, referrer_id")
      .eq("telegram_id", tg.id)
      .maybeSingle();
    if (selErr) throw selErr;

    let userId: string;

    if (!existing) {
      // Resolve referrer id (if a valid referral code was passed)
      let referrerId: string | null = null;
      if (referrerTelegramId && referrerTelegramId !== tg.id) {
        const { data: refUser } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("telegram_id", referrerTelegramId)
          .maybeSingle();
        referrerId = refUser?.id ?? null;
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("users")
        .insert({
          telegram_id: tg.id,
          username: tg.username ?? null,
          first_name: tg.first_name ?? null,
          last_name: tg.last_name ?? null,
          language_code: tg.language_code ?? null,
          photo_url: tg.photo_url ?? null,
          referrer_id: referrerId,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      userId = inserted.id;

      // Record the referral relationship in its own table for tracking
      if (referrerId) {
        await supabaseAdmin
          .from("referrals")
          .insert({ referrer_id: referrerId, referred_id: userId, status: "pending" })
          .then(() => null)
          .catch(() => null); // ignore unique-violation if double-insert
      }
    } else {
      userId = existing.id;
      // Refresh profile fields opportunistically
      await supabaseAdmin
        .from("users")
        .update({
          username: tg.username ?? null,
          first_name: tg.first_name ?? null,
          last_name: tg.last_name ?? null,
          photo_url: tg.photo_url ?? null,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    const accessToken = signUserJwt({
      id: userId,
      telegramId: tg.id,
      username: tg.username,
    });

    res.json({
      accessToken,
      refreshToken: accessToken, // simple model for now; rotation can come later
      user: {
        id: userId,
        telegramId: tg.id,
        username: tg.username ?? null,
        firstName: tg.first_name ?? null,
        lastName: tg.last_name ?? null,
        photoUrl: tg.photo_url ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Telegram passes referral codes as the deep-link argument.
 * We use the convention `ref_<telegramId>` so the bot can hand out links like
 *   t.me/NovaMineBot/app?startapp=ref_12345
 */
function parseReferral(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^ref_(\d{1,15})$/.exec(raw);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}
