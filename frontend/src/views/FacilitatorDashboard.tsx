import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRSessionCard } from '../components/QRJoinFlow'
import { MISSIONS, MISSION_COUNT, type Participant } from '../lib/types'
import { fetchSessionProgress } from '../lib/api'
import { card, chip, ghostButton, techGradient, techTone } from '../lib/ui'

export default function FacilitatorDashboard({ sessionId }: { sessionId: string }) {
    const [showQR, setShowQR] = useState(false)
    const [tick, setTick] = useState(0)

    // Tick the LIVE indicator. We do this independently of react-query polling
    // so the dot stays animated even if the network is slow.
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 1000)
        return () => clearInterval(t)
    }, [])

    const { data: progress, isLoading } = useQuery({
        queryKey: ['session-progress', sessionId],
        queryFn: () => fetchSessionProgress(sessionId),
        refetchInterval: 3000,
    })

    const session = progress?.session
    const participants: Participant[] = progress?.participants ?? []
    const completed = participants.filter((p) => p.completed_missions.length === MISSION_COUNT).length
    const avgProgress =
        participants.length > 0
            ? Math.round(
                  (participants.reduce((s, p) => s + p.completed_missions.length, 0) /
                      (participants.length * MISSION_COUNT)) *
                      100,
              )
            : 0

    return (
        <main
            id="facilitator-main"
            aria-label="Facilitator dashboard"
            style={{
                padding: '1.5rem',
                maxWidth: 1200,
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                fontFamily: 'var(--font-sans)',
            }}
        >
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span
                        aria-hidden="true"
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 'var(--radius-2)',
                            background: 'var(--gradient-bitcoin)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 22,
                            color: '#0A0A0B',
                            fontWeight: 800,
                        }}
                    >
                        ₿
                    </span>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
                            {session?.name ?? (isLoading ? 'Loading session…' : 'Session')}
                        </h1>
                        <span
                            style={{
                                fontSize: 11,
                                color: 'var(--muted)',
                                letterSpacing: '0.06em',
                                fontFamily: 'var(--font-mono)',
                            }}
                        >
                            id · {sessionId.slice(0, 8)}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                        style={{
                            ...chip('green'),
                            fontFamily: 'var(--font-mono)',
                        }}
                        aria-live="polite"
                        aria-label={`Live, updated ${tick} seconds ago`}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: 'var(--success)',
                                animation: 'pulse-dot 1.6s infinite ease-in-out',
                                display: 'inline-block',
                            }}
                        />
                        LIVE
                    </span>
                    <button onClick={() => setShowQR((v) => !v)} style={{ ...ghostButton, padding: '8px 14px' }}>
                        {showQR ? 'Hide QR' : 'Show QR'}
                    </button>
                </div>
            </header>

            {showQR && session && (
                <div
                    style={{
                        ...card,
                        display: 'flex',
                        justifyContent: 'center',
                        padding: 20,
                    }}
                >
                    <QRSessionCard sessionId={sessionId} sessionName={session.name} />
                </div>
            )}

            {/* Stats */}
            <section
                aria-label="Session statistics"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                }}
            >
                <Stat label="Participants" value={participants.length} />
                <Stat label="Finished" value={completed} accent />
                <Stat label="Avg. progress" value={`${avgProgress}%`} />
                <Stat label="Missions" value={MISSION_COUNT} />
            </section>

            {/* Participant grid */}
            <section
                aria-label="Participant progress"
                style={{ ...card, overflow: 'hidden' }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `220px repeat(${MISSION_COUNT}, minmax(0, 1fr)) 56px`,
                        padding: '12px 16px',
                        background: 'var(--surface2)',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--muted)',
                        fontWeight: 700,
                    }}
                >
                    <span>Participant</span>
                    {MISSIONS.map((m) => (
                        <span
                            key={m.id}
                            title={m.name}
                            aria-label={m.name}
                            style={{
                                textAlign: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                            }}
                        >
                            {m.id}
                        </span>
                    ))}
                    <span style={{ textAlign: 'right' }}>%</span>
                </div>

                {participants.length === 0 ? (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 8,
                            padding: '3rem 1rem',
                            color: 'var(--muted)',
                            fontSize: 14,
                        }}
                    >
                        <span aria-hidden="true" style={{ fontSize: 28 }}>
                            ⏳
                        </span>
                        <p style={{ margin: 0 }}>Waiting for participants to join…</p>
                        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Share the QR code above.</p>
                    </div>
                ) : (
                    participants.map((p) => <ParticipantRow key={p.id} participant={p} />)
                )}
            </section>
        </main>
    )
}

function Stat({
    label,
    value,
    accent,
}: {
    label: string
    value: number | string
    accent?: boolean
}) {
    return (
        <div
            style={{
                ...card,
                padding: '16px 18px',
            }}
        >
            <div
                style={{
                    fontSize: 28,
                    fontWeight: 800,
                    lineHeight: 1,
                    background: accent ? 'var(--gradient-bitcoin)' : undefined,
                    WebkitBackgroundClip: accent ? 'text' : undefined,
                    backgroundClip: accent ? 'text' : undefined,
                    WebkitTextFillColor: accent ? 'transparent' : undefined,
                    color: accent ? 'transparent' : 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                }}
            >
                {value}
            </div>
            <div
                style={{
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    marginTop: 6,
                    fontWeight: 600,
                }}
            >
                {label}
            </div>
        </div>
    )
}

function ParticipantRow({ participant }: { participant: Participant }) {
    const doneCount = participant.completed_missions.length
    const pct = Math.round((doneCount / MISSION_COUNT) * 100)
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: `220px repeat(${MISSION_COUNT}, minmax(0, 1fr)) 56px`,
                alignItems: 'center',
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                    aria-hidden="true"
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'var(--gradient-bitcoin)',
                        color: '#0A0A0B',
                        fontWeight: 800,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {participant.name.charAt(0).toUpperCase()}
                </div>
                <span
                    style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {participant.name}
                </span>
            </div>
            {MISSIONS.map((m) => {
                const done = participant.completed_missions.includes(m.id)
                const active = participant.current_mission === m.id
                return (
                    <div
                        key={m.id}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={`${m.id}. ${m.name}: ${
                            done ? 'completed' : active ? 'in progress' : 'locked'
                        }`}
                        aria-label={`${m.name}: ${
                            done ? 'completed' : active ? 'in progress' : 'locked'
                        }`}
                    >
                        {done ? (
                            <span
                                aria-hidden="true"
                                style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: '50%',
                                    background: techGradient(m.tech),
                                    color: '#0A0A0B',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                ✓
                            </span>
                        ) : active ? (
                            <span
                                aria-hidden="true"
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: `var(--${
                                        techTone(m.tech) === 'orange'
                                            ? 'bitcoin'
                                            : techTone(m.tech) === 'purple'
                                              ? 'nostr-purple'
                                              : 'ecash-cyan'
                                    })`,
                                    animation: 'pulse-dot 1.6s infinite ease-in-out',
                                }}
                            />
                        ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>–</span>
                        )}
                    </div>
                )
            })}
            <div
                style={{
                    textAlign: 'right',
                    fontSize: 12,
                    color: pct === 100 ? 'var(--success)' : 'var(--muted)',
                    fontWeight: pct === 100 ? 700 : 500,
                    fontFamily: 'var(--font-mono)',
                }}
            >
                {pct}%
            </div>
        </div>
    )
}
