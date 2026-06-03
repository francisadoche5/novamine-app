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

// ── POST /referrals/milestones/:count/claim ───────────────────────────────────
// Awards NOVA when a user reaches a referral milestone for the first time.
const MILESTONES: Record<number, number> = { 1: 1200, 5: 2400, 25: 6000, 50: 12000, 100: 24000 };

referralsRouter.post("/milestones/:count/claim", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;
    const count = Number(req.params.count);

    // Validate milestone exists
    if (!MILESTONES[count]) return res.status(400).json({ error: "Invalid milestone" });

    // Check user actually has enough qualified referrals
    const { data: refs } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referrer_id", userId)
      .eq("status", "active");
    if ((refs?.length ?? 0) < count) {
      return res.status(400).json({ error: "Not enough active referrals" });
    }

    // Check not already claimed
    const { data: existing } = await supabaseAdmin
      .from("milestone_claims")
      .select("id")
      .eq("user_id", userId)
      .eq("milestone", count)
      .maybeSingle();
    if (existing) return res.status(400).json({ error: "Already claimed" });

    // Record claim
    await supabaseAdmin.from("milestone_claims").insert({ user_id: userId, milestone: count });

    // Award NOVA
    const nova = MILESTONES[count];
    const { data: user } = await supabaseAdmin.from("users").select("nova").eq("id", userId).single();
    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({ nova: Number(user?.nova ?? 0) + nova })
      .eq("id", userId);
    if (updateErr) throw updateErr;

    res.json({ ok: true, nova_awarded: nova, new_nova: Number(user?.nova ?? 0) + nova });
  } catch (err) { next(err); }
});

// ── GET /referrals/milestones ─────────────────────────────────────────────────
// Returns which milestones this user has already claimed.
referralsRouter.get("/milestones", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;
    const { data } = await supabaseAdmin
      .from("milestone_claims")
      .select("milestone")
      .eq("user_id", userId);
    res.json({ claimed: (data ?? []).map((r: any) => r.milestone) });
  } catch (err) { next(err); }
});
