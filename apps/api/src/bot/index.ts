// grammy Telegram bot. In production we mount the webhook on the same Express
// app so Render's single web service handles both the HTTP API and the bot.
// In development (NODE_ENV !== "production") we long-poll instead so no public
// URL is needed.
import { Bot, webhookCallback } from "grammy";
import type { Express } from "express";
import { config } from "../config.js";
import { supabaseAdmin } from "../lib/supabase.js";

export async function startBot(app: Express) {
  if (!config.bot.token) {
    console.warn("[bot] BOT_TOKEN not set — bot disabled");
    return;
  }

  const bot = new Bot(config.bot.token);

  // ── Commands ──
  bot.command("start", async (ctx) => {
    // Telegram passes referral code as the first argument: /start <code>
    const startParam = ctx.match?.toString().trim() || null;
    const miniAppUrl = config.bot.publicUrl.replace(/\/$/, ""); // we'll point this at the Vercel URL via env

    await ctx.reply(
      [
        "⛏️ *Welcome to NovaMine* — mine NOVA, earn TON.",
        "",
        startParam ? `Referral: \`${startParam}\`` : "",
        "Tap below to launch the app.",
      ]
        .filter(Boolean)
        .join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Open NovaMine",
                // For Mini Apps, this should be the Vercel URL set in BotFather.
                // Linking to t.me/<bot>/<app> is also fine.
                url: config.bot.username
                  ? `https://t.me/${config.bot.username}/app${startParam ? `?startapp=${startParam}` : ""}`
                  : miniAppUrl,
              },
            ],
          ],
        },
      }
    );
  });

  bot.command("help", (ctx) =>
    ctx.reply(
      "Commands:\n/start — open the Mini App\n/invite — get your referral link\n/balance — view your NOVA & TON"
    )
  );

  bot.command("invite", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !config.bot.username) return ctx.reply("Bot not configured yet.");
    const link = `https://t.me/${config.bot.username}/app?startapp=ref_${userId}`;
    await ctx.reply(
      `🔗 Your referral link:\n\n${link}\n\nEarn 3,000 NOVA + 15% commission per active friend.`
    );
  });

  // Catch-all for plain messages
  bot.on("message", async (ctx) => {
    await ctx.reply("Tap /start to open NovaMine.");
  });

  // ── Notification Schedulers ─────────────────────────────────────────────────

  // Runs every 5 minutes — checks for unclaimed mining sessions > 8 hours old
  // and users who haven't logged in for > 24 hours
  async function runNotifications() {
    if (!config.isProd) return; // only in production
    try {
      const now = new Date();

      // ── 1. Unclaimed mining reminder (session > 8 hours old) ──
      const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();
      const { data: miningSessions } = await supabaseAdmin
        .from("mining_sessions")
        .select("user_id, claim_ready_at, users!inner(telegram_id, first_name, notified_mining_at)")
        .lt("claim_ready_at", eightHoursAgo)
        .is("claimed_at", null);

      for (const session of (miningSessions ?? [])) {
        const u = (session as any).users;
        if (!u?.telegram_id) continue;

        // Don't spam — only notify once per 8 hours per user
        const lastNotified = u.notified_mining_at ? new Date(u.notified_mining_at) : null;
        if (lastNotified && now.getTime() - lastNotified.getTime() < 8 * 60 * 60 * 1000) continue;

        try {
          await bot.api.sendMessage(
            u.telegram_id,
            `⛏️ *Hey ${u.first_name ?? "Miner"}!*

Your NOVA mining session is ready to collect! Don't let it sit — tap below to claim your rewards now.`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[{
                  text: "⚡ Claim NOVA Now",
                  url: config.bot.username
                    ? `https://t.me/${config.bot.username}/app`
                    : config.bot.publicUrl,
                }]],
              },
            }
          );
          // Update notified_mining_at
          await supabaseAdmin
            .from("users")
            .update({ notified_mining_at: now.toISOString() })
            .eq("id", session.user_id);
        } catch (_) { /* user may have blocked the bot */ }
      }

      // ── 2. Inactivity reminder (no login for > 24 hours) ──
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: inactiveUsers } = await supabaseAdmin
        .from("users")
        .select("id, telegram_id, first_name, last_seen_at, notified_inactive_at")
        .lt("last_seen_at", oneDayAgo)
        .not("telegram_id", "is", null);

      for (const u of (inactiveUsers ?? [])) {
        if (!u.telegram_id) continue;

        // Don't re-notify within 24 hours of last inactive notification
        const lastNotified = u.notified_inactive_at ? new Date(u.notified_inactive_at) : null;
        if (lastNotified && now.getTime() - lastNotified.getTime() < 24 * 60 * 60 * 1000) continue;

        try {
          await bot.api.sendMessage(
            u.telegram_id,
            `🌟 *Miss you, ${u.first_name ?? "Miner"}!*

You haven't logged into NovaMine today. Your mining is waiting and daily rewards are ready to claim!

Tap below to get back on track.`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[{
                  text: "🚀 Open NovaMine",
                  url: config.bot.username
                    ? `https://t.me/${config.bot.username}/app`
                    : config.bot.publicUrl,
                }]],
              },
            }
          );
          await supabaseAdmin
            .from("users")
            .update({ notified_inactive_at: now.toISOString() })
            .eq("id", u.id);
        } catch (_) { /* user may have blocked the bot */ }
      }
    } catch (err) {
      console.error("[bot] notification scheduler error:", err);
    }
  }

  // Run every 5 minutes (UptimeRobot keeps the server alive)
  setInterval(runNotifications, 5 * 60 * 1000);
  // Also run once on startup after a short delay
  setTimeout(runNotifications, 30 * 1000);

  // ── Bootstrap webhook (prod) or long-poll (dev) ──
  if (config.isProd && config.bot.publicUrl) {
    const path = "/telegram/webhook";

    // Telegram only allows A-Za-z0-9_- in the secret token (1–256 chars).
    // Strip any disallowed characters so a mis-configured env var doesn't crash the bot.
    const rawSecret = config.bot.webhookSecret || "";
    const webhookSecret = rawSecret.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 256) || undefined;

    app.use(
      path,
      webhookCallback(bot, "express", {
        secretToken: webhookSecret,
      })
    );

    const webhookUrl = `${config.bot.publicUrl.replace(/\/$/, "")}${path}`;
    try {
      await bot.api.setWebhook(webhookUrl, {
        secret_token: webhookSecret,
        allowed_updates: ["message", "callback_query"],
      });
      console.log(`[bot] webhook set to ${webhookUrl}`);
    } catch (err) {
      console.error("[bot] failed to set webhook:", err);
    }
  } else {
    // Long polling for local dev
    bot.start({
      onStart: (info) => console.log(`[bot] long-polling as @${info.username}`),
    });
  }
}
