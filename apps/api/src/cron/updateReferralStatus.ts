/**
 * updateReferralStatus.ts
 *
 * Runs once per day (scheduled in index.ts).
 *
 * What it does:
 *  1. For every pending/active referral this month, counts how many days
 *     the referred user has claimed their streak reward (streak_claims table).
 *  2. Updates active_days_this_month on the referrals row.
 *  3. If active_days_this_month >= 10, flips status to "active".
 *  4. If a new month has started, resets active_days_this_month back to 0
 *     and flips "active" rows back to "pending" so users must re-qualify.
 */

import { supabaseAdmin } from "../lib/supabase.js";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function updateReferralStatus() {
  const monthKey = currentMonthKey();
  console.log(`[cron] updateReferralStatus running for month=${monthKey}`);

  try {
    // 1. Fetch all referrals
    const { data: referrals, error: refErr } = await supabaseAdmin
      .from("referrals")
      .select("id, referred_id, status, active_days_this_month, month_key");

    if (refErr) throw refErr;
    if (!referrals || referrals.length === 0) {
      console.log("[cron] No referrals found, skipping.");
      return;
    }

    // 2. Fetch streak_claims for all referred users this month in one query
    const referredIds = referrals.map((r: any) => r.referred_id);

    const { data: claims, error: claimErr } = await supabaseAdmin
      .from("streak_claims")
      .select("user_id, day")
      .in("user_id", referredIds)
      .eq("month", monthKey);

    if (claimErr) throw claimErr;

    // Build a map: user_id -> count of claimed days this month
    const claimCount: Record<string, number> = {};
    for (const c of claims ?? []) {
      claimCount[c.user_id] = (claimCount[c.user_id] ?? 0) + 1;
    }

    // 3. Update each referral row
    let updated = 0;
    for (const ref of referrals) {
      const activeDays = claimCount[ref.referred_id] ?? 0;
      const newStatus  = activeDays >= 10 ? "active" : "pending";

      // Reset active_days if we're in a new month
      const isNewMonth = ref.month_key && ref.month_key !== monthKey;

      const updates: any = {
        active_days_this_month: isNewMonth ? activeDays : activeDays,
        status: isNewMonth ? (activeDays >= 10 ? "active" : "pending") : newStatus,
        month_key: monthKey,
      };

      // Only write if something changed
      const changed =
        ref.active_days_this_month !== activeDays ||
        ref.status !== updates.status ||
        ref.month_key !== monthKey;

      if (changed) {
        const { error: updateErr } = await supabaseAdmin
          .from("referrals")
          .update(updates)
          .eq("id", ref.id);

        if (updateErr) {
          console.error(`[cron] Failed to update referral ${ref.id}:`, updateErr.message);
        } else {
          updated++;
        }
      }
    }

    console.log(`[cron] updateReferralStatus done — ${updated}/${referrals.length} rows updated`);
  } catch (err: any) {
    console.error("[cron] updateReferralStatus error:", err.message);
  }
}
