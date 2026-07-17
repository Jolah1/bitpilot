/**
 * Skill-tree completion celebration modal.
 *
 * Pops up the moment a learner finishes every lesson in a skill tree. The
 * whole screen dims, the badge swings front-and-center, and confetti drops
 * behind it. Two actions: Save badge (→ ShareBadgeModal) and Continue.
 *
 * Stays open until the learner explicitly dismisses via Continue (or the
 * backdrop / Escape). Intentionally a big interrupt, the moment of
 * earning is the one we want to celebrate hard.
 */
import { useEffect, useRef, useState } from 'react'
import type { Badge } from '../lib/types'
import { TREES } from '../lib/types'
import { useFocusTrap } from '../lib/useFocusTrap'
import { TierBadgeCard, badgeIdFor, rankTitleFor } from './TierBadgeCard'
import { ShareBadgeModal } from './ShareBadgeModal'

const CONFETTI_COLORS = ['#FF5722', '#FFAB91', '#FFCCBC', '#FFFFFF']
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
}

export function BadgeCelebrationModal({
    badge,
    participantId,
    participantName,
    onClose,
}: BadgeCelebrationModalProps) {
    const treeMeta = TREES.find((t) => t.key === badge.tree)
    const label = treeMeta?.label ?? badge.tree
    const [shareOpen, setShareOpen] = useState(false)
    const badgeId = badgeIdFor(participantId, badge.tree)
    const continueBtnRef = useRef<HTMLButtonElement | null>(null)
    const dialogRef = useRef<HTMLDivElement | null>(null)
    // Trap only while no nested modal is open. When the share modal mounts
    // it takes over the trap; nesting two traps would fight over every Tab.
    useFocusTrap(dialogRef, !shareOpen)

    // Make the modal easy to dismiss so the learner can get back to the next
    // mission. Escape closes it; clicking the backdrop closes it; and the
    // Continue button is auto-focused so Enter dismisses too.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !shareOpen) {
                e.preventDefault()
                onClose()
            }
        }
        document.addEventListener('keydown', onKey)
        // Defer focus until after the pop-in animation settles so iOS doesn't
        // scroll the modal off-screen trying to keep the button visible.
        const t = window.setTimeout(() => continueBtnRef.current?.focus(), 300)
        return () => {
            document.removeEventListener('keydown', onKey)
            window.clearTimeout(t)
        }
    }, [onClose, shareOpen])

    // Backdrop click: dismiss. Stop propagation on the inner card so clicks
    // inside the card don't bubble up and close the modal.
    const onBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
    }

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bp-celebrate-title"
            onClick={onBackdropClick}
            style={{
                position: 'fixed',
                inset: 0,
                background:
                    'radial-gradient(ellipse at top, rgba(255,87,34,0.18), rgba(11,18,32,0.92) 55%)',
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
                {/* Explicit close mark. Escape/backdrop/Continue all close
                    too, but a visible × is the affordance people look for. */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close celebration"
                    style={{
                        position: 'absolute',
                        top: -6,
                        right: 0,
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.22)',
                        borderRadius: '50%',
                        width: 34,
                        height: 34,
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: 17,
                        lineHeight: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    ✕
                </button>
                <div
                    id="bp-celebrate-title"
                    style={{
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: '0.32em',
                        color: '#FFAB91',
                        textTransform: 'uppercase',
                    }}
                >
                    Flight path complete
                </div>
                <h1
                    style={{
                        margin: 0,
                        fontSize: 'clamp(22px, 6vw, 32px)',
                        fontWeight: 900,
                        color: '#FFFFFF',
                        letterSpacing: '-0.02em',
                        textAlign: 'center',
                        textShadow: '0 4px 24px rgba(255,87,34,0.45)',
                    }}
                >
                    You earned the {rankTitleFor(badge.tree)} badge
                </h1>

                {/* The badge itself, swings gently. */}
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
                            'drop-shadow(0 24px 48px rgba(0,0,0,0.55)) drop-shadow(0 0 36px rgba(255,87,34,0.30))',
                    }}
                >
                    <TierBadgeCard
                        tree={badge.tree}
                        participantName={participantName}
                        earnedAt={badge.earned_at}
                        badgeId={badgeId}
                        fluid
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
                    You completed every lesson in the {label} flight path ({badge.required} mission{badge.required === 1 ? '' : 's'}).{' '}
                    <strong style={{ color: '#FFFFFF' }}>
                        Save the badge or share it, it's yours.
                    </strong>
                </div>

                {/* Actions */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: 10,
                        width: '100%',
                        maxWidth: 440,
                        marginTop: 4,
                    }}
                >
                    <button
                        className="bp-press"
                        onClick={() => setShareOpen(true)}
                        style={primary()}
                    >
                        Save / share badge
                    </button>
                    <button
                        ref={continueBtnRef}
                        className="bp-press"
                        onClick={onClose}
                        style={ghost()}
                    >
                        Continue
                    </button>
                </div>
                <div
                    style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.55)',
                        textAlign: 'center',
                        marginTop: 2,
                    }}
                >
                    Tap outside, press Esc, or hit Continue to head into your next flight path.
                </div>
            </div>

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

function primary(): React.CSSProperties {
    return {
        background:
            'linear-gradient(180deg, #FFB958 0%, #FF5722 60%, #D84315 100%)',
        color: '#0C1A14',
        border: 'none',
        borderRadius: 10,
        padding: '14px 18px',
        fontWeight: 800,
        fontSize: 14,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.01em',
        boxShadow:
            '0 1px 0 rgba(255,255,255,0.35) inset, 0 8px 24px rgba(255,87,34,0.35)',
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
