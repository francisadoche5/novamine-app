import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { SLOTS, DICE } from "@novamine/shared";

export const gamesRouter = Router();

gamesRouter.post("/slots/spin", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;

    const { data: lastSpin } = await supabaseAdmin
      .from("slot_spins")
      .select("next_available_at")
      .eq("user_id", userId)
      .order("spun_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSpin?.next_available_at && new Date(lastSpin.next_available_at).getTime() > Date.now()) {
      return res.status(429).json({
        error: "Slots cooling down",
        nextAvailableAt: lastSpin.next_available_at,
      });
    }

    const outcome = SLOTS.rollOutcome();
    const cooldownSec =
      Math.floor(Math.random() * (SLOTS.COOLDOWN_MAX_SEC - SLOTS.COOLDOWN_MIN_SEC + 1)) +
      SLOTS.COOLDOWN_MIN_SEC;
    const now = new Date();
    const nextAvailableAt = new Date(now.getTime() + cooldownSec * 1000);

    await supabaseAdmin.from("slot_spins").insert({
      user_id: userId,
      reels: outcome.reels,
      reward: outcome.reward,
      spun_at: now.toISOString(),
      next_available_at: nextAvailableAt.toISOString(),
    });

    if (outcome.reward > 0) {
      await supabaseAdmin.rpc("increment_user_nova", { p_user_id: userId, p_amount: outcome.reward });
    }

    res.json({
      reels: outcome.reels,
      reward: outcome.reward,
      nextAvailableAt: nextAvailableAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

gamesRouter.post("/dice/roll", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;

    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);

    const { data: today } = await supabaseAdmin
      .from("dice_rolls")
      .select("id")
      .eq("user_id", userId)
      .gte("rolled_at", startOfUtcDay.toISOString())
      .maybeSingle();
    if (today) return res.status(429).json({ error: "Already rolled today" });

    const value = 1 + Math.floor(Math.random() * 6);
    const reward = DICE.rewardFor(value);

    await supabaseAdmin.from("dice_rolls").insert({
      user_id: userId,
      value,
      reward,
      rolled_at: new Date().toISOString(),
    });

    if (reward > 0) {
      await supabaseAdmin.rpc("increment_user_nova", { p_user_id: userId, p_amount: reward });
    }

    res.json({ value, reward });
  } catch (err) {
    next(err);
  }
});
