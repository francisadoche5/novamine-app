# NovaMine — Code Patches

---

## 1. 🔴 TonConnect Shop Fix

### Step 1 — Install TonConnect UI
```bash
cd apps/web
npm install @tonconnect/ui-react
```

### Step 2 — Wrap your app in `apps/web/src/main.jsx`
```jsx
import { TonConnectUIProvider } from "@tonconnect/ui-react";

// manifestUrl must be publicly accessible — host a tonconnect-manifest.json
const MANIFEST_URL = "https://your-domain.com/tonconnect-manifest.json";

createRoot(document.getElementById("root")).render(
  <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
    <App />
  </TonConnectUIProvider>
);
```

### Step 3 — Create `apps/web/public/tonconnect-manifest.json`
```json
{
  "url": "https://your-domain.com",
  "name": "NovaMine",
  "iconUrl": "https://your-domain.com/icon.png"
}
```

### Step 4 — Replace your ShopScreen buy button logic in `App.jsx`

Add these imports at the top of App.jsx:
```jsx
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
```

Then replace your existing shop buy handler with this hook + function:

```jsx
// Inside your ShopScreen component (or wherever the buy button lives):

const [tonConnectUI] = useTonConnectUI();
const walletAddress = useTonAddress();
const [buying, setBuying] = useState(false);

async function handleBuyTier(tier) {
  // 1. Ensure wallet is connected
  if (!walletAddress) {
    await tonConnectUI.connectWallet();
    return; // user will click again after connecting
  }

  setBuying(tier.id);
  try {
    // 2. Convert TON price to nanotons (1 TON = 1_000_000_000 nanoton)
    const nanotons = BigInt(Math.round(tier.priceTon * 1_000_000_000)).toString();

    // 3. Open wallet for payment — TON_WALLET_ADDRESS is your receiving wallet
    const result = await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300, // 5 min window
      messages: [
        {
          address: shopConfig.walletAddress, // from GET /shop response
          amount: nanotons,
          // Optional comment so you can identify the purchase
          payload: btoa(`novamiine:${tier.id}:${user.id}`),
        },
      ],
    });

    // result.boc contains the transaction — extract hash
    const txHash = result.boc; // use boc as identifier; verify on backend via tonscan

    // 4. Submit to your API
    const purchase = await api.buyShopTier(tier.id, txHash);
    alert(`Payment submitted! Purchase ID: ${purchase.purchaseId}\nStatus: pending (admin confirms within 24h)`);

  } catch (err) {
    if (err?.message?.includes("User declined")) {
      // user cancelled in wallet — no alert needed
    } else {
      alert("Transaction failed: " + err.message);
    }
  } finally {
    setBuying(false);
  }
}
```

Then in your JSX, replace the static buy button:
```jsx
// Before (broken — no real payment):
<button onClick={() => handleBuy(tier)}>Buy</button>

// After (real TonConnect flow):
<button
  onClick={() => handleBuyTier(tier)}
  disabled={buying === tier.id}
  style={{ /* your existing styles */ }}
>
  {buying === tier.id
    ? "Opening wallet…"
    : walletAddress
    ? `Buy ${tier.label}`
    : "Connect Wallet to Buy"}
</button>
```

Add a connect/disconnect button somewhere in your UI (e.g. top of Shop tab):
```jsx
import { TonConnectButton } from "@tonconnect/ui-react";

// Drop anywhere in JSX:
<TonConnectButton />
```

---

## 2. 📺 Ad System Integration

### Step 1 — Add /config endpoint to your API (`apps/api/src/routes/config.ts`)

```typescript
import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export const configRouter = Router();

// Store ad config in a simple DB table or env variable.
// Simplest approach: use a `config` table with key/value rows.
configRouter.get("/", async (_req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from("app_config")
      .select("key, value")
      .in("key", ["ads_enabled", "ad_triggers"]);

    const cfg: Record<string, any> = {};
    (data || []).forEach((r: any) => { cfg[r.key] = r.value; });

    res.json({
      adsEnabled: cfg.ads_enabled ?? true,
      adTriggers: cfg.ad_triggers ?? {
        start_mining: true,
        collect_mining: true,
        spin_slot: true,
        dice_roll: true,
      },
    });
  } catch {
    res.json({ adsEnabled: true, adTriggers: {} });
  }
});
```

Register in `apps/api/src/index.ts`:
```typescript
import { configRouter } from "./routes/config.js";
app.use("/config", configRouter);
```

Create the `app_config` table (run in Supabase SQL editor):
```sql
create table if not exists public.app_config (
  key   text primary key,
  value jsonb not null
);
-- Seed defaults
insert into public.app_config values
  ('ads_enabled', 'true'),
  ('ad_triggers', '{"start_mining":true,"collect_mining":true,"spin_slot":true,"dice_roll":true}')
on conflict do nothing;
```

### Step 2 — Fetch config once in `App.jsx`

```jsx
const [adConfig, setAdConfig] = useState({ adsEnabled: false, adTriggers: {} });

useEffect(() => {
  fetch(`${API_BASE}/config`)
    .then(r => r.json())
    .then(setAdConfig)
    .catch(() => {}); // fail silently
}, []);
```

### Step 3 — Gate each trigger point

```jsx
// Helper
function shouldShowAd(trigger) {
  return adConfig.adsEnabled && adConfig.adTriggers[trigger];
}

// Start Mining button handler:
async function handleStartMining() {
  if (shouldShowAd("start_mining")) await showMontageAd();
  await api.startMining();
  // ... rest of your logic
}

// Collect Mining handler:
async function handleCollectMining() {
  if (shouldShowAd("collect_mining")) await showMontageAd();
  await api.claimMining();
}

// Slot spin handler:
async function handleSpinSlot() {
  if (shouldShowAd("spin_slot")) await showMontageAd();
  await api.spinSlots();
}

// Dice roll handler:
async function handleDiceRoll() {
  if (shouldShowAd("dice_roll")) await showMontageAd();
  await api.rollDice();
}
```

---

## 3. 🗄️ Admin API Routes (optional — for live dashboard control)

If you want the Admin Dashboard to control ad settings in real time (not just locally), 
add an admin middleware + routes:

```typescript
// apps/api/src/middleware/adminAuth.ts
import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
```

```typescript
// apps/api/src/routes/admin.ts
import { Router } from "express";
import { requireAdmin } from "../middleware/adminAuth.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.patch("/config", async (req, res) => {
  const { key, value } = req.body;
  await supabaseAdmin.from("app_config").upsert({ key, value });
  res.json({ ok: true });
});
```

Add `ADMIN_SECRET=your_secret` to `apps/api/.env`.
