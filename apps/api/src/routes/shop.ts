import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { SHOP } from "@novamine/shared";

export const shopRouter = Router();

shopRouter.get("/", (_req, res) => {
  res.json({ tiers: SHOP.TIERS, walletAddress: process.env.TON_WALLET_ADDRESS ?? "" });
});

const BuyBody = z.object({
  tierId: z.string().min(1),
  txHash: z.string().min(10),
});

shopRouter.post("/buy", requireAuth, async (req, res, next) => {
  try {
    const { tierId, txHash } = BuyBody.parse(req.body);
    const tier = SHOP.TIERS.find((t) => t.id === tierId);
    if (!tier) return res.status(404).json({ error: "Unknown tier" });

    const userId = (req as any).auth!.sub;

    const { data: purchase, error } = await supabaseAdmin
      .from("shop_purchases")
      .insert({
        user_id: userId,
        tier_id: tier.id,
        nova_granted: tier.novaPower,
        ton_paid: tier.priceTon,
        tx_hash: txHash,
        status: "pending",
      })
      .select("id, status")
      .single();
    if (error) throw error;

    res.json({ purchaseId: purchase.id, status: purchase.status });
  } catch (err) {
    next(err);
  }
});
