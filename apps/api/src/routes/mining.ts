import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { MINING } from "@novamine/shared";

export const miningRouter = Router();

miningRouter.post("/start", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;

    const { data: active } = await supabaseAdmin
      .from("mining_sessions")
      .select("id")
      .eq("user_id", userId)
      .is("claimed_at", null)
      .maybeSingle();
    if (active) {
      return res.status(409).json({ error: "Mining session already active", sessionId: active.id });
    }

    const startedAt = new Date();
    const claimReadyAt = new Date(startedAt.getTime() + MINING.SESSION_DURATION_MS);

    const { data: inserted, error } = await supabaseAdmin
      .from("mining_sessions")
      .insert({
        user_id: userId,
        started_at: startedAt.toISOString(),
        claim_ready_at: claimReadyAt.toISOString(),
      })
      .select("id, started_at, claim_ready_at")
      .single();
    if (error) throw error;

    res.json({
      sessionId: inserted.id,
      startedAt: inserted.started_at,
      claimReadyAt: inserted.claim_ready_at,
    });
  } catch (err) {
    next(err);
  }
});

miningRouter.post("/claim", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;

    const { data: session, error: selErr } = await supabaseAdmin
      .from("mining_sessions")
      .select("id, claim_ready_at, claimed_at")
      .eq("user_id", userId)
      .is("claimed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!session) return res.status(404).json({ error: "No active mining session" });
    if (new Date(session.claim_ready_at).getTime() > Date.now()) {
      return res.status(425).json({ error: "Not claimable yet", claimReadyAt: session.claim_ready_at });
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("mining_power, hashes, ton_balance")
      .eq("id", userId)
      .single();
    if (!user) return res.status(404).json({ error: "User not found" });

    const power = Number(user.mining_power ?? MINING.DEFAULT_POWER);
    const hashesEarned = MINING.hashesPerSession(power);

    await supabaseAdmin
      .from("mining_sessions")
      .update({ claimed_at: new Date().toISOString(), hashes_earned: hashesEarned })
      .eq("id", session.id);

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("users")
      .update({ hashes: Number(user.hashes ?? 0) + hashesEarned })
      .eq("id", userId)
      .select("hashes, ton_balance")
      .single();
    if (upErr) throw upErr;

    // Award NOVA bonus for every claim — atomic RPC preferred; manual fallback
    // if the RPC is unavailable so the claim never silently drops nova.
    let novaAfterClaim: number | null = null;
    const { data: novaData, error: rpcError } = await supabaseAdmin.rpc("increment_user_nova", {
      p_user_id: userId,
      p_amount: MINING.NOVA_PER_CLAIM,
    });
    if (rpcError) {
      // Fallback: manual read-modify-write
      const { data: freshUser } = await supabaseAdmin
        .from("users").select("nova").eq("id", userId).single();
      if (freshUser) {
        const newNova = Number(freshUser.nova ?? 0) + MINING.NOVA_PER_CLAIM;
        await supabaseAdmin.from("users").update({ nova: newNova }).eq("id", userId);
        novaAfterClaim = newNova;
      }
    } else {
      novaAfterClaim = novaData != null ? Number(novaData) : null;
    }
    // Last resort: fetch current value so frontend is always in sync
    if (novaAfterClaim == null) {
      const { data: fb } = await supabaseAdmin.from("users").select("nova").eq("id", userId).single();
      novaAfterClaim = fb ? Number(fb.nova ?? 0) : 0;
    }

    res.json({
      sessionId: session.id,
      hashesEarned,
      novaEarned: MINING.NOVA_PER_CLAIM,
      hashes: updated.hashes,
      tonBalance: updated.ton_balance,
      nova: novaAfterClaim,
    });
  } catch (err) {
    next(err);
  }
});
