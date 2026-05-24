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

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("users")
      .select("id, telegram_id, username, referrer_id")
      .eq("telegram_id", tg.id)
      .maybeSingle();
    if (selErr) throw selErr;

    let userId: string;

    if (!existing) {
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

      if (referrerId) {
        try {
          await supabaseAdmin
            .from("referrals")
            .insert({ referrer_id: referrerId, referred_id: userId, status: "pending" });
        } catch (_) {
          // ignore duplicate
        }
      }
    } else {
      userId = existing.id;
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
      refreshToken: accessToken,
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

function parseReferral(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^ref_(\d{1,15})$/.exec(raw);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}
