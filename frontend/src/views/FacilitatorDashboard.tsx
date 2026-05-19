import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRSessionCard } from "../components/QRJoinFlow";
import type { Participant } from "../lib/types";
import { fetchSessionProgress } from "../lib/api";

const MISSION_LABELS = ["Nostr ID","Receive ⚡","Send 50 sats","Cashu token","Nostr note"];

export default function FacilitatorDashboard({ sessionId }: { sessionId: string }) {
  const [showQR, setShowQR] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: progress } = useQuery({
    queryKey: ["session-progress", sessionId],
    queryFn: () => fetchSessionProgress(sessionId),
    refetchInterval: 3000,
  });

  const session = progress?.session;
  const participants: Participant[] = progress?.participants ?? [];
  const completed = participants.filter(p => p.completed_missions.length === 5).length;
  const avgProgress = participants.length > 0
    ? Math.round(participants.reduce((s, p) => s + p.completed_missions.length, 0) / participants.length * 20)
    : 0;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem", fontFamily: "monospace" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.75rem", color: "#F7931A" }}>₿</span>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>{session?.name ?? "Loading…"}</h1>
            <span style={{ fontSize: "0.65rem", color: "var(--muted)", letterSpacing: "0.08em" }}>session · {sessionId.slice(0, 8)}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.65rem", letterSpacing: "0.15em", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 100, padding: "4px 10px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", opacity: tick % 2 === 0 ? 1 : 0.3, transition: "opacity 0.4s", display: "inline-block" }} />
            LIVE
          </div>
          <button onClick={() => setShowQR(v => !v)} style={{ fontSize: "0.72rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "6px 12px", cursor: "pointer" }}>
            {showQR ? "Hide QR" : "Show QR"}
          </button>
        </div>
      </div>

      {/* QR Panel */}
      {showQR && session && (
        <div style={{ display: "flex", justifyContent: "center", padding: "1rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
          <QRSessionCard sessionId={sessionId} sessionName={session.name} />
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
        {[
          [participants.length, "Participants", false],
          [completed, "Finished", true],
          [avgProgress + "%", "Avg. progress", false],
          [5, "Missions", false],
        ].map(([val, label, orange]) => (
          <div key={String(label)} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: orange ? "#F7931A" : "var(--text)", lineHeight: 1 }}>{String(val)}</div>
            <div style={{ fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginTop: 4 }}>{String(label)}</div>
          </div>
        ))}
      </div>

      {/* Participant grid */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px repeat(5, 1fr) 48px", padding: "0.6rem 1rem", background: "var(--bg)", borderBottom: "1px solid var(--border)", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
          <span>Participant</span>
          {MISSION_LABELS.map(m => <span key={m} style={{ textAlign: "center" }}>{m}</span>)}
          <span style={{ textAlign: "right" }}>%</span>
        </div>

        {participants.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", padding: "3rem 1rem", color: "var(--muted)", fontSize: "0.8rem" }}>
            <span style={{ fontSize: "2rem" }}>⏳</span>
            <p style={{ margin: 0 }}>Waiting for participants to join…</p>
            <p style={{ margin: 0, fontSize: "0.68rem", opacity: 0.7 }}>Share the QR code above.</p>
          </div>
        ) : (
          participants.map(p => <ParticipantRow key={p.id} participant={p} />)
        )}
      </div>
    </div>
  );
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const doneCount = participant.completed_missions.length;
  const pct = Math.round((doneCount / 5) * 100);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px repeat(5, 1fr) 48px", alignItems: "center", padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#F7931A", color: "#000", fontWeight: 700, fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {participant.name.charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{participant.name}</span>
      </div>
      {[1,2,3,4,5].map(missionId => (
        <div key={missionId} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {participant.completed_missions.includes(missionId)
            ? <span style={{ color: "#22c55e" }}>✓</span>
            : participant.current_mission === missionId
            ? <span style={{ color: "#F7931A", fontSize: "0.8rem" }}>●</span>
            : <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>–</span>
          }
        </div>
      ))}
      <div style={{ textAlign: "right", fontSize: "0.72rem", color: pct === 100 ? "#22c55e" : "var(--muted)", fontWeight: pct === 100 ? 600 : 400 }}>{pct}%</div>
    </div>
  );
}
