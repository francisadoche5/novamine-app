// grammy Telegram bot. In production we mount the webhook on the same Express
// app so Render's single web service handles both the HTTP API and the bot.
// In development (NODE_ENV !== "production") we long-poll instead so no public
// URL is needed.
import { Bot, webhookCallback } from "grammy";
import type { Express } from "express";
import { config } from "../config.js";

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
