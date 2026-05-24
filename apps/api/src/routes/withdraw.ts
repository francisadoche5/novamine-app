// POST /withdraw — request a TON withdrawal.
// Both gates (min balance + active referrals) are enforced server-side.
// v1: creates a `withdrawals` row with status="pending"; admin processes manually
//     using the configured TON_WALLET_ADDRESS as the source.
// v1.1: replace manual flow with TonConnect / hot wallet automation.
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { WITHDRAW } from "@novamine/shared";

export const withdrawRouter = Router();

const Body = z.object({
  amount: z.number().positive().finite(),
  walletAddress: z.string().min(10).max(100),
});

withdrawRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { amount, walletAddress } = Body.parse(req.body);
    const userId = req.auth!.sub;

    if (amount < WITHDRAW.MIN_TON) {
      return res.status(400).json({ error: `Minimum withdrawal is ${WITHDRAW.MIN_TON} TON` });
    }

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("ton_balance")
      .eq("id", userId)
      .single();
    if (error) throw error;
    if (Number(user.ton_balance) < amount) {
      return res.status(400).json({ error: "Insufficient TON balance" });
    }

    const { count: qualified } = await supabaseAdmin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId)
      .eq("status", "active");

    if ((qualified ?? 0) < WITHDRAW.REQUIRED_ACTIVE_REFERRALS) {
      return res.status(403).json({
        error: "Need more active referrals",
        required: WITHDRAW.REQUIRED_ACTIVE_REFERRALS,
        current: qualified ?? 0,
      });
    }

    // Reserve the funds: deduct now, refund on rejection
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("users")
      .update({ ton_balance: Number(user.ton_balance) - amount })
      .eq("id", userId)
      .select("ton_balance")
      .single();
    if (upErr) throw upErr;

    const { data: withdrawal, error: wErr } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount_ton: amount,
        wallet_address: walletAddress,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select("id, status, requested_at")
      .single();
    if (wErr) throw wErr;

    res.json({
      withdrawalId: withdrawal.id,
      status: withdrawal.status,
      requestedAt: withdrawal.requested_at,
      newTonBalance: updated.ton_balance,
    });
  } catch (err) {
    next(err);
  }
});
