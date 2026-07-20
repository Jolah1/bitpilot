/**
 * Solo learner achievement + progress dashboard.
 *
 * Replaces the FacilitatorDashboard for solo learners, the multi-participant
 * table layout doesn't make sense when there's only one person in the
 * session. This view focuses on the individual: total missions completed,
 * skill trees earned, current target, and clickable tree badges that open
 * the share modal.
 */
import { useEffect, useState } from 'react'
import { TierProgressionMark } from '../components/TierProgressionMark'
import { api } from '../lib/api'
import { rich } from '../lib/rich'
import { journeyById, journeyProgress } from '../lib/journeys'
import {
    MISSIONS,
    MISSION_COUNT,
    TREES,
    treeFor,
    type Badge,
    type Participant,
} from '../lib/types'
import { card, chip, primaryButton, treeColor } from '../lib/ui'
import { ShareBadgeModal } from '../components/ShareBadgeModal'

export default function SoloProgressView({
    participantId,
    onResume,
}: {
    participantId: string
    /** Jump back to the mission flow (the learner view) from "Up next". */
    onResume?: () => void
}) {
    const [participant, setParticipant] = useState<Participant | null>(null)
    const [badges, setBadges] = useState<Badge[]>([])
    const [loading, setLoading] = useState(true)
    const [sharing, setSharing] = useState<Badge | null>(null)
    const [showLibrary, setShowLibrary] = useState(false)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [p, b] = await Promise.all([api.getParticipant(), api.getMyBadges()])
                if (cancelled) return
                setParticipant(p)
                setBadges(b)
            } catch {
                // Keep the empty state, the network error will show in
                // LearnerView too, no need to duplicate it here.
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [participantId])

    const completed = participant?.completed_missions ?? []
    const earnedBadges = badges.filter((b) => b.earned).length
    const currentMission = participant?.current_mission ?? 0
    const currentTree = treeFor(currentMission)
    const pctComplete = Math.round((completed.length / MISSION_COUNT) * 100)
    // Server truth for the run length; "banked today" compares the credited
    // UTC day to the browser's UTC day so the label can invite one more
    // mission when today's isn't done yet.
    const streak = participant?.streak_count ?? 0
    const streakBankedToday =
        streak > 0 && participant?.streak_day === Math.floor(Date.now() / 86_400_000)
    const currentMissionDef = MISSIONS[Math.min(currentMission, MISSION_COUNT - 1)]
    const journey = journeyById(participant?.journey_id ?? null)
    const progress = journey ? journeyProgress(journey, completed) : null
    const capabilities = journey?.capabilities ?? []

    return (
        <main
            id="solo-main"
            aria-label="Your progress"
            style={{
                padding: 'clamp(0.75rem, 3vw, 1.5rem)',
                maxWidth: 960,
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                fontFamily: 'var(--font-sans)',
            }}
        >
            <header style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span
                    aria-hidden="true"
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: 'var(--radius-3)',
                        background: 'var(--gradient-bitcoin)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        color: '#0A0A0B',
                        fontWeight: 800,
                        flexShrink: 0,
                    }}
                >
                    {participant?.name?.charAt(0).toUpperCase() ?? '⚡'}
                </span>
                <div style={{ minWidth: 0 }}>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: 'clamp(20px, 4.5vw, 26px)',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {loading
                            ? 'Loading your progress…'
                            : participant?.name
                              ? `${participant.name}'s progress`
                              : 'Your progress'}
                    </h1>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {journey ? journey.title : 'Complete mission library'}
                    </span>
                </div>
            </header>

            {journey && progress && (
                <section aria-label="Practical outcome" style={{ ...card, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{journey.audience}</div>
                            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
                                {participant?.guidance === 'self-directed' ? 'Checklist' : 'Step-by-step guidance'}
                                {' · '}{participant?.session_minutes} min sessions
                                {' · '}{participant?.practice_mode === 'test-network' ? 'Test network' : 'Simulation'}
                            </div>
                            <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{journey.outcome}</h2>
                        </div>
                        <span style={{ ...chip(progress.complete ? 'green' : 'orange'), alignSelf: 'flex-start' }}>
                            {progress.complete ? '✓ Ready to use' : `${progress.done}/${progress.total} steps`}
                        </span>
                    </div>
                    <div style={{ marginTop: 14, height: 9, borderRadius: 'var(--radius-pill)', overflow: 'hidden', background: 'var(--border)' }}>
                        <div style={{ height: '100%', width: `${progress.percent}%`, background: 'var(--gradient-bitcoin)' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 14 }}>
                        {capabilities.map((capability) => {
                            const ready = completed.includes(capability.mission)
                            return (
                                <div key={capability.mission} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-2)' }}>
                                    <span aria-hidden="true">{ready ? '✅' : '○'}</span>{' '}
                                    <span style={{ fontSize: 13, color: ready ? 'var(--text)' : 'var(--muted)' }}>
                                        {capability.label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                    {onResume && !progress.complete && (
                        <button className="bp-press" onClick={onResume} style={{ ...primaryButton(), marginTop: 14, minHeight: 44 }}>
                            Continue toward this outcome
                        </button>
                    )}
                </section>
            )}

            {!journey && (
                <section aria-label="Headline stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                    <Stat label="Missions" value={`${completed.length}/${MISSION_COUNT}`} />
                    <Stat label="Flight paths earned" value={`${earnedBadges}/${TREES.length}`} accent={earnedBadges > 0} />
                    <Stat label="Complete" value={`${pctComplete}%`} />
                    <Stat label={streakBankedToday ? 'Day streak · done today' : 'Day streak'} value={`${streak > 0 ? '🔥 ' : ''}${streak}`} accent={streak > 0} />
                </section>
            )}

            <button
                type="button"
                onClick={() => setShowLibrary((value) => !value)}
                aria-expanded={showLibrary}
                style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-2)', color: 'var(--text)', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
                {showLibrary ? 'Hide complete mission-library progress' : 'Show complete mission-library progress'}
            </button>

            {/* Tree progress bars */}
            {showLibrary && <section aria-label="Flight path progress" style={{ ...card, padding: 16 }}>
                <h2
                    style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        marginBottom: 12,
                    }}
                >
                    Flight path progress
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {TREES.map((t) => {
                        const total = t.missions.length
                        const done = completed.filter((m) => t.missions.includes(m)).length
                        const isActive = t.key === currentTree.key
                        const pct = total === 0 ? 0 : (done / total) * 100
                        return (
                            <div key={t.key}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'baseline',
                                        marginBottom: 4,
                                        fontSize: 12,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            color:
                                                done === total || isActive
                                                    ? treeColor(t.key)
                                                    : 'var(--text)',
                                        }}
                                    >
                                        {t.label}
                                    </span>
                                    <span
                                        style={{
                                            color:
                                                done === total ? 'var(--success)' : 'var(--muted)',
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 11,
                                        }}
                                    >
                                        {done === total ? '✓ ' : ''}
                                        {done}/{total}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        position: 'relative',
                                        height: 8,
                                        borderRadius: 'var(--radius-pill)',
                                        background: 'var(--border)',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: `${pct}%`,
                                            background: treeColor(t.key),
                                            opacity: done === total || isActive ? 1 : 0.55,
                                            transition: 'width 0.3s ease',
                                        }}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>}

            {/* Badge gallery */}
            {showLibrary && <section aria-label="Flight path badges" style={{ ...card, padding: 16 }}>
                <h2
                    style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        marginBottom: 4,
                    }}
                >
                    Badges
                </h2>
                <p
                    style={{
                        margin: 0,
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginBottom: 14,
                    }}
                >
                    {earnedBadges === 0
                        ? `Finish every lesson in a flight path to unlock its medallion. ${TREES[0].label} is ${TREES[0].missions.length} missions.`
                        : 'Tap an earned badge to download or share it.'}
                </p>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 12,
                    }}
                >
                    {(badges.length > 0 ? badges : skeletonBadges()).map((b) => {
                        const treeMeta = TREES.find((t) => t.key === b.tree)
                        const treeLabel = treeMeta?.label ?? b.tree
                        const interactive = b.earned
                        return (
                            <button
                                key={b.tree}
                                type="button"
                                disabled={!interactive}
                                className={interactive ? 'bp-tile' : undefined}
                                onClick={interactive ? () => setSharing(b) : undefined}
                                aria-label={
                                    interactive
                                        ? `Share ${treeLabel} badge`
                                        : `${treeLabel} badge locked, ${b.completed} of ${b.required} missions complete`
                                }
                                style={{
                                    background: b.earned
                                        ? 'rgba(255, 87, 34, 0.08)'
                                        : 'transparent',
                                    border: b.earned
                                        ? '1px solid rgba(255, 87, 34, 0.35)'
                                        : '1px dashed var(--border)',
                                    borderRadius: 'var(--radius-2)',
                                    padding: 14,
                                    cursor: interactive ? 'pointer' : 'default',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 8,
                                    opacity: b.earned ? 1 : 0.55,
                                    color: 'inherit',
                                    fontFamily: 'inherit',
                                }}
                            >
                                <TierProgressionMark earned={b.earned} size={44} />
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 800,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase',
                                        color: b.earned ? 'var(--bitcoin)' : 'var(--muted)',
                                    }}
                                >
                                    {treeLabel}
                                </span>
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--muted)',
                                        fontFamily: 'var(--font-mono)',
                                    }}
                                >
                                    {b.completed}/{b.required}
                                </span>
                                {b.earned && (
                                    <span style={{ ...chip('orange'), fontSize: 9 }}>
                                        Earned
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </section>}

            {/* Current mission pointer */}
            {!loading &&
                (completed.length >= MISSION_COUNT ? (
                    <section style={{ ...card, padding: 16 }}>
                        <h2
                            style={{
                                margin: 0,
                                fontSize: 13,
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                marginBottom: 4,
                            }}
                        >
                            All done
                        </h2>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
                            You have completed every mission on BitPilot. 🎉
                        </p>
                    </section>
                ) : (
                    <section style={{ ...card, padding: 16 }}>
                        <h2
                            style={{
                                margin: 0,
                                fontSize: 13,
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                marginBottom: 4,
                            }}
                        >
                            Up next
                        </h2>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
                            Mission #{currentMissionDef.id} · {currentMissionDef.name}
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                            {rich(currentMissionDef.tagline)}
                        </p>
                        {onResume && (
                            <button
                                className="bp-press"
                                onClick={onResume}
                                style={{
                                    ...primaryButton(),
                                    marginTop: 14,
                                    padding: '10px 18px',
                                    fontSize: 14,
                                    minHeight: 44,
                                }}
                            >
                                Continue your missions
                            </button>
                        )}
                    </section>
                ))}

            {sharing && (
                <ShareBadgeModal
                    badge={sharing}
                    participantId={participantId}
                    participantName={participant?.name ?? ''}
                    onClose={() => setSharing(null)}
                />
            )}
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
                    // Display-size numeric: scales from phone to desktop.
                    // The big number is the "wow", the label is supporting.
                    fontSize: 'clamp(30px, 7vw, 44px)',
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

/** Placeholder cards while badges load, so the grid doesn't pop into existence. */
function skeletonBadges(): Badge[] {
    return TREES.map((t) => ({
        tree: t.key,
        completed: 0,
        required: t.missions.length,
        earned: false,
        earned_at: null,
    }))
}
