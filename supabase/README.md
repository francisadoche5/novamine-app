# Supabase

This folder holds the database schema for NovaMine.

## Applying the migration

You have two options.

### Option 1 — Supabase Dashboard (easiest)

1. Open your project at https://app.supabase.com
2. Go to **SQL Editor → New query**
3. Paste the contents of `migrations/0001_init.sql`
4. Click **Run**

### Option 2 — Supabase CLI

```bash
# Install once: npm i -g supabase
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

## Verifying

After the migration runs, in **Database → Tables** you should see:

```
users
mining_sessions
slot_spins
dice_rolls
tasks_completed
referrals
withdrawals
shop_purchases
activity_feed
```

And in **Database → Functions** you should see `increment_user_nova(uuid, bigint)`.

## Where to find the keys the API needs

In your Supabase project:

| Env var                       | Where to find it                                         |
| ----------------------------- | -------------------------------------------------------- |
| `SUPABASE_URL`                | Project Settings → API → Project URL                     |
| `SUPABASE_SERVICE_ROLE_KEY`   | Project Settings → API → `service_role` (keep secret!)   |
| `SUPABASE_JWT_SECRET`         | Project Settings → API → JWT Settings → JWT Secret       |
| `VITE_SUPABASE_URL`           | Same as `SUPABASE_URL`                                   |
| `VITE_SUPABASE_ANON_KEY`      | Project Settings → API → `anon` / `public`               |

Never commit the service role key or JWT secret to git.
