import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type PairingCode } from '../lib/api'
import { card, ghostButton, primaryButton } from '../lib/ui'

/**
 * Device A side of "continue on another device". Mints a one-time pairing
 * code and shows it, formatted and with a live countdown. Redeeming it on the
 * other device signs this one out (a deliberate handoff), which we state
 * plainly. Progress moves; the Nostr keys stay on this device, so we say so.
 */
export function ContinueOnDeviceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [pairing, setPairing] = useState<PairingCode | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [remaining, setRemaining] = useState(0)

    const mint = useCallback(async () => {
        setLoading(true)
        setError('')
        setPairing(null)
        try {
            setPairing(await api.createPairingCode())
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not create a code. Try again.')
        }
        setLoading(false)
    }, [])

    // Mint a fresh code each time the modal opens.
    useEffect(() => {
        if (open) mint()
    }, [open, mint])

    // Live countdown to expiry.
    useEffect(() => {
        if (!pairing) return
        const tick = () => setRemaining(Math.max(0, pairing.expires_at * 1000 - Date.now()))
        tick()
        const t = setInterval(tick, 1000)
        return () => clearInterval(t)
    }, [pairing])

    // Close on Escape.
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null

    const expired = pairing !== null && remaining <= 0
    const mins = Math.floor(remaining / 60000)
    const secs = Math.floor((remaining % 60000) / 1000)
    const formatted = pairing ? `${pairing.code.slice(0, 4)}-${pairing.code.slice(4)}` : ''

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Continue on another device"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 200,
                background: 'rgba(4, 8, 18, 0.72)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    ...card,
                    width: '100%',
                    maxWidth: 380,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                }}
            >
                <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                        Continue on another device
                    </h2>
                    <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                        On the other device, open BitPilot, choose{' '}
                        <strong style={{ color: 'var(--text)' }}>Continue with a code</strong>, and enter this:
                    </p>
                </div>

                {loading && (
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
                        Creating a code…
                    </p>
                )}

                {error && (
                    <div
                        role="alert"
                        style={{
                            background: 'rgba(248, 113, 113, 0.08)',
                            border: '1px solid rgba(248, 113, 113, 0.3)',
                            borderRadius: 'var(--radius-2)',
                            padding: '10px 14px',
                            fontSize: 13,
                            color: 'var(--danger)',
                            lineHeight: 1.5,
                        }}
                    >
                        {error}
                    </div>
                )}

                {pairing && (
                    <>
                        <div
                            style={{
                                textAlign: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 34,
                                fontWeight: 800,
                                letterSpacing: '0.12em',
                                padding: '16px 8px',
                                borderRadius: 'var(--radius-2)',
                                background: 'var(--surface2)',
                                border: '1px solid var(--border)',
                                color: expired ? 'var(--muted)' : 'var(--bitcoin)',
                                userSelect: 'all',
                                textDecoration: expired ? 'line-through' : 'none',
                            }}
                        >
                            {formatted}
                        </div>
                        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>
                            {expired
                                ? 'This code has expired.'
                                : `Expires in ${mins}:${String(secs).padStart(2, '0')}`}
                        </p>
                    </>
                )}

                <div
                    style={{
                        fontSize: 12.5,
                        color: 'var(--muted)',
                        lineHeight: 1.55,
                        background: 'rgba(255, 87, 34, 0.06)',
                        border: '1px solid rgba(255, 87, 34, 0.28)',
                        borderRadius: 'var(--radius-2)',
                        padding: '10px 12px',
                    }}
                >
                    Once the code is used, <strong style={{ color: 'var(--text)' }}>this device signs out</strong>.
                    Your progress moves with you. Your Nostr keys stay on this device, so a later mission may ask you
                    to re-enter your seed phrase.
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    {expired && (
                        <button
                            onClick={mint}
                            className="bp-press"
                            style={{ ...primaryButton(loading), flex: 1, minHeight: 44 }}
                            disabled={loading}
                        >
                            Get a new code
                        </button>
                    )}
                    <button onClick={onClose} style={{ ...ghostButton, flex: 1, minHeight: 44 }}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}
