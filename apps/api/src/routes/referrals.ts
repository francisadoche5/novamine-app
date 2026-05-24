import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { WITHDRAW } from "@novamine/shared";

export const referralsRouter = Router();

referralsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;

    const { data: rows, error } = await supabaseAdmin
      .from("referrals")
      .select("id, status, active_days_this_month, created_at, referred:referred_id ( id, username, first_name, photo_url )")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    res.json({
      total: rows?.length ?? 0,
      qualified: rows?.filter((r) => r.status === "active").length ?? 0,
      pending: rows?.filter((r) => r.status === "pending").length ?? 0,
      requiredForWithdraw: WITHDRAW.REQUIRED_ACTIVE_REFERRALS,
      list: rows ?? [],
    });
  } catch (err) {
    next(err);
  }
});
