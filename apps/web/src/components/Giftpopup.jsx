import { T } from "../constants/theme.js";
import { api } from "../lib/api.js";

/**
 * Welcome-gift popup shown to new users after they claim their first login reward.
 * Two-stage flow: tap the gift box → confetti burst → congratulations screen → CLAIM.
 *
 * Props:
 *  welcomeTon      – number, TON amount to display (default 1.5)
 *  giftOpened      – boolean, whether the box has been tapped open
 *  giftParticles   – array of particle objects for the confetti burst
 *  onOpenGift      – () => void  (called when the gift box is tapped)
 *  onClaim         – () => void  (called when CLAIM button is pressed)
 */
export default function GiftPopup({
  welcomeTon,
  giftOpened,
  giftParticles,
  onOpenGift,
  onClaim,
}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.85)",backdropFilter:"blur(4px)"}}>

      {/* Gold particle burst */}
      {giftParticles.map(p => (
        <div
          key={p.id}
          style={{
            position:"absolute",
            left:`${p.x}%`,
            top:`${p.y}%`,
            width:p.size,
            height:p.size,
            borderRadius:"50%",
            background:p.color,
            animation:`particle ${p.dur}s ease-out forwards`,
            pointerEvents:"none",
          }}
        />
      ))}

      <div style={{background:"linear-gradient(135deg,#0d1117,#141a0f)",border:`2px solid ${T.gold}`,borderRadius:24,padding:"36px 28px",textAlign:"center",maxWidth:320,width:"90%",boxShadow:`0 0 60px rgba(245,200,66,0.3)`,animation:"popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275)"}}>

        {!giftOpened ? (
          /* ── Stage 1: tap to open ── */
          <>
            <div
              style={{fontSize:80,marginBottom:8,animation:"float 2s ease-in-out infinite",cursor:"pointer",display:"inline-block"}}
              onClick={onOpenGift}
            >
              🎁
            </div>
            <div style={{fontFamily:"'Orbitron'",fontSize:13,color:T.gold,letterSpacing:2,marginBottom:8}}>TAP TO OPEN</div>
            <div style={{fontSize:13,color:T.muted}}>A welcome gift is waiting for you!</div>
          </>
        ) : (
          /* ── Stage 2: congratulations ── */
          <>
            <div style={{fontSize:64,marginBottom:12,animation:"popIn 0.4s ease"}}>🎉</div>
            <div style={{fontFamily:"'Orbitron'",fontSize:16,color:T.gold,letterSpacing:2,marginBottom:8}}>
              CONGRATULATIONS!
            </div>
            <div style={{fontSize:14,color:T.text,marginBottom:4}}>You have received</div>
            <div style={{fontFamily:"'Orbitron'",fontSize:32,color:T.green,fontWeight:700,marginBottom:4,textShadow:`0 0 20px rgba(57,255,138,0.5)`}}>
              +{welcomeTon} TON
            </div>
            <div style={{fontSize:12,color:T.muted,marginBottom:20}}>credited to your balance</div>
            <button
              onClick={onClaim}
              style={{background:`linear-gradient(135deg,${T.gold},${T.goldDim})`,color:"#000",border:"none",borderRadius:12,padding:"12px 32px",fontFamily:"'Orbitron'",fontWeight:700,fontSize:13,cursor:"pointer",letterSpacing:1}}
            >
              CLAIM
            </button>
          </>
        )}
      </div>
    </div>
  );
}
