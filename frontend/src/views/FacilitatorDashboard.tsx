import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isSoloSessionName } from '../App'
import { BrandMark } from '../components/BrandMark'
import { QRSessionCard } from '../components/QRJoinFlow'
import { MISSION_COUNT, TREES, treeFor, type Participant } from '../lib/types'
import { fetchSessionProgress } from '../lib/api'
import { card, chip, ghostButton, treeColor } from '../lib/ui'

/**
 * A learner who hasn't advanced past their current mission for this long is
 * flagged as needing a hand. Tracked client-side from the 3s poll (the wire
 * Participant carries no timestamp), so it measures time since this dashboard
 * first saw them on that mission — which is exactly what a facilitator wants:
 * "who has been stuck since I've been watching".
 */
const STUCK_MS = 4 * 60 * 1000
const isFinished = (p: Participant) => p.completed_missions.length === MISSION_COUNT

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
    // `null` means "follow the room": show the QR while nobody has joined, hide
    // it once learners arrive. Toggling locks the facilitator's explicit choice.
    const [qrOverride, setQrOverride] = useState<boolean | null>(null)
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

    // Remember when we first saw each learner on their current mission. A ref,
    // not state, so updating it doesn't rerender; the 1s `tick` above drives the
    // re-render that recomputes stuck durations.
    const seenRef = useRef<Map<string, { mission: number; since: number }>>(new Map())
    useEffect(() => {
        const now = Date.now()
        const seen = seenRef.current
        const live = new Set<string>()
        for (const p of participants) {
            live.add(p.id)
            const prev = seen.get(p.id)
            if (!prev || prev.mission !== p.current_mission) {
                seen.set(p.id, { mission: p.current_mission, since: now })
            }
        }
        for (const id of [...seen.keys()]) if (!live.has(id)) seen.delete(id)
    }, [participants])

    // How long a learner has sat on their current mission (0 if finished or
    // just-seen). Reads `tick` implicitly: this runs on every 1s rerender.
    const stuckMsFor = (p: Participant) => {
        if (isFinished(p)) return 0
        const s = seenRef.current.get(p.id)
        return s ? Date.now() - s.since : 0
    }
    const needsHand = participants.filter((p) => stuckMsFor(p) >= STUCK_MS).length

    // Surface the people who need attention: stuck longest first, then whoever
    // has the least progress, with finished learners settling to the bottom.
    const ranked = [...participants].sort((a, b) => {
        const sa = stuckMsFor(a) >= STUCK_MS,
            sb = stuckMsFor(b) >= STUCK_MS
        const ta = isFinished(a) ? 2 : sa ? 0 : 1
        const tb = isFinished(b) ? 2 : sb ? 0 : 1
        if (ta !== tb) return ta - tb
        if (ta === 0) return stuckMsFor(b) - stuckMsFor(a) // longer stuck first
        return a.completed_missions.length - b.completed_missions.length // least done first
    })

    const showQR = qrOverride ?? participants.length === 0
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
                        onClick={() => setQrOverride(!showQR)}
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
                <Stat label="Needs a hand" value={needsHand} alert={needsHand > 0} />
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
                                background: treeColor(t.key),
                            }}
                        />
                        {t.label} ({t.missions.length})
                    </span>
                ))}
            </section>

            {/* Mission distribution — answers "where is everyone right now?" */}
            {participants.length > 0 && <MissionHistogram participants={participants} />}

            {/* Leaderboard — who is furthest along. Facilitator-only surface, so
                it exposes nothing the host cannot already see in the grid below. */}
            {participants.length > 0 && <Leaderboard participants={participants} />}

            {/* Participant rows — a responsive grid so a facilitator scanning a
                room sees many learners at once, not one tall single column. */}
            {participants.length === 0 ? (
                <section
                    aria-label="Participant progress"
                    style={{
                        ...card,
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
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                        Nobody here yet
                    </p>
                    <p style={{ margin: 0, maxWidth: 320, lineHeight: 1.55 }}>
                        The QR code above is live. As learners join you'll see them show
                        up here, one card per learner.
                    </p>
                </section>
            ) : (
                <section
                    aria-label="Participant progress"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: 12,
                    }}
                >
                    {ranked.map((p) => (
                        <ParticipantRow key={p.id} participant={p} stuckMs={stuckMsFor(p)} />
                    ))}
                </section>
            )}
        </main>
    )
}

