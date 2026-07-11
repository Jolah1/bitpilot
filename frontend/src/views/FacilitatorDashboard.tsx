import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isSoloSessionName } from '../App'
import { BrandMark } from '../components/BrandMark'
import { QRSessionCard } from '../components/QRJoinFlow'
import { MISSION_COUNT, TREES, treeFor, type Participant } from '../lib/types'
import { fetchSessionProgress } from '../lib/api'
import { card, chip, ghostButton, techGradient } from '../lib/ui'

/**
 * Facilitator dashboard. Polls /api/sessions/:id every 3s, shows a per-tree
 * progress strip for each participant.
 *
 * The earlier design tried to render a column grid one per mission. At
 * 60+ missions that becomes ~2000px wide — completely broken on every
 * viewport. New design: 8 tree bars per participant, plus a percentage
 * and current-mission tag. Same info, much smaller footprint, works on
 * mobile.
 */
export default function FacilitatorDashboard({ sessionId }: { sessionId: string }) {
    const [showQR, setShowQR] = useState(false)
    const [tick, setTick] = useState(0)

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
    // Solo learners create a sentinel-named session under the hood (see
    // `SOLO_SESSION_NAME` in App.tsx). Display them as "Solo run" rather
    // than leaking the raw "__solo__" string into the header or QR card.
    const isSolo = isSoloSessionName(session?.name)
    const displayName = isSolo ? 'Solo run' : session?.name
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
                padding: 'clamp(0.75rem, 3vw, 1.5rem)',
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
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <BrandMark size={40} />
                    <div style={{ minWidth: 0 }}>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: 'clamp(16px, 4vw, 20px)',
                                fontWeight: 800,
                                letterSpacing: '-0.02em',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {displayName ?? (isLoading ? 'Loading session…' : 'Session')}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span
                        style={{ ...chip('green'), fontFamily: 'var(--font-mono)' }}
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
                    <button
                        onClick={() => setShowQR((v) => !v)}
                        style={{ ...ghostButton, padding: '8px 14px', minHeight: 40 }}
                    >
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
                    <QRSessionCard sessionId={sessionId} sessionName={displayName ?? session.name} />
                </div>
            )}

            {/* Stats */}
            <section
                aria-label="Session statistics"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 12,
                }}
            >
                <Stat label="Participants" value={participants.length} />
                <Stat label="Finished" value={completed} accent />
                <Stat label="Avg. progress" value={`${avgProgress}%`} />
                <Stat label="Missions" value={MISSION_COUNT} />
            </section>

            {/* Tree legend */}
            <section
                aria-label="Tree legend"
                style={{
                    ...card,
                    padding: 12,
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    fontSize: 11,
                }}
            >
                {TREES.map((t) => (
                    <span
                        key={t.key}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            color: 'var(--muted)',
                            fontFamily: 'var(--font-mono)',
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                background: 'var(--gradient-bitcoin)',
                                opacity: 0.85,
                            }}
                        />
                        {t.label} ({t.missions.length})
                    </span>
                ))}
            </section>

            {/* Mission distribution — answers "where is everyone right now?" */}
            {participants.length > 0 && <MissionHistogram participants={participants} />}

            {/* Participant rows */}
            <section
                aria-label="Participant progress"
                style={{ ...card, overflow: 'hidden', padding: 0 }}
            >
                {participants.length === 0 ? (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 10,
                            padding: '3.5rem 1rem',
                            color: 'var(--muted)',
                            fontSize: 14,
                            textAlign: 'center',
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: '50%',
                                background:
                                    'linear-gradient(135deg, rgba(247,147,26,0.18), rgba(167,139,250,0.10))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 28,
                            }}
                        >
                            👥
                        </span>
                        <p
                            style={{
                                margin: 0,
                                fontSize: 15,
                                fontWeight: 700,
                                color: 'var(--text)',
                            }}
                        >
                            Nobody here yet
                        </p>
                        <p style={{ margin: 0, maxWidth: 320, lineHeight: 1.55 }}>
                            Share the QR code above. As learners join you'll see them
                            show up live, one row per learner.
                        </p>
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
        <div style={{ ...card, padding: '18px 18px 16px' }}>
            <div
                style={{
                    fontSize: 'clamp(28px, 6vw, 38px)',
                    fontWeight: 900,
                    lineHeight: 1,
                    letterSpacing: '-0.025em',
                    background: accent ? 'var(--gradient-bitcoin)' : undefined,
                    WebkitBackgroundClip: accent ? 'text' : undefined,
                    backgroundClip: accent ? 'text' : undefined,
                    WebkitTextFillColor: accent ? 'transparent' : undefined,
                    color: accent ? 'transparent' : 'var(--text)',
                    fontFamily: 'var(--font-sans)',
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {value}
            </div>
            <div
                style={{
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    marginTop: 10,
                    fontWeight: 700,
                }}
            >
                {label}
            </div>
        </div>
    )
}

