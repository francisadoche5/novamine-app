// apps/api/src/routes/admin.ts
// All admin actions — protected by ADMIN_SECRET env var via x-admin-secret header.
// No Supabase keys are ever sent to the browser.

import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export const adminRouter = Router();

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAdmin(req: any, res: any, next: any) {
  const secret = req.headers["x-admin-secret"];
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return res.status(500).json({ error: "ADMIN_SECRET not configured on server" });
  if (secret !== expected) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ── Login check ──────────────────────────────────────────────────────────────
adminRouter.post("/login", (req: any, res: any) => {
  const { secret } = req.body;
  if (secret === process.env.ADMIN_SECRET) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: "Wrong password" });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────── 
adminRouter.get("/analytics", requireAdmin, async (_req: any, res: any) => {
  try {
    const [users, purchases, withdrawals, sessions] = await Promise.all([
      supabaseAdmin.from("users").select("id,nova,ton_balance,mining_power,created_at,last_seen_at"),
      supabaseAdmin.from("shop_purchases").select("ton_paid,status,created_at"),
      supabaseAdmin.from("withdrawals").select("amount_ton,status"),
      supabaseAdmin.from("mining_sessions").select("id,claimed_at").not("claimed_at", "is", null),
    ]);
    res.json({
      users: users.data ?? [],
      purchases: purchases.data ?? [],
      withdrawals: withdrawals.data ?? [],
      sessions: sessions.data ?? [],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Users ─────────────────────────────────────────────────────────────────── 
adminRouter.get("/users", requireAdmin, async (_req: any, res: any) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id,telegram_id,username,first_name,nova,ton_balance,mining_power,created_at,last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

adminRouter.patch("/users/:id", requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { nova, ton_balance, mining_power } = req.body;
    const { error } = await supabaseAdmin
      .from("users")
      .update({ nova: Number(nova), ton_balance: Number(ton_balance), mining_power: Number(mining_power) })
      .eq("id", id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Withdrawals ───────────────────────────────────────────────────────────── 
adminRouter.get("/withdrawals", requireAdmin, async (_req: any, res: any) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("withdrawals")
      .select("id,user_id,amount_ton,wallet_address,status,tx_hash,requested_at,notes")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    // Enrich with user info
    const ids = [...new Set((data ?? []).map((r: any) => r.user_id))];
    let userMap: Record<string, any> = {};
    if (ids.length) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id,username,first_name,telegram_id")
        .in("id", ids);
      (users ?? []).forEach((u: any) => { userMap[u.id] = u; });
    }
    res.json({ withdrawals: data ?? [], userMap });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

adminRouter.patch("/withdrawals/:id", requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'approve' | 'reject'

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("withdrawals")
      .select("user_id,amount_ton,status")
      .eq("id", id)
      .single();
    if (fetchErr || !row) return res.status(404).json({ error: "Not found" });
    if (row.status !== "pending") return res.status(400).json({ error: "Already processed" });

    if (action === "approve") {
      await supabaseAdmin.from("withdrawals")
        .update({ status: "sent", processed_at: new Date().toISOString() })
        .eq("id", id);
    } else if (action === "reject") {
      // Refund TON to user
      const { data: user } = await supabaseAdmin.from("users").select("ton_balance").eq("id", row.user_id).single();
      if (user) {
        await supabaseAdmin.from("users")
          .update({ ton_balance: Number(user.ton_balance) + Number(row.amount_ton) })
          .eq("id", row.user_id);
      }
      await supabaseAdmin.from("withdrawals")
        .update({ status: "rejected", notes: notes ?? null, processed_at: new Date().toISOString() })
        .eq("id", id);
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Shop Purchases ────────────────────────────────────────────────────────── 
adminRouter.get("/purchases", requireAdmin, async (_req: any, res: any) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("shop_purchases")
      .select("id,user_id,tier_id,nova_granted,ton_paid,tx_hash,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((r: any) => r.user_id))];
    let userMap: Record<string, any> = {};
    if (ids.length) {
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id,username,first_name,telegram_id,nova,mining_power")
        .in("id", ids);
      (users ?? []).forEach((u: any) => { userMap[u.id] = u; });
    }
    res.json({ purchases: data ?? [], userMap });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

adminRouter.patch("/purchases/:id", requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'confirm' | 'reject'

    const { data: row, error } = await supabaseAdmin
      .from("shop_purchases")
      .select("user_id,nova_granted,status")
      .eq("id", id)
      .single();
    if (error || !row) return res.status(404).json({ error: "Not found" });
    if (row.status !== "pending") return res.status(400).json({ error: "Already processed" });

    if (action === "confirm") {
      const { data: user } = await supabaseAdmin.from("users")
        .select("nova,mining_power").eq("id", row.user_id).single();
      if (user) {
        await supabaseAdmin.from("users").update({
          nova: Number(user.nova) + Number(row.nova_granted),
          mining_power: Number(user.mining_power) + Number(row.nova_granted),
        }).eq("id", row.user_id);
      }
      await supabaseAdmin.from("shop_purchases")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", id);
    } else {
      await supabaseAdmin.from("shop_purchases")
        .update({ status: "rejected" }).eq("id", id);
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Ad Config ─────────────────────────────────────────────────────────────── 
adminRouter.get("/ad-config", requireAdmin, async (_req: any, res: any) => {
  try {
    const { data } = await supabaseAdmin.from("app_config")
      .select("key,value").in("key", ["ads_enabled", "ad_triggers"]);
    const cfg: Record<string, any> = {};
    (data ?? []).forEach((r: any) => { cfg[r.key] = r.value; });
    res.json({
      adsEnabled: cfg.ads_enabled ?? true,
      adTriggers: cfg.ad_triggers ?? { start_mining: true, collect_mining: true, spin_slot: true, dice_roll: true },
    });
  } catch { res.json({ adsEnabled: true, adTriggers: {} }); }
});

adminRouter.patch("/ad-config", requireAdmin, async (req: any, res: any) => {
  try {
    const { adsEnabled, adTriggers } = req.body;
    await supabaseAdmin.from("app_config").upsert({ key: "ads_enabled", value: adsEnabled });
    await supabaseAdmin.from("app_config").upsert({ key: "ad_triggers", value: adTriggers });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Reward Config ────────────────────────────────────────────────────────────
adminRouter.get("/reward-config", requireAdmin, async (_req: any, res: any) => {
  try {
    const { data } = await supabaseAdmin.from("app_config")
      .select("key,value")
      .in("key", ["welcome_ton", "referral_ton", "min_withdraw_ton"]);
    const cfg: Record<string, any> = {};
    (data ?? []).forEach((r: any) => { cfg[r.key] = r.value; });
    res.json({
      welcomeTon:    Number(cfg.welcome_ton    ?? 1.5),
      referralTon:   Number(cfg.referral_ton   ?? 0.005),
      minWithdrawTon: Number(cfg.min_withdraw_ton ?? 2.0),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

adminRouter.patch("/reward-config", requireAdmin, async (req: any, res: any) => {
  try {
    const { welcomeTon, referralTon, minWithdrawTon } = req.body;
    const updates = [
      { key: "welcome_ton",     value: Number(welcomeTon) },
      { key: "referral_ton",    value: Number(referralTon) },
      { key: "min_withdraw_ton",value: Number(minWithdrawTon) },
    ];
    for (const u of updates) {
      await supabaseAdmin.from("app_config").upsert(u);
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Shop Tiers (DB-backed) ────────────────────────────────────────────────── 
adminRouter.get("/shop-tiers", requireAdmin, async (_req: any, res: any) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("shop_tiers")
      .select("*")
      .order("price_ton", { ascending: true });
    if (error) throw error;
    res.json(data ?? []);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

adminRouter.put("/shop-tiers", requireAdmin, async (req: any, res: any) => {
  try {
    const { tiers } = req.body; // array of tier objects
    if (!Array.isArray(tiers)) return res.status(400).json({ error: "tiers must be an array" });

    // Upsert all tiers
    const rows = tiers.map((t: any) => ({
      id: t.id,
      label: t.label,
      nova_power: Number(t.novaPower),
      price_ton: Number(t.priceTon),
      daily_ton: Number(t.dailyTon ?? 0),
      month_ton: Number(t.monthTon ?? 0),
      hot: !!t.hot,
      active: true,
    }));
    const { error } = await supabaseAdmin.from("shop_tiers").upsert(rows);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


