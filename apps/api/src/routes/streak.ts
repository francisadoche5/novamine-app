import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const streakRouter = Router();

// ── Reward schedule (hardcoded 30 days) ───────────────────────────────────────
const SCHEDULE = [
  { day:  1, nova: 10,    ton: 0       },
  { day:  2, nova: 0,     ton: 0.005   },
  { day:  3, nova: 20,    ton: 0       },
  { day:  4, nova: 0,     ton: 0.006   },
  { day:  5, nova: 40,    ton: 0       },
  { day:  6, nova: 0,     ton: 0.09    },
  { day:  7, nova: 80,    ton: 0       },
  { day:  8, nova: 0,     ton: 0.003   },
  { day:  9, nova: 200,   ton: 0       },
  { day: 10, nova: 0,     ton: 0.004   },
  { day: 11, nova: 400,   ton: 0       },
  { day: 12, nova: 0,     ton: 0.006   },
  { day: 13, nova: 500,   ton: 0       },
  { day: 14, nova: 0,     ton: 0.009   },
  { day: 15, nova: 750,   ton: 0       },
  { day: 16, nova: 0,     ton: 0.002   },
  { day: 17, nova: 1200,  ton: 0       },
  { day: 18, nova: 0,     ton: 0.01    },
  { day: 19, nova: 2000,  ton: 0       },
  { day: 20, nova: 0,     ton: 0.03    },
  { day: 21, nova: 3000,  ton: 0       },
  { day: 22, nova: 0,     ton: 0.05    },
  { day: 23, nova: 4000,  ton: 0       },
  { day: 24, nova: 0,     ton: 0.005   },
  { day: 25, nova: 5000,  ton: 0       },
  { day: 26, nova: 0,     ton: 0.009   },
  { day: 27, nova: 10000, ton: 0       },
  { day: 28, nova: 0,     ton: 0.09    },
  { day: 29, nova: 0,     ton: 0.1     },
  { day: 30, nova: 20000, ton: 0       },
];

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function todayDay() {
  return new Date().getUTCDate(); // 1-31
}

// ── GET /me/streak ─────────────────────────────────────────────────────────────
// Returns the 30-day grid with claimed status for the current month.
streakRouter.get("/", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.sub;
    const monthKey = currentMonthKey();
    const today = todayDay();

    // Fetch claimed days this month
    const { data: claims } = await supabaseAdmin
      .from("streak_claims")
      .select("day")
      .eq("user_id", userId)
      .eq("month", monthKey);

    const claimedSet = new Set((claims ?? []).map((c: any) => c.day));

    const days = SCHEDULE.map(s => ({
      day:     s.day,
      nova:    s.nova,
      ton:     s.ton,
      claimed: claimedSet.has(s.day),
      isToday: s.day === today,
      isPast:  s.day < today,
    }));

    res.json({ days, month: monthKey, today });
  } catch (err) { next(err); }
});

// ── POST /me/streak/:day/claim ─────────────────────────────────────────────────
streakRouter.post("/:day/claim", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const userId = req.auth!.sub;
    const day    = Number(req.params.day);
    const monthKey = currentMonthKey();
    const today    = todayDay();

    // Must be claiming today
    if (day !== today) {
      return res.status(400).json({ error: "You can only claim today's reward" });
    }

    // Validate day in schedule
    const schedule = SCHEDULE.find(s => s.day === day);
    if (!schedule) return res.status(400).json({ error: "Invalid day" });

    // Check not already claimed
    const { data: existing } = await supabaseAdmin
      .from("streak_claims")
      .select("id")
      .eq("user_id", userId)
      .eq("month", monthKey)
      .eq("day", day)
      .maybeSingle();

    if (existing) return res.status(400).json({ error: "Already claimed today" });

    // Record claim
    await supabaseAdmin.from("streak_claims").insert({
      user_id: userId,
      month:   monthKey,
      day,
    });

    // Award NOVA and/or TON
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("nova, ton_balance")
      .eq("id", userId)
      .single();

    const updates: any = {};
    if (schedule.nova > 0) updates.nova        = Number(user?.nova        ?? 0) + schedule.nova;
    if (schedule.ton  > 0) updates.ton_balance = Number(user?.ton_balance ?? 0) + schedule.ton;

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("users").update(updates).eq("id", userId);
    }

    res.json({
      ok:   true,
      nova: schedule.nova,
      ton:  schedule.ton,
      new_nova:        updates.nova        ?? Number(user?.nova        ?? 0),
      new_ton_balance: updates.ton_balance ?? Number(user?.ton_balance ?? 0),
    });
  } catch (err) { next(err); }
});
