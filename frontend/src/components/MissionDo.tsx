import { useState } from 'react'
import { Mission } from '../lib/types'
import { api } from '../lib/api'

interface Props {
    mission: Mission
    participantId: string
    isCompleted: boolean
    onComplete: () => void
    onNext: () => void
    isLast: boolean
}

export function MissionDo({ mission, participantId, isCompleted, onComplete, onNext, isLast }: Props) {
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<string | null>(null)
    const [showAction, setShowAction] = useState(false)
    const [inputVal, setInputVal] = useState('')
    const [error, setError] = useState<string | null>(null)

    const handleAction = async () => {
        setLoading(true)
        setError(null)
        try {
            if (mission.id === 1) {
                const res = await api.createNostrIdentity(participantId) as any
                setResult(`PUBLIC KEY (npub):\n${res.npub}\n\nSECRET KEY (nsec) — save this now:\n${res.nsec}`)
                setShowAction(true)
            } else if (mission.id === 2) {
                const res = await api.createInvoice(participantId, 100, 'SatQuest Mission 2') as any
                setResult(`BOLT11 INVOICE:\n${res.invoice}`)
                setShowAction(true)
            } else if (mission.id === 3) {
                if (!inputVal || !inputVal.includes('@')) throw new Error('Enter a valid Lightning address (e.g. you@walletofsatoshi.com)')
                await api.payInvoice(participantId, inputVal) as any
                await api.completeMission(participantId, 3)
                onComplete()
            } else if (mission.id === 4) {
                if (!inputVal || inputVal.length < 5) throw new Error('Paste a valid Cashu token')
                await api.completeMission(participantId, 4)
                onComplete()
            } else if (mission.id === 5) {
                if (!inputVal || inputVal.length < 5) throw new Error('Write something first!')
                await api.publishNostrNote(participantId, inputVal, 'mock-nsec') as any
                await api.completeMission(participantId, 5)
                onComplete()
            }
        } catch (e: any) {
            setError(e.message ?? 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const handleConfirm = async () => {
        setLoading(true)
        try {
            await api.completeMission(participantId, mission.id)
            onComplete()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    if (isCompleted) {
        return (
            <div>
                <div style={{
                    background: 'var(--sat-green-dim)', border: '1px solid var(--sat-green)',
                    borderRadius: 6, padding: 20, textAlign: 'center', marginBottom: 16,
                }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sat-green)', marginBottom: 4 }}>
                        Mission complete ⚡
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--sat-green)', opacity: 0.8 }}>
                        +{mission.reward} sats earned
                    </div>
                </div>
                {!isLast ? (
                    <button onClick={onNext} style={btnStyle('var(--bitcoin)', '#000')}>
                        Next mission →
                    </button>
                ) : (
                    <div style={{
                        background: '#0D1A2D', border: '1px solid var(--nostr-purple)',
                        borderRadius: 6, padding: 20, textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--nostr-purple)', marginBottom: 4 }}>
                            🎉 All missions complete!
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--nostr-purple)', opacity: 0.8 }}>
                            You are now a SatQuest graduate
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div>
            {/* Steps */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 14 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'var(--bitcoin)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
                    What you'll do
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mission.doSteps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                            <span style={{
                                fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--bitcoin)',
                                background: 'var(--bitcoin-dim)', width: 20, height: 20, borderRadius: 2,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                            }}>{i + 1}</span>
                            <span>{step}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Input fields for missions that need them */}
            {(mission.id === 3) && (
                <input
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    placeholder="Lightning address (e.g. you@walletofsatoshi.com)"
                    style={inputStyle}
                />
            )}
            {(mission.id === 4) && (
                <input
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    placeholder="Paste Cashu token here (cashu...)"
                    style={inputStyle}
                />
            )}
            {(mission.id === 5) && (
                <textarea
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    placeholder="Write your first Nostr note... e.g. Just completed SatQuest! Learning Bitcoin in Lagos ⚡"
                    style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                />
            )}

            {/* Result box */}
            {result && (
                <div style={{
                    background: '#0D1A0D', border: '1px solid var(--sat-green)',
                    borderRadius: 6, padding: 14, marginBottom: 12,
                }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'var(--sat-green)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                        Result
                    </div>
                    <pre style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--sat-green)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
                        {result}
                    </pre>
                </div>
            )}

            {result && mission.id === 1 && (
                <div style={{ background: '#1A1000', border: '1px solid var(--bitcoin)', borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 12, color: 'var(--bitcoin)', lineHeight: 1.6 }}>
                    ⚠ Your nsec has been shown once. Write it down — it cannot be recovered.
                </div>
            )}

            {error && (
                <div style={{ background: '#1A0000', border: '1px solid var(--danger)', borderRadius: 4, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'var(--danger)' }}>
                    {error}
                </div>
            )}

            {/* Action button */}
            {!showAction ? (
                <button onClick={handleAction} disabled={loading} style={btnStyle('var(--bitcoin)', '#000')}>
                    {loading ? 'Processing...' : mission.actionLabel}
                </button>
            ) : (
                <button onClick={handleConfirm} disabled={loading} style={btnStyle('var(--sat-green)', '#000')}>
                    {loading ? 'Saving...' : `I'm done — complete mission`}
                </button>
            )}
        </div>
    )
}

const btnStyle = (bg: string, color: string): React.CSSProperties => ({
    width: '100%', padding: 14,
    background: bg, color,
    fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700,
    border: 'none', borderRadius: 4, cursor: 'pointer', letterSpacing: 0.5,
    opacity: 1, transition: 'opacity 0.15s',
})

const inputStyle: React.CSSProperties = {
    width: '100%', padding: 12,
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: 4, color: 'var(--text)', fontSize: 13,
    marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace",
    outline: 'none',
}
