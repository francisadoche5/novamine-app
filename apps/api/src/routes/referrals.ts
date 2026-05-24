// GET /referrals — referrer's view of their team.
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { WITHDRAW } from "@novamine/shared";

export const referralsRouter = Router();

referralsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;

    const { data: rows, error } = await supabaseAdmin
      .from("referrals")
      .select(
        "id, status, active_days_this_month, created_at, referred:referred_id ( id, username, first_name, photo_url )"
      )
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const total = rows?.length ?? 0;
    const qualified = rows?.filter((r) => r.status === "active").length ?? 0;
    const pending = rows?.filter((r) => r.status === "pending").length ?? 0;

    res.json({
      total,
      qualified,
      pending,
      requiredForWithdraw: WITHDRAW.REQUIRED_ACTIVE_REFERRALS,
      list: rows ?? [],
    });
  } catch (err) {
    next(err);
  }
});
