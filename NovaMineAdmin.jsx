import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Replace these with your actual values
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_SERVICE_KEY = "YOUR_SERVICE_ROLE_KEY"; // service_role key — keep secret!
const ADMIN_SECRET = "your_admin_password"; // simple local gate

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const supabase = {
  from: (table) => ({
    select: (cols = "*", opts = {}) => {
      let qs = `select=${cols}`;
      if (opts.order) qs += `&order=${opts.order}`;
      if (opts.limit) qs += `&limit=${opts.limit}`;
      if (opts.filter) qs += `&${opts.filter}`;
      return sb(`${table}?${qs}`, { method: "GET" });
    },
    update: (body, filter) =>
      sb(`${table}?${filter}`, {
        method: "PATCH",
        body,
        prefer: "return=representation",
      }),
    delete: (filter) =>
      sb(`${table}?${filter}`, { method: "DELETE", prefer: "return=minimal" }),
    insert: (body) =>
      sb(`${table}`, { method: "POST", body, prefer: "return=representation" }),
    rpc: (fn, body) =>
      sb(`rpc/${fn}`, { method: "POST", body }),
  }),
};

// ─── SHARED CONSTANTS (mirror of packages/shared) ───────────────────────────
const DEFAULT_TIERS = [
  { id: "tier_1k",    label: "1K",    novaPower:    1000, priceTon: 0.008, hot: false },
  { id: "tier_10k",   label: "10K",   novaPower:   10000, priceTon: 0.085, hot: false },
  { id: "tier_100k",  label: "100K",  novaPower:  100000, priceTon: 0.85,  hot: true  },
  { id: "tier_500k",  label: "500K",  novaPower:  500000, priceTon: 4.25,  hot: false },
  { id: "tier_1_25m", label: "1.25M", novaPower: 1250000, priceTon: 8.5,   hot: false },
  { id: "tier_8_75m", label: "8.75M", novaPower: 8750000, priceTon: 42.5,  hot: false },
];

const DEFAULT_TASKS = [
  { id: "join_channel",        label: "Join NovaMine Channel",   reward: 500,  action: "Join",     url: "https://t.me/NovaMineChannel", maxCompletions: 0 },
  { id: "join_chat",           label: "Join Community Chat",     reward: 500,  action: "Claim",    url: "https://t.me/NovaMineChat",    maxCompletions: 0 },
  { id: "start_partner_alpha", label: "Start Partner Bot Alpha", reward: 1000, action: "Start Bot",url: "https://t.me/PartnerAlphaBot", maxCompletions: 0 },
  { id: "start_partner_beta",  label: "Start Partner Bot Beta",  reward: 500,  action: "Start Bot",url: "https://t.me/PartnerBetaBot",  maxCompletions: 50 },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  bg: "#05070a",
  card: "#0c1018",
  cardBorder: "#1a2332",
  accent: "#00d4ff",
  accentDim: "rgba(0,212,255,0.15)",
  accentGlow: "rgba(0,212,255,0.3)",
  gold: "#f5c842",
  goldDim: "rgba(245,200,66,0.15)",
  green: "#00ff88",
  greenDim: "rgba(0,255,136,0.12)",
  red: "#ff3b5c",
  redDim: "rgba(255,59,92,0.12)",
  orange: "#ff8c00",
  text: "#e8edf3",
  muted: "#4a5568",
  mutedLight: "#7a8a9e",
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${S.bg}; font-family: 'Syne', sans-serif; color: ${S.text}; min-height: 100vh; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: ${S.bg}; }
  ::-webkit-scrollbar-thumb { background: ${S.cardBorder}; border-radius: 3px; }
  input, textarea, select { font-family: 'JetBrains Mono', monospace; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
  @keyframes glow { 0%,100% { box-shadow: 0 0 8px ${S.accentGlow}; } 50% { box-shadow: 0 0 24px ${S.accentGlow}; } }
  .fade-in { animation: fadeIn 0.3s ease forwards; }
  .pulse { animation: pulse 2s ease-in-out infinite; }
`;

// ─── TINY COMPONENTS ─────────────────────────────────────────────────────────
const Badge = ({ color = S.accent, children }) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
    {children}
  </span>
);

const Btn = ({ onClick, color = S.accent, children, small, danger, disabled, style = {} }) => {
  const c = danger ? S.red : color;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: disabled ? "#1a2332" : `${c}18`, color: disabled ? S.muted : c, border: `1px solid ${disabled ? S.cardBorder : c + "55"}`, borderRadius: 6, padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s", fontFamily: "'Syne', sans-serif", ...style }}
      onMouseEnter={e => { if (!disabled) { e.target.style.background = `${c}30`; e.target.style.borderColor = c; } }}
      onMouseLeave={e => { if (!disabled) { e.target.style.background = `${c}18`; e.target.style.borderColor = `${c}55`; } }}>
      {children}
    </button>
  );
};

const Input = ({ value, onChange, placeholder, type = "text", style = {} }) => (
  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
    style={{ background: "#080c12", border: `1px solid ${S.cardBorder}`, borderRadius: 6, color: S.text, padding: "7px 12px", fontSize: 13, outline: "none", width: "100%", transition: "border 0.15s", ...style }}
    onFocus={e => e.target.style.borderColor = S.accent}
    onBlur={e => e.target.style.borderColor = S.cardBorder}
  />
);

const Card = ({ children, style = {}, glow }) => (
  <div style={{ background: S.card, border: `1px solid ${S.cardBorder}`, borderRadius: 12, padding: 20, animation: "fadeIn 0.3s ease", ...(glow ? { boxShadow: `0 0 24px ${S.accentGlow}` } : {}), ...style }}>
    {children}
  </div>
);

const Spinner = () => (
  <div style={{ width: 20, height: 20, border: `2px solid ${S.cardBorder}`, borderTop: `2px solid ${S.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
);

const Toggle = ({ value, onChange, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => onChange(!value)}>
    <div style={{ width: 44, height: 24, borderRadius: 12, background: value ? S.green : S.cardBorder, border: `1px solid ${value ? S.green : S.muted}`, position: "relative", transition: "all 0.2s" }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: value ? "#fff" : S.muted, position: "absolute", top: 2, left: value ? 22 : 2, transition: "left 0.2s" }} />
    </div>
    {label && <span style={{ fontSize: 13, color: value ? S.green : S.mutedLight }}>{label}</span>}
  </div>
);

