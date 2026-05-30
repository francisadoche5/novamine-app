// Single source of truth for NovaMine's economy constants.
// Imported by both apps/web (via Vite) and apps/api (via TypeScript NodeNext).
// Keep this file pure (no I/O, no env) so it can run in any environment.

// ── MINING ───────────────────────────────────────────────────────────────────
export const MINING = {
  // Real production duration. Mining session unlocks claim after 24 hours (matches Dulce CANDY loop).
  SESSION_DURATION_MS: 24 * 60 * 60 * 1000,
  // Default mining power for a brand-new user (Starter tier).
  DEFAULT_POWER: 1000,
  // NOVA bonus earned every time a user claims a mining session.
  NOVA_PER_CLAIM: 1300,
  // Hashes earned per session — each tier has its own fixed rate.
  // These are tuned so each tier hits the target days-to-withdraw.
  hashesPerSession(power) {
    // Tier-specific rates (power → hashes/session)
    const RATES = {
      1_000:  0.00043458, // Starter  → 40 days to withdraw
      2_000:  0.00049666, // Rising   → 35 days
      5_000:  0.00057944, // Advanced → 30 days
      10_000: 0.00086916, // Master   → 20 days
      25_000: 0.00115888, // Elite    → 15 days
      50_000: 0.00173832, // Legendary→ 10 days
    };
    const p = Number(power);
    // Exact match first
    if (RATES[p] !== undefined) return RATES[p];
    // Fallback: linear scale from base
    return +(0.00043458 * (p / 1000)).toFixed(8);
  },
  // Daily TON display (cosmetic only).
  dailyTon(power) {
    const hashes = MINING.hashesPerSession(power) * 1; // 1 session/day (24h session)
    return +(hashes * SWAP.HASH_TO_TON_RATE).toFixed(5);
  },
};

// ── NOVA → MINING POWER TIERS ────────────────────────────────────────────────
export const NOVA_POWER_TIERS = [
  { minNova: 1_000_000, power: 50_000, label: "⚡ Legendary" },
  { minNova:   500_000, power: 25_000, label: "💎 Elite"     },
  { minNova:   100_000, power: 10_000, label: "🔮 Master"    },
  { minNova:    10_000, power:  5_000, label: "🌟 Advanced"  },
  { minNova:     1_000, power:  2_000, label: "🔥 Rising"    },
  { minNova:         0, power:  1_000, label: "🪙 Starter"   },
];

export function miningPowerFromNova(nova) {
  const n = Number(nova ?? 0);
  for (const tier of NOVA_POWER_TIERS) {
    if (n >= tier.minNova) return tier.power;
  }
  return 1000;
}

export function tierFromNova(nova) {
  const n = Number(nova ?? 0);
  for (const tier of NOVA_POWER_TIERS) {
    if (n >= tier.minNova) return tier;
  }
  return NOVA_POWER_TIERS[NOVA_POWER_TIERS.length - 1];
}

// ── ADMIN AUTO-FILL RATES ─────────────────────────────────────────────────────
// When admin types a TON amount, NOVA and HASHES auto-fill using these rates.
export const ADMIN_RATES = {
  TON_TO_NOVA:   10_000,   // 1 TON = 10,000 NOVA
  TON_TO_HASHES: 0.08691,  // 1 TON = 0.08691 HASHES (derived from swap rate)
  novaFromTon:  (ton) => Math.round(Number(ton) * 10_000),
  hashesFromTon:(ton) => +(Number(ton) * 0.08691).toFixed(8),
};

// ── SWAP ─────────────────────────────────────────────────────────────────────
export const SWAP = {
  // 1 HASH = 11.5054 TON — tuned so Starter users reach 0.8 TON in 40 days
  HASH_TO_TON_RATE: 11.5054,
  hashesToTon(hashes) {
    return +(Number(hashes) * SWAP.HASH_TO_TON_RATE).toFixed(8);
  },
};

