import { Router } from "express";
import { z } from "zod";
import { validateInitData } from "../auth/telegram.js";
import { signUserJwt } from "../auth/jwt.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

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

      // Load reward config from app_config
      const { data: cfgRows } = await supabaseAdmin
        .from("app_config")
        .select("key,value")
        .in("key", ["welcome_ton", "referral_ton"]);
      const cfg: Record<string, number> = {};
      (cfgRows ?? []).forEach((r: any) => { cfg[r.key] = Number(r.value); });
      const welcomeTon   = cfg.welcome_ton  ?? 1.5;
      const referralTon  = cfg.referral_ton ?? 0.005;

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
          ton_balance: welcomeTon,    // welcome gift credited on signup
          gift_claimed: false,        // tracks whether popup has been shown
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
          // Credit referral bonus to referrer
          const { data: referrer } = await supabaseAdmin
            .from("users").select("ton_balance").eq("id", referrerId).single();
          if (referrer) {
            await supabaseAdmin
              .from("users")
              .update({ ton_balance: Number(referrer.ton_balance) + referralTon })
              .eq("id", referrerId);
          }
        } catch (_) { /* ignore duplicate */ }
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

    // Fetch gift_claimed flag and welcome amount to send to frontend.
    // FIX: for brand-new users we already know gift_claimed is false — don't
    // rely on the re-read which can race and return the wrong value.
    const { data: freshUser } = await supabaseAdmin
      .from("users")
      .select("gift_claimed, ton_balance")
      .eq("id", userId)
      .single();

    const { data: welcomeCfg } = await supabaseAdmin
      .from("app_config").select("value").eq("key", "welcome_ton").maybeSingle();
    const welcomeTonAmount = Number(welcomeCfg?.value ?? 1.5);

    res.json({
      accessToken,
      refreshToken: accessToken,
      isNewUser: !existing,
      welcomeTon: welcomeTonAmount,
      // FIX: new users always get false (gift not yet claimed), regardless of
      // whether the re-read raced. Existing users fall back to true (safe —
      // suppresses the popup if the read somehow fails).
      giftClaimed: existing ? (freshUser?.gift_claimed ?? true) : false,
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

// ── POST /auth/claim-gift ─────────────────────────────────────────────────────
// Marks the welcome gift popup as seen so it never shows again.
authRouter.post("/claim-gift", requireAuth, async (req: any, res, next) => {
  try {
    const userId = req.auth!.sub;
    await supabaseAdmin.from("users")
      .update({ gift_claimed: true })
      .eq("id", userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
