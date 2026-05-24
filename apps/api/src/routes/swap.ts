// POST /swap — convert mined hashes to TON balance.
// The exchange rate is fixed in shared/constants for now; in v1.1 it can become
// a config row in Supabase the admin can update.
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { SWAP } from "@novamine/shared";

export const swapRouter = Router();

const Body = z.object({
  hashes: z.number().positive().finite(),
});

swapRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { hashes } = Body.parse(req.body);
    const userId = req.auth!.sub;

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("hashes, ton_balance")
      .eq("id", userId)
      .single();
    if (error) throw error;
    if (Number(user.hashes) < hashes) {
      return res.status(400).json({ error: "Not enough hashes" });
    }

    const tonOut = +(hashes * SWAP.HASH_TO_TON_RATE).toFixed(8);

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("users")
      .update({
        hashes: Number(user.hashes) - hashes,
        ton_balance: Number(user.ton_balance) + tonOut,
      })
      .eq("id", userId)
      .select("hashes, ton_balance")
      .single();
    if (upErr) throw upErr;

    // Also log to activity_feed for the live ticker
    await supabaseAdmin.from("activity_feed").insert({
      user_id: userId,
      type: "swap",
      payload: { hashes, ton: tonOut },
    });

    res.json({
      hashesSwapped: hashes,
      tonReceived: tonOut,
      hashes: updated.hashes,
      tonBalance: updated.ton_balance,
    });
  } catch (err) {
    next(err);
  }
});
