/**
 * Solo learner achievement + progress dashboard.
 *
 * Replaces the FacilitatorDashboard for solo learners — the multi-participant
 * table layout doesn't make sense when there's only one person in the
 * session. This view focuses on the individual: total missions completed,
 * tiers earned, current target, and clickable tier badges that open the
 * share modal.
 */
import { useEffect, useState } from 'react'
import { TierProgressionMark } from '../components/TierProgressionMark'
import { api } from '../lib/api'
import {
    MISSIONS,
    MISSION_COUNT,
    TIERS,
    tierFor,
    type Badge,
    type Participant,
} from '../lib/types'
import { card, chip } from '../lib/ui'
import { ShareBadgeModal } from '../components/ShareBadgeModal'

export default function SoloProgressView({ participantId }: { participantId: string }) {
    const [participant, setParticipant] = useState<Participant | null>(null)
    const [badges, setBadges] = useState<Badge[]>([])
    const [loading, setLoading] = useState(true)
    const [sharing, setSharing] = useState<Badge | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [p, b] = await Promise.all([api.getParticipant(), api.getMyBadges()])
                if (cancelled) return
                setParticipant(p)
                setBadges(b)
            } catch {
                // Keep the empty state — the network error will show in
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
    const currentTier = tierFor(currentMission)
    const currentMissionDef = MISSIONS[Math.min(currentMission, MISSION_COUNT - 1)]

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
                        Solo run · {completed.length}/{MISSION_COUNT} missions complete
                    </span>
                </div>
            </header>

            {/* Stat row */}
            <section
                aria-label="Headline stats"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12,
                }}
            >
                <Stat label="Missions" value={`${completed.length}/${MISSION_COUNT}`} />
                <Stat
                    label="Tiers earned"
                    value={`${earnedBadges}/${TIERS.length}`}
                    accent={earnedBadges > 0}
                />
                <Stat label="Current tier" value={currentTier.label} />
            </section>

            {/* Tier progress bars */}
            <section aria-label="Tier progress" style={{ ...card, padding: 16 }}>
                <h2
                    style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        marginBottom: 12,
                    }}
                >
                    Tier progress
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {TIERS.map((t) => {
                        const [lo, hi] = t.range
                        const total = hi - lo + 1
                        const done = completed.filter((m) => m >= lo && m <= hi).length
                        const isActive = currentMission >= lo && currentMission <= hi
                        const pct = (done / total) * 100
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
                                            color: isActive
                                                ? 'var(--bitcoin)'
                                                : done === total
                                                  ? 'var(--success)'
                                                  : 'var(--text)',
                                        }}
                                    >
                                        {t.label}
                                    </span>
                                    <span
                                        style={{
                                            color: 'var(--muted)',
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 11,
                                        }}
                                    >
                                        {done}/{total} · M{lo}–M{hi}
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
                                            background:
                                                done === total
                                                    ? 'var(--success)'
                                                    : isActive
                                                      ? 'var(--gradient-bitcoin)'
                                                      : 'var(--border-strong)',
                                            transition: 'width 0.3s ease',
                                        }}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>

            {/* Badge gallery */}
            <section aria-label="Tier badges" style={{ ...card, padding: 16 }}>
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
                        ? `Finish your first ${TIERS[0].range[1] + 1} missions to unlock the ${TIERS[0].label} medallion.`
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
                        const tierMeta = TIERS.find((t) => t.key === b.tier)
                        const tierLabel = tierMeta?.label ?? b.tier
                        const interactive = b.earned
                        return (
                            <button
                                key={b.tier}
                                type="button"
                                disabled={!interactive}
                                className={interactive ? 'bp-tile' : undefined}
                                onClick={interactive ? () => setSharing(b) : undefined}
                                aria-label={
                                    interactive
                                        ? `Share ${tierLabel} badge`
                                        : `${tierLabel} badge locked, ${b.completed} of ${b.required} missions complete`
                                }
                                style={{
                                    background: b.earned
                                        ? 'rgba(247, 147, 26, 0.08)'
                                        : 'transparent',
                                    border: b.earned
                                        ? '1px solid rgba(247, 147, 26, 0.35)'
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
                                <TierProgressionMark tier={b.tier} earned={b.earned} size={44} />
                                <span
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 800,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase',
                                        color: b.earned ? 'var(--bitcoin)' : 'var(--muted)',
                                    }}
                                >
                                    {tierLabel}
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
            </section>

            {/* Current mission pointer */}
            {!loading && (
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
                    <p
                        style={{
                            margin: 0,
                            fontSize: 14,
                            color: 'var(--text)',
                            lineHeight: 1.5,
                        }}
                    >
                        Mission #{currentMissionDef.id} · {currentMissionDef.name}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                        {currentMissionDef.tagline}
                    </p>
                </section>
            )}

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
                    // The big number is the "wow" — the label is supporting.
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
    return TIERS.map((t) => ({
        tier: t.key,
        completed: 0,
        required: t.range[1] - t.range[0] + 1,
        earned: false,
        earned_at: null,
        reward_sats: t.reward,
        reward_claim: null,
    }))
}
