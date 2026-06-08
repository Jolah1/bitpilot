/**
 * Tier-completion celebration modal.
 *
 * Pops up the moment a learner crosses a tier boundary. The whole screen
 * dims, the badge swings front-and-center, and confetti drops behind it.
 * Three actions: Claim sats, Save badge (→ ShareBadgeModal), Exit.
 *
 * Stays open until the learner explicitly dismisses via Exit (or the
 * backdrop, if they didn't claim). Intentionally a big interrupt — the
 * moment of earning is the one we want to celebrate hard.
 */
import { useState } from 'react'
import type { Badge, RewardClaim, Tier } from '../lib/types'
import { TIERS } from '../lib/types'
import { TierBadgeCard, badgeIdFor } from './TierBadgeCard'
import { ShareBadgeModal } from './ShareBadgeModal'
import { TierRewardClaimModal } from './TierRewardClaimModal'

const CONFETTI_COLORS = ['#F7931A', '#FFD23F', '#10C57E', '#A78BFA', '#FFFFFF']
const CONFETTI_COUNT = 36

/**
 * Animations are inlined as a single <style> block. They need to be in
 * the DOM (not in a CSS module) because the modal mounts/unmounts dynamically
 * and we don't want a stylesheet round-trip for a one-shot celebration.
 */
const ANIM_STYLE = `
@keyframes bp-badge-swing {
    0%   { transform: rotate(-3.2deg); }
    50%  { transform: rotate(3.2deg); }
    100% { transform: rotate(-3.2deg); }
}
@keyframes bp-confetti-fall {
    0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
    100% { transform: translate3d(0, 110vh, 0) rotate(720deg); opacity: 0.6; }
}
@keyframes bp-modal-pop {
    0%   { transform: scale(0.85); opacity: 0; }
    60%  { transform: scale(1.04); opacity: 1; }
    100% { transform: scale(1);    opacity: 1; }
}
@keyframes bp-glow-pulse {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 0.85; }
}
@media (prefers-reduced-motion: reduce) {
    .bp-celebrate-badge { animation: none !important; }
    .bp-celebrate-confetti { display: none !important; }
}
`

export interface BadgeCelebrationModalProps {
    badge: Badge
    participantId: string
    participantName: string
    onClose: () => void
    onClaimed: (claim: RewardClaim) => void
}

