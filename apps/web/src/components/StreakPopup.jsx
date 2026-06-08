import { T } from "../constants/theme.js";
import { api } from "../lib/api.js";

/**
 * Daily login streak popup.
 * Shows a 30-day reward grid; tapping today's tile claims it.
 * For new users who haven't seen the welcome gift yet, claiming Day 1
 * triggers the gift popup instead of just closing.
 *
 * Props:
 *  streakDays     – array of { day, nova, ton, claimed, isToday, isPast }
 *  authResultRef  – React ref holding the authenticate() result
 *  onClose        – () => void
 *  onDayClaimed   – ({ day, nova, ton }) => void  (called after successful claim)
 *  onShowGift     – () => void  (called to open the welcome-gift popup)
 *  setWelcomeTon  – state setter so GiftPopup shows the correct amount
 */
export default function StreakPopup({
  streakDays,
  authResultRef,
  onClose,
  onDayClaimed,
  onShowGift,
  setWelcomeTon,
}) {
  if (!streakDays.length) return null;

  return (
    <div
      style={{position:"fixed",inset:0,zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.88)",backdropFilter:"blur(4px)"}}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{background:"linear-gradient(135deg,#0d1117,#141a0f)",border:`2px solid ${T.gold}`,borderRadius:20,padding:"20px 16px",maxWidth:400,width:"94%",maxHeight:"85vh",overflowY:"auto",boxShadow:`0 0 50px rgba(245,200,66,0.25)`,animation:"popIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275)"}}
      >
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:32,marginBottom:4}}>🗓️</div>
          <div style={{fontFamily:"'Orbitron'",fontSize:14,color:T.gold,letterSpacing:2,marginBottom:2}}>DAILY REWARDS</div>
          <div style={{fontSize:12,color:T.muted}}>Claim your reward each day this month</div>
        </div>

        {/* 30-day grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:16}}>
          {streakDays.map(d => {
            const isTon  = d.ton > 0;
            const label  = isTon
              ? `${d.ton}T`
              : `${d.nova >= 1000 ? `${d.nova / 1000}K` : d.nova}`;

            return (
              <div
                key={d.day}
                onClick={async () => {
                  if (!d.isToday || d.claimed) return;
                  try {
                    const r = await api.claimStreak(d.day);
                    if (r?.ok) {
                      onDayClaimed({ day: d.day, nova: r.nova, ton: r.ton });

                      // ── New-user welcome: show 1.5 TON congratulations popup
                      //    after they claim their first login reward ──
                      const auth = authResultRef.current;
                      if (auth?.isNewUser && auth?.giftClaimed === false) {
                        if (auth.welcomeTon) setWelcomeTon(auth.welcomeTon);
                        setTimeout(() => {
                          onClose();
                          onShowGift();
                        }, 600);
                      } else {
                        setTimeout(onClose, 1200);
                      }
                    }
                  } catch (e) {
                    alert(e?.message ?? "Failed");
                  }
                }}
                style={{
                  background: d.claimed
                    ? "rgba(57,255,138,0.08)"
                    : d.isToday
                    ? "rgba(245,200,66,0.15)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${d.claimed ? T.green : d.isToday ? T.gold : "#1e2a1e"}`,
                  borderRadius: 10,
                  padding: "8px 4px",
                  textAlign: "center",
                  cursor: d.isToday && !d.claimed ? "pointer" : "default",
                  opacity: d.isPast && !d.claimed ? 0.35 : 1,
                  transform: d.isToday && !d.claimed ? "scale(1.05)" : "scale(1)",
                  transition: "transform 0.2s",
                }}
              >
                <div style={{fontSize:9,color:d.claimed?T.green:d.isToday?T.gold:T.muted,fontFamily:"'Orbitron'",marginBottom:2}}>D{d.day}</div>
                <div style={{fontSize:d.isToday?14:11,fontWeight:700,color:d.claimed?T.green:isTon?"#4da6ff":T.gold}}>
                  {d.claimed ? "✓" : label}
                </div>
                {d.isToday && !d.claimed && (
                  <div style={{fontSize:8,color:T.gold,marginTop:2}}>TAP</div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{width:"100%",background:"transparent",border:`1px solid #1e2a1e`,borderRadius:10,padding:"10px",color:T.muted,fontFamily:"'Rajdhani'",fontSize:13,cursor:"pointer"}}
        >
          Close
        </button>
      </div>
    </div>
  );
}
