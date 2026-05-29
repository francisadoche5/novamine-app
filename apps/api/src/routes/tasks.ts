import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { TASKS } from "@novamine/shared";

export const tasksRouter = Router();

tasksRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;

    // Try DB-stored tasks first (set by admin) — fall back to shared constants
    const { data: dbTasks } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true });

    const rawTasks = dbTasks && dbTasks.length > 0
      ? dbTasks.map((t: any) => ({
          id: t.id,
          label: t.label ?? t.title,
          reward: Number(t.reward ?? t.nova_reward ?? 0),
          action: t.action ?? "Claim",
          url: t.url ?? null,
        }))
      : TASKS.LIST.map((t) => ({
          id: t.id,
          label: t.label,
          reward: t.reward,
          action: t.action,
          url: t.url,
        }));

    const { data: completions, error } = await supabaseAdmin
      .from("tasks_completed")
      .select("task_id, completed_at")
      .eq("user_id", userId);
    if (error) throw error;

    const completedSet = new Set(completions?.map((c) => c.task_id) ?? []);
    res.json({
      tasks: rawTasks.map((t) => ({ ...t, done: completedSet.has(t.id) })),
    });
  } catch (err) {
    next(err);
  }
});

const Params = z.object({ id: z.string().min(1) });

tasksRouter.post("/:id/claim", requireAuth, async (req, res, next) => {
  try {
    const { id } = Params.parse(req.params);

    // Look up from DB first, then fall back to shared constants
    let task: any = null;
    const { data: dbTask } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (dbTask) {
      task = { id: dbTask.id, label: dbTask.label ?? dbTask.title, reward: Number(dbTask.reward ?? dbTask.nova_reward ?? 0) };
    } else {
      const found = TASKS.LIST.find((t) => String(t.id) === id);
      if (found) task = { id: found.id, label: found.label, reward: found.reward };
    }
    if (!task) return res.status(404).json({ error: "Unknown task" });

    const userId = (req as any).auth!.sub;

    const { data: existing } = await supabaseAdmin
      .from("tasks_completed")
      .select("task_id")
      .eq("user_id", userId)
      .eq("task_id", task.id)
      .maybeSingle();
    if (existing) return res.status(409).json({ error: "Task already claimed" });

    await supabaseAdmin
      .from("tasks_completed")
      .insert({ user_id: userId, task_id: task.id, completed_at: new Date().toISOString() });

    // Update nova with RPC (with manual fallback)
    if (task.reward > 0) {
      const { error: rpcError } = await supabaseAdmin.rpc("increment_user_nova", {
        p_user_id: userId,
        p_amount: task.reward,
      });
      if (rpcError) {
        const { data: user } = await supabaseAdmin.from("users").select("nova").eq("id", userId).single();
        if (user) {
          await supabaseAdmin.from("users")
            .update({ nova: Number(user.nova) + task.reward })
            .eq("id", userId);
        }
      }
    }

    // Return updated nova
    const { data: updated } = await supabaseAdmin.from("users").select("nova").eq("id", userId).single();
    res.json({ taskId: task.id, reward: task.reward, nova: updated?.nova ?? null });
  } catch (err) {
    next(err);
  }
});