// ── SHOP TIERS ───────────────────────────────────────────────────────────────
export const SHOP = {
  TIERS: [
    { id: "tier_1k",    label: "1K",    novaPower:    1_000, priceTon:  0.5,  dailyTon: 0.00200, monthTon: 0.06000 },
    { id: "tier_10k",   label: "10K",   novaPower:   10_000, priceTon:  1.0,  dailyTon: 0.00231, monthTon: 0.06930 },
    { id: "tier_100k",  label: "100K",  novaPower:  100_000, priceTon:  3.0,  dailyTon: 0.00347, monthTon: 0.10410, hot: true },
    { id: "tier_500k",  label: "500K",  novaPower:  500_000, priceTon:  8.0,  dailyTon: 0.00463, monthTon: 0.13890 },
    { id: "tier_1_25m", label: "1.25M", novaPower: 1_250_000, priceTon: 20.0, dailyTon: 0.00694, monthTon: 0.20820 },
    { id: "tier_8_75m", label: "8.75M", novaPower: 8_750_000, priceTon: 80.0, dailyTon: 0.04861, monthTon: 1.45830 },
  ],
};

// ── SLOT MACHINE ─────────────────────────────────────────────────────────────
export const SLOTS = {
  SYMBOLS: ["⚡", "💎", "🔮", "🌟", "🔥", "🪙"],
  TRIPLE_REWARDS: {
    "⚡⚡⚡": 25, "💎💎💎": 25, "🔮🔮🔮": 10,
    "🌟🌟🌟": 10, "🔥🔥🔥": 10, "🪙🪙🪙": 10,
  },
  TWO_MATCH_REWARD: 3,
  COOLDOWN_MIN_SEC: 25,
  COOLDOWN_MAX_SEC: 7200,
  rollOutcome() {
    const r = Math.random();
    let reels;
    if (r < 0.12) {
      reels = ["⚡", "⚡", "⚡"];
    } else if (r < 0.35) {
      const pool = SLOTS.SYMBOLS.slice(1);
      const sym = pool[Math.floor(Math.random() * pool.length)];
      reels = [sym, sym, sym];
    } else {
      reels = [randSym(), randSym(), randSym()];
    }
    const combo = reels.join("");
    let reward = SLOTS.TRIPLE_REWARDS[combo] ?? 0;
    if (reward === 0 &&
      (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2])) {
      reward = SLOTS.TWO_MATCH_REWARD;
    }
    return { reels, reward };
  },
};

function randSym() {
  return SLOTS.SYMBOLS[Math.floor(Math.random() * SLOTS.SYMBOLS.length)];
}

// ── DAILY DICE ───────────────────────────────────────────────────────────────
export const DICE = {
  REWARDS: { 1: 5, 2: 10, 3: 15, 4: 20, 5: 30, 6: 50 },
  rewardFor(value) { return DICE.REWARDS[value] ?? 0; },
};

// ── TASKS ────────────────────────────────────────────────────────────────────
export const TASKS = {
  LIST: [
    { id: "join_channel",        label: "Join NovaMine Channel",   reward: 500,  action: "Join",      url: "https://t.me/NovaMineChannel" },
    { id: "join_chat",           label: "Join Community Chat",     reward: 500,  action: "Claim",     url: "https://t.me/NovaMineChat" },
    { id: "start_partner_alpha", label: "Start Partner Bot Alpha", reward: 1000, action: "Start Bot", url: "https://t.me/PartnerAlphaBot" },
    { id: "start_partner_beta",  label: "Start Partner Bot Beta",  reward: 500,  action: "Start Bot", url: "https://t.me/PartnerBetaBot" },
  ],
};

// ── WITHDRAW GATING ──────────────────────────────────────────────────────────
export const WITHDRAW = {
  MIN_TON: 0.8,
  REQUIRED_ACTIVE_REFERRALS: 5,
  ACTIVE_MIN_DAYS_MINED_THIS_MONTH: 10,
};

// ── INVITE MILESTONES ────────────────────────────────────────────────────────
export const REFERRAL_MILESTONES = [
  { count: 1,   reward:  1200 },
  { count: 5,   reward:  2400 },
  { count: 25,  reward:  6000 },
  { count: 50,  reward: 12000 },
  { count: 100, reward: 24000 },
];