const Stat = ({ label, value, sub, color = S.accent }) => (
  <div style={{ textAlign: "center" }}>
    <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    <div style={{ fontSize: 11, color: S.mutedLight, marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: S.muted, marginTop: 1 }}>{sub}</div>}
  </div>
);

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
export default function NovaMineAdmin() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [tab, setTab] = useState("analytics");
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  if (!authed) return <LoginScreen pw={pw} setPw={setPw} onLogin={() => { if (pw === ADMIN_SECRET) setAuthed(true); else alert("Wrong password"); }} />;

  const tabs = [
    { id: "analytics",  label: "Analytics",    icon: "📊" },
    { id: "users",      label: "Users",         icon: "👥" },
    { id: "shop",       label: "Shop Manager",  icon: "🏪" },
    { id: "tasks",      label: "Tasks Manager", icon: "📋" },
    { id: "ads",        label: "Ad Control",    icon: "📺" },
    { id: "withdrawals",label: "Withdrawals",   icon: "💸" },
    { id: "purchases",  label: "Shop Purchases",icon: "🛒" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: S.bg }}>
      <style>{globalCSS}</style>

      {/* Top bar */}
      <div style={{ background: S.card, borderBottom: `1px solid ${S.cardBorder}`, padding: "0 24px", display: "flex", alignItems: "center", gap: 20, height: 60, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 20 }}>
          <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${S.accent}, ${S.gold})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⛏</div>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5, color: S.text }}>NovaMine</span>
          <Badge color={S.accent}>ADMIN</Badge>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: tab === t.id ? S.accentDim : "transparent", color: tab === t.id ? S.accent : S.mutedLight, border: tab === t.id ? `1px solid ${S.accent}44` : "1px solid transparent", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <Btn small onClick={() => setAuthed(false)} color={S.red}>Logout</Btn>
      </div>

      {/* Content */}
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        {tab === "analytics"   && <AnalyticsPanel notify={notify} />}
        {tab === "users"       && <UsersPanel notify={notify} />}
        {tab === "shop"        && <ShopPanel notify={notify} />}
        {tab === "tasks"       && <TasksPanel notify={notify} />}
        {tab === "ads"         && <AdsPanel notify={notify} />}
        {tab === "withdrawals" && <WithdrawalsPanel notify={notify} />}
        {tab === "purchases"   && <PurchasesPanel notify={notify} />}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "success" ? S.greenDim : S.redDim, border: `1px solid ${toast.type === "success" ? S.green : S.red}`, borderRadius: 10, padding: "12px 20px", color: toast.type === "success" ? S.green : S.red, fontSize: 14, fontWeight: 600, animation: "fadeIn 0.3s ease", zIndex: 9999, maxWidth: 320 }}>
          {toast.type === "success" ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ pw, setPw, onLogin }) {
  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{globalCSS}</style>
      <Card style={{ width: 360, textAlign: "center" }} glow>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⛏️</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>NovaMine Admin</div>
        <div style={{ fontSize: 13, color: S.mutedLight, marginBottom: 24 }}>Control Panel — Restricted Access</div>
        <Input value={pw} onChange={setPw} placeholder="Admin password" type="password" style={{ marginBottom: 12 }} />
        <Btn onClick={onLogin} style={{ width: "100%" }}>Enter Dashboard</Btn>
      </Card>
    </div>
  );
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
function AnalyticsPanel({ notify }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [users, purchases, withdrawals, sessions] = await Promise.all([
          sb(`users?select=id,nova,ton_balance,mining_power,created_at,last_seen_at`, { method: "GET", headers: {} }),
          sb(`shop_purchases?select=ton_paid,status,created_at`, { method: "GET", headers: {} }),
          sb(`withdrawals?select=amount_ton,status`, { method: "GET", headers: {} }),
          sb(`mining_sessions?select=id,claimed_at&claimed_at=not.is.null&limit=500`, { method: "GET", headers: {} }),
        ]);

        const now = Date.now();
        const DAY = 86400000;
        const activeToday = users.filter(u => now - new Date(u.last_seen_at) < DAY).length;
        const activeWeek  = users.filter(u => now - new Date(u.last_seen_at) < 7 * DAY).length;
        const totalRevenue = purchases.filter(p => p.status === "confirmed").reduce((s, p) => s + Number(p.ton_paid), 0);
        const pendingWithdrawals = withdrawals.filter(w => w.status === "pending").length;
        const pendingPurchases   = purchases.filter(p => p.status === "pending").length;

        setStats({ totalUsers: users.length, activeToday, activeWeek, totalRevenue: totalRevenue.toFixed(3), pendingWithdrawals, pendingPurchases, totalSessions: sessions.length });
      } catch (e) { notify(e.message, "error"); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="📊" title="Analytics Overview" sub="Real-time stats from Supabase" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Users",        value: stats.totalUsers,         color: S.accent },
          { label: "Active Today",       value: stats.activeToday,        color: S.green  },
          { label: "Active This Week",   value: stats.activeWeek,         color: S.gold   },
          { label: "TON Revenue",        value: `${stats.totalRevenue} ◎`, color: S.gold   },
          { label: "Pending Withdrawals",value: stats.pendingWithdrawals, color: stats.pendingWithdrawals > 0 ? S.orange : S.green },
          { label: "Pending Purchases",  value: stats.pendingPurchases,   color: stats.pendingPurchases > 0 ? S.orange : S.green },
          { label: "Total Mine Claims",  value: stats.totalSessions,      color: S.accent },
        ].map(s => (
          <Card key={s.label}>
            <Stat label={s.label} value={s.value} color={s.color} />
          </Card>
        ))}
      </div>
      <Card>
        <div style={{ color: S.mutedLight, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
          💡 Revenue counts only <Badge color={S.green}>confirmed</Badge> purchases. Pending TON purchases await manual confirmation in <strong style={{ color: S.text }}>Shop Purchases</strong> tab.
        </div>
      </Card>
    </div>
  );
}

