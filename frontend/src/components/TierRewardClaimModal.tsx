/**
 * Tier-reward claim modal. Lets a learner who just unlocked a tier paste
 * a BOLT11 invoice their wallet generated; the backend pays it (real or
 * simulated, gated by LIGHTNING_REAL_ALLOW_PAYOUTS) and we surface the
 * payment_hash + amount on success. The modal stays open so the learner
 * can read the result; closing it returns control to whatever opened it.
 */
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { TIERS, type Badge, type RewardClaim } from '../lib/types'
import { useFocusTrap } from '../lib/useFocusTrap'
import {
    callout,
    chip,
    ghostButton,
    inputMono,
    label as labelStyle,
    primaryButton,
} from '../lib/ui'

export function TierRewardClaimModal({
    badge,
    onClose,
    onClaimed,
}: {
    badge: Badge
    onClose: () => void
    onClaimed: (claim: RewardClaim) => void
}) {
    const tierMeta = TIERS.find((t) => t.key === badge.tier)
    const label = tierMeta?.label ?? badge.tier
    const [invoice, setInvoice] = useState('')
    const [claiming, setClaiming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [localClaim, setLocalClaim] = useState<RewardClaim | null>(null)
    const claim = localClaim ?? badge.reward_claim
    const dialogRef = useRef<HTMLDivElement | null>(null)
    useFocusTrap(dialogRef, true)

    // Escape closes the modal — but only when we're not mid-claim, so the
    // learner can't accidentally cancel a payout that's already in flight.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !claiming) onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose, claiming])

    const submitClaim = async () => {
        if (!invoice.trim()) {
            setError('Paste a Lightning invoice from your wallet first.')
            return
        }
        setClaiming(true)
        setError(null)
        try {
            const r = await api.claimTierReward(badge.tier, invoice.trim())
            const c: RewardClaim = {
                amount_sats: r.amount_sats,
                payment_hash: r.payment_hash,
                simulated: r.simulated,
                paid_at: r.paid_at,
            }
            setLocalClaim(c)
            onClaimed(c)
        } catch (e) {
            setError(
                e instanceof ApiError
                    ? e.message
                    : "Couldn't claim the reward. Try again in a moment.",
            )
        } finally {
            setClaiming(false)
        }
    }

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tier-reward-title"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                zIndex: 1250,
                fontFamily: 'var(--font-sans)',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 440,
                    borderRadius: 'var(--radius-3)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div
                    style={{
                        padding: '18px 22px',
                        background: 'var(--gradient-bitcoin)',
                        color: '#0A0A0B',
                    }}
                >
                    <div
                        id="tier-reward-title"
                        style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}
                    >
                        Claim your {label} reward
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                        {badge.reward_sats} sats — paid to a Lightning invoice you choose.
                    </div>
                </div>

                <div
                    style={{
                        padding: '18px 22px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        overflowY: 'auto',
                    }}
                >
                    {claim ? (
                        <div
                            style={{
                                ...callout('success'),
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                            }}
                        >
                            <div style={{ fontWeight: 700, fontSize: 14 }}>
                                ✓ {claim.amount_sats} sats sent
                                {claim.simulated && (
                                    <span
                                        style={{
                                            ...chip('neutral'),
                                            fontSize: 9,
                                            marginLeft: 8,
                                        }}
                                    >
                                        Simulated
                                    </span>
                                )}
                            </div>
                            <div
                                style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 10,
                                    color: 'var(--muted)',
                                    wordBreak: 'break-all',
                                }}
                            >
                                payment_hash: {claim.payment_hash}
                            </div>
                            {claim.simulated && (
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                    Real payouts are off in this environment. The badge is
                                    yours; sats will land once the facilitator enables
                                    real Lightning payouts.
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div
                                style={{
                                    fontSize: 13,
                                    color: 'var(--text)',
                                    lineHeight: 1.5,
                                }}
                            >
                                Open your Lightning wallet, create an invoice for exactly{' '}
                                <strong>{badge.reward_sats} sats</strong>, and paste it
                                below.
                            </div>
                            <details
                                style={{
                                    fontSize: 12,
                                    color: 'var(--muted)',
                                    background: 'var(--bg)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-2)',
                                    padding: '8px 12px',
                                }}
                            >
                                <summary
                                    style={{
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontWeight: 600,
                                    }}
                                >
                                    Don't have a Lightning wallet?
                                </summary>
                                <div style={{ marginTop: 8, lineHeight: 1.6 }}>
                                    Any of these work (free, no signup):
                                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                                        <li>
                                            <a
                                                href="https://walletofsatoshi.com"
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ color: 'var(--bitcoin)' }}
                                            >
                                                Wallet of Satoshi
                                            </a>
                                            {' '}— easiest, custodial
                                        </li>
                                        <li>
                                            <a
                                                href="https://phoenix.acinq.co"
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ color: 'var(--bitcoin)' }}
                                            >
                                                Phoenix
                                            </a>
                                            {' '}— self-custodial
                                        </li>
                                        <li>
                                            <a
                                                href="https://getalby.com"
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ color: 'var(--bitcoin)' }}
                                            >
                                                Alby
                                            </a>
                                            {' '}— browser-based
                                        </li>
                                    </ul>
                                    <div style={{ marginTop: 8 }}>
                                        In your wallet, tap <strong>Receive</strong>, set the
                                        amount to <strong>{badge.reward_sats} sats</strong>,
                                        and copy the long string starting with{' '}
                                        <code style={{ fontFamily: 'var(--font-mono)' }}>
                                            lnbc…
                                        </code>
                                        . Paste it here.
                                    </div>
                                </div>
                            </details>
                            <label style={{ ...labelStyle, fontSize: 10 }}>
                                BOLT11 invoice
                            </label>
                            <textarea
                                value={invoice}
                                onChange={(e) => {
                                    setInvoice(e.target.value)
                                    if (error) setError(null)
                                }}
                                placeholder="lnbc..."
                                rows={3}
                                spellCheck={false}
                                disabled={claiming}
                                style={{
                                    ...inputMono,
                                    resize: 'vertical',
                                    minHeight: 72,
                                }}
                            />
                            {error && (
                                <div
                                    role="alert"
                                    style={{ ...callout('danger'), fontSize: 12 }}
                                >
                                    {error}
                                </div>
                            )}
                            <button
                                className="bp-press"
                                onClick={submitClaim}
                                disabled={claiming || !invoice.trim()}
                                style={primaryButton(claiming || !invoice.trim())}
                            >
                                {claiming ? 'Paying…' : `Claim ${badge.reward_sats} sats`}
                            </button>
                        </>
                    )}

                    <button onClick={onClose} style={{ ...ghostButton, marginTop: 4 }}>
                        {claim ? 'Close' : 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    )
}
