import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { TASKS } from "@novamine/shared";

export const tasksRouter = Router();

// ── GET /tasks ────────────────────────────────────────────────────────────────
// Returns all active tasks with a `done` flag for the requesting user.
// NEVER throws on DB errors — users must always see a task list.
tasksRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).auth!.sub;

    // 1. Fetch active tasks from DB (admin-managed).
    //    If the query fails for any reason, fall back to the hardcoded list
    //    so the screen is never empty.
    const { data: dbTasks } = await supabaseAdmin
      .from("tasks")
      .select("id, label, reward, action, url, active")
      .eq("active", true);

    const rawTasks =
      dbTasks && dbTasks.length > 0
        ? dbTasks.map((t: any) => ({
            id: t.id,
            label: t.label ?? "Task",
            reward: Number(t.reward ?? 0),
            action: t.action ?? "Claim",
            url: t.url ?? null,
          }))
        : TASKS.LIST.map((t) => ({
            id: t.id,
            label: t.label,
            reward: t.reward,
            action: t.action,
            url: t.url ?? null,
          }));

    // 2. Fetch which tasks this user has already completed.
    //    Do NOT throw if this fails — worst case every task shows as unclaimed,
    //    which is safe. A throw here used to silently return 500 and show
    //    "No tasks available" even though tasks existed in the DB.
    const { data: completions } = await supabaseAdmin
      .from("tasks_completed")
      .select("task_id")
      .eq("user_id", userId);

    const completedSet = new Set(
      (completions ?? []).map((c: any) => c.task_id)
    );

    res.json({
      tasks: rawTasks.map((t) => ({ ...t, done: completedSet.has(t.id) })),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /tasks/:id/claim ─────────────────────────────────────────────────────
const Params = z.object({ id: z.string().min(1) });

tasksRouter.post("/:id/claim", requireAuth, async (req, res, next) => {
  try {
    const { id } = Params.parse(req.params);
    const userId = (req as any).auth!.sub;

    // 1. Look up task — DB first, then hardcoded fallback.
    let task: { id: string; label: string; reward: number } | null = null;

    const { data: dbTask } = await supabaseAdmin
      .from("tasks")
      .select("id, label, reward")
      .eq("id", id)
      .maybeSingle();

    if (dbTask) {
      task = {
        id: dbTask.id,
        label: dbTask.label ?? "Task",
        reward: Number(dbTask.reward ?? 0),
      };
    } else {
      const found = TASKS.LIST.find((t) => String(t.id) === id);
      if (found) task = { id: found.id, label: found.label, reward: found.reward };
    }

    if (!task) return res.status(404).json({ error: "Unknown task" });

    // 2. Check not already claimed.
    const { data: existing } = await supabaseAdmin
      .from("tasks_completed")
      .select("task_id")
      .eq("user_id", userId)
      .eq("task_id", task.id)
      .maybeSingle();

    if (existing) return res.status(409).json({ error: "Task already claimed" });

    // 3. Mark completed.
    await supabaseAdmin
      .from("tasks_completed")
      .insert({ user_id: userId, task_id: task.id });

    // 4. Credit NOVA — RPC first, manual fallback if RPC unavailable.
    if (task.reward > 0) {
      const { error: rpcError } = await supabaseAdmin.rpc("increment_user_nova", {
        p_user_id: userId,
        p_amount: task.reward,
      });

      if (rpcError) {
        const { data: user } = await supabaseAdmin
          .from("users")
          .select("nova")
          .eq("id", userId)
          .single();
        if (user) {
          await supabaseAdmin
            .from("users")
            .update({ nova: Number(user.nova ?? 0) + task.reward })
            .eq("id", userId);
        }
      }
    }

    // 5. Return updated NOVA so the frontend balance stays in sync.
    const { data: updated } = await supabaseAdmin
      .from("users")
      .select("nova")
      .eq("id", userId)
      .single();

    res.json({ taskId: task.id, reward: task.reward, nova: updated?.nova ?? null });
  } catch (err) {
    next(err);
  }
});
