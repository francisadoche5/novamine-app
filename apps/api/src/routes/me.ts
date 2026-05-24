// GET /me — returns the authenticated user's full state for hydrating the UI.
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select(
        "id, telegram_id, username, first_name, last_name, photo_url, nova, hashes, ton_balance, daily_rate, mining_power, created_at"
      )
      .eq("id", userId)
      .single();
    if (error) throw error;

    // Active mining session
    const { data: session } = await supabaseAdmin
      .from("mining_sessions")
      .select("id, started_at, claim_ready_at, claimed_at")
      .eq("user_id", userId)
      .is("claimed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Slot cooldown
    const { data: lastSpin } = await supabaseAdmin
      .from("slot_spins")
      .select("next_available_at")
      .eq("user_id", userId)
      .order("spun_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Today's dice roll (UTC)
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const { data: todayDice } = await supabaseAdmin
      .from("dice_rolls")
      .select("id, value, reward, rolled_at")
      .eq("user_id", userId)
      .gte("rolled_at", startOfUtcDay.toISOString())
      .maybeSingle();

    // Active referral counts
    const { count: qualifiedFriends } = await supabaseAdmin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId)
      .eq("status", "active");

    const { count: totalReferred } = await supabaseAdmin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId);

    res.json({
      user,
      mining: session
        ? {
            sessionId: session.id,
            startedAt: session.started_at,
            claimReadyAt: session.claim_ready_at,
            claimable: session.claim_ready_at
              ? new Date(session.claim_ready_at).getTime() <= Date.now()
              : false,
          }
        : null,
      slots: {
        nextAvailableAt: lastSpin?.next_available_at ?? null,
      },
      dice: {
        todayRolled: !!todayDice,
        todayValue: todayDice?.value ?? null,
        todayReward: todayDice?.reward ?? null,
      },
      referrals: {
        total: totalReferred ?? 0,
        qualified: qualifiedFriends ?? 0,
        requiredForWithdraw: 5,
      },
    });
  } catch (err) {
    next(err);
  }
});
