// NovaMine v4 - circular nav + all NOVA labels - All NOVA labels correct
import { useState, useEffect, useRef } from "react";
import NovaMineAdmin from "./pages/admin/index.jsx";
import { getTelegramUser, initTelegram } from "./lib/telegram.js";
import { authenticate } from "./lib/auth.js";
import { api } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";
import { miningPowerFromNova, tierFromNova, MINING } from "@novamine/shared";
import { useTonConnectUI, useTonAddress, TonConnectButton } from "@tonconnect/ui-react";
import { T, css, diceDots, diceColors } from "./constants/theme.js";
import Icon from "./components/Icon.jsx";
import DiceFace from "./components/DiceFace.jsx";
import SwapModal from "./components/SwapModal.jsx";
import WithdrawModal from "./components/WithdrawModal.jsx";
import StreakPopup from "./components/StreakPopup.jsx";
import GiftPopup from "./components/GiftPopup.jsx";
import { genActivity } from "./lib/activityFeed.js";


// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function NovaMine(){
  if (window.location.pathname === "/admin") {
    return <NovaMineAdmin />;
  }
  const [tab,setTab]=useState("power");
  const [nova,setNova]=useState(0);          // new users start at 0
  const [hashes,setHashes]=useState(0);      // new users start at 0
  const [tonBalance,setTonBalance]=useState(0); // new users start at 0
  const [miningPower,setMiningPower]=useState(1000);
  const [adsEnabled,setAdsEnabled]=useState(false);
  const [adTriggers,setAdTriggers]=useState({start_mining:false,collect_mining:false,spin_slot:false,dice_roll:false});
  const [userLoaded,setUserLoaded]=useState(false);
  const [shopTiers,setShopTiers]=useState([]);
  const [shopWallet,setShopWallet]=useState("");
  const userDbId=useRef(null);
  const [subTab,setSubTab]=useState("slots");
  const [showWithdraw,setShowWithdraw]=useState(false);
  const [showSwap,setShowSwap]=useState(false);
  const [showAd,setShowAd]=useState(false);
  const [adCallback,setAdCallback]=useState(null);
  const [adProgress,setAdProgress]=useState(0);
  const [adSkippable,setAdSkippable]=useState(false);
  // Mining state — persisted in localStorage so it survives page reloads/quit
  const MINING_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours — matches Dulce CANDY 24h production loop
  const [miningStartedAt, setMiningStartedAt] = useState(() => {
    const v = localStorage.getItem("nm_mining_started_at");
    return v ? Number(v) : null;
  });
  const miningActive = miningStartedAt !== null && (Date.now() - miningStartedAt) < MINING_DURATION_MS;
  const claimReady   = miningStartedAt !== null && (Date.now() - miningStartedAt) >= MINING_DURATION_MS;
  const miningTimer=useRef(null);
  const adTimer=useRef(null);
  const authResultRef=useRef(null);
  const [qualifiedFriends, setQualifiedFriends] = useState(0);
  const [claimedMilestones, setClaimedMilestones] = useState([]);
  const [minWithdrawTon, setMinWithdrawTon] = useState(2.0);
  const [showGift, setShowGift] = useState(false);
  const [giftUnclaimed, setGiftUnclaimed] = useState(false); // shows banner on homepage
  const [showStreak, setShowStreak] = useState(false);
  const [streakDays, setStreakDays] = useState([]);   // array of {day, nova, ton, claimed}
  const [streakLoading, setStreakLoading] = useState(false);
  const [giftOpened, setGiftOpened] = useState(false);
  const [welcomeTon, setWelcomeTon] = useState(1.5);
  const [giftParticles, setGiftParticles] = useState([]);
  const [refStats, setRefStats] = useState({total:0, valid:0, pending:0, nova:0, list:[]});
  const [buyingTierId, setBuyingTierId] = useState(null);
  const [buyError, setBuyError] = useState(null);
  // TonConnect — wallet for shop purchases
  const [tonConnectUI] = useTonConnectUI();
  const tonWalletAddress = useTonAddress();

  // ── Load real user data from API on mount ────────────────────────────────
  useEffect(()=>{
    let realtimeChannel = null;
    (async()=>{
      try {
        initTelegram();
        const authResult = await authenticate();
        authResultRef.current = authResult;
        const data = await api.me();
        if(data?.user){
          const realNova = Number(data.user.nova ?? 0);
          const realHashes = Number(data.user.hashes ?? 0);
          const realTon = Number(data.user.ton_balance ?? 0);
          // Always recalculate mining power from NOVA — never trust the DB value
          const realPower = miningPowerFromNova(realNova);
          setNova(realNova);
          setHashes(realHashes);
          setTonBalance(realTon);
          setMiningPower(realPower);
          userDbId.current = data.user.id;
          // Show gift banner on homepage if user hasn't claimed yet
          if (data.user.gift_claimed === false) {
            setGiftUnclaimed(true); // shows the tappable gift banner
          }
          // If DB power is stale/wrong, fix it silently in the background
          if(realPower !== Number(data.user.mining_power)){
            api.updateMiningPower(realPower).catch(()=>{});
          }

          // ── Fix 5: Supabase Realtime — push admin balance/shop changes live ──
          // Requires Realtime enabled on the `users` table in your Supabase project:
          // Dashboard → Database → Replication → enable `users` table.
          realtimeChannel = supabase
            .channel(`user-updates:${data.user.id}`)
            .on("postgres_changes", {
              event: "UPDATE",
              schema: "public",
              table: "users",
              filter: `id=eq.${data.user.id}`,
            }, (payload) => {
              const u = payload.new;
              setNova(Number(u.nova ?? 0));
              setHashes(Number(u.hashes ?? 0));
              setTonBalance(Number(u.ton_balance ?? 0));
              setMiningPower(miningPowerFromNova(Number(u.nova ?? 0)));
            })
            .subscribe();
        }
        // Restore mining session from API if active
        if(data?.mining?.startedAt){
          const started = new Date(data.mining.startedAt).getTime();
          setMiningStartedAt(started);
          localStorage.setItem("nm_mining_started_at", String(started));
        }

        // Sync dice used state from server (overrides localStorage)
        if(data?.dice?.todayRolled){
          const today = new Date().toISOString().slice(0,10);
          localStorage.setItem("nm_dice_rolled_date", today);
          setDiceUsed(true);
          if(data.dice.todayValue != null) setDiceVal(data.dice.todayValue);
        }

        // Sync slots cooldown from server (server is authoritative)
        if(data?.slots?.nextAvailableAt){
          const nextAt = new Date(data.slots.nextAvailableAt).getTime();
          const remaining = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
          localStorage.setItem("nm_slot_cooldown_until", String(nextAt));
          if(remaining > 0){
            setSlotsCooldown(remaining);
            clearInterval(slotTimer.current);
            slotTimer.current = setInterval(()=>{setSlotsCooldown(s=>{if(s<=1){clearInterval(slotTimer.current);localStorage.removeItem("nm_slot_cooldown_until");return 0;}return s-1;});},1000);
          }
        }

        // ── Load shop tiers from API — no auth required, always runs ──
        try {
          const shopData = await api.listShopTiers();
          if(shopData?.tiers?.length) setShopTiers(shopData.tiers);
          if(shopData?.walletAddress) setShopWallet(shopData.walletAddress);
        } catch(_) {}



        // Load referral count from API
        try {
          const refData = await api.referrals();
          // API returns { total, qualified, pending, requiredForWithdraw, list }
          const qualified = refData?.qualified ?? 0;
          setQualifiedFriends(qualified);
          // Load min withdraw from admin config
          try {
            const rwCfg = await api.getRewardConfig?.();
            if (rwCfg?.minWithdrawTon) setMinWithdrawTon(Number(rwCfg.minWithdrawTon));
          } catch(_) {}
          // Load which milestones already claimed
          try {
            const msData = await api.milestoneClaims();
            setClaimedMilestones(msData?.claimed ?? []);
          } catch(_) {}
          const total   = refData?.total ?? 0;
          const pending = refData?.pending ?? 0;
          const valid   = total - pending;
          const novaEarned = (refData?.list ?? []).reduce((s,r) => s + Number(r.nova_earned ?? 0), 0);
          setRefStats({ total, valid, pending, nova: novaEarned, list: refData?.list ?? [] });
        } catch(_) {}

      } catch(e){
        console.warn("Failed to load user data:", e);
      } finally {
        setUserLoaded(true);

        // Load streak in background — never blocks app load
        setTimeout(async () => {
          try {
            const sd = await api.getStreak();
            if (sd?.days && sd.days.length > 0) {
              setStreakDays(sd.days);
              const today = sd.days.find(d => d.isToday);
              if (today && !today.claimed) setShowStreak(true);
            }
          } catch(_) {}
        }, 1500); // 1.5s delay so app fully renders first
      }
    })();
    return () => {
      if(realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── Poll /me every 60s — backup so admin credits always reflect ───────────
  useEffect(()=>{
    const poll = setInterval(async ()=>{
      try {
        const fresh = await api.me();
        if(fresh?.user){
          setNova(Number(fresh.user.nova ?? 0));
          setHashes(Number(fresh.user.hashes ?? 0));
          setTonBalance(Number(fresh.user.ton_balance ?? 0));
          setMiningPower(miningPowerFromNova(Number(fresh.user.nova ?? 0)));
        }
      } catch(_){}
    }, 60_000);
    return ()=> clearInterval(poll);
  },[]);

  // ── Load ad config from API ───────────────────────────────────────────────
  // Also load shop tiers independently so they show even if auth is slow
  useEffect(()=>{
    api.listShopTiers().then(d=>{ if(d?.tiers?.length) setShopTiers(d.tiers); if(d?.walletAddress) setShopWallet(d.walletAddress); }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/ad-config-public`)
      .then(r=>r.ok?r.json():null)
      .then(cfg=>{
        if(cfg){
          setAdsEnabled(!!cfg.adsEnabled);
          setAdTriggers(cfg.adTriggers ?? {});
        }
      })
      .catch(()=>{});
  },[]);
  // ─────────────────────────────────────────────────────────────────────────
  // BOT_USERNAME — can be overridden via VITE_BOT_USERNAME in .env
  const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || "NovaMinerVerseBot";
  const tgUser = getTelegramUser();
  const myTelegramId = tgUser?.id ?? null;
  const referralLink = myTelegramId
    ? `https://t.me/${BOT_USERNAME}/app?startapp=ref_${myTelegramId}`
    : null;

  const [copiedLink, setCopiedLink] = useState(false);

  function handleShareReferral() {
    if (!referralLink) return;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      // Opens the Telegram share sheet pre-filled with the referral link
      const text = encodeURIComponent("Join me on NovaMine and start mining NOVA! 🚀");
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`);
    } else {
      // Fallback for desktop/dev: just copy
      handleCopyLink();
    }
  }

  function handleCopyLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = referralLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  const [activities,setActivities]=useState(()=>Array.from({length:6},()=>genActivity()));

  const [reels,setReels]=useState(["⚡","⚡","⚡"]);
  const [spinning,setSpinning]=useState(false);
  const [slotsResult,setSlotsResult]=useState(null);
  const [slotsCooldown,setSlotsCooldown]=useState(()=>{
    const until=localStorage.getItem("nm_slot_cooldown_until");
    if(!until) return 0;
    const remaining=Math.max(0,Math.round((Number(until)-Date.now())/1000));
    return remaining;
  });
  const slotTimer=useRef(null);

  const [diceVal,setDiceVal]=useState(6);
  const [rolling,setRolling]=useState(false);
  const [diceResult,setDiceResult]=useState(null);
  // Dice state — persisted so rolling once per UTC day survives reloads
  const [diceUsed,setDiceUsed]=useState(()=>{
    const v = localStorage.getItem("nm_dice_rolled_date");
    if (!v) return false;
    const today = new Date().toISOString().slice(0,10); // "YYYY-MM-DD"
    return v === today;
  });



  // ── Auto-update mining power when NOVA changes ───────────────────────────
  useEffect(()=>{
    if(!userLoaded) return; // don't run before initial data is loaded
    const newPower = miningPowerFromNova(nova);
    if(newPower !== miningPower){
      setMiningPower(newPower);
      // Sync to database so API also uses the updated power
      api.updateMiningPower(newPower).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[nova, userLoaded]);
  // ─────────────────────────────────────────────────────────────────────────

  // Mining countdown re-render (keeps timer display live)
  const [,forceUpdate]=useState(0);
  useEffect(()=>{
    const iv=setInterval(()=>{
      forceUpdate(n=>n+1);
    },1000);
    return()=>clearInterval(iv);
  },[]);

  // Activity feed
  useEffect(()=>{
    const schedule=()=>{
      const delay=3000+Math.random()*3000;
      return setTimeout(()=>{
        setActivities(prev=>[genActivity(),...prev.slice(0,7)]);
        timerRef.current=schedule();
      },delay);
    };
    const timerRef={current:schedule()};
    return()=>clearTimeout(timerRef.current);
  },[]);

  useEffect(()=>()=>clearInterval(slotTimer.current),[]);

  // On mount, if a mining session is active, schedule a re-render when it becomes claimable
  useEffect(()=>{
    if(miningStartedAt !== null){
      const remaining = MINING_DURATION_MS - (Date.now() - miningStartedAt);
      if(remaining > 0){
        miningTimer.current = setTimeout(()=>setMiningStartedAt(t=>t), remaining);
      }
    }
    return ()=>clearTimeout(miningTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── REWARDED AD ENGINE ──
  function watchAd(onComplete, trigger="start_mining"){
    // Only show ad if master toggle ON and this trigger is enabled
    if(adsEnabled && adTriggers[trigger] && typeof show_11059350==="function"){
      show_11059350().then(()=>{ onComplete(); }).catch(()=>{ onComplete(); });
    } else {
      onComplete();
    }
  }

  function closeAd(){
    clearInterval(adTimer.current);
    setShowAd(false);
    if(adCallback){adCallback();setAdCallback(null);}
  }

  function startMining(){
    // Watch ad first, then start 24h mining session
    watchAd(async ()=>{
      try {
        const result = await api.startMining();
        // Use the server's authoritative start time so client and server stay in sync
        const started = new Date(result.startedAt).getTime();
        localStorage.setItem("nm_mining_started_at", String(started));
        setMiningStartedAt(started);
        clearTimeout(miningTimer.current);
        const remaining = new Date(result.claimReadyAt).getTime() - Date.now();
        miningTimer.current = setTimeout(()=>setMiningStartedAt(t=>t), Math.max(0, remaining));
      } catch(e){
        // 409 means a session is already active — restore it from localStorage
        if(e?.status === 409){
          const now = Date.now();
          localStorage.setItem("nm_mining_started_at", String(now));
          setMiningStartedAt(now);
        } else {
          console.warn("Start mining failed:", e);
        }
      }
    }, "start_mining");
  }

  function claimHashes(){
    // Watch ad before claiming, then call the real API
    watchAd(async ()=>{
      try {
        const result = await api.claimMining();
        // Update all balances from server response — nova is now authoritative
        setHashes(Number(result.hashes));
        setNova(Number(result.nova));
        setTonBalance(Number(result.tonBalance));
        localStorage.removeItem("nm_mining_started_at");
        setMiningStartedAt(null);

        // Re-fetch /me so balance is always real DB value — carries forward into next session
        try {
          const fresh = await api.me();
          if(fresh?.user){
            setHashes(Number(fresh.user.hashes ?? 0));
            setNova(Number(fresh.user.nova ?? 0));
            setTonBalance(Number(fresh.user.ton_balance ?? 0));
            setMiningPower(miningPowerFromNova(Number(fresh.user.nova ?? 0)));
          }
        } catch(_){ /* silent — claim response values still set above */ }

      } catch(e){
        console.warn("Claim failed:", e);
        if(e?.status===404){
          localStorage.removeItem("nm_mining_started_at");
          setMiningStartedAt(null);
        } else if(e?.status===425){
          alert("⏳ Mining not complete yet. Please wait a little longer and try again.");
        } else {
          alert("❌ Claim failed. Please check your connection and try again.");
        }
      }
    }, "collect_mining");
  }

  const formatTime=s=>{
    if(s>=3600){const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;return`${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;}
    return`${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;
  };

  const SYMBOLS=["⚡","💎","🔮","🌟","🔥","🪙"];
  const SLOT_REWARDS={"⚡⚡⚡":25,"💎💎💎":25,"🔮🔮🔮":10,"🌟🌟🌟":10,"🔥🔥🔥":10,"🪙🪙🪙":10};
  const DICE_REWARDS={1:5,2:10,3:15,4:20,5:30,6:50};

  function spinSlots(){
    if(adsEnabled && adTriggers["spin_slot"] && typeof show_11059350==="function"){show_11059350().catch(()=>{});}
    setSpinning(true);setSlotsResult(null);
    // Animate reels while API call runs in background
    let t=0;
    const iv=setInterval(()=>{
      setReels([SYMBOLS[Math.floor(Math.random()*6)],SYMBOLS[Math.floor(Math.random()*6)],SYMBOLS[Math.floor(Math.random()*6)]]);
      t++;
      if(t>=20){clearInterval(iv);}
    },80);
    // Call the API — server is authoritative for result and nova balance
    api.spinSlots().then(result=>{
      const final = result.reels ?? [SYMBOLS[Math.floor(Math.random()*6)],SYMBOLS[Math.floor(Math.random()*6)],SYMBOLS[Math.floor(Math.random()*6)]];
      setReels(final);setSpinning(false);
      // API returns { reels, reward, nextAvailableAt } — reward is the field name
      const earned = result.reward ?? result.novaEarned ?? 0;
      setSlotsResult(earned);
      if(result.nova!=null) setNova(Number(result.nova));
      else if(earned>0) setNova(p=>p+earned);
      // API returns nextAvailableAt ISO string — derive cooldown seconds from it
      let cd;
      if(result.nextAvailableAt){
        cd = Math.max(0, Math.round((new Date(result.nextAvailableAt).getTime() - Date.now()) / 1000));
      } else {
        cd = result.cooldownSec ?? Math.floor(Math.random()*(7200-25+1))+25;
      }
      setSlotsCooldown(cd);
      const cooldownUntil = Date.now() + cd * 1000;
      localStorage.setItem("nm_slot_cooldown_until", String(cooldownUntil));
      clearInterval(slotTimer.current);
      slotTimer.current=setInterval(()=>{setSlotsCooldown(s=>{if(s<=1){clearInterval(slotTimer.current);localStorage.removeItem("nm_slot_cooldown_until");return 0;}return s-1;});},1000);
    }).catch(e=>{
      setSpinning(false);
      console.warn("Spin failed:", e);
    });
  }

  function rollDice(){
    if(adsEnabled && adTriggers["dice_roll"] && typeof show_11059350==="function"){show_11059350().catch(()=>{});}
    setRolling(true);setDiceResult(null);
    // Animate dice while API call runs
    let t=0;
    const iv=setInterval(()=>{
      setDiceVal(Math.floor(Math.random()*6)+1);t++;
      if(t>=16){clearInterval(iv);}
    },80);
    // Call the API — server is authoritative for result and nova balance
    api.rollDice().then(result=>{
      // API returns { value, reward } — value is the dice face, reward is nova earned
      const face = result.value ?? result.face ?? Math.floor(Math.random()*6)+1;
      setDiceVal(face);setRolling(false);
      const earned = result.reward ?? result.novaEarned ?? 0;
      setDiceResult(earned);
      if(result.nova!=null) setNova(Number(result.nova));
      else if(earned>0) setNova(p=>p+earned);
      const today=new Date().toISOString().slice(0,10);
      localStorage.setItem("nm_dice_rolled_date",today);
      setDiceUsed(true);
    }).catch(e=>{
      setRolling(false);
      console.warn("Dice roll failed:", e);
    });
  }



  // ── Shop: buy a tier via TonConnect wallet ───────────────────────────────
  async function handleBuyTier(tier){
    if(buyingTierId) return;
    setBuyError(null);

    // If wallet not connected, open connect dialog
    if(!tonWalletAddress){
      try { await tonConnectUI.connectWallet(); } catch(_){}
      return; // user will click Buy again after connecting
    }

    setBuyingTierId(tier.id);
    try {
      // Convert TON price → nanotons (1 TON = 1_000_000_000 nanoton)
      const nanotons = BigInt(Math.round(Number(tier.cost) * 1_000_000_000)).toString();
      // Receiving wallet comes from the shop API response (stored in shopWallet state)
      const receiverWallet = shopWallet || import.meta.env.VITE_TON_WALLET_ADDRESS || "";
      if(!receiverWallet){
        setBuyError("Wallet address not configured. Please contact support.");
        return;
      }

      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300, // 5-min window
        messages: [{
          address: receiverWallet,
          amount: nanotons,
          // Base64 payload identifies the purchase (tier + user)
          payload: btoa(`novamiine:${tier.id}:${userDbId.current ?? "unknown"}`),
        }],
      });

      // Submit the boc (transaction bag-of-cells) as proof to our API
      const txHash = result.boc;
      const purchase = await api.buyShopTier(tier.id, txHash);
      alert(`✅ Payment sent! Purchase ID: ${purchase.purchaseId}\nYour NOVA boost will be applied after admin confirms (~24h).`);
    } catch(e){
      if(e?.message?.includes("User declined") || e?.message?.includes("Cancel")){
        // user cancelled in wallet — no error needed
      } else {
        setBuyError(e?.message ?? "Transaction failed. Please try again.");
      }
    } finally {
      setBuyingTierId(null);
    }
  }

  // ── Fix 5: Shop tiers come from API (loaded on mount) so admin edits reflect live.
  const displayTiers = shopTiers.map(t => ({
    id: t.id,
    power: t.label,
    cost: String(t.priceTon),
    daily: typeof t.dailyTon === "number" ? t.dailyTon.toFixed(5) : "—",
    month: typeof t.monthTon === "number" ? t.monthTon.toFixed(5) : "—",
    hot: !!t.hot,
  }));

  const leaderboard=[
    {name:"MikeCarterX",   power:"18.4M",daily:"6.62"},
    {name:"JoaoSilva99",   power:"14.2M",daily:"5.11"},
    {name:"EmilyJOfficial",power:"11.7M",daily:"4.21"},
    {name:"SantosGabriel_",power:"9.3M", daily:"3.35"},
    {name:"AshleyWave",    power:"7.8M", daily:"2.81"},
    {name:"LucasOliveira7",power:"5.5M", daily:"1.98"},
    {name:"DanielB_Pro",   power:"3.9M", daily:"1.40"},
    {name:"RafaCostaX",    power:"2.1M", daily:"0.76"},
    {name:"JessicaMLive",  power:"1.4M", daily:"0.50"},
    {name:"BrunoFps",      power:"980K", daily:"0.35"},
  ];

  const navItems=[
    {id:"shop",icon:"shop",label:"Shop"},
    {id:"rank",icon:"trophy",label:"Rank"},
    {id:"power",icon:"zap",label:"Nova"},
    {id:"team",icon:"users",label:"Team"},
    {id:"tasks",icon:"tasks",label:"Tasks"},
  ];

  const novaDisplay=nova>=1000000?`${(nova/1000000).toFixed(2)}M`:nova>=1000?`${(nova/1000).toFixed(1)}K`:nova;

  return(
    <div style={{background:T.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",fontFamily:"'Rajdhani',sans-serif",color:T.text,position:"relative",overflow:"hidden"}}>
      <style>{css}</style>

      {/* ── Daily Streak Popup ── */}
      {showStreak && streakDays.length > 0 && (
        <StreakPopup
          streakDays={streakDays}
          authResultRef={authResultRef}
          onClose={() => setShowStreak(false)}
          onDayClaimed={({ day, nova, ton }) => {
            setStreakDays(p => p.map(x => x.day === day ? { ...x, claimed: true } : x));
            if (nova) setNova(p => p + nova);
            if (ton)  setTonBalance(p => p + ton);
          }}
          onShowGift={() => { setGiftOpened(false); setShowGift(true); }}
          setWelcomeTon={setWelcomeTon}
        />
      )}

      {/* ── Gift Popup ── */}
      {showGift && (
        <GiftPopup
          welcomeTon={welcomeTon}
          giftOpened={giftOpened}
          giftParticles={giftParticles}
          onOpenGift={() => {
            setGiftOpened(true);
            const particles = Array.from({ length: 24 }, (_, i) => ({
              id: i,
              x: 35 + Math.random() * 30,
              y: 25 + Math.random() * 50,
              size: 4 + Math.random() * 8,
              color: Math.random() > 0.5 ? T.gold : "#fff",
              dur: 0.6 + Math.random() * 0.8,
            }));
            setGiftParticles(particles);
            setTimeout(() => setGiftParticles([]), 1500);
            api.claimGift?.().catch(() => {});
          }}
          onClaim={() => {
            setShowGift(false);
            setGiftUnclaimed(false);
            setTonBalance(p => p + welcomeTon);
          }}
        />
      )}
      <div style={{position:"fixed",inset:0,backgroundImage:`linear-gradient(${T.goldFaint} 1px,transparent 1px),linear-gradient(90deg,${T.goldFaint} 1px,transparent 1px)`,backgroundSize:"40px 40px",pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${T.goldGlow},transparent)`,animation:"scanline 4s linear infinite",pointerEvents:"none",zIndex:9999}}/>

      {/* HEADER */}
      <div style={{position:"sticky",top:0,zIndex:100,background:`${T.bg}ee`,backdropFilter:"blur(12px)",borderBottom:`1px solid ${T.goldFaint}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Orbitron'",fontWeight:900,fontSize:14,color:"#000",boxShadow:`0 0 16px ${T.goldGlow}`}}>N</div>
          <span style={{fontFamily:"'Orbitron'",fontWeight:700,fontSize:16,color:T.gold,letterSpacing:2}}>NOVAMINE</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:T.goldFaint,border:`1px solid ${T.goldDim}`,borderRadius:50,padding:"5px 12px"}}>
            <span style={{color:T.gold}}><Icon name="zap" size={14}/></span>
            <span style={{fontFamily:"'Orbitron'",fontSize:12,fontWeight:700,color:T.gold}}>{novaDisplay}</span>
          </div>
          <button onClick={()=>setShowWithdraw(true)} style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,border:"none",borderRadius:50,padding:"5px 12px",fontFamily:"'Rajdhani'",fontWeight:700,fontSize:12,color:"#000",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
            <Icon name="withdraw" size={12}/> Withdraw
          </button>
        </div>
      </div>

      <div style={{padding:"0 0 80px",position:"relative",zIndex:1}}>

        {/* ══ NOVA/POWER TAB ══ */}
        {tab==="power"&&(
          <div style={{padding:"16px 16px 0",animation:"slideUp 0.3s ease"}}>

            {/* ── Welcome Gift Box — only shown until claimed ── */}
            {giftUnclaimed&&(
              <div
                onClick={()=>{
                  setGiftOpened(false);
                  setShowGift(true);
                }}
                style={{
                  display:"flex",alignItems:"center",gap:12,
                  background:"linear-gradient(135deg,rgba(245,200,66,0.15),rgba(245,200,66,0.05))",
                  border:"1.5px solid rgba(245,200,66,0.6)",
                  borderRadius:16,padding:"14px 18px",marginBottom:16,cursor:"pointer",
                  boxShadow:"0 0 20px rgba(245,200,66,0.2)",
                  animation:"glow 2s ease-in-out infinite",
                }}
              >
                <div style={{fontSize:40,animation:"float 2s ease-in-out infinite"}}>🎁</div>
                <div>
                  <div style={{fontFamily:"'Orbitron'",fontSize:13,color:"#f5c842",fontWeight:700,letterSpacing:1}}>WELCOME GIFT</div>
                  <div style={{fontSize:12,color:"#8a9a8a",marginTop:3}}>Tap to claim your {welcomeTon} TON reward!</div>
                </div>
                <div style={{marginLeft:"auto",fontSize:20}}>›</div>
              </div>
            )}

            {/* Nova card — CIRCLE design */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
              {/* Outer glow ring */}
              <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {/* Rotating ring */}
                <div style={{position:"absolute",width:290,height:290,borderRadius:"50%",border:"2px solid transparent",background:`conic-gradient(${T.gold},${T.goldDim},transparent,${T.gold}) border-box`,WebkitMask:"linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0)",WebkitMaskComposite:"destination-out",maskComposite:"exclude",animation:"spin 8s linear infinite",pointerEvents:"none"}}/>
                {/* Outer subtle ring */}
                <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",border:`1px solid ${T.goldGlow}`,pointerEvents:"none"}}/>
                {/* Main circle */}
                <div style={{width:270,height:270,borderRadius:"50%",background:"linear-gradient(145deg,#0f1e0f,#0a1a0a)",border:`2px solid ${T.goldDim}`,boxShadow:`0 0 60px ${T.goldGlow}, 0 0 120px rgba(245,200,66,0.08), inset 0 2px 0 rgba(245,200,66,0.15)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"glow 3s ease-in-out infinite",position:"relative",overflow:"hidden"}}>
                  {/* Inner shimmer overlay */}
                  <div style={{position:"absolute",top:0,left:0,right:0,height:"45%",borderRadius:"50% 50% 0 0 / 50% 50% 0 0",background:"rgba(245,200,66,0.04)",pointerEvents:"none"}}/>
                  {/* Chest icon */}
                  <div style={{fontSize:28,marginBottom:4}}>🏆</div>
                  {/* Big number */}
                  <div style={{fontFamily:"'Orbitron'",fontWeight:900,fontSize:42,color:T.gold,lineHeight:1,textShadow:`0 0 24px ${T.gold}`}}>
                    {novaDisplay}
                  </div>
                  {/* Decimal subtle */}
                  <div style={{fontSize:11,letterSpacing:3,color:T.goldDim,fontFamily:"'Orbitron'",marginTop:4,marginBottom:6}}>NOVA</div>
                  {/* Mining tier badge */}
                  <div style={{fontSize:11,color:T.gold,fontWeight:700,background:"rgba(245,200,66,0.12)",borderRadius:20,padding:"2px 12px",marginBottom:6,fontFamily:"'Rajdhani'"}}>
                    {tierFromNova(nova).label}
                  </div>
                  {/* Dollar equivalent */}
                  <div style={{fontSize:13,color:T.muted,marginBottom:6}}>
                    ≈ <span style={{color:T.green,fontWeight:700}}>{tonBalance.toFixed(5)} TON</span>
                  </div>
                  {/* Daily rate — dynamic based on mining power */}
                  <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(245,200,66,0.08)",borderRadius:20,padding:"4px 14px",marginBottom:10}}>
                    <span style={{color:T.gold,fontWeight:700,fontSize:13}}>+{MINING.hashesPerSession(miningPower).toFixed(8)}</span>
                    <span style={{color:T.gold,fontSize:13}}>⚡</span>
                    <span style={{color:T.muted,fontSize:12}}>/ session</span>
                  </div>
                  {/* Referral count */}
                  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:T.muted}}>
                    <span>👥</span>
                    <span>{qualifiedFriends} / 5 referrals</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── NOVA display (styled like Dulce CANDY's SUGAR block) ── */}
            <div style={{background:T.card,border:`1px solid ${T.goldDim}`,borderRadius:16,padding:18,marginBottom:14}}>
              {/* Big NOVA balance — formatted like CANDY shows "1.0K SUGAR" */}
              <div style={{textAlign:"center",marginBottom:14}}>
                <div style={{fontFamily:"'Orbitron'",fontWeight:900,fontSize:38,color:T.gold,textShadow:`0 0 30px ${T.goldGlow}`,lineHeight:1}}>
                  {nova>=1000000?`${(nova/1000000).toFixed(1)}M`:nova>=1000?`${(nova/1000).toFixed(1)}K`:nova.toLocaleString()}
                </div>
                <div style={{fontSize:12,letterSpacing:4,color:T.goldDim,fontFamily:"'Orbitron'",marginTop:4}}>NOVA</div>
              </div>

              {/* 1H / 1D / 30D rate cards — dynamic based on mining power */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                {(()=>{
                  const perSession = MINING.hashesPerSession(miningPower);
                  const perHour  = perSession / 24;
                  const perDay   = perSession;
                  const per30d   = perDay * 30;
                  return [
                    ["1H",  perHour.toFixed(7)+"…"],
                    ["1D",  perDay.toFixed(7)+"…"],
                    ["30D", per30d.toFixed(5)+"…"],
                  ].map(([label,val])=>(
                    <div key={label} style={{background:"rgba(245,200,66,0.06)",borderRadius:12,padding:"10px 6px",textAlign:"center",border:`1px solid rgba(245,200,66,0.15)`}}>
                      <div style={{fontSize:9,color:T.muted,letterSpacing:2,fontFamily:"'Orbitron'",marginBottom:4}}>{label}</div>
                      <div style={{fontSize:10,fontWeight:700,color:T.gold}}>{val}</div>
                    </div>
                  ));
                })()}
              </div>

              {/* Add NOVA / Free NOVA — mirrors "Add SUGAR / Free SUGAR" */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button className="btn-gold" onClick={()=>setTab("shop")} style={{padding:"12px",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#000",border:"none",borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:`0 4px 14px ${T.goldGlow}`,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  ⚡ Add NOVA
                </button>
                <button className="btn-gold" onClick={()=>setTab("tasks")} style={{padding:"12px",background:"transparent",border:`1px solid ${T.goldDim}`,color:T.gold,borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  🎁 Free NOVA
                </button>
              </div>
            </div>

            {/* ── HASHES MINED card (styled like Dulce CANDY's CANDIES MINED) ── */}
            <div style={{background:T.card,border:"1px solid #1e2a1e",borderRadius:16,padding:18,marginBottom:14}}>
              {/* ⭐ HASHES MINED ⭐ badge — mirrors CANDIES MINED badge */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
                <div style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,borderRadius:20,padding:"6px 20px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:"#000",fontSize:13}}>★</span>
                  <span style={{fontFamily:"'Orbitron'",fontSize:11,letterSpacing:2,color:"#000",fontWeight:700}}>HASHES MINED</span>
                  <span style={{color:"#000",fontSize:13}}>★</span>
                </div>
              </div>

              {/* Live accumulating number — ticks up in real-time during session */}
              <div style={{background:"rgba(245,200,66,0.06)",border:`1px solid rgba(245,200,66,0.15)`,borderRadius:12,padding:"16px",textAlign:"center",marginBottom:14}}>
                <div style={{fontFamily:"'Orbitron'",fontWeight:900,fontSize:26,color:T.green,textShadow:"0 0 20px rgba(57,255,138,0.5)",lineHeight:1}}>
                  {(()=>{
                    if((miningActive || claimReady) && miningStartedAt){
                      const elapsed  = Date.now() - miningStartedAt;
                      const progress = Math.min(elapsed / MINING_DURATION_MS, 1);
                      const live     = hashes + MINING.hashesPerSession(miningPower) * progress;
                      return live.toFixed(8);
                    }
                    return hashes.toFixed(8);
                  })()}
                </div>
                <div style={{fontSize:12,color:T.muted,marginTop:6}}>≈ {tonBalance.toFixed(8)} TON</div>
              </div>

              {/* Mining state — idle / active countdown / claim ready */}
              {!miningActive && !claimReady && (
                <button onClick={startMining} className="btn-gold" style={{width:"100%",padding:"14px",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,border:"none",borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:15,cursor:"pointer",color:"#000",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:`0 4px 20px ${T.goldGlow}`,marginBottom:10}}>
                  ▶ START HASHES PRODUCTION · Watch Ad
                </button>
              )}
              {miningActive && !claimReady && (
                <div style={{marginBottom:10}}>
                  {/* Countdown timer — exact same style as Dulce's 23:59:58 */}
                  <div style={{background:"rgba(57,255,138,0.06)",border:`1px solid ${T.greenDim}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:T.green,animation:"pulse 1s ease-in-out infinite",boxShadow:"0 0 8px rgba(57,255,138,0.6)",flexShrink:0}}/>
                    <span style={{fontFamily:"'Orbitron'",fontSize:20,fontWeight:700,color:T.green,letterSpacing:2}}>
                      {(()=>{const rem=Math.max(0,Math.ceil((MINING_DURATION_MS-(Date.now()-miningStartedAt))/1000));return formatTime(rem);})()}
                    </span>
                  </div>
                  <div style={{fontSize:11,color:T.muted,textAlign:"center"}}>Production in progress — come back to collect</div>
                </div>
              )}
              {claimReady && (
                <button onClick={claimHashes} className="shimmer-btn btn-gold" style={{width:"100%",padding:"14px",border:"none",borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:15,cursor:"pointer",color:"#000",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10}}>
                  🎁 Claim Hashes · Watch Ad
                </button>
              )}

              {/* Swap button */}
              <button onClick={()=>setShowSwap(true)} className="btn-gold swap-card" style={{width:"100%",padding:"12px",background:`linear-gradient(135deg,rgba(245,200,66,0.1),rgba(245,200,66,0.05))`,border:`1px solid ${T.goldDim}`,borderRadius:10,color:T.gold,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <Icon name="swap" size={16}/> SWAP HASHES → TON
              </button>
            </div>

            {/* Live Activity Feed */}
            <div style={{background:T.card,border:"1px solid #1e2a1e",borderRadius:16,padding:18,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:T.green,animation:"pulse 1s ease-in-out infinite",boxShadow:"0 0 8px rgba(57,255,138,0.6)"}}/>
                  <span style={{fontFamily:"'Orbitron'",fontSize:11,letterSpacing:2,color:T.gold}}>LIVE ACTIVITY</span>
                </div>
                <span style={{fontSize:11,color:T.muted}}>Global network</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:300,overflow:"hidden"}}>
                {activities.slice(0,7).map((a,i)=>(
                  <div key={a.id} className="activity-item" style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:"1px solid rgba(255,255,255,0.04)",animationDelay:`${i*0.05}s`}}>
                    <div style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                      {a.icon}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.text}</div>
                      <div style={{fontSize:11,color:a.color,fontWeight:700}}>{a.value}</div>
                    </div>
                    <div style={{fontSize:10,color:T.muted,flexShrink:0}}>{a.time}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,overflow:"hidden",borderTop:"1px solid #1e2a1e",paddingTop:10}}>
                <div style={{display:"flex",gap:24,whiteSpace:"nowrap",animation:"tickerScroll 20s linear infinite",width:"max-content"}}>
                  {[...ALL_USERS,...ALL_USERS].map((u,i)=>(
                    <span key={i} style={{fontSize:10,color:T.muted}}>
                      <span style={{color:T.gold}}>●</span> {u} is mining
                    </span>
                  ))}
                </div>
              </div>
            </div>



          </div>
        )}

        {/* ══ SHOP TAB ══ */}
        {tab==="shop"&&(
          <div style={{padding:"20px 16px",animation:"slideUp 0.3s ease"}}>
            <div style={{fontFamily:"'Orbitron'",fontWeight:700,fontSize:18,color:T.gold,marginBottom:4,letterSpacing:2}}>NOVA SHOP</div>
            <div style={{fontSize:14,color:T.muted,marginBottom:12}}>Boost your mining rate with TON</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"10px 14px",background:T.card,borderRadius:12,border:`1px solid ${T.goldDim}`}}>
              <div style={{fontSize:12,color:T.muted}}>{tonWalletAddress?`Wallet: ${tonWalletAddress.slice(0,6)}…${tonWalletAddress.slice(-4)}`:"Connect wallet to buy"}</div>
              <TonConnectButton style={{height:32}}/>
            </div>
            {displayTiers.length===0&&(
              <div style={{textAlign:"center",color:T.muted,padding:40,fontSize:13}}>Loading shop…</div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {displayTiers.map((item,i)=>(
                <div key={item.id??i} className="card-hover" style={{background:T.card,border:`1px solid ${item.hot?T.goldDim:"#1e2a1e"}`,borderRadius:16,padding:16,position:"relative",boxShadow:item.hot?`0 0 24px ${T.goldGlow}`:"none"}}>
                  {item.hot&&<div style={{position:"absolute",top:-10,right:16,background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#000",fontSize:10,fontWeight:700,fontFamily:"'Orbitron'",padding:"3px 10px",borderRadius:50,letterSpacing:1}}>BEST VALUE</div>}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:46,height:46,borderRadius:12,background:T.goldFaint,border:`1px solid ${T.goldDim}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.gold}}>
                        <Icon name="cpu" size={20}/>
                      </div>
                      <div>
                        <div style={{fontFamily:"'Orbitron'",fontWeight:700,fontSize:17,color:T.gold}}>{item.power}</div>
                        <div style={{fontSize:11,color:T.muted}}>NOVA</div>
                        <div style={{fontSize:11,color:T.muted,marginTop:1}}>Daily: <span style={{color:T.green}}>{item.daily} TON</span></div>
                      </div>
                    </div>
                    <button className="btn-gold" onClick={()=>handleBuyTier(item)} disabled={!!buyingTierId} style={{background:buyingTierId===item.id?"#1a1a1a":`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:buyingTierId===item.id?T.muted:"#000",border:"none",borderRadius:10,padding:"10px 14px",fontFamily:"'Orbitron'",fontWeight:700,fontSize:12,cursor:buyingTierId?"not-allowed":"pointer",opacity:buyingTierId&&buyingTierId!==item.id?0.6:1}}>
                      {buyingTierId===item.id?"…":item.cost+" TON"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {buyError&&<div style={{background:"rgba(255,77,77,0.08)",border:"1px solid rgba(255,77,77,0.3)",borderRadius:10,padding:"10px 14px",marginTop:10,fontSize:12,color:T.red}}>{buyError}</div>}
          </div>
        )}

        {/* ══ RANK TAB ══ */}
        {tab==="rank"&&(
          <div style={{padding:"20px 16px",animation:"slideUp 0.3s ease"}}>
            <div style={{fontFamily:"'Orbitron'",fontWeight:700,fontSize:18,color:T.gold,marginBottom:4,letterSpacing:2}}>LEADERBOARD</div>
            <div style={{fontSize:14,color:T.muted,marginBottom:20}}>Top miners globally</div>
            {leaderboard.map((user,i)=>(
              <div key={user.name} style={{background:i<3?"linear-gradient(135deg,#0f1e0f,#0a1a0a)":T.card,border:`1px solid ${i<3?T.goldDim:"#1e2a1e"}`,borderRadius:14,padding:"13px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,boxShadow:i===0?`0 0 20px ${T.goldGlow}`:"none"}}>
                <div style={{width:36,height:36,borderRadius:8,background:i<3?`linear-gradient(135deg,${T.gold},${T.goldDim})`:"#1a2a1a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Orbitron'",fontWeight:900,fontSize:i<3?16:13,color:i<3?"#000":T.muted,flexShrink:0}}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:i<3?T.gold:T.text}}>{user.name}</div>
                  <div style={{fontSize:11,color:T.muted}}>{user.power} NOVA</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Orbitron'",fontSize:11,color:T.green}}>{user.daily}</div>
                  <div style={{fontSize:10,color:T.muted}}>TON/day</div>
                </div>
              </div>
            ))}
            <div style={{background:"linear-gradient(135deg,#0f1e0f,#0a1a0a)",border:`2px solid ${T.gold}`,borderRadius:14,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:`0 0 16px ${T.goldGlow}`}}>
              <div style={{width:36,height:36,borderRadius:8,background:"#1a2a1a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:T.muted,fontFamily:"'Orbitron'",fontWeight:700,flexShrink:0}}>--</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:T.gold}}>You <span style={{fontSize:11,color:T.goldDim}}>← You</span></div>
                <div style={{fontSize:11,color:T.muted}}>{novaDisplay} NOVA</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Orbitron'",fontSize:11,color:T.green}}>0.00036</div>
                <div style={{fontSize:10,color:T.muted}}>TON/day</div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TEAM TAB ══ */}
        {tab==="team"&&(
          <div style={{padding:"20px 16px",animation:"slideUp 0.3s ease"}}>
            <div style={{background:"linear-gradient(135deg,#0f1e0f,#0a1a0a)",border:`1px solid ${T.goldDim}`,borderRadius:20,padding:22,marginBottom:16,boxShadow:`0 0 32px ${T.goldGlow}`}}>
              <div style={{fontFamily:"'Orbitron'",fontWeight:700,fontSize:15,color:T.gold,marginBottom:16,letterSpacing:1}}>YOUR REFERRAL REWARDS</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:18}}>
                {[["⭐","+6,000","NOVA","Premium"],["👤","+3,000","NOVA","Per Referral"],["💰","15%","COMM","On Purchases"]].map(([icon,val,unit,label])=>(
                  <div key={label} style={{background:"rgba(0,0,0,0.4)",borderRadius:12,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(245,200,66,0.1)"}}>
                    <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
                    <div style={{fontFamily:"'Orbitron'",fontWeight:900,fontSize:15,color:T.gold}}>{val}</div>
                    <div style={{fontSize:10,color:T.goldDim,fontFamily:"'Orbitron'"}}>{unit}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:2}}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{background:"rgba(0,0,0,0.3)",borderRadius:12,padding:14,marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,color:T.muted}}>Withdraw unlock progress</span>
                  <span style={{fontSize:12,color:T.gold,fontWeight:700}}>{qualifiedFriends}/5 active</span>
                </div>
                <div style={{background:"rgba(0,0,0,0.5)",borderRadius:6,height:6,overflow:"hidden"}}>
                  <div style={{width:`${(qualifiedFriends/5)*100}%`,height:"100%",background:`linear-gradient(90deg,${T.gold},${T.green})`,borderRadius:6}}/>
                </div>
                <div style={{fontSize:11,color:T.muted,marginTop:6}}>Friend must login + mine 10 days/month to count as active</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:16,background:"rgba(0,0,0,0.3)",borderRadius:10,padding:12}}>
                {[[String(refStats.total),"REFERRED"],[String(refStats.valid),"VALID"],[String(refStats.pending),"PENDING"],[refStats.nova.toFixed(0),"NOVA"]].map(([v,l])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{fontFamily:"'Orbitron'",fontWeight:700,fontSize:15,color:T.gold}}>{v}</div>
                    <div style={{fontSize:9,color:T.muted,letterSpacing:1}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={handleShareReferral} className="btn-gold" style={{padding:"13px",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#000",border:"none",borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:`0 4px 16px ${T.goldGlow}`,opacity:referralLink?1:0.5}}>
                  <Icon name="share" size={16}/> {referralLink ? "Share Referral Link" : "Loading..."}
                </button>
                <button onClick={handleCopyLink} style={{padding:"13px",background:copiedLink?"rgba(57,255,138,0.1)":"transparent",border:`1px solid ${copiedLink?T.green:"#1e3a1e"}`,color:copiedLink?T.green:T.muted,borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:600,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.3s",opacity:referralLink?1:0.5}}>
                  <Icon name="copy" size={16}/> {copiedLink ? "✓ Link Copied!" : "Copy Referral Link"}
                </button>
                {referralLink&&(
                  <div style={{background:"rgba(0,0,0,0.4)",borderRadius:10,padding:"10px 12px",border:"1px solid #1e2a1e",wordBreak:"break-all",fontSize:11,color:T.muted,fontFamily:"monospace",lineHeight:1.5}}>
                    {referralLink}
                  </div>
                )}
              </div>
            </div>
            <div style={{fontWeight:700,fontSize:12,letterSpacing:2,color:T.muted,fontFamily:"'Orbitron'",marginBottom:12}}>YOUR TEAM</div>
            {refStats.list && refStats.list.length > 0 ? (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {refStats.list.map((r,i) => {
                  const name = r.referred?.username
                    ? `@${r.referred.username}`
                    : r.referred?.first_name ?? `User #${i+1}`;
                  const isActive = r.status === "active";
                  return (
                    <div key={r.id} style={{background:T.card,border:`1px solid ${isActive?"#1e3a1e":"#1e2a1e"}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:`linear-gradient(135deg,${T.goldDim},#1a1a1a)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                        {r.referred?.photo_url
                          ? <img src={r.referred.photo_url} style={{width:38,height:38,borderRadius:"50%",objectFit:"cover"}} />
                          : "👤"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                        <div style={{fontSize:11,color:isActive?T.green:T.muted,marginTop:2}}>{isActive?"✓ Active":"⏳ Pending"}</div>
                      </div>
                      <div style={{fontSize:10,color:T.muted,textAlign:"right",flexShrink:0}}>
                        {r.active_days_this_month ?? 0} days<br/>this month
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{background:T.card,border:"1px solid #1e2a1e",borderRadius:14,padding:24,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>👥</div>
                <div style={{color:T.muted,fontSize:14}}>No team members yet</div>
                <div style={{color:T.muted,fontSize:12,marginTop:4}}>Invite friends to start earning</div>
              </div>
            )}
          </div>
        )}

        {/* ══ TASKS TAB ══ */}
        {tab==="tasks"&&(
          <div style={{padding:"20px 16px",animation:"slideUp 0.3s ease"}}>
            <div style={{fontFamily:"'Orbitron'",fontWeight:700,fontSize:18,color:T.gold,marginBottom:4,letterSpacing:2}}>MISSIONS</div>
            <div style={{fontSize:14,color:T.muted,marginBottom:20}}>Play games & invite friends to earn NOVA</div>

            <div style={{fontWeight:700,fontSize:11,letterSpacing:2,color:T.muted,fontFamily:"'Orbitron'",marginBottom:10}}>FREE NOVA GAMES</div>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {[{id:"slots",label:"🎰 Fruit Slots"},{id:"dice",label:"🎲 Daily Roll"}].map(g=>(
                <button key={g.id} onClick={()=>setSubTab(g.id)} style={{flex:1,padding:"10px",background:subTab===g.id?`linear-gradient(135deg,${T.gold},${T.goldDim})`:"transparent",color:subTab===g.id?"#000":T.muted,border:`1px solid ${subTab===g.id?T.gold:"#1e2a1e"}`,borderRadius:10,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all 0.2s"}}>{g.label}</button>
              ))}
            </div>

            {subTab==="slots"&&(
              <div style={{background:T.card,border:"1px solid #1e2a1e",borderRadius:16,padding:18,marginBottom:16}}>
                <div style={{textAlign:"center",marginBottom:12}}>
                  <div style={{fontFamily:"'Orbitron'",fontWeight:700,color:T.gold,fontSize:15}}>FRUIT SLOTS</div>
                  <div style={{fontSize:12,color:T.muted,marginTop:2}}>Spin · Win NOVA · Timer: 25s–2h</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
                  {[["⚡⚡⚡","25 NOVA",true],["💎💎💎","25 NOVA",false],["🔮🔮🔮","10 NOVA",false],["🌟🌟🌟","10 NOVA",false],["🔥🔥🔥","10 NOVA",false],["Any 2×","3 NOVA",false]].map(([icon,reward,hot])=>(
                    <div key={icon} className="prize-card" style={{background:hot?T.goldFaint:"rgba(255,255,255,0.03)",border:`1px solid ${hot?T.goldDim:"#1e2a1e"}`,borderRadius:10,padding:"8px 4px",textAlign:"center"}}>
                      <div style={{fontSize:icon.includes("×")?11:18,fontWeight:700,color:icon.includes("×")?T.muted:"auto",marginBottom:2}}>{icon}</div>
                      <div style={{fontSize:10,fontWeight:700,color:T.gold,fontFamily:"'Orbitron'"}}>{reward}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:"#050d05",borderRadius:14,padding:12,marginBottom:12,display:"flex",gap:8,justifyContent:"center",border:"1px solid #0f1e0f"}}>
                  {reels.map((sym,i)=><SlotReel key={i} symbol={sym} spinning={spinning}/>)}
                </div>
                {slotsResult!==null&&(
                  <div style={{textAlign:"center",marginBottom:10,animation:"popIn 0.3s ease",color:slotsResult>0?T.green:T.muted,fontFamily:"'Orbitron'",fontWeight:700,fontSize:13}}>
                    {slotsResult>0?`⚡ +${slotsResult} NOVA!`:"No match — try again!"}
                  </div>
                )}
                <button onClick={spinSlots} disabled={spinning||slotsCooldown>0} className="btn-gold" style={{width:"100%",padding:"13px",background:spinning||slotsCooldown>0?"#1a1a1a":`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:spinning||slotsCooldown>0?T.muted:"#000",border:spinning||slotsCooldown>0?"1px solid #1e2a1e":"none",borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:15,cursor:spinning||slotsCooldown>0?"not-allowed":"pointer"}}>
                  {spinning?"Spinning...":slotsCooldown>0?`⏱ ${formatTime(slotsCooldown)}`:"🎰 Spin Now"}
                </button>
              </div>
            )}

            {subTab==="dice"&&(
              <div style={{background:T.card,border:"1px solid #1e2a1e",borderRadius:16,padding:18,marginBottom:16}}>
                <div style={{textAlign:"center",marginBottom:12}}>
                  <div style={{fontFamily:"'Orbitron'",fontWeight:700,color:T.gold,fontSize:15}}>DAILY ROLL</div>
                  <div style={{fontSize:12,color:T.muted,marginTop:2}}>Roll once every 24h · Win NOVA</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:18}}>
                  {[1,2,3,4,5,6].map(f=>(
                    <div key={f} className="prize-card" style={{background:"rgba(255,255,255,0.03)",border:`1px solid #1e2a1e`,borderRadius:10,padding:"8px 4px",textAlign:"center"}}>
                      <div style={{display:"flex",justifyContent:"center",marginBottom:4}}><DiceFace value={f} size={30}/></div>
                      <div style={{fontSize:10,fontWeight:700,color:T.gold,fontFamily:"'Orbitron'"}}>{[5,10,15,20,30,50][f-1]} NOVA</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
                  <div style={{animation:rolling?"diceRoll 0.15s linear infinite":"float 2s ease-in-out infinite"}}>
                    <DiceFace value={diceVal} size={88}/>
                  </div>
                </div>
                {diceResult!==null&&(
                  <div style={{textAlign:"center",marginBottom:10,animation:"popIn 0.3s ease",color:T.green,fontFamily:"'Orbitron'",fontWeight:700,fontSize:13}}>
                    🎲 Rolled {diceVal}! +{diceResult} NOVA!
                  </div>
                )}
                <button onClick={rollDice} disabled={rolling||diceUsed} className="btn-gold" style={{width:"100%",padding:"13px",background:rolling||diceUsed?"#1a1a1a":`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:rolling||diceUsed?T.muted:"#000",border:rolling||diceUsed?"1px solid #1e2a1e":"none",borderRadius:12,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:15,cursor:rolling||diceUsed?"not-allowed":"pointer"}}>
                  {rolling?"Rolling...":diceUsed?"Come back tomorrow!":"🎲 Roll Dice"}
                </button>
              </div>
            )}

            <div style={{fontWeight:700,fontSize:11,letterSpacing:2,color:T.muted,fontFamily:"'Orbitron'",margin:"4px 0 10px"}}>INVITE MILESTONES</div>
            {[[1,1200,"1.2K"],[5,2400,"2.4K"],[25,6000,"6K"],[50,12000,"12K"],[100,24000,"24K"]].map(([n,novaAmt,reward])=>{
              const reached = qualifiedFriends >= n;
              const claimed = claimedMilestones.includes(n);
              const progress = Math.min(100, Math.round((qualifiedFriends / n) * 100));
              return (
              <div key={n} style={{background:T.card,border:`1px solid ${claimed?"#1e3a1e":reached?"#2a3a1e":"#1e2a1e"}`,borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,opacity:claimed?0.7:1}}>
                <div style={{width:34,height:34,borderRadius:8,background:reached?T.goldFaint:"#1a1a1a",border:`1px solid ${reached?T.goldDim:"#1e2a1e"}`,display:"flex",alignItems:"center",justifyContent:"center",color:reached?T.gold:T.muted}}>
                  <Icon name="users" size={15}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13,color:claimed?T.muted:T.text}}>Invite {n} Friend{n>1?"s":""}</div>
                  <div style={{fontSize:11,color:T.gold}}>⚡ +{reward} NOVA</div>
                  <div style={{marginTop:4,height:3,background:"#1e2a1e",borderRadius:2}}>
                    <div style={{width:`${progress}%`,height:"100%",background:`linear-gradient(90deg,${T.gold},${T.green})`,borderRadius:2,transition:"width 0.5s"}}/>
                  </div>
                  <div style={{fontSize:10,color:T.muted,marginTop:2}}>{Math.min(qualifiedFriends,n)}/{n} friends</div>
                </div>
                {claimed?(
                  <div style={{background:"rgba(57,255,138,0.1)",border:`1px solid ${T.green}`,borderRadius:8,padding:"5px 10px",fontSize:11,color:T.green,fontFamily:"'Orbitron'"}}>✓ Done</div>
                ):reached?(
                  <button onClick={async()=>{
                    try{
                      const r = await api.claimMilestone(n);
                      if(r?.ok){
                        setClaimedMilestones(p=>[...p,n]);
                        setNova(r.new_nova);
                      }
                    }catch(e){ alert(e?.message??"Claim failed"); }
                  }} className="btn-gold" style={{padding:"6px 12px",background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#000",border:"none",borderRadius:8,fontFamily:"'Rajdhani'",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>
                    Claim
                  </button>
                ):(
                  <div style={{background:"#1a1a1a",border:"1px solid #1e2a1e",borderRadius:8,padding:"5px 10px",fontSize:11,color:T.muted,fontFamily:"'Orbitron'",display:"flex",alignItems:"center",gap:3}}>
                    <Icon name="lock" size={11}/> {n}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:`${T.bg}f0`,backdropFilter:"blur(16px)",borderTop:`1px solid ${T.goldFaint}`,display:"flex",zIndex:200}}>
        {navItems.map(item=>(
          <button key={item.id} onClick={()=>setTab(item.id)} className={`nav-btn${tab===item.id?" active":""}`} style={{flex:1,padding:"12px 4px 10px",background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,color:tab===item.id?T.gold:T.muted}}>
            {item.id==="power"?(
              <div style={{width:52,height:52,borderRadius:"50%",background:tab==="power"?`linear-gradient(135deg,${T.gold},${T.goldDim})`:"#1a2a1a",display:"flex",alignItems:"center",justifyContent:"center",marginTop:-20,boxShadow:tab==="power"?`0 0 28px ${T.goldGlow},0 0 0 3px ${T.goldDim}`:`0 0 0 2px #1e2a1e`,border:tab==="power"?`2px solid ${T.gold}`:"2px solid #1e2a1e",color:tab==="power"?"#000":T.muted,transition:"all 0.2s",flexShrink:0}}>
                <Icon name="zap" size={20}/>
              </div>
            ):<Icon name={item.icon} size={20}/>}
            <span style={{fontSize:10,fontFamily:"'Orbitron'",letterSpacing:1,fontWeight:600}}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* MODALS */}
      {showAd&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.97)",zIndex:2000,display:"flex",flexDirection:"column",animation:"adFadeIn 0.3s ease"}}>
          {/* Fake Ad Banner */}
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
            {/* Ad label */}
            <div style={{position:"absolute",top:16,left:16,background:"rgba(255,255,255,0.1)",borderRadius:6,padding:"3px 10px",fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>AD</div>
            {/* Skip timer */}
            <div style={{position:"absolute",top:16,right:16}}>
              {adSkippable?(
                <button onClick={closeAd} className="btn-gold" style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,border:"none",borderRadius:8,padding:"6px 14px",fontFamily:"'Rajdhani'",fontWeight:700,fontSize:13,cursor:"pointer",color:"#000",animation:"adSkipPulse 1s ease-in-out infinite"}}>
                  Skip Ad ▶
                </button>
              ):(
                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:8,padding:"6px 14px",fontSize:12,color:"rgba(255,255,255,0.4)"}}>
                  Skip in {Math.max(0,5-Math.floor(adProgress/20))}s
                </div>
              )}
            </div>

            {/* Ad creative - generic sponsor placeholder */}
            <div style={{width:"100%",maxWidth:340,background:"linear-gradient(135deg,#1a1a2e,#16213e)",borderRadius:20,padding:32,textAlign:"center",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 0 60px rgba(77,166,255,0.15)"}}>
              <div style={{fontSize:56,marginBottom:16}}>🚀</div>
              <div style={{fontFamily:"'Orbitron'",fontWeight:900,fontSize:22,color:"#4da6ff",marginBottom:8,letterSpacing:2}}>CRYPTOBOOST</div>
              <div style={{fontSize:14,color:"rgba(255,255,255,0.6)",marginBottom:20,lineHeight:1.6}}>Supercharge your crypto portfolio with AI-powered signals</div>
              <div style={{background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.3)",borderRadius:10,padding:"10px 20px",display:"inline-block",fontSize:13,color:"#4da6ff",fontWeight:700}}>
                Start Free Trial →
              </div>
            </div>

            {/* Reward reminder */}
            <div style={{marginTop:24,background:"rgba(245,200,66,0.08)",border:`1px solid ${T.goldDim}`,borderRadius:12,padding:"12px 20px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{color:T.gold,fontSize:20}}>⚡</span>
              <div>
                <div style={{fontFamily:"'Orbitron'",fontSize:12,color:T.gold,fontWeight:700}}>REWARD UNLOCKING</div>
                <div style={{fontSize:11,color:T.muted,marginTop:2}}>Watch the full ad to continue</div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{padding:"0 0 32px"}}>
            <div style={{background:"rgba(255,255,255,0.08)",height:4,borderRadius:2,margin:"0 24px 10px",overflow:"hidden"}}>
              <div style={{height:"100%",background:`linear-gradient(90deg,${T.gold},${T.green})`,borderRadius:2,width:`${adProgress}%`,transition:"width 0.1s linear"}}/>
            </div>
            <div style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.3)"}}>
              {adProgress<100?"Ad playing...":"Ad complete — tap Skip to continue"}
            </div>
          </div>
        </div>
      )}
      {showSwap&&<SwapModal onClose={()=>setShowSwap(false)} hashes={hashes} onSwapComplete={(r)=>{if(r?.hashes!=null)setHashes(Number(r.hashes));if(r?.tonBalance!=null)setTonBalance(Number(r.tonBalance));}}/>}
      {showWithdraw&&<WithdrawModal onClose={()=>setShowWithdraw(false)} tonBalance={tonBalance} qualifiedFriends={qualifiedFriends} onGoSwap={()=>setShowSwap(true)} onInvite={handleShareReferral} onWithdrawComplete={()=>{setTonBalance(0);setShowWithdraw(false);}} minWithdrawTon={minWithdrawTon}/>}
    </div>
  );
}