// ─── USERS ────────────────────────────────────────────────────────────────────
function UsersPanel({ notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("balance");
  const [editUser, setEditUser] = useState(null);
  const [editVals, setEditVals] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sb(`users?select=id,telegram_id,username,first_name,nova,ton_balance,mining_power,created_at,last_seen_at&order=last_seen_at.desc&limit=200`, { method: "GET", headers: {} });
      setUsers(data || []);
    } catch (e) { notify(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase();
      return !q || (u.username || "").toLowerCase().includes(q) || (u.first_name || "").toLowerCase().includes(q) || String(u.telegram_id).includes(q);
    })
    .sort((a, b) => {
      if (sort === "balance")  return Number(b.ton_balance) - Number(a.ton_balance);
      if (sort === "nova")     return Number(b.nova) - Number(a.nova);
      if (sort === "power")    return Number(b.mining_power) - Number(a.mining_power);
      if (sort === "active")   return new Date(b.last_seen_at) - new Date(a.last_seen_at);
      return 0;
    });

  const now = Date.now();
  const isActive = (u) => now - new Date(u.last_seen_at) < 86400000;

  const saveEdit = async () => {
    try {
      await sb(`users?id=eq.${editUser.id}`, {
        method: "PATCH", headers: {},
        body: { nova: Number(editVals.nova), ton_balance: Number(editVals.ton_balance), mining_power: Number(editVals.mining_power) },
      });
      notify("User updated");
      setEditUser(null);
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="👥" title="Users" sub={`${users.length} total users`} />

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Input value={search} onChange={setSearch} placeholder="Search by username, name, Telegram ID…" style={{ flex: 1, minWidth: 200 }} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ background: "#080c12", border: `1px solid ${S.cardBorder}`, color: S.text, padding: "7px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
          <option value="active">Sort: Active first</option>
          <option value="balance">Sort: TON balance</option>
          <option value="nova">Sort: NOVA</option>
          <option value="power">Sort: Mining Power</option>
        </select>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map(u => (
          <Card key={u.id} style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${S.accent}33, ${S.gold}33)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                {(u.first_name || u.username || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{u.first_name || u.username || "Unknown"}</div>
                <div style={{ fontSize: 11, color: S.mutedLight, fontFamily: "'JetBrains Mono'" }}>@{u.username || "—"} · {u.telegram_id}</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.gold, fontFamily: "'JetBrains Mono'" }}>{Number(u.ton_balance).toFixed(4)} ◎</div>
                  <div style={{ fontSize: 10, color: S.muted }}>TON</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.accent, fontFamily: "'JetBrains Mono'" }}>{Number(u.nova).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: S.muted }}>NOVA</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.text, fontFamily: "'JetBrains Mono'" }}>{Number(u.mining_power).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: S.muted }}>POWER</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isActive(u) && <Badge color={S.green}>ACTIVE</Badge>}
                <Btn small onClick={() => { setEditUser(u); setEditVals({ nova: u.nova, ton_balance: u.ton_balance, mining_power: u.mining_power }); }}>Edit</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit modal */}
      {editUser && (
        <Modal title={`Edit: ${editUser.first_name || editUser.username}`} onClose={() => setEditUser(null)}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ fontSize: 12, color: S.mutedLight }}>NOVA Balance</label>
            <Input value={editVals.nova} onChange={v => setEditVals(p => ({ ...p, nova: v }))} type="number" />
            <label style={{ fontSize: 12, color: S.mutedLight }}>TON Balance</label>
            <Input value={editVals.ton_balance} onChange={v => setEditVals(p => ({ ...p, ton_balance: v }))} type="number" />
            <label style={{ fontSize: 12, color: S.mutedLight }}>Mining Power</label>
            <Input value={editVals.mining_power} onChange={v => setEditVals(p => ({ ...p, mining_power: v }))} type="number" />
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Btn onClick={saveEdit} style={{ flex: 1 }}>Save Changes</Btn>
              <Btn onClick={() => setEditUser(null)} color={S.muted} style={{ flex: 1 }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SHOP MANAGER ─────────────────────────────────────────────────────────────
function ShopPanel({ notify }) {
  const [tiers, setTiers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nm_tiers") || "null") || DEFAULT_TIERS; } catch { return DEFAULT_TIERS; }
  });
  const [editing, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [newTier, setNewTier] = useState(null);

  const save = (updated) => {
    setTiers(updated);
    localStorage.setItem("nm_tiers", JSON.stringify(updated));
    notify("Shop tiers saved (reload API to apply)");
  };

  const startEdit = (t) => { setEditing(t.id); setEditVals({ ...t }); };

  const applyEdit = () => {
    save(tiers.map(t => t.id === editing ? { ...editVals, novaPower: Number(editVals.novaPower), priceTon: Number(editVals.priceTon) } : t));
    setEditing(null);
  };

  const removeTier = (id) => { if (confirm("Remove this tier?")) save(tiers.filter(t => t.id !== id)); };

  const addTier = () => {
    const t = { id: `tier_custom_${Date.now()}`, label: newTier.label, novaPower: Number(newTier.novaPower), priceTon: Number(newTier.priceTon), hot: false };
    save([...tiers, t]);
    setNewTier(null);
  };

  return (
    <div className="fade-in">
      <SectionHeader icon="🏪" title="Shop Manager" sub="Edit tier prices, NOVA power, and visibility" />

      <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        {tiers.map(t => (
          <Card key={t.id} style={{ padding: "14px 18px" }}>
            {editing === t.id ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto auto", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>LABEL</div>
                  <Input value={editVals.label} onChange={v => setEditVals(p => ({ ...p, label: v }))} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>NOVA POWER</div>
                  <Input value={editVals.novaPower} onChange={v => setEditVals(p => ({ ...p, novaPower: v }))} type="number" />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>PRICE (TON)</div>
                  <Input value={editVals.priceTon} onChange={v => setEditVals(p => ({ ...p, priceTon: v }))} type="number" />
                </div>
                <Toggle value={editVals.hot} onChange={v => setEditVals(p => ({ ...p, hot: v }))} label="🔥 Hot" />
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn small onClick={applyEdit}>Save</Btn>
                  <Btn small onClick={() => setEditing(null)} color={S.muted}>✕</Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, background: `${S.gold}15`, border: `1px solid ${S.gold}44`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: S.gold, fontFamily: "'JetBrains Mono'" }}>
                  {t.label}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, display: "flex", gap: 8, alignItems: "center" }}>
                    {t.id} {t.hot && <Badge color={S.orange}>🔥 HOT</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: S.mutedLight, fontFamily: "'JetBrains Mono'", marginTop: 2 }}>
                    {Number(t.novaPower).toLocaleString()} NOVA · {t.priceTon} TON
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small onClick={() => startEdit(t)}>Edit</Btn>
                  <Btn small danger onClick={() => removeTier(t.id)}>Remove</Btn>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {newTier ? (
        <Card style={{ border: `1px dashed ${S.accent}55` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: S.accent, marginBottom: 12 }}>➕ New Tier</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>LABEL (e.g. 50K)</div>
              <Input value={newTier.label || ""} onChange={v => setNewTier(p => ({ ...p, label: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>NOVA POWER</div>
              <Input value={newTier.novaPower || ""} onChange={v => setNewTier(p => ({ ...p, novaPower: v }))} type="number" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>PRICE (TON)</div>
              <Input value={newTier.priceTon || ""} onChange={v => setNewTier(p => ({ ...p, priceTon: v }))} type="number" />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small onClick={addTier} color={S.green}>Add</Btn>
              <Btn small onClick={() => setNewTier(null)} color={S.muted}>✕</Btn>
            </div>
          </div>
        </Card>
      ) : (
        <Btn onClick={() => setNewTier({})} color={S.green}>➕ Add New Tier</Btn>
      )}

      <div style={{ marginTop: 20, padding: 16, background: `${S.orange}10`, border: `1px solid ${S.orange}44`, borderRadius: 10, fontSize: 12, color: S.orange }}>
        ⚠️ <strong>Important:</strong> Changes here are saved locally for your reference. To apply them to production, update <code style={{ background: "#080c12", padding: "1px 6px", borderRadius: 4 }}>packages/shared/index.js</code> → <code>SHOP.TIERS</code> with the new values and redeploy the API.
      </div>
    </div>
  );
}

// ─── TASKS MANAGER ────────────────────────────────────────────────────────────
function TasksPanel({ notify }) {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nm_tasks") || "null") || DEFAULT_TASKS; } catch { return DEFAULT_TASKS; }
  });
  const [editing, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [newTask, setNewTask] = useState({});

  const save = (updated) => {
    setTasks(updated);
    localStorage.setItem("nm_tasks", JSON.stringify(updated));
    notify("Tasks saved (redeploy API to apply)");
  };

  const removeTask = (id) => { if (confirm("Remove task?")) save(tasks.filter(t => t.id !== id)); };

  const applyEdit = () => {
    save(tasks.map(t => t.id === editing ? { ...t, ...editVals, reward: Number(editVals.reward), maxCompletions: Number(editVals.maxCompletions || 0) } : t));
    setEditing(null);
  };

  const addTask = () => {
    const t = { id: `task_${Date.now()}`, label: newTask.label, reward: Number(newTask.reward), action: newTask.action || "Claim", url: newTask.url || "", maxCompletions: Number(newTask.maxCompletions || 0) };
    save([...tasks, t]);
    setShowNew(false);
    setNewTask({});
  };

  return (
    <div className="fade-in">
      <SectionHeader icon="📋" title="Tasks Manager" sub="Add/remove tasks, set rewards and caps" />

      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {tasks.map(t => (
          <Card key={t.id} style={{ padding: "14px 18px" }}>
            {editing === t.id ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>LABEL</div>
                    <Input value={editVals.label || ""} onChange={v => setEditVals(p => ({ ...p, label: v }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>REWARD (NOVA)</div>
                    <Input value={editVals.reward || ""} onChange={v => setEditVals(p => ({ ...p, reward: v }))} type="number" />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>MAX COMPLETIONS (0 = unlimited)</div>
                    <Input value={editVals.maxCompletions ?? ""} onChange={v => setEditVals(p => ({ ...p, maxCompletions: v }))} type="number" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>URL</div>
                    <Input value={editVals.url || ""} onChange={v => setEditVals(p => ({ ...p, url: v }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>BUTTON LABEL</div>
                    <Input value={editVals.action || ""} onChange={v => setEditVals(p => ({ ...p, action: v }))} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small onClick={applyEdit}>Save</Btn>
                  <Btn small onClick={() => setEditing(null)} color={S.muted}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    {t.label}
                    {t.maxCompletions > 0 && <Badge color={S.orange}>Cap: {t.maxCompletions}</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: S.mutedLight, fontFamily: "'JetBrains Mono'", marginTop: 2 }}>
                    +{t.reward} NOVA · [{t.action}] · {t.url || "no url"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small onClick={() => { setEditing(t.id); setEditVals({ ...t }); }}>Edit</Btn>
                  <Btn small danger onClick={() => removeTask(t.id)}>Remove</Btn>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {showNew ? (
        <Card style={{ border: `1px dashed ${S.green}55` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: S.green, marginBottom: 12 }}>➕ New Task</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>LABEL</div>
              <Input value={newTask.label || ""} onChange={v => setNewTask(p => ({ ...p, label: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>REWARD (NOVA)</div>
              <Input value={newTask.reward || ""} onChange={v => setNewTask(p => ({ ...p, reward: v }))} type="number" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>MAX COMPLETIONS</div>
              <Input value={newTask.maxCompletions || ""} onChange={v => setNewTask(p => ({ ...p, maxCompletions: v }))} type="number" placeholder="0 = unlimited" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>URL</div>
              <Input value={newTask.url || ""} onChange={v => setNewTask(p => ({ ...p, url: v }))} placeholder="https://t.me/..." />
            </div>
            <div>
              <div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>BUTTON LABEL</div>
              <Input value={newTask.action || ""} onChange={v => setNewTask(p => ({ ...p, action: v }))} placeholder="Join / Claim / etc" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={addTask} color={S.green}>Add Task</Btn>
            <Btn small onClick={() => { setShowNew(false); setNewTask({}); }} color={S.muted}>Cancel</Btn>
          </div>
        </Card>
      ) : (
        <Btn onClick={() => setShowNew(true)} color={S.green}>➕ Add New Task</Btn>
      )}

      <div style={{ marginTop: 20, padding: 16, background: `${S.orange}10`, border: `1px solid ${S.orange}44`, borderRadius: 10, fontSize: 12, color: S.orange }}>
        ⚠️ Changes are saved locally. Apply to production by updating <code style={{ background: "#080c12", padding: "1px 6px", borderRadius: 4 }}>packages/shared/index.js</code> → <code>TASKS.LIST</code> and redeploying. <code>maxCompletions</code> requires a <code>tasks</code> DB table for enforcement (see migration guide below).
      </div>
    </div>
  );
}

// ─── ADS PANEL ────────────────────────────────────────────────────────────────
function AdsPanel({ notify }) {
  const [adsOn, setAdsOn] = useState(() => localStorage.getItem("nm_ads_enabled") !== "false");
  const [triggers, setTriggers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nm_ad_triggers") || "null") || {
        start_mining: true,
        collect_mining: true,
        spin_slot: true,
        dice_roll: true,
      };
    } catch { return { start_mining: true, collect_mining: true, spin_slot: true, dice_roll: true }; }
  });

  const saveAds = (on, trigs) => {
    localStorage.setItem("nm_ads_enabled", String(on));
    localStorage.setItem("nm_ad_triggers", JSON.stringify(trigs));
    notify("Ad settings saved");
  };

  const toggleMain = (v) => { setAdsOn(v); saveAds(v, triggers); };
  const toggleTrigger = (k) => {
    const updated = { ...triggers, [k]: !triggers[k] };
    setTriggers(updated);
    saveAds(adsOn, updated);
  };

  const triggerLabels = {
    start_mining:    { label: "Start Mining",        icon: "⛏️", desc: "Show ad when user taps 'Start Mining'" },
    collect_mining:  { label: "Collect Mined NOVA",  icon: "📦", desc: "Show ad when user claims mining session" },
    spin_slot:       { label: "Spin Fruit Slot",     icon: "🎰", desc: "Show ad on each slot machine spin" },
    dice_roll:       { label: "Dice Roll",           icon: "🎲", desc: "Show ad on daily dice roll" },
  };

  return (
    <div className="fade-in">
      <SectionHeader icon="📺" title="Ad Session Control" sub="Master toggle + trigger point configuration" />

      <Card style={{ marginBottom: 20, border: `1px solid ${adsOn ? S.green + "55" : S.cardBorder}` }} glow={adsOn}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Master Ad Toggle</div>
            <div style={{ fontSize: 12, color: S.mutedLight, marginTop: 4 }}>
              {adsOn ? "🟢 Ads are showing to all users in the mini app" : "🔴 Ads are disabled — no ads will show anywhere"}
            </div>
          </div>
          <Toggle value={adsOn} onChange={toggleMain} />
        </div>
      </Card>

      <div style={{ fontSize: 13, fontWeight: 700, color: S.mutedLight, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
        Trigger Points
      </div>
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {Object.entries(triggerLabels).map(([k, info]) => (
          <Card key={k} style={{ padding: "14px 18px", opacity: adsOn ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 28 }}>{info.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</div>
                <div style={{ fontSize: 11, color: S.mutedLight, marginTop: 2 }}>{info.desc}</div>
              </div>
              <Toggle value={triggers[k] && adsOn} onChange={() => { if (adsOn) toggleTrigger(k); }} />
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ background: `${S.accent}08`, border: `1px solid ${S.accent}33` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.accent, marginBottom: 10 }}>Integration Guide</div>
        <div style={{ fontSize: 12, color: S.mutedLight, lineHeight: 1.7 }}>
          In your <code style={{ color: S.accent, background: "#080c12", padding: "1px 6px", borderRadius: 4 }}>App.jsx</code>, read these settings from your API/DB before showing ads:
          <pre style={{ background: "#080c12", borderRadius: 8, padding: 14, marginTop: 10, fontSize: 11, color: S.text, overflowX: "auto", lineHeight: 1.6 }}>{`// In your API, expose a /config endpoint:
// GET /config → { adsEnabled: true, adTriggers: { start_mining: true, ... } }

// In App.jsx, before each trigger point:
if (config.adsEnabled && config.adTriggers.start_mining) {
  await showMontageAd(); // your existing ad logic
}
await api.startMining();`}</pre>
        </div>
      </Card>
    </div>
  );
}

// ─── WITHDRAWALS ──────────────────────────────────────────────────────────────
function WithdrawalsPanel({ notify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [userMap, setUserMap] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sb(`withdrawals?select=id,user_id,amount_ton,wallet_address,status,tx_hash,requested_at,notes&order=requested_at.desc&limit=200`, { method: "GET", headers: {} });
      setRows(data || []);
      // Load user info for unique user_ids
      const ids = [...new Set((data || []).map(r => r.user_id))];
      if (ids.length) {
        const users = await sb(`users?select=id,username,first_name,telegram_id&id=in.(${ids.join(",")})`, { method: "GET", headers: {} });
        const m = {};
        (users || []).forEach(u => { m[u.id] = u; });
        setUserMap(m);
      }
    } catch (e) { notify(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const approve = async (row) => {
    try {
      await sb(`withdrawals?id=eq.${row.id}`, { method: "PATCH", headers: {}, body: { status: "sent", processed_at: new Date().toISOString() } });
      notify("Withdrawal approved");
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const reject = async (row) => {
    const reason = prompt("Rejection reason (optional):");
    try {
      // Refund TON to user
      const user = await sb(`users?select=ton_balance&id=eq.${row.user_id}`, { method: "GET", headers: {} });
      if (user?.[0]) {
        await sb(`users?id=eq.${row.user_id}`, { method: "PATCH", headers: {}, body: { ton_balance: Number(user[0].ton_balance) + Number(row.amount_ton) } });
      }
      await sb(`withdrawals?id=eq.${row.id}`, { method: "PATCH", headers: {}, body: { status: "rejected", notes: reason || null, processed_at: new Date().toISOString() } });
      notify("Withdrawal rejected & TON refunded");
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const filtered = rows.filter(r => filter === "all" ? true : r.status === filter);
  const statusColor = { pending: S.orange, processing: S.accent, sent: S.green, rejected: S.red, refunded: S.muted };

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="💸" title="Withdrawals" sub={`${rows.filter(r => r.status === "pending").length} pending`} />

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {["pending", "sent", "rejected", "all"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ background: filter === s ? `${S.accent}20` : "transparent", color: filter === s ? S.accent : S.mutedLight, border: `1px solid ${filter === s ? S.accent + "55" : S.cardBorder}`, borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map(row => {
          const u = userMap[row.user_id];
          return (
            <Card key={row.id} style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: S.gold }}>{Number(row.amount_ton).toFixed(4)} ◎</span>
                    <Badge color={statusColor[row.status] || S.muted}>{row.status.toUpperCase()}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: S.mutedLight, fontFamily: "'JetBrains Mono'", marginBottom: 2 }}>
                    {u ? `@${u.username || u.first_name} (${u.telegram_id})` : row.user_id.slice(0, 8) + "…"}
                  </div>
                  <div style={{ fontSize: 11, color: S.muted, fontFamily: "'JetBrains Mono'" }}>
                    → {row.wallet_address}
                  </div>
                  {row.notes && <div style={{ fontSize: 11, color: S.red, marginTop: 4 }}>Note: {row.notes}</div>}
                </div>
                <div style={{ fontSize: 11, color: S.muted, textAlign: "right" }}>
                  {new Date(row.requested_at).toLocaleString()}
                </div>
                {row.status === "pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small color={S.green} onClick={() => approve(row)}>✓ Approve</Btn>
                    <Btn small danger onClick={() => reject(row)}>✗ Reject</Btn>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <EmptyState icon="💸" msg={`No ${filter} withdrawals`} />}
      </div>
    </div>
  );
}

// ─── SHOP PURCHASES ───────────────────────────────────────────────────────────
function PurchasesPanel({ notify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [userMap, setUserMap] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sb(`shop_purchases?select=id,user_id,tier_id,nova_granted,ton_paid,tx_hash,status,created_at&order=created_at.desc&limit=200`, { method: "GET", headers: {} });
      setRows(data || []);
      const ids = [...new Set((data || []).map(r => r.user_id))];
      if (ids.length) {
        const users = await sb(`users?select=id,username,first_name,telegram_id,nova,mining_power&id=in.(${ids.join(",")})`, { method: "GET", headers: {} });
        const m = {};
        (users || []).forEach(u => { m[u.id] = u; });
        setUserMap(m);
      }
    } catch (e) { notify(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const confirm = async (row) => {
    try {
      const user = userMap[row.user_id];
      if (user) {
        // Grant mining power + nova
        await sb(`users?id=eq.${row.user_id}`, { method: "PATCH", headers: {}, body: {
          nova: Number(user.nova || 0) + Number(row.nova_granted),
          mining_power: Number(user.mining_power || 1000) + Number(row.nova_granted),
        }});
      }
      await sb(`shop_purchases?id=eq.${row.id}`, { method: "PATCH", headers: {}, body: { status: "confirmed", confirmed_at: new Date().toISOString() } });
      notify(`Purchase confirmed — ${Number(row.nova_granted).toLocaleString()} NOVA granted`);
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const reject = async (row) => {
    try {
      await sb(`shop_purchases?id=eq.${row.id}`, { method: "PATCH", headers: {}, body: { status: "rejected" } });
      notify("Purchase rejected");
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const filtered = rows.filter(r => filter === "all" ? true : r.status === filter);
  const statusColor = { pending: S.orange, confirmed: S.green, rejected: S.red };

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="🛒" title="Shop Purchases" sub={`${rows.filter(r => r.status === "pending").length} pending TON payments`} />

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {["pending", "confirmed", "rejected", "all"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ background: filter === s ? `${S.accent}20` : "transparent", color: filter === s ? S.accent : S.mutedLight, border: `1px solid ${filter === s ? S.accent + "55" : S.cardBorder}`, borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map(row => {
          const u = userMap[row.user_id];
          return (
            <Card key={row.id} style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: S.gold }}>{row.tier_id}</span>
                    <Badge color={statusColor[row.status] || S.muted}>{row.status.toUpperCase()}</Badge>
                    <span style={{ fontSize: 13, color: S.accent }}>+{Number(row.nova_granted).toLocaleString()} NOVA</span>
                  </div>
                  <div style={{ fontSize: 11, color: S.mutedLight, marginBottom: 2 }}>
                    {u ? `@${u.username || u.first_name} (${u.telegram_id})` : row.user_id.slice(0, 8) + "…"}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", color: S.muted }}>
                    {Number(row.ton_paid).toFixed(4)} TON · tx: {row.tx_hash?.slice(0, 16)}…
                  </div>
                </div>
                <div style={{ fontSize: 11, color: S.muted }}>{new Date(row.created_at).toLocaleString()}</div>
                {row.status === "pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small color={S.green} onClick={() => confirm(row)}>✓ Confirm</Btn>
                    <Btn small danger onClick={() => reject(row)}>✗ Reject</Btn>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <EmptyState icon="🛒" msg={`No ${filter} purchases`} />}
      </div>

      <div style={{ marginTop: 20, padding: 16, background: `${S.accent}08`, border: `1px solid ${S.accent}33`, borderRadius: 10, fontSize: 12, color: S.mutedLight, lineHeight: 1.7 }}>
        <strong style={{ color: S.accent }}>How to verify:</strong> Before confirming, check the <code style={{ color: S.text, background: "#080c12", padding: "1px 5px", borderRadius: 4 }}>tx_hash</code> on <a href="https://tonscan.org" target="_blank" style={{ color: S.accent }}>tonscan.org</a> to confirm the TON payment reached your wallet. Confirming will automatically grant NOVA + mining power to the user.
      </div>
    </div>
  );
}

// ─── SHARED UI HELPERS ────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>
        <span>{icon}</span> {title}
      </div>
      {sub && <div style={{ fontSize: 13, color: S.mutedLight, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Card style={{ width: "min(500px, 90vw)", animation: "fadeIn 0.2s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: S.mutedLight, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </Card>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80, gap: 12, color: S.mutedLight }}>
      <Spinner /> Loading from Supabase…
    </div>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div style={{ textAlign: "center", padding: 48, color: S.muted }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{msg}</div>
    </div>
  );
}
