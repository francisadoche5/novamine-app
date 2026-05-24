// Tasks (channel joins, partner bot starts, etc.)
//   GET  /tasks                → list + claim status
//   POST /tasks/:id/claim      → mark complete + grant NOVA reward
//
// For v1 we trust the client. v1.1 will verify with bot.api.getChatMember()
// for channel-join tasks, etc.
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { TASKS } from "@novamine/shared";

export const tasksRouter = Router();

tasksRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth!.sub;
    const { data: completions, error } = await supabaseAdmin
      .from("tasks_completed")
      .select("task_id, completed_at")
      .eq("user_id", userId);
    if (error) throw error;

    const completedSet = new Set(completions?.map((c) => c.task_id) ?? []);
    res.json({
      tasks: TASKS.LIST.map((t) => ({ ...t, done: completedSet.has(t.id) })),
    });
  } catch (err) {
    next(err);
  }
});

const Params = z.object({ id: z.string().min(1) });

tasksRouter.post("/:id/claim", requireAuth, async (req, res, next) => {
  try {
    const { id } = Params.parse(req.params);
    const task = TASKS.LIST.find((t) => String(t.id) === id);
    if (!task) return res.status(404).json({ error: "Unknown task" });

    const userId = req.auth!.sub;

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

    await supabaseAdmin.rpc("increment_user_nova", { p_user_id: userId, p_amount: task.reward });

    res.json({ taskId: task.id, reward: task.reward });
  } catch (err) {
    next(err);
  }
});
