// Thin wrapper around window.Telegram.WebApp with a dev-mode mock so we can
// run NovaMine in a regular browser during development. Telegram injects this
// object via the <script src="telegram-web-app.js"> tag in index.html.

const isDev = import.meta.env.DEV;

/**
 * Initialize the Telegram WebApp. Returns the WebApp instance (real or mock).
 * Safe to call multiple times.
 */
export function initTelegram() {
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;

  if (tg && tg.initData) {
    // Real Telegram environment
    tg.ready();
    tg.expand();
    // Lock vertical swipe-to-close on iOS so users don't accidentally dismiss the app
    if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
    return tg;
  }

  if (!isDev) {
    // Production fallback — should never happen if served from inside Telegram
    console.warn("[novamine] Telegram WebApp not available in production");
    return null;
  }

  // Dev mock: lets us iterate in localhost without ngrok-tunnelling into Telegram every time.
  // The mock initData has NO valid HMAC, so the API will only accept it when
  // ALLOW_DEV_AUTH=true is set on the server.
  const mock = buildDevMock();
  if (typeof window !== "undefined") window.Telegram = { WebApp: mock };
  return mock;
}

export function getInitData() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp?.initData ?? "" : "";
}

export function getTelegramUser() {
  return typeof window !== "undefined"
    ? window.Telegram?.WebApp?.initDataUnsafe?.user ?? null
    : null;
}

function buildDevMock() {
  const devUser = {
    id: 1000000001,
    first_name: "Dev",
    last_name: "Tester",
    username: "dev_tester",
    language_code: "en",
    is_premium: false,
  };

  // Telegram-style initData URLSearchParams string. The hash is intentionally
  // bogus — only the dev API path will accept it.
  const params = new URLSearchParams({
    user: JSON.stringify(devUser),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "DEV_QUERY",
    hash: "DEV_NO_HMAC",
  });

  return {
    initData: params.toString(),
    initDataUnsafe: {
      user: devUser,
      auth_date: Math.floor(Date.now() / 1000),
      query_id: "DEV_QUERY",
      hash: "DEV_NO_HMAC",
    },
    version: "7.0",
    platform: "web-dev",
    colorScheme: "dark",
    themeParams: {},
    isExpanded: true,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 800,
    ready: () => {},
    expand: () => {},
    close: () => {},
    disableVerticalSwipes: () => {},
    HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
    MainButton: { show: () => {}, hide: () => {}, setText: () => {}, onClick: () => {} },
    BackButton: { show: () => {}, hide: () => {}, onClick: () => {} },
  };
}
