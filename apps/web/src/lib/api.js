// Typed-ish thin client for the Render API. All economy-affecting calls
// (mining, claiming, slots, dice, swap, withdraw) go through here
// so the server can authoritatively validate cooldowns / balances / referrals.

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

let accessToken = null;

export function setApiToken(token) {
  accessToken = token;
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // not JSON
  }

  if (!res.ok) {
    const err = new Error(payload?.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export const api = {
  // Auth
  authTelegram: (initData, startParam) =>
    request("/auth/telegram", { method: "POST", body: { initData, startParam }, auth: false }),

  // User / state
  me: () => request("/me"),

  // Mining
  startMining: () => request("/mining/start", { method: "POST" }),
  claimMining: () => request("/mining/claim", { method: "POST" }),

  // Games
  spinSlots: () => request("/games/slots/spin", { method: "POST" }),
  rollDice: () => request("/games/dice/roll", { method: "POST" }),

  // Swap & withdraw
  swap: (hashes) => request("/swap", { method: "POST", body: { hashes } }),
  requestWithdraw: (amount, walletAddress) =>
    request("/withdraw", { method: "POST", body: { amount, walletAddress } }),

  // Shop
  listShopTiers: () => request("/shop"),
  buyShopTier: (tierId, txHash) =>
    request("/shop/buy", { method: "POST", body: { tierId, txHash } }),

  // Referrals / team
  referrals: () => request("/referrals"),
  milestoneClaims: () => request("/referrals/milestones"),
  claimMilestone: (count) => request(`/referrals/milestones/${count}/claim`, { method: "POST" }),

  // Update mining power (called automatically when NOVA changes)
  updateMiningPower: (power) =>
    request("/me/mining-power", { method: "PATCH", body: { mining_power: power } }),

  // Leaderboard (public, no auth)
  leaderboard: () => request("/leaderboard", { auth: false }),
};
