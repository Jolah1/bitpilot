import { useState } from "react";
import { api } from "../lib/api";

const MISSIONS = [
  { id:1, emoji:"🪪", name:"Get your Bitcoin ID", tagline:"Like a username — nobody can take it away",
    learn:{ heading:"What is a Nostr identity?", body:"Think of it like creating a Gmail account — but YOU own it forever. No company can delete it.\n\nYou'll get two keys:\n🔑 PUBLIC key (npub) — share freely, like your phone number\n🔒 PRIVATE key (nsec) — NEVER share this, like your PIN.", tip:"💡 Write your private key on paper — it can never be recovered if lost!" },
    quiz:{ question:"Your private key (nsec) is like your PIN. What should you do with it?", options:[{text:"Post it online so people can find me",correct:false},{text:"Keep it secret — never share with anyone",correct:true},{text:"Send it to a friend for safekeeping",correct:false}] },
    action:"Generate my Bitcoin ID", actionHint:"Tap the button — your identity is created in under a second!" },
  { id:2, emoji:"📥", name:"Receive real Bitcoin", tagline:"Get actual sats sent straight to you",
    learn:{ heading:"What is a Lightning invoice?", body:"Lightning is a super-fast lane on the Bitcoin highway. Instead of waiting 10 minutes, it settles in under a second.\n\nAn invoice is like a payment request — similar to asking someone to pay you on PayPal, but for Bitcoin.", tip:"💡 The amount is tiny (a few pennies) — just to learn the flow!" },
    quiz:{ question:"How fast does a Lightning Bitcoin payment settle?", options:[{text:"About 10 minutes",correct:false},{text:"Instantly — under a second",correct:true},{text:"1–2 business days",correct:false}] },
    action:"Create my payment request", actionHint:"We'll generate an invoice. Show it to your facilitator to pay!" },
  { id:3, emoji:"📤", name:"Send 50 sats", tagline:"Pay someone — as easy as sending an email",
    learn:{ heading:"What is a Lightning Address?", body:"A Lightning Address looks just like an email address (e.g. alice@ln.tips) — but it's actually a Bitcoin payment address.\n\n50 sats is less than 1 penny. Think of it as a practice payment!", tip:"💡 50 sats ≈ $0.00003. Tiny amount, big skill!" },
    quiz:{ question:"What does a Lightning Address look like?", options:[{text:"A long random code like 1A2B3C…",correct:false},{text:"An email address like alice@wallet.com",correct:true},{text:"A QR code",correct:false}] },
    action:"Send 50 sats", actionHint:"Type a Lightning address (like demo@ln.tips) and send!" },
  { id:4, emoji:"🎟️", name:"Claim a secret token", tagline:"Private digital cash — no bank, no trace",
    learn:{ heading:"What is Cashu eCash?", body:"When you pay by card, your bank tracks everything. Not great!\n\nCashu eCash is like handing someone a £10 note — nobody tracks it. Real Bitcoin value, completely private.", tip:"💡 Think of it like a gift card code over WhatsApp — paste it and the sats are yours!" },
    quiz:{ question:"What makes eCash different from paying by card?", options:[{text:"It's faster than Lightning",correct:false},{text:"Your spending is completely private",correct:true},{text:"You can spend more than you have",correct:false}] },
    action:"Claim my token", actionHint:"Paste the Cashu token your facilitator sent you." },
  { id:5, emoji:"📢", name:"Post your first note", tagline:"Send a message no one can ever delete",
    learn:{ heading:"What is Nostr?", body:"Twitter can delete your account. Facebook can ban you. Nostr is different — nobody's in charge.\n\nYour posts are signed with YOUR private key. Only you can post as you, and no company can remove it.", tip:"💡 Keep it friendly — it really is permanent!" },
    quiz:{ question:"On Nostr, who can delete your posts?", options:[{text:"The company that runs Nostr",correct:false},{text:"Your internet provider",correct:false},{text:"Nobody — there is no company in charge",correct:true}] },
    action:"Publish my note", actionHint:"Write your first Nostr message — it'll live on the network forever!" },
];

