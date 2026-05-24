// Type definitions for @novamine/shared.
// Hand-written so the runtime stays in plain JS (no build step needed).

export interface MiningModule {
  readonly SESSION_DURATION_MS: number;
  readonly DEFAULT_POWER: number;
  hashesPerSession(power: number): number;
  dailyTon(power: number): number;
}
export const MINING: MiningModule;

export interface SlotsOutcome {
  reels: [string, string, string];
  reward: number;
}
export interface SlotsModule {
  readonly SYMBOLS: readonly string[];
  readonly TRIPLE_REWARDS: Readonly<Record<string, number>>;
  readonly TWO_MATCH_REWARD: number;
  readonly COOLDOWN_MIN_SEC: number;
  readonly COOLDOWN_MAX_SEC: number;
  rollOutcome(): SlotsOutcome;
}
export const SLOTS: SlotsModule;

export interface DiceModule {
  readonly REWARDS: Readonly<Record<number, number>>;
  rewardFor(value: number): number;
}
export const DICE: DiceModule;

export interface ShopTier {
  id: string;
  label: string;
  novaPower: number;
  priceTon: number;
  dailyTon: number;
  monthTon: number;
  hot?: boolean;
}
export interface ShopModule {
  readonly TIERS: readonly ShopTier[];
}
export const SHOP: ShopModule;

export interface Task {
  id: string;
  label: string;
  reward: number;
  action: string;
  url: string;
}
export interface TasksModule {
  readonly LIST: readonly Task[];
}
export const TASKS: TasksModule;

export interface SwapModule {
  readonly HASH_TO_TON_RATE: number;
  hashesToTon(hashes: number): number;
}
export const SWAP: SwapModule;

export interface WithdrawModule {
  readonly MIN_TON: number;
  readonly REQUIRED_ACTIVE_REFERRALS: number;
  readonly ACTIVE_MIN_DAYS_MINED_THIS_MONTH: number;
}
export const WITHDRAW: WithdrawModule;

export interface ReferralMilestone {
  count: number;
  reward: number;
}
export const REFERRAL_MILESTONES: readonly ReferralMilestone[];