function Stat({
    label,
    value,
    accent,
    alert,
}: {
    label: string
    value: number | string
    accent?: boolean
    alert?: boolean
}) {
    return (
        <div
            style={{
                ...card,
                padding: '18px 18px 16px',
                borderColor: alert ? 'rgba(251, 191, 36, 0.4)' : undefined,
                background: alert ? 'rgba(251, 191, 36, 0.06)' : undefined,
            }}
        >
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
                    color: accent ? 'transparent' : alert ? '#FBBF24' : 'var(--text)',
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
                                        background: c === 0 ? 'var(--border)' : treeColor(t.key),
                                        borderRadius: 2,
                                        minHeight: 2,
                                        opacity: c === 0 ? 0.5 : 1,
                                        boxShadow:
                                            c === max && c > 0
                                                ? `0 0 0 1.5px ${treeColor(t.key)}`
                                                : undefined,
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

function Leaderboard({ participants }: { participants: Participant[] }) {
    const leaders = [...participants]
        .map((p) => ({ p, done: p.completed_missions.length }))
        .sort((a, b) => b.done - a.done || a.p.name.localeCompare(b.p.name))
        .slice(0, 5)
    // Nothing to rank until at least one learner has cleared a mission.
    if ((leaders[0]?.done ?? 0) === 0) return null
    const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`
    return (
        <section aria-label="Leaderboard" style={{ ...card, padding: 12 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>
                Leaderboard
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaders.map(({ p, done }, i) => {
                    const pct = Math.round((done / MISSION_COUNT) * 100)
                    return (
                        <div
                            key={p.id}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1.75rem minmax(0, 1fr) auto',
                                alignItems: 'center',
                                gap: 10,
                            }}
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    fontSize: i < 3 ? 18 : 12,
                                    fontWeight: 700,
                                    color: 'var(--muted)',
                                    fontFamily: 'var(--font-mono)',
                                    textAlign: 'center',
                                }}
                            >
                                {medal(i)}
                            </span>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {p.name}
                                </span>
                                <div
                                    style={{
                                        height: 5,
                                        borderRadius: 'var(--radius-pill)',
                                        background: 'var(--border)',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            height: '100%',
                                            width: `${pct}%`,
                                            background: 'var(--gradient-bitcoin)',
                                        }}
                                    />
                                </div>
                            </div>
                            <span
                                style={{
                                    fontSize: 12,
                                    color: 'var(--muted)',
                                    fontFamily: 'var(--font-mono)',
                                    fontVariantNumeric: 'tabular-nums',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {done} · {pct}%
                            </span>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function ParticipantRow({ participant, stuckMs }: { participant: Participant; stuckMs: number }) {
    const doneCount = participant.completed_missions.length
    const pct = Math.round((doneCount / MISSION_COUNT) * 100)
    const isDone = pct === 100
    const currentTree = treeFor(participant.current_mission)
    const stuck = stuckMs >= STUCK_MS
    const stuckMins = Math.floor(stuckMs / 60000)
    return (
        <div
            style={{
                ...card,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                padding: '12px 14px',
                borderColor: stuck ? 'rgba(251, 191, 36, 0.45)' : undefined,
                background: stuck ? 'rgba(251, 191, 36, 0.05)' : undefined,
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
                                    boxShadow: isActive
                                        ? `0 0 0 1.5px ${treeColor(t.key)}`
                                        : undefined,
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: `${pctTree}%`,
                                        background: treeColor(t.key),
                                        opacity: done === total ? 1 : isActive ? 1 : 0.7,
                                    }}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 6,
                    flexShrink: 0,
                }}
            >
                <span
                    style={{
                        fontSize: 14,
                        color: isDone ? 'var(--success)' : 'var(--muted)',
                        fontWeight: isDone ? 700 : 600,
                        fontFamily: 'var(--font-mono)',
                    }}
                >
                    {isDone ? '✓ 100%' : `${pct}%`}
                </span>
                {stuck && (
                    <span
                        style={{
                            ...chip('neutral'),
                            background: 'rgba(251, 191, 36, 0.12)',
                            color: '#FBBF24',
                            border: '1px solid rgba(251, 191, 36, 0.35)',
                            whiteSpace: 'nowrap',
                        }}
                        title={`On mission ${participant.current_mission} for about ${stuckMins} min without advancing`}
                    >
                        needs a hand{stuckMins > 0 ? ` · ${stuckMins}m` : ''}
                    </span>
                )}
            </div>
        </div>
    )
}