function MissionHistogram({ participants }: { participants: Participant[] }) {
    const finished = participants.filter((p) => p.completed_missions.length === MISSION_COUNT).length
    const active = participants.length - finished
    const counts = new Array(MISSION_COUNT).fill(0) as number[]
    for (const p of participants) {
        if (p.completed_missions.length === MISSION_COUNT) continue
        const m = p.current_mission
        if (m >= 0 && m < MISSION_COUNT) counts[m] += 1
    }
    const max = Math.max(1, ...counts)
    const modeIdx = counts.indexOf(max)
    const modeTree = treeFor(modeIdx)
    return (
        <section aria-label="Mission distribution" style={{ ...card, padding: 12 }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 10,
                    gap: 8,
                    flexWrap: 'wrap',
                }}
            >
                <h2
                    style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                    }}
                >
                    Where is everyone?
                </h2>
                <span
                    style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                    }}
                >
                    {active} active
                    {finished > 0 && ` · ${finished} finished`}
                    {active > 0 && ` · most on M${modeIdx} (${modeTree.label})`}
                </span>
            </div>
            {/* At 60+ missions a `repeat(MISSION_COUNT, 1fr)` grid produces
                ~5px columns on a 360px viewport — bars vanish. Wrap in a
                horizontal scroller with a min-width so each bar gets at
                least ~10px even on mobile; the inner grid still pays the
                tree color cue, the scroll lets a touch user investigate. */}
            <div
                className="no-scrollbar"
                style={{
                    overflowX: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    marginLeft: -4,
                    marginRight: -4,
                    paddingLeft: 4,
                    paddingRight: 4,
                }}
            >
                <div style={{ minWidth: MISSION_COUNT * 10 }}>
                    <div
                        role="img"
                        aria-label={`Distribution of learners across missions. Most learners on mission ${modeIdx} with ${max}.`}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${MISSION_COUNT}, 1fr)`,
                            alignItems: 'end',
                            gap: 2,
                            height: 64,
                        }}
                    >
                        {counts.map((c, idx) => {
                            const heightPct = c === 0 ? 6 : 6 + (c / max) * 94
                            const t = treeFor(idx)
                            return (
                                <div
                                    key={idx}
                                    title={`Mission ${idx} (${t.label}) — ${c} learner${c === 1 ? '' : 's'}`}
                                    style={{
                                        height: `${heightPct}%`,
                                        background:
                                            c === 0
                                                ? 'var(--border)'
                                                : c === max
                                                  ? techGradient('bitcoin')
                                                  : 'var(--bitcoin)',
                                        borderRadius: 2,
                                        minHeight: 2,
                                        opacity: c === 0 ? 0.5 : 1,
                                    }}
                                />
                            )
                        })}
                    </div>
                    <div
                        aria-hidden="true"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${MISSION_COUNT}, 1fr)`,
                            gap: 2,
                            marginTop: 6,
                            fontSize: 10,
                            color: 'var(--muted)',
                            fontFamily: 'var(--font-mono)',
                        }}
                    >
                        {Array.from({ length: MISSION_COUNT }, (_, i) => (
                            <span key={i} style={{ textAlign: 'center' }}>
                                {i % 10 === 0 ? i : ''}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

function ParticipantRow({ participant }: { participant: Participant }) {
    const doneCount = participant.completed_missions.length
    const pct = Math.round((doneCount / MISSION_COUNT) * 100)
    const currentTree = treeFor(participant.current_mission)
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                padding: '12px 14px',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
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
                            fontSize: 14,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        {participant.name}
                    </span>
                    <span
                        style={{
                            fontSize: 10,
                            color: 'var(--muted)',
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}
                        title={`Currently on mission ${participant.current_mission} (${currentTree.label})`}
                    >
                        #{participant.current_mission} · {currentTree.label}
                    </span>
                </div>
                {/* 8-bar tree strip */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${TREES.length}, 1fr)`,
                        gap: 4,
                    }}
                    aria-label="Per-tree progress"
                >
                    {TREES.map((t) => {
                        const total = t.missions.length
                        const done = participant.completed_missions.filter(
                            (m) => t.missions.includes(m),
                        ).length
                        const isActive = t.key === currentTree.key
                        const pctTree = total === 0 ? 0 : (done / total) * 100
                        return (
                            <div
                                key={t.key}
                                title={`${t.label}: ${done}/${total}`}
                                style={{
                                    position: 'relative',
                                    height: 6,
                                    borderRadius: 'var(--radius-pill)',
                                    background: 'var(--border)',
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: `${pctTree}%`,
                                        background:
                                            done === total
                                                ? techGradient('bitcoin')
                                                : isActive
                                                  ? 'var(--bitcoin)'
                                                  : 'var(--border-strong)',
                                    }}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
            <div
                style={{
                    textAlign: 'right',
                    fontSize: 14,
                    color: pct === 100 ? 'var(--success)' : 'var(--muted)',
                    fontWeight: pct === 100 ? 700 : 600,
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                }}
            >
                {pct}%
            </div>
        </div>
    )
}
