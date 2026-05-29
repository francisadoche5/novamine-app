import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { SHOP } from "@novamine/shared";

export const shopRouter = Router();

shopRouter.get("/", async (_req, res) => {
  try {
    // Try DB-stored tiers first (set by admin) — fall back to shared constants
    const { data: dbTiers } = await supabaseAdmin
      .from("shop_tiers")
      .select("*")
      .eq("active", true)
      .order("price_ton", { ascending: true });

    const tiers = dbTiers && dbTiers.length > 0
      ? dbTiers.map((t: any) => ({
          id: t.id,
          label: t.label,
          novaPower: Number(t.nova_power),
          priceTon: Number(t.price_ton),
          dailyTon: Number(t.daily_ton ?? 0),
          monthTon: Number(t.month_ton ?? 0),
          hot: !!t.hot,
        }))
      : SHOP.TIERS;

    res.json({ tiers, walletAddress: process.env.TON_WALLET_ADDRESS ?? "" });
  } catch {
    // Always return something so the app never shows "Loading shop…" forever
    res.json({ tiers: SHOP.TIERS, walletAddress: process.env.TON_WALLET_ADDRESS ?? "" });
  }
});

const BuyBody = z.object({
  tierId: z.string().min(1),
  txHash: z.string().min(10),
});

shopRouter.post("/buy", requireAuth, async (req, res, next) => {
  try {
    const { tierId, txHash } = BuyBody.parse(req.body);

    // Look up tier from DB first, then fall back to shared constants
    let tier: any = null;
    const { data: dbTier } = await supabaseAdmin
      .from("shop_tiers")
      .select("*")
      .eq("id", tierId)
      .maybeSingle();
    if (dbTier) {
      tier = { id: dbTier.id, priceTon: Number(dbTier.price_ton), novaPower: Number(dbTier.nova_power) };
    } else {
      tier = SHOP.TIERS.find((t) => t.id === tierId);
    }
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