export function BadgeCelebrationModal({
    badge,
    participantId,
    participantName,
    onClose,
    onClaimed,
}: BadgeCelebrationModalProps) {
    const tierMeta = TIERS.find((t) => t.key === badge.tier)
    const label = tierMeta?.label ?? badge.tier
    const [claimOpen, setClaimOpen] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const claim = badge.reward_claim
    const badgeId = badgeIdFor(participantId, badge.tier as Tier)

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bp-celebrate-title"
            // Don't close on backdrop click here. The user must hit Exit
            // explicitly so they don't accidentally lose the claim affordance.
            style={{
                position: 'fixed',
                inset: 0,
                background:
                    'radial-gradient(ellipse at top, rgba(247,147,26,0.18), rgba(0,0,0,0.86) 55%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                zIndex: 1200,
                fontFamily: 'var(--font-sans)',
                overflow: 'auto',
            }}
        >
            <style>{ANIM_STYLE}</style>

            {/* Confetti layer. Render only if the user hasn't enabled
                reduced-motion (handled via @media query above hiding them). */}
            <div
                aria-hidden="true"
                className="bp-celebrate-confetti"
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    overflow: 'hidden',
                }}
            >
                {Array.from({ length: CONFETTI_COUNT }, (_, i) => {
                    const left = (i * 37) % 100
                    const delay = (i % 8) * 0.4
                    const dur = 4.5 + (i % 5) * 0.9
                    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
                    const size = 8 + (i % 4) * 3
                    return (
                        <span
                            key={i}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: `${left}%`,
                                width: size,
                                height: size * 0.4,
                                background: color,
                                borderRadius: 1,
                                animation: `bp-confetti-fall ${dur}s linear ${delay}s infinite`,
                                opacity: 0.85,
                            }}
                        />
                    )
                })}
            </div>

            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 520,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 14,
                    animation: 'bp-modal-pop 0.5s cubic-bezier(0.2, 1.2, 0.4, 1) both',
                }}
            >
                <div
                    id="bp-celebrate-title"
                    style={{
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: '0.32em',
                        color: '#FFD23F',
                        textTransform: 'uppercase',
                    }}
                >
                    Tier complete
                </div>
                <h1
                    style={{
                        margin: 0,
                        fontSize: 'clamp(22px, 6vw, 32px)',
                        fontWeight: 900,
                        color: '#FFFFFF',
                        letterSpacing: '-0.02em',
                        textAlign: 'center',
                        textShadow: '0 4px 24px rgba(247,147,26,0.45)',
                    }}
                >
                    You earned the {label} badge
                </h1>

                {/* The badge itself — swings gently. */}
                <div
                    className="bp-celebrate-badge"
                    style={{
                        width: '100%',
                        maxWidth: 360,
                        aspectRatio: '600 / 800',
                        display: 'flex',
                        animation: 'bp-badge-swing 4.2s ease-in-out infinite',
                        transformOrigin: 'top center',
                        filter:
                            'drop-shadow(0 24px 48px rgba(0,0,0,0.55)) drop-shadow(0 0 36px rgba(247,147,26,0.30))',
                    }}
                >
                    <TierBadgeCard
                        tier={badge.tier}
                        participantName={participantName}
                        earnedAt={badge.earned_at}
                        badgeId={badgeId}
                    />
                </div>

                {/* Sub-line context */}
                <div
                    style={{
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.78)',
                        textAlign: 'center',
                        maxWidth: 380,
                        lineHeight: 1.5,
                    }}
                >
                    You completed all {badge.required} missions in the {label} tier.
                    {claim ? (
                        <>
                            {' '}
                            <strong style={{ color: '#FFFFFF' }}>
                                {claim.amount_sats} sats already claimed.
                            </strong>
                        </>
                    ) : (
                        <>
                            {' '}
                            <strong style={{ color: '#FFFFFF' }}>
                                {badge.reward_sats} sats are waiting for you.
                            </strong>
                        </>
                    )}
                </div>

                {/* Actions */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 10,
                        width: '100%',
                        maxWidth: 440,
                        marginTop: 4,
                    }}
                >
                    {claim ? (
                        <span
                            style={{
                                ...primary(true),
                                background: 'rgba(16, 197, 126, 0.92)',
                                color: '#06120D',
                                cursor: 'default',
                                textAlign: 'center',
                            }}
                            title={`payment_hash: ${claim.payment_hash}`}
                        >
                            ✓ {claim.amount_sats} sats claimed
                        </span>
                    ) : (
                        <button onClick={() => setClaimOpen(true)} style={primary(false)}>
                            Claim {badge.reward_sats} sats
                        </button>
                    )}
                    <button onClick={() => setShareOpen(true)} style={secondary()}>
                        Save badge
                    </button>
                    <button onClick={onClose} style={ghost()}>
                        Exit
                    </button>
                </div>
            </div>

            {claimOpen && (
                <TierRewardClaimModal
                    badge={badge}
                    onClose={() => setClaimOpen(false)}
                    onClaimed={onClaimed}
                />
            )}
            {shareOpen && (
                <ShareBadgeModal
                    badge={badge}
                    participantId={participantId}
                    participantName={participantName}
                    onClose={() => setShareOpen(false)}
                />
            )}
        </div>
    )
}

// ── button styles ────────────────────────────────────────────────────────────

function primary(disabled: boolean): React.CSSProperties {
    return {
        background:
            'linear-gradient(180deg, #FFB958 0%, #F7931A 60%, #E07A0A 100%)',
        color: '#0A0A0B',
        border: 'none',
        borderRadius: 10,
        padding: '14px 18px',
        fontWeight: 800,
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.01em',
        boxShadow:
            '0 1px 0 rgba(255,255,255,0.35) inset, 0 8px 24px rgba(247,147,26,0.35)',
    }
}

function secondary(): React.CSSProperties {
    return {
        background: 'rgba(255,255,255,0.10)',
        color: '#FFFFFF',
        border: '1px solid rgba(255,255,255,0.30)',
        borderRadius: 10,
        padding: '14px 18px',
        fontWeight: 700,
        fontSize: 14,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        backdropFilter: 'blur(6px)',
    }
}

function ghost(): React.CSSProperties {
    return {
        background: 'transparent',
        color: 'rgba(255,255,255,0.78)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 10,
        padding: '14px 18px',
        fontWeight: 600,
        fontSize: 14,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
    }
}
