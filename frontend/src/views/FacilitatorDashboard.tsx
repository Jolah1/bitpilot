import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRSessionCard } from "../components/QRJoinFlow";
import type { Participant, Session } from "../lib/types";
import { fetchSessionProgress } from "../lib/api";

const MISSION_LABELS = [
    "Nostr ID",
    "Receive ⚡",
    "Send 50 sats",
    "Cashu token",
    "Nostr note",
];

const PHASE_LABELS = ["learn", "quiz", "do"];

interface FacilitatorDashboardProps {
    session: Session;
}

export default function FacilitatorDashboard({ session }: FacilitatorDashboardProps) {
    const [showQR, setShowQR] = useState(false);
    const [tick, setTick] = useState(0);

    // Pulse the "live" dot every second
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 1000);
        return () => clearInterval(t);
    }, []);

    const { data: progress } = useQuery({
        queryKey: ["session-progress", session.id],
        queryFn: () => fetchSessionProgress(session.id),
        refetchInterval: 3000,
    });

    const participants: Participant[] = progress?.participants ?? [];
    const completed = participants.filter((p) => p.missions_completed === 5).length;
    const avgProgress =
        participants.length > 0
            ? Math.round(
                participants.reduce((s, p) => s + p.missions_completed, 0) /
                participants.length *
                20
            )
            : 0;

    return (
        <div className="facilitator-root">
            {/* ── Header ── */}
            <header className="fac-header">
                <div className="fac-header-left">
                    <span className="fac-logo">₿</span>
                    <div>
                        <h1 className="fac-session-name">{session.name}</h1>
                        <span className="fac-session-id">session · {session.id.slice(0, 8)}</span>
                    </div>
                </div>
                <div className="fac-header-right">
                    <div className="fac-live-badge">
                        <span className={`fac-live-dot ${tick % 2 === 0 ? "dim" : ""}`} />
                        LIVE
                    </div>
                    <button className="fac-qr-btn" onClick={() => setShowQR((v) => !v)}>
                        {showQR ? "Hide QR" : "Show QR"}
                    </button>
                </div>
            </header>

            {/* ── QR Panel ── */}
            {showQR && (
                <div className="fac-qr-panel">
                    <QRSessionCard sessionId={session.id} sessionName={session.name} />
                </div>
            )}

            {/* ── Stats row ── */}
            <div className="fac-stats">
                <div className="fac-stat-card">
                    <span className="fac-stat-val">{participants.length}</span>
                    <span className="fac-stat-label">Participants</span>
                </div>
                <div className="fac-stat-card">
                    <span className="fac-stat-val orange">{completed}</span>
                    <span className="fac-stat-label">Finished</span>
                </div>
                <div className="fac-stat-card">
                    <span className="fac-stat-val">{avgProgress}%</span>
                    <span className="fac-stat-label">Avg. progress</span>
                </div>
                <div className="fac-stat-card">
                    <span className="fac-stat-val">5</span>
                    <span className="fac-stat-label">Missions</span>
                </div>
            </div>

            {/* ── Progress grid ── */}
            <div className="fac-grid-wrap">
                <div className="fac-grid-header">
                    <span className="fac-col-name">Participant</span>
                    {MISSION_LABELS.map((m, i) => (
                        <span key={i} className="fac-col-mission">{m}</span>
                    ))}
                    <span className="fac-col-pct">%</span>
                </div>

                {participants.length === 0 ? (
                    <div className="fac-empty">
                        <span className="fac-empty-icon">⏳</span>
                        <p>Waiting for participants to join…</p>
                        <p className="fac-empty-sub">Share the QR code or session link above.</p>
                    </div>
                ) : (
                    participants.map((p) => (
                        <ParticipantRow key={p.id} participant={p} />
                    ))
                )}
            </div>

            <style>{`
        .facilitator-root {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: 'IBM Plex Mono', monospace;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          max-width: 1100px;
          margin: 0 auto;
        }

        /* Header */
        .fac-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .fac-header-left { display: flex; align-items: center; gap: 0.75rem; }
        .fac-logo {
          font-size: 1.75rem;
          color: var(--bitcoin-orange);
          font-weight: 700;
          line-height: 1;
        }
        .fac-session-name {
          font-family: 'Syne', sans-serif;
          font-size: 1.2rem;
          font-weight: 700;
          margin: 0;
          line-height: 1.2;
        }
        .fac-session-id {
          font-size: 0.65rem;
          color: var(--text-muted);
          letter-spacing: 0.08em;
        }
        .fac-header-right { display: flex; align-items: center; gap: 0.75rem; }
        .fac-live-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.65rem;
          letter-spacing: 0.15em;
          color: #22c55e;
          border: 1px solid rgba(34,197,94,0.3);
          border-radius: 100px;
          padding: 4px 10px;
        }
        .fac-live-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #22c55e;
          transition: opacity 0.4s;
        }
        .fac-live-dot.dim { opacity: 0.3; }
        .fac-qr-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 0.72rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          padding: 6px 12px;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .fac-qr-btn:hover { border-color: var(--bitcoin-orange); }

        /* QR panel */
        .fac-qr-panel {
          display: flex;
          justify-content: center;
          padding: 1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
        }

        /* Stats */
        .fac-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
        }
        .fac-stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .fac-stat-val {
          font-family: 'Syne', sans-serif;
          font-size: 1.75rem;
          font-weight: 700;
          line-height: 1;
          color: var(--text);
        }
        .fac-stat-val.orange { color: var(--bitcoin-orange); }
        .fac-stat-label {
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        /* Grid */
        .fac-grid-wrap {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .fac-grid-header {
          display: grid;
          grid-template-columns: 160px repeat(5, 1fr) 48px;
          gap: 0;
          padding: 0.6rem 1rem;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          font-size: 0.62rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .fac-col-name { }
        .fac-col-mission { text-align: center; }
        .fac-col-pct { text-align: right; }

        /* Empty state */
        .fac-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 3rem 1rem;
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        .fac-empty-icon { font-size: 2rem; margin-bottom: 0.5rem; }
        .fac-empty-sub { font-size: 0.68rem; opacity: 0.7; }

        @media (max-width: 640px) {
          .fac-stats { grid-template-columns: repeat(2, 1fr); }
          .fac-grid-header { display: none; }
        }
      `}</style>
        </div>
    );
}

