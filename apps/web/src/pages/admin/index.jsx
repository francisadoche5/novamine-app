import { useState, useEffect, useCallback } from "react";
import { miningPowerFromNova, MINING, ADMIN_RATES, SWAP } from "@novamine/shared";

// ─── CONFIG — no secrets here, everything goes through your Render API ────────
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://novamine-api.onrender.com";

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function adminFetch(path, opts = {}, secret) {
  const res = await fetch(`${API_BASE}/admin${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": secret || sessionStorage.getItem("nm_admin_secret") || "",
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  bg: "#05070a", card: "#0c1018", cardBorder: "#1a2332",
  accent: "#00d4ff", accentDim: "rgba(0,212,255,0.15)", accentGlow: "rgba(0,212,255,0.3)",
  gold: "#f5c842", goldDim: "rgba(245,200,66,0.15)",
  green: "#00ff88", greenDim: "rgba(0,255,136,0.12)",
  red: "#ff3b5c", redDim: "rgba(255,59,92,0.12)",
  orange: "#ff8c00", text: "#e8edf3", muted: "#4a5568", mutedLight: "#7a8a9e",
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${S.bg}; font-family: 'Syne', sans-serif; color: ${S.text}; min-height: 100vh; }
  ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: ${S.bg}; }
  ::-webkit-scrollbar-thumb { background: ${S.cardBorder}; border-radius: 3px; }
  input, textarea, select { font-family: 'JetBrains Mono', monospace; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-in { animation: fadeIn 0.3s ease forwards; }
`;

// ─── TINY UI COMPONENTS ───────────────────────────────────────────────────────
const Badge = ({ color = S.accent, children }) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono'", letterSpacing: 0.5 }}>{children}</span>
);

const Btn = ({ onClick, color = S.accent, children, small, danger, disabled, style = {} }) => {
  const c = danger ? S.red : color;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: disabled ? "#1a2332" : `${c}18`, color: disabled ? S.muted : c, border: `1px solid ${disabled ? S.cardBorder : c + "55"}`, borderRadius: 6, padding: small ? "4px 10px" : "8px 16px", fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s", fontFamily: "'Syne'", ...style }}
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

const Toggle = ({ value, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: value ? S.green : S.cardBorder, border: `1px solid ${value ? S.green : S.muted}`, position: "relative", transition: "all 0.2s", cursor: "pointer" }} onClick={() => onChange(!value)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: value ? "#fff" : S.muted, position: "absolute", top: 2, left: value ? 22 : 2, transition: "left 0.2s" }} />
  </div>
);

const SectionHeader = ({ icon, title, sub }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>{icon} {title}</div>
    {sub && <div style={{ fontSize: 13, color: S.mutedLight, marginTop: 4 }}>{sub}</div>}
  </div>
);

const LoadingScreen = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80, gap: 12, color: S.mutedLight }}>
    <Spinner /> Loading…
  </div>
);