export default function LearnerView({ participantId }: { participantId: string }) {
  const [missionIdx, setMissionIdx] = useState(0);
  const [phase, setPhase] = useState<"learn"|"quiz"|"do">("learn");
  const [selected, setSelected] = useState<number|null>(null);
  const [quizResult, setQuizResult] = useState<"correct"|"wrong"|null>(null);
  const [doInput, setDoInput] = useState("");
  const [doResult, setDoResult] = useState<string|null>(null);
  const [doError, setDoError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [completedMissions, setCompletedMissions] = useState<number[]>([]);

  const mission = MISSIONS[missionIdx];
  const allDone = completedMissions.length === 5;

  const goNextMission = () => {
    setCompletedMissions(prev => [...prev, missionIdx]);
    if (missionIdx < 4) {
      setMissionIdx(missionIdx + 1);
      setPhase("learn");
      setSelected(null);
      setQuizResult(null);
      setDoInput("");
      setDoResult(null);
      setDoError(null);
    }
  };

  const handleQuizSubmit = () => {
    if (selected === null) return;
    const correct = mission.quiz.options[selected].correct;
    setQuizResult(correct ? "correct" : "wrong");
    if (correct) setTimeout(() => setPhase("do"), 900);
  };

  const handleDo = async () => {
    setLoading(true);
    setDoError(null);
    try {
      let actionMessage: string;
      if (missionIdx === 0) {
        const r = await api.createNostrIdentity(participantId);
        actionMessage = `✓ Your keys:\nnpub: ${r.npub}\nnsec: ${r.nsec}\n\n⚠️ ${r.warning}`;
      } else if (missionIdx === 1) {
        const r = await api.createInvoice(participantId, 100, "BitPilot Mission 2");
        actionMessage = `✓ Invoice created!\n${r.invoice}`;
      } else if (missionIdx === 2) {
        const r = await api.payInvoice(participantId, doInput || "demo@ln.tips");
        actionMessage = `✓ Sent! Hash: ${r.payment_hash}`;
      } else if (missionIdx === 3) {
        actionMessage = `✓ Token claimed! 21 sats added to your balance.`;
      } else {
        if (!doInput.trim()) { setLoading(false); return; }
        const r = await api.publishNostrNote(participantId, doInput, "nsec1demo");
        actionMessage = `✓ Published! Event ID: ${r.event_id}`;
      }
      // Only mark the mission complete on the backend AFTER the action succeeded.
      // If completion fails, surface the error rather than pretending it worked.
      await api.completeMission(participantId, mission.id);
      setDoResult(actionMessage);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setDoError(`Something went wrong: ${msg}`);
    }
    setLoading(false);
  };

  // ── Done screen ──
  if (allDone && missionIdx === 4 && doResult) return (
    <div style={{ maxWidth:560, margin:"0 auto", padding:"3rem 1rem", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:"1rem" }}>
      <div style={{ fontSize:"4rem" }}>🎉</div>
      <h1 style={{ fontSize:28, fontWeight:800, margin:0 }}>You did it!</h1>
      <p style={{ fontSize:15, color:"var(--muted)", lineHeight:1.6, margin:0 }}>You just used real Bitcoin. Lightning. Nostr. eCash.<br/>Welcome to the future of money.</p>
      <div style={{ display:"flex", flexDirection:"column", gap:6, width:"100%", maxWidth:300 }}>
        {MISSIONS.map((m,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"var(--muted)" }}>
            <span style={{ color:"#22c55e" }}>✓</span><span>{m.emoji}</span><span style={{ flex:1, textAlign:"left" }}>{m.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const s = { // shared styles
    card: { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden", maxWidth:560, margin:"0 auto" } as React.CSSProperties,
    btn: { background:"#F7931A", color:"#000", border:"none", borderRadius:10, padding:"13px 20px", fontWeight:700, fontSize:15, cursor:"pointer", width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:7 } as React.CSSProperties,
    ghostBtn: { background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", fontSize:13, color:"var(--muted)", cursor:"pointer" } as React.CSSProperties,
    input: { width:"100%", padding:"11px 14px", border:"1px solid var(--border)", borderRadius:10, background:"var(--bg)", color:"var(--text)", fontSize:14, outline:"none", boxSizing:"border-box" as const, fontFamily:"inherit" },
    tip: { background:"rgba(247,147,26,0.08)", border:"1px solid rgba(247,147,26,0.2)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"var(--text)", lineHeight:1.5 } as React.CSSProperties,
    result: { background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:10, padding:"12px 14px", fontSize:12, fontFamily:"monospace", whiteSpace:"pre-wrap" as const, color:"var(--text)", lineHeight:1.6 } as React.CSSProperties,
  };

  return (
    <div style={{ padding:"1.5rem 1rem 4rem", fontFamily:"inherit" }}>

      {/* Progress steps */}
      <div style={{ display:"flex", gap:4, marginBottom:20, maxWidth:560, margin:"0 auto 20px" }}>
        {MISSIONS.map((m,i) => {
          const done = completedMissions.includes(i);
          const active = i === missionIdx;
          return (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, opacity: done?0.7:active?1:0.3 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background: done?"rgba(34,197,94,0.15)":active?"#F7931A":"var(--surface)", border:`1px solid ${done?"#22c55e":active?"#F7931A":"var(--border)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color: active?"#000":"inherit" }}>
                {done ? "✓" : m.emoji}
              </div>
              <span style={{ fontSize:9, textAlign:"center", color:"var(--muted)", lineHeight:1.2 }}>{m.name}</span>
            </div>
          );
        })}
      </div>

      <div style={s.card}>
        {/* Mission header */}
        <div style={{ padding:"1.25rem 1.25rem 0", display:"flex", alignItems:"flex-start", gap:12 }}>
          <span style={{ fontSize:"2rem", lineHeight:1 }}>{mission.emoji}</span>
          <div>
            <div style={{ fontSize:11, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>Mission {missionIdx+1} of 5</div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 2px" }}>{mission.name}</h2>
            <p style={{ fontSize:13, color:"var(--muted)", margin:0 }}>{mission.tagline}</p>
          </div>
        </div>

        {/* Phase tabs */}
        <div style={{ display:"flex", margin:"1rem 1.25rem 0", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
          {(["learn","quiz","do"] as const).map((p,i) => {
            const isDone = (p==="learn" && (phase==="quiz"||phase==="do")) || (p==="quiz" && phase==="do");
            return (
              <div key={p} style={{ flex:1, padding:"8px 4px", textAlign:"center", fontSize:12, background: phase===p?"var(--bg)":"var(--surface)", color: phase===p?"var(--text)":"var(--muted)", fontWeight: phase===p?600:400, borderRight: p!=="do"?"1px solid var(--border)":"none", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <span style={{ width:16, height:16, borderRadius:"50%", background: isDone?"#22c55e":phase===p?"#F7931A":"var(--border)", color: (isDone||phase===p)?"#000":"var(--muted)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, flexShrink:0 }}>
                  {isDone?"✓":i+1}
                </span>
                {p==="learn"?"Read":p==="quiz"?"Quiz":"Do it!"}
              </div>
            );
          })}
        </div>

        <div style={{ padding:"1.25rem", display:"flex", flexDirection:"column", gap:"1rem" }}>

          {/* LEARN */}
          {phase==="learn" && <>
            <h3 style={{ fontSize:17, fontWeight:600, margin:0 }}>{mission.learn.heading}</h3>
            {mission.learn.body.split("\n\n").map((para,i) => (
              <p key={i} style={{ fontSize:15, lineHeight:1.7, margin:0, whiteSpace:"pre-line" }}>{para}</p>
            ))}
            <div style={s.tip}>💡 {mission.learn.tip}</div>
            <button style={s.btn} onClick={() => setPhase("quiz")}>Got it — take the quiz →</button>
          </>}

          {/* QUIZ */}
          {phase==="quiz" && <>
            <p style={{ fontSize:16, fontWeight:600, lineHeight:1.4, margin:0 }}>{mission.quiz.question}</p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {mission.quiz.options.map((opt,i) => (
                <button key={i}
                  onClick={() => { if (!quizResult) setSelected(i); }}
                  disabled={!!quizResult}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", border:`1px solid ${quizResult==="correct"&&opt.correct?"#22c55e":quizResult==="wrong"&&selected===i?"#ef4444":selected===i?"#F7931A":"var(--border)"}`, borderRadius:10, background: quizResult==="correct"&&opt.correct?"rgba(34,197,94,0.1)":quizResult==="wrong"&&selected===i?"rgba(239,68,68,0.08)":selected===i?"rgba(247,147,26,0.08)":"var(--surface)", cursor:quizResult?"default":"pointer", textAlign:"left", fontSize:14, color:"var(--text)", width:"100%" }}>
                  <span style={{ width:24, height:24, borderRadius:"50%", background:"var(--bg)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, flexShrink:0 }}>{["A","B","C"][i]}</span>
                  {opt.text}
                </button>
              ))}
            </div>
            {quizResult==="wrong" && (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#ef4444" }}>
                Not quite! Read the lesson again.
                <div style={{ marginTop:8 }}>
                  <button style={s.ghostBtn} onClick={() => { setSelected(null); setQuizResult(null); setPhase("learn"); }}>← Back to lesson</button>
                </div>
              </div>
            )}
            {quizResult==="correct" && <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#22c55e" }}>Correct! Opening next step… ✓</div>}
            {!quizResult && <button style={{ ...s.btn, opacity:selected===null?0.5:1 }} onClick={handleQuizSubmit} disabled={selected===null}>Submit answer</button>}
          </>}

          {/* DO */}
          {phase==="do" && <>
            <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.5, margin:0 }}>👇 {mission.actionHint}</p>

            {(missionIdx===2||missionIdx===3||missionIdx===4) && !doResult && (
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                <label style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.07em", color:"var(--muted)", fontWeight:600 }}>
                  {missionIdx===2?"Lightning address":missionIdx===3?"Cashu token":"Your note"}
                </label>
                {missionIdx===4
                  ? <textarea value={doInput} onChange={e=>setDoInput(e.target.value)} placeholder="I just sent my first Bitcoin on Lightning! ⚡" style={{ ...s.input, minHeight:80, resize:"vertical" }} rows={3} maxLength={280} />
                  : <input value={doInput} onChange={e=>setDoInput(e.target.value)} placeholder={missionIdx===2?"demo@ln.tips":"cashuA..."} style={s.input} />
                }
              </div>
            )}

            {doResult
              ? <>
                  <div style={s.result}>{doResult}</div>
                  <button style={s.btn} onClick={missionIdx===4 ? goNextMission : goNextMission}>
                    {missionIdx===4 ? "🎉 Complete BitPilot!" : `Next: ${MISSIONS[missionIdx+1].name} →`}
                  </button>
                </>
              : <>
                  {doError && (
                    <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#ef4444", lineHeight:1.5 }}>
                      ⚠️ {doError}
                    </div>
                  )}
                  <button style={{ ...s.btn, opacity:loading?0.6:1 }} onClick={handleDo} disabled={loading || (missionIdx===4&&!doInput.trim())}>
                    {loading ? <>⏳ Working…</> : <>{mission.emoji} {doError ? "Try again" : mission.action}</>}
                  </button>
                </>
            }
          </>}

        </div>
      </div>
    </div>
  );
}
