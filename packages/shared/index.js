// Single source of truth for NovaMine's economy constants.
// Imported by both apps/web (via Vite) and apps/api (via TypeScript NodeNext).
// Keep this file pure (no I/O, no env) so it can run in any environment.

// ── MINING ───────────────────────────────────────────────────────────────────
export const MINING = {
  // Real production duration. Mining session unlocks claim after 6 hours.
  SESSION_DURATION_MS: 6 * 60 * 60 * 1000,
  // Default mining power for a brand-new user (1K NOVA tier).
  DEFAULT_POWER: 1000,
  // Hashes earned per claim. Scales linearly with mining_power.
  // 1K power → 0.00043458 hashes per session (matches your demo).
  hashesPerSession(power) {
    const base = 0.00043458; // hashes per 1K power per session
    return +(base * (Number(power) / 1000)).toFixed(8);
  },
  // Daily TON-equivalent rate per power tier (cosmetic — used for display).
  dailyTon(power) {
    const perK = 0.00036;
    return +((Number(power) / 1000) * perK).toFixed(5);
  },
};

// ── SLOT MACHINE ─────────────────────────────────────────────────────────────
export const SLOTS = {
  SYMBOLS: ["⚡", "💎", "🔮", "🌟", "🔥", "🪙"],
  // Triple-match payouts (NOVA)
  TRIPLE_REWARDS: {
    "⚡⚡⚡": 25,
    "💎💎💎": 25,
    "🔮🔮🔮": 10,
    "🌟🌟🌟": 10,
    "🔥🔥🔥": 10,
    "🪙🪙🪙": 10,
  },
  // Any-two-match consolation
  TWO_MATCH_REWARD: 3,
  // Cooldown is randomized between these on every spin
  COOLDOWN_MIN_SEC: 25,
  COOLDOWN_MAX_SEC: 7200,
  /**
   * Server-side spin result generator. Uses weighted RNG so jackpots are rare
   * but not impossible — matches the demo distribution.
   * @returns {{ reels: string[], reward: number }}
   */
  rollOutcome() {
    const r = Math.random();
    let reels;

    if (r < 0.12) {
      // 12% chance: ⚡⚡⚡ jackpot
      reels = ["⚡", "⚡", "⚡"];
    } else if (r < 0.35) {
      // 23% chance: another triple from {💎🔮🌟🔥🪙}
      const pool = SLOTS.SYMBOLS.slice(1);
      const sym = pool[Math.floor(Math.random() * pool.length)];
      reels = [sym, sym, sym];
    } else {
      // 65% chance: random reels
      reels = [randSym(), randSym(), randSym()];
    }

    const combo = reels.join("");
    let reward = SLOTS.TRIPLE_REWARDS[combo] ?? 0;
    if (
      reward === 0 &&
      (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2])
    ) {
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
  rewardFor(value) {
    return DICE.REWARDS[value] ?? 0;
  },
};

// ── SHOP TIERS ───────────────────────────────────────────────────────────────
export const SHOP = {
  TIERS: [
    { id: "tier_1k",     label: "1K",    novaPower:    1_000, priceTon:  0.008, dailyTon: 0.00036, monthTon: 0.01080 },
    { id: "tier_10k",    label: "10K",   novaPower:   10_000, priceTon:  0.085, dailyTon: 0.00360, monthTon: 0.10800 },
    { id: "tier_100k",   label: "100K",  novaPower:  100_000, priceTon:  0.85,  dailyTon: 0.03600, monthTon: 1.08000, hot: true },
    { id: "tier_500k",   label: "500K",  novaPower:  500_000, priceTon:  4.25,  dailyTon: 0.18000, monthTon: 5.40000 },
    { id: "tier_1_25m",  label: "1.25M", novaPower: 1_250_000, priceTon:  8.50,  dailyTon: 0.45000, monthTon: 13.5000 },
    { id: "tier_8_75m",  label: "8.75M", novaPower: 8_750_000, priceTon: 42.50,  dailyTon: 3.15000, monthTon: 94.5000 },
  ],
};

// ── TASKS ────────────────────────────────────────────────────────────────────
// Static task list for v1. Later we can move this to a Supabase `tasks` table
// so admins can edit without a deploy.
export const TASKS = {
  LIST: [
    { id: "join_channel",       label: "Join NovaMine Channel",  reward: 500,  action: "Join",      url: "https://t.me/NovaMineChannel" },
    { id: "join_chat",          label: "Join Community Chat",    reward: 500,  action: "Claim",     url: "https://t.me/NovaMineChat" },
    { id: "start_partner_alpha",label: "Start Partner Bot Alpha",reward: 1000, action: "Start Bot", url: "https://t.me/PartnerAlphaBot" },
    { id: "start_partner_beta", label: "Start Partner Bot Beta", reward: 500,  action: "Start Bot", url: "https://t.me/PartnerBetaBot" },
  ],
};

// ── SWAP ─────────────────────────────────────────────────────────────────────
export const SWAP = {
  // 1 hash = 0.00001440 TON (matches the SwapModal in App.jsx)
  HASH_TO_TON_RATE: 0.00001440,
  hashesToTon(hashes) {
    return +(Number(hashes) * SWAP.HASH_TO_TON_RATE).toFixed(8);
  },
};

// ── WITHDRAW GATING ──────────────────────────────────────────────────────────
export const WITHDRAW = {
  MIN_TON: 0.8,
  REQUIRED_ACTIVE_REFERRALS: 5,
  // What it takes for a referral to count as "active" this month
  ACTIVE_MIN_DAYS_MINED_THIS_MONTH: 10,
};

// ── INVITE MILESTONES (for the Tasks tab) ────────────────────────────────────
export const REFERRAL_MILESTONES = [
  { count: 1,   reward:  1200 },
  { count: 5,   reward:  2400 },
  { count: 25,  reward:  6000 },
  { count: 50,  reward: 12000 },
  { count: 100, reward: 24000 },
];