const EmptyState = ({ icon, msg }) => (
  <div style={{ textAlign: "center", padding: 48, color: S.muted }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 14 }}>{msg}</div>
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <Card style={{ width: "min(500px, 90vw)", animation: "fadeIn 0.2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: S.mutedLight, cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      {children}
    </Card>
  </div>
);

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function NovaMineAdmin() {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem("nm_admin_secret"));
  const [secret, setSecret] = useState("");
  const [tab, setTab] = useState("analytics");
  const [toast, setToast] = useState(null);
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const notify = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginErr("");
    try {
      await adminFetch("/login", { method: "POST", body: { secret } }, secret);
      sessionStorage.setItem("nm_admin_secret", secret);
      setAuthed(true);
    } catch {
      setLoginErr("Wrong password. Try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("nm_admin_secret");
    setAuthed(false);
    setSecret("");
  };

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{globalCSS}</style>
      <Card style={{ width: 360, textAlign: "center" }} glow>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⛏️</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>NovaMine Admin</div>
        <div style={{ fontSize: 13, color: S.mutedLight, marginBottom: 24 }}>Enter your admin password</div>
        <Input value={secret} onChange={setSecret} placeholder="Admin password" type="password" style={{ marginBottom: 12 }} />
        {loginErr && <div style={{ color: S.red, fontSize: 12, marginBottom: 10 }}>{loginErr}</div>}
        <Btn onClick={handleLogin} disabled={loginLoading} style={{ width: "100%" }}>
          {loginLoading ? "Checking…" : "Enter Dashboard"}
        </Btn>
        <div style={{ fontSize: 11, color: S.muted, marginTop: 16 }}>Password is managed via Render environment variables</div>
      </Card>
    </div>
  );

  const tabs = [
    { id: "analytics",   label: "Analytics",     icon: "📊" },
    { id: "users",       label: "Users",          icon: "👥" },
    { id: "shop",        label: "Shop",           icon: "🏪" },
    { id: "ads",         label: "Ad Control",     icon: "📺" },
    { id: "withdrawals", label: "Withdrawals",    icon: "💸" },
    { id: "purchases",   label: "Purchases",      icon: "🛒" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: S.bg }}>
      <style>{globalCSS}</style>
      <div style={{ background: S.card, borderBottom: `1px solid ${S.cardBorder}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${S.accent}, ${S.gold})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⛏</div>
            <span style={{ fontWeight: 800, fontSize: 16 }}>NovaMine</span>
            <Badge color={S.accent}>ADMIN</Badge>
          </div>
          <Btn small onClick={logout} color={S.red}>Logout</Btn>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "0 12px 10px", scrollbarWidth: "none" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: tab === t.id ? S.accentDim : "transparent", color: tab === t.id ? S.accent : S.mutedLight, border: tab === t.id ? `1px solid ${S.accent}44` : `1px solid ${S.cardBorder}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", flexShrink: 0 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        {tab === "analytics"   && <AnalyticsPanel notify={notify} />}
        {tab === "users"       && <UsersPanel notify={notify} />}
        {tab === "shop"        && <ShopPanel notify={notify} />}
        {tab === "ads"         && <AdsPanel notify={notify} />}
        {tab === "withdrawals" && <WithdrawalsPanel notify={notify} />}
        {tab === "purchases"   && <PurchasesPanel notify={notify} />}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "success" ? S.greenDim : S.redDim, border: `1px solid ${toast.type === "success" ? S.green : S.red}`, borderRadius: 10, padding: "12px 20px", color: toast.type === "success" ? S.green : S.red, fontSize: 14, fontWeight: 600, animation: "fadeIn 0.3s ease", zIndex: 9999 }}>
          {toast.type === "success" ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
function AnalyticsPanel({ notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/analytics", { method: "GET" })
      .then(d => {
        const now = Date.now(), DAY = 86400000;
        const users = d.users || [];
        const purchases = d.purchases || [];
        const withdrawals = d.withdrawals || [];
        setData({
          totalUsers: users.length,
          activeToday: users.filter(u => now - new Date(u.last_seen_at) < DAY).length,
          activeWeek: users.filter(u => now - new Date(u.last_seen_at) < 7 * DAY).length,
          totalRevenue: purchases.filter(p => p.status === "confirmed").reduce((s, p) => s + Number(p.ton_paid), 0).toFixed(3),
          pendingWithdrawals: withdrawals.filter(w => w.status === "pending").length,
          pendingPurchases: purchases.filter(p => p.status === "pending").length,
          totalSessions: d.sessions?.length || 0,
        });
      })
      .catch(e => notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="📊" title="Analytics Overview" sub="Live data from your Supabase database" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        {[
          { label: "Total Users",         value: data.totalUsers,         color: S.accent },
          { label: "Active Today",        value: data.activeToday,        color: S.green  },
          { label: "Active This Week",    value: data.activeWeek,         color: S.gold   },
          { label: "TON Revenue",         value: `${data.totalRevenue} ◎`, color: S.gold  },
          { label: "Pending Withdrawals", value: data.pendingWithdrawals, color: data.pendingWithdrawals > 0 ? S.orange : S.green },
          { label: "Pending Purchases",   value: data.pendingPurchases,   color: data.pendingPurchases > 0 ? S.orange : S.green },
          { label: "Total Mine Claims",   value: data.totalSessions,      color: S.accent },
        ].map(s => (
          <Card key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono'" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: S.mutedLight, marginTop: 4 }}>{s.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── USERS ────────────────────────────────────────────────────────────────────
function UsersPanel({ notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("active");
  const [editUser, setEditUser] = useState(null);
  const [editVals, setEditVals] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/users", { method: "GET" })
      .then(setUsers)
      .catch(e => notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase();
      return !q || (u.username||"").toLowerCase().includes(q) || (u.first_name||"").toLowerCase().includes(q) || String(u.telegram_id).includes(q);
    })
    .sort((a, b) => {
      if (sort === "balance") return Number(b.ton_balance) - Number(a.ton_balance);
      if (sort === "nova")    return Number(b.nova) - Number(a.nova);
      if (sort === "power")   return Number(b.mining_power) - Number(a.mining_power);
      return new Date(b.last_seen_at) - new Date(a.last_seen_at);
    });

  const isActive = u => Date.now() - new Date(u.last_seen_at) < 86400000;

  const saveEdit = async () => {
    try {
      const correctPower = miningPowerFromNova(editVals.nova);
      await adminFetch(`/users/${editUser.id}`, { method: "PATCH", body: { nova: editVals.nova, ton_balance: editVals.ton_balance, hashes: editVals.hashes ?? 0, mining_power: correctPower } });
      setUsers(us => us.map(u => u.id === editUser.id ? { ...u, nova: editVals.nova, ton_balance: editVals.ton_balance, hashes: editVals.hashes ?? 0, mining_power: correctPower } : u));
      setEditUser(null);
      notify("User updated — mining power auto-set to " + correctPower.toLocaleString());
    } catch (e) { notify(e.message, "error"); }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="👥" title="Users" sub={`${users.length} total`} />
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Input value={search} onChange={setSearch} placeholder="Search username, name, Telegram ID…" style={{ flex: 1, minWidth: 200 }} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ background: "#080c12", border: `1px solid ${S.cardBorder}`, color: S.text, padding: "7px 12px", borderRadius: 6, fontSize: 13 }}>
          <option value="active">Active first</option>
          <option value="balance">TON balance</option>
          <option value="nova">NOVA</option>
          <option value="power">Mining Power</option>
        </select>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map(u => (
          <Card key={u.id} style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${S.accent}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.text, fontFamily: "'JetBrains Mono'" }}>{MINING.hashesPerSession(miningPowerFromNova(u.nova)).toFixed(8)}</div>
                  <div style={{ fontSize: 10, color: S.muted }}>HASHES/SESSION</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isActive(u) && <Badge color={S.green}>ACTIVE</Badge>}
                <Btn small onClick={() => { setEditUser(u); setEditVals({ nova: u.nova, ton_balance: u.ton_balance, hashes: u.hashes ?? 0, mining_power: u.mining_power }); }}>Edit</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {editUser && (
        <Modal title={`Edit: ${editUser.first_name || editUser.username}`} onClose={() => setEditUser(null)}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ fontSize: 12, color: S.mutedLight }}>TON Balance <span style={{color:"#39ff8a",fontSize:10}}>(auto-fills NOVA & HASHES)</span></label>
            <Input value={editVals.ton_balance} onChange={v => {
              const ton = Number(v) || 0;
              setEditVals(p => ({
                ...p,
                ton_balance: v,
                nova: ton > 0 ? ADMIN_RATES.novaFromTon(ton) : p.nova,
                hashes: ton > 0 ? ADMIN_RATES.hashesFromTon(ton) : p.hashes,
              }));
            }} type="number" />
            <label style={{ fontSize: 12, color: S.mutedLight }}>NOVA Balance</label>
            <Input value={editVals.nova} onChange={v => setEditVals(p => ({ ...p, nova: v }))} type="number" />
            <label style={{ fontSize: 12, color: S.mutedLight }}>HASHES</label>
            <Input value={editVals.hashes ?? 0} onChange={v => setEditVals(p => ({ ...p, hashes: v }))} type="number" />
            <label style={{ fontSize: 12, color: S.mutedLight }}>Mining Power (auto from NOVA)</label>
            <div style={{ background: "#080c12", border: "1px solid #1e2a1e", borderRadius: 6, color: "#39ff8a", padding: "7px 12px", fontSize: 13, fontWeight: 700 }}>
              {Number(miningPowerFromNova(editVals.nova)).toLocaleString()} power
            </div>
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

// ─── SHOP (DB-backed editor — saves live to the database) ─────────────────────
const DEFAULT_TIERS = [
  { id: "tier_1k",    label: "1K",    novaPower:    1000, priceTon: 0.5,  hot: false },
  { id: "tier_10k",   label: "10K",   novaPower:   10000, priceTon: 1.0,  hot: false },
  { id: "tier_100k",  label: "100K",  novaPower:  100000, priceTon: 3.0,  hot: true  },
  { id: "tier_500k",  label: "500K",  novaPower:  500000, priceTon: 8.0,  hot: false },
  { id: "tier_1_25m", label: "1.25M", novaPower: 1250000, priceTon: 20.0, hot: false },
  { id: "tier_8_75m", label: "8.75M", novaPower: 8750000, priceTon: 80.0, hot: false },
];

function ShopPanel({ notify }) {
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [editing, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [saving, setSaving] = useState(false);

  // Load current tiers from DB on mount
  useEffect(() => {
    adminFetch("/shop-tiers").then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setTiers(data.map(t => ({
          id: t.id, label: t.label,
          novaPower: Number(t.nova_power ?? t.novaPower),
          priceTon: Number(t.price_ton ?? t.priceTon),
          hot: !!t.hot,
        })));
      }
    }).catch(() => {});
  }, []);

  const saveToDb = async (updated) => {
    setSaving(true);
    try {
      await adminFetch("/shop-tiers", { method: "PUT", body: { tiers: updated } });
      setTiers(updated);
      notify("✅ Shop tiers saved — live in the app immediately!");
    } catch (e) { notify(e.message, "error"); }
    finally { setSaving(false); }
  };

  const applyEdit = () => {
    const updated = tiers.map(t => t.id === editing
      ? { ...editVals, novaPower: Number(editVals.novaPower), priceTon: Number(editVals.priceTon) }
      : t);
    saveToDb(updated);
    setEditing(null);
  };

  return (
    <div className="fade-in">
      <SectionHeader icon="🏪" title="Shop Manager" sub="Changes save directly to the database — live in the app instantly" />
      <div style={{ display: "grid", gap: 12 }}>
        {tiers.map(t => (
          <Card key={t.id} style={{ padding: "14px 18px" }}>
            {editing === t.id ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto auto", gap: 10, alignItems: "flex-end" }}>
                <div><div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>LABEL</div><Input value={editVals.label} onChange={v => setEditVals(p => ({ ...p, label: v }))} /></div>
                <div><div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>NOVA POWER</div><Input value={editVals.novaPower} onChange={v => setEditVals(p => ({ ...p, novaPower: v }))} type="number" /></div>
                <div><div style={{ fontSize: 10, color: S.muted, marginBottom: 4 }}>PRICE (TON)</div><Input value={editVals.priceTon} onChange={v => setEditVals(p => ({ ...p, priceTon: v }))} type="number" /></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Toggle value={editVals.hot} onChange={v => setEditVals(p => ({ ...p, hot: v }))} /><span style={{ fontSize: 12, color: S.mutedLight }}>Hot</span></div>
                <div style={{ display: "flex", gap: 6 }}><Btn small onClick={applyEdit}>Save</Btn><Btn small onClick={() => setEditing(null)} color={S.muted}>✕</Btn></div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, background: `${S.gold}15`, border: `1px solid ${S.gold}44`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: S.gold }}>{t.label}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>{t.id}{t.hot && <Badge color={S.orange}>🔥 HOT</Badge>}</div>
                  <div style={{ fontSize: 12, color: S.mutedLight, fontFamily: "'JetBrains Mono'" }}>{Number(t.novaPower).toLocaleString()} NOVA · {t.priceTon} TON</div>
                </div>
                <Btn small onClick={() => { setEditing(t.id); setEditVals({ ...t }); }}>Edit</Btn>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function AdsPanel({ notify }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch("/ad-config", { method: "GET" })
      .then(setConfig)
      .catch(e => notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  const saveConfig = async (updated) => {
    setSaving(true);
    try {
      await adminFetch("/ad-config", { method: "PATCH", body: updated });
      setConfig(updated);
      notify("Ad config saved");
    } catch (e) { notify(e.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading || !config) return <LoadingScreen />;

  const triggerLabels = {
    start_mining:   { label: "Start Mining",       icon: "⛏️" },
    collect_mining: { label: "Collect Mined NOVA", icon: "📦" },
    spin_slot:      { label: "Spin Fruit Slot",    icon: "🎰" },
    dice_roll:      { label: "Dice Roll",          icon: "🎲" },
  };

  return (
    <div className="fade-in">
      <SectionHeader icon="📺" title="Ad Session Control" sub="Changes save directly to your database" />
      <Card style={{ marginBottom: 20, border: `1px solid ${config.adsEnabled ? S.green + "55" : S.cardBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Master Ad Toggle</div>
            <div style={{ fontSize: 12, color: S.mutedLight, marginTop: 4 }}>{config.adsEnabled ? "🟢 Ads ON — showing to all users" : "🔴 Ads OFF — disabled everywhere"}</div>
          </div>
          <Toggle value={config.adsEnabled} onChange={v => saveConfig({ ...config, adsEnabled: v })} />
        </div>
      </Card>
      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(triggerLabels).map(([k, info]) => (
          <Card key={k} style={{ padding: "14px 18px", opacity: config.adsEnabled ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 28 }}>{info.icon}</div>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{info.label}</div>
              <Toggle value={!!config.adTriggers[k] && config.adsEnabled}
                onChange={() => { if (config.adsEnabled) saveConfig({ ...config, adTriggers: { ...config.adTriggers, [k]: !config.adTriggers[k] } }); }} />
            </div>
          </Card>
        ))}
      </div>
      {saving && <div style={{ textAlign: "center", marginTop: 16, color: S.mutedLight, fontSize: 13 }}><Spinner /> Saving…</div>}
    </div>
  );
}

// ─── WITHDRAWALS ──────────────────────────────────────────────────────────────
function WithdrawalsPanel({ notify }) {
  const [data, setData] = useState({ withdrawals: [], userMap: {} });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/withdrawals", { method: "GET" })
      .then(setData)
      .catch(e => notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    const notes = action === "reject" ? prompt("Rejection reason (optional):") : undefined;
    try {
      await adminFetch(`/withdrawals/${id}`, { method: "PATCH", body: { action, notes } });
      notify(action === "approve" ? "Withdrawal approved" : "Withdrawal rejected & TON refunded");
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const statusColor = { pending: S.orange, processing: S.accent, sent: S.green, rejected: S.red, refunded: S.muted };
  const filtered = data.withdrawals.filter(r => filter === "all" || r.status === filter);

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="💸" title="Withdrawals" sub={`${data.withdrawals.filter(r => r.status === "pending").length} pending`} />
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
          const u = data.userMap[row.user_id];
          return (
            <Card key={row.id} style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: S.gold }}>{Number(row.amount_ton).toFixed(4)} ◎</span>
                    <Badge color={statusColor[row.status] || S.muted}>{row.status.toUpperCase()}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: S.mutedLight, fontFamily: "'JetBrains Mono'" }}>{u ? `@${u.username || u.first_name} (${u.telegram_id})` : row.user_id.slice(0, 8) + "…"}</div>
                  <div style={{ fontSize: 11, color: S.muted, fontFamily: "'JetBrains Mono'" }}>→ {row.wallet_address}</div>
                  {row.notes && <div style={{ fontSize: 11, color: S.red, marginTop: 4 }}>Note: {row.notes}</div>}
                </div>
                <div style={{ fontSize: 11, color: S.muted }}>{new Date(row.requested_at).toLocaleString()}</div>
                {row.status === "pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small color={S.green} onClick={() => act(row.id, "approve")}>✓ Approve</Btn>
                    <Btn small danger onClick={() => act(row.id, "reject")}>✗ Reject</Btn>
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
  const [data, setData] = useState({ purchases: [], userMap: {} });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/purchases", { method: "GET" })
      .then(setData)
      .catch(e => notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    try {
      await adminFetch(`/purchases/${id}`, { method: "PATCH", body: { action } });
      notify(action === "confirm" ? "Purchase confirmed — NOVA granted!" : "Purchase rejected");
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const statusColor = { pending: S.orange, confirmed: S.green, rejected: S.red };
  const filtered = data.purchases.filter(r => filter === "all" || r.status === filter);

  if (loading) return <LoadingScreen />;

  return (
    <div className="fade-in">
      <SectionHeader icon="🛒" title="Shop Purchases" sub={`${data.purchases.filter(r => r.status === "pending").length} pending TON payments`} />
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
          const u = data.userMap[row.user_id];
          return (
            <Card key={row.id} style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: S.gold }}>{row.tier_id}</span>
                    <Badge color={statusColor[row.status] || S.muted}>{row.status.toUpperCase()}</Badge>
                    <span style={{ fontSize: 13, color: S.accent }}>+{Number(row.nova_granted).toLocaleString()} NOVA</span>
                  </div>
                  <div style={{ fontSize: 11, color: S.mutedLight }}>{u ? `@${u.username || u.first_name} (${u.telegram_id})` : row.user_id.slice(0, 8) + "…"}</div>
                  <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", color: S.muted }}>{Number(row.ton_paid).toFixed(4)} TON · tx: {row.tx_hash?.slice(0, 20)}…</div>
                </div>
                <div style={{ fontSize: 11, color: S.muted }}>{new Date(row.created_at).toLocaleString()}</div>
                {row.status === "pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn small color={S.green} onClick={() => act(row.id, "confirm")}>✓ Confirm</Btn>
                    <Btn small danger onClick={() => act(row.id, "reject")}>✗ Reject</Btn>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <EmptyState icon="🛒" msg={`No ${filter} purchases`} />}
      </div>
      <div style={{ marginTop: 20, padding: 16, background: `${S.accent}08`, border: `1px solid ${S.accent}33`, borderRadius: 10, fontSize: 12, color: S.mutedLight }}>
        <strong style={{ color: S.accent }}>Before confirming:</strong> verify the tx_hash on <a href="https://tonscan.org" target="_blank" style={{ color: S.accent }}>tonscan.org</a> to confirm TON reached your wallet. Confirming auto-grants NOVA + mining power.
      </div>
    </div>
  );
}
