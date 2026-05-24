// GET /leaderboard — public top miners. No auth required.
import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, username, first_name, photo_url, mining_power, daily_rate")
      .order("mining_power", { ascending: false })
      .limit(10);
    if (error) throw error;

    res.json({
      top: (data ?? []).map((u, i) => ({
        rank: i + 1,
        username: u.username ?? u.first_name ?? "Miner",
        photoUrl: u.photo_url,
        miningPower: u.mining_power,
        dailyRate: u.daily_rate,
      })),
    });
  } catch (err) {
    next(err);
  }
});
