# NovaMine

A Telegram Mini App for mining NOVA and earning TON. Stack: **Vercel** (web) + **Render** (API + Telegram bot) + **Supabase** (Postgres + Auth + RLS).

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Telegram   │ ─▶ │  Vercel app  │ ─▶ │  Render API  │ ─▶ Supabase
│ (Mini App +  │    │  (React UI)  │    │ (Express +   │
│  bot chat)   │ ◀─ │              │ ◀─ │  grammy bot) │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Repo layout

```
.
├── apps/
│   ├── web/             # Vite + React (deploys to Vercel)
│   └── api/             # Express + grammy bot in TypeScript (deploys to Render)
├── packages/
│   └── shared/          # Economy constants used by both web and api
├── supabase/
│   └── migrations/      # SQL schema (0001_init.sql)
├── render.yaml          # Render Blueprint
└── package.json         # npm workspaces
```

## What you (the human) need to do

Work through this checklist. I've left clear placeholders everywhere.

### 1. Telegram bot — @BotFather

1. Open `@BotFather` on Telegram → `/newbot`
2. Save the **bot token** (e.g. `123456:ABCDEF...`) → goes into `BOT_TOKEN`
3. Save the **bot username** (e.g. `NovaMineBot`) → goes into `BOT_USERNAME`
4. Tell BotFather: `/newapp` → choose your bot → upload an icon, set title "NovaMine", URL = your Vercel domain (you'll have it after step 4)

### 2. Supabase

1. Create a new project at https://app.supabase.com
2. Wait for it to provision, then go to **SQL Editor** → paste `supabase/migrations/0001_init.sql` → **Run**
3. Project Settings → API → grab these:
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (`service_role` — secret!)
   - `VITE_SUPABASE_ANON_KEY` (`anon` / `public`)
   - `SUPABASE_JWT_SECRET` (Project Settings → API → JWT Settings)

### 3. Render — API + bot

1. Go to https://render.com → **New** → **Blueprint** → connect this repo
2. It will pick up `render.yaml` and create the `novamine-api` web service
3. Once created, open the service → **Environment** and fill in:
   - `BOT_TOKEN`
   - `BOT_USERNAME`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `TON_WALLET_ADDRESS` (your TON wallet — destination for withdrawals)
   - `PUBLIC_API_URL` → set this to the Render URL of this service (e.g. `https://novamine-api.onrender.com`)
   - `CORS_ORIGINS` → set this after step 4 (your Vercel URL)
4. Trigger a manual deploy. The bot will set its webhook automatically on boot.

### 4. Vercel — Web

1. Go to https://vercel.com → **Add New** → **Project** → import this repo
2. **Root Directory** → `apps/web`
3. Framework will auto-detect as Vite. Build command stays default.
4. Environment Variables:
   - `VITE_API_BASE_URL` → your Render URL from step 3
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Note the Vercel URL.
6. Go back to **Render** and set `CORS_ORIGINS` to your Vercel URL, redeploy.
7. Go back to **@BotFather** → `/myapps` → set the Mini App URL to your Vercel URL.

### 5. Test it

- Open `t.me/<your-bot-username>` → tap **/start** → tap the **Open NovaMine** button.
- The Mini App should load, auth should happen invisibly, and you should see your NOVA balance start at 0.

---

## Local development

```bash
# Install everything
npm install

# Copy env templates
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
# Fill in .env files with the keys from steps 1-2 above

# Run web (port 5173) and api (port 8080) in separate terminals
npm run dev:web
npm run dev:api
```

The web app has a **dev mode mock** for Telegram — when running outside Telegram, it injects a fake user (`dev_tester`, id `1000000001`) so you can develop in your browser without ngrok-tunnelling. The API accepts this mock only when `ALLOW_DEV_AUTH=true`. **Never** set that flag in production.

If you want to test inside the real Telegram client during development, you can use ngrok:

```bash
ngrok http 5173
# Take the https URL and set it as the Mini App URL in @BotFather temporarily
```

## How the auth flow works

1. Telegram opens the Vercel-hosted Mini App and injects `window.Telegram.WebApp.initData` (signed by your bot token).
2. The web app POSTs `initData` to `POST /auth/telegram` on Render.
3. The Render API validates the HMAC against `BOT_TOKEN`, upserts the user in Supabase, and mints a JWT signed with `SUPABASE_JWT_SECRET`.
4. The web app uses that JWT for two things: as a `Bearer` token for the Render API, and as a Supabase session via `supabase.auth.setSession()` so RLS lets the user read their own rows.
5. All economy mutations (mining, slots, dice, swap, withdraw, task claim, shop buy) go through the Render API — never trusted to the client. RLS in Supabase only allows reads.

## Server-authoritative game economy

| Endpoint | Source of truth |
|---|---|
| `POST /mining/start` | Creates a row in `mining_sessions` with `claim_ready_at = now() + 6h` |
| `POST /mining/claim` | Refuses if `claim_ready_at` is in the future; payout = `MINING.hashesPerSession(power)` |
| `POST /games/slots/spin` | Refuses if previous spin's `next_available_at` is in the future. Random cooldown 25s–2h. |
| `POST /games/dice/roll` | DB unique index `(user_id, utc_date)` enforces once-per-day |
| `POST /swap` | Deducts hashes, credits TON at `SWAP.HASH_TO_TON_RATE` |
| `POST /withdraw` | Refuses if `ton_balance < 0.8` or `< 5` active referrals |

## Withdrawals

For v1, withdrawals are processed manually. When a user requests one, a row is inserted into `withdrawals` with `status='pending'`. You (the admin) review them in the Supabase dashboard and send TON from your wallet, then update the row to `status='sent'` with the `tx_hash`.

A future version will integrate TonConnect / a hot wallet for automatic payout.

## Things NOT included yet (v1.1+)

- Real ad-network integration (the rewarded-ad modal in the UI is a self-rendered placeholder).
- TON on-chain verification of `shop_purchases` (the API records the tx hash but doesn't verify it received funds yet).
- TonConnect for automatic withdrawals.
- Background workers for: monthly active-referral recalculation, expired-mining-session cleanup, leaderboard cache.
- Rate limiting / anti-abuse on the API endpoints.
- Admin dashboard.

If you want any of these next, just ask.