// ─── Single participant row ───────────────────────────────────────────────────

function ParticipantRow({ participant }: { participant: Participant }) {
    const pct = Math.round((participant.missions_completed / 5) * 100);

    return (
        <div className="p-row">
            <div className="p-name-col">
                <div className="p-avatar">{participant.name.charAt(0).toUpperCase()}</div>
                <span className="p-name">{participant.name}</span>
            </div>

            {[0, 1, 2, 3, 4].map((mIdx) => {
                const completed = participant.missions_completed > mIdx;
                const active = participant.missions_completed === mIdx;
                const phase = participant.current_phase ?? 0;

                return (
                    <div key={mIdx} className="p-mission-cell">
                        {completed ? (
                            <span className="p-check">✓</span>
                        ) : active ? (
                            <div className="p-phases">
                                {PHASE_LABELS.map((ph, pi) => (
                                    <span
                                        key={pi}
                                        className={`p-phase-dot ${pi < phase ? "done" : pi === phase ? "active" : ""}`}
                                        title={ph}
                                    />
                                ))}
                            </div>
                        ) : (
                            <span className="p-dash">–</span>
                        )}
                    </div>
                );
            })}

            <div className="p-pct-col">
                <span className={`p-pct ${pct === 100 ? "full" : ""}`}>{pct}%</span>
            </div>

            <style>{`
        .p-row {
          display: grid;
          grid-template-columns: 160px repeat(5, 1fr) 48px;
          align-items: center;
          padding: 0.6rem 1rem;
          border-bottom: 1px solid var(--border);
          transition: background 0.1s;
        }
        .p-row:last-child { border-bottom: none; }
        .p-row:hover { background: var(--bg); }
        .p-name-col { display: flex; align-items: center; gap: 8px; }
        .p-avatar {
          width: 26px; height: 26px;
          border-radius: 50%;
          background: var(--bitcoin-orange);
          color: #000;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 0.75rem;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .p-name { font-size: 0.78rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .p-mission-cell { display: flex; align-items: center; justify-content: center; }
        .p-check { color: #22c55e; font-size: 0.9rem; }
        .p-dash { color: var(--text-muted); font-size: 0.8rem; }
        .p-phases { display: flex; gap: 3px; align-items: center; }
        .p-phase-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--border);
          transition: background 0.2s;
        }
        .p-phase-dot.done { background: #22c55e; }
        .p-phase-dot.active { background: var(--bitcoin-orange); box-shadow: 0 0 0 2px rgba(247,147,26,0.25); }
        .p-pct-col { display: flex; justify-content: flex-end; }
        .p-pct { font-size: 0.72rem; color: var(--text-muted); }
        .p-pct.full { color: #22c55e; font-weight: 600; }
      `}</style>
        </div>
    );
}

