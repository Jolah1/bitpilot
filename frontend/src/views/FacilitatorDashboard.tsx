import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Participant } from '../lib/types'

interface Props {
    sessionId: string
}

const MISSION_DOTS = [1, 2, 3, 4, 5]

function MissionDots({ participant }: { participant: Participant }) {
    return (
        <div style={{ display: 'flex', gap: 4 }}>
            {MISSION_DOTS.map(n => {
                const done = participant.completed_missions.includes(n)
                const active = participant.current_mission === n
                return (
                    <div key={n} style={{
                        width: 12, height: 12, borderRadius: '50%',
                        background: done ? 'var(--sat-green)' : active ? '#8B5CF6' : 'var(--surface2)',
                        border: `1px solid ${done ? 'var(--sat-green)' : active ? '#8B5CF6' : 'var(--border)'}`,
                        transition: 'all 0.2s',
                    }} />
                )
            })}
        </div>
    )
}

export function FacilitatorDashboard({ sessionId }: Props) {
    const { data: session } = useQuery({
        queryKey: ['session', sessionId],
        queryFn: () => api.getSession(sessionId) as any,
        refetchInterval: 3000,
    })

    const { data: participants = [] } = useQuery({
        queryKey: ['participants', sessionId],
        queryFn: () => api.listParticipants(sessionId) as any,
        refetchInterval: 3000,
    })

    const ps = participants as Participant[]
    const completedM2 = ps.filter(p => p.completed_missions.includes(2)).length
    const totalSats = ps.reduce((sum, p) => sum + p.sats_earned, 0)

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
                        Facilitator view
                    </div>
                    <h1 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                        Session dashboard
                    </h1>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                        {(session as any)?.session?.name ?? 'Loading...'}
                    </div>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--sat-green-dim)', color: 'var(--sat-green)',
                    padding: '8px 16px', borderRadius: 4,
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
                    border: '1px solid var(--sat-green)',
                }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sat-green)', animation: 'pulse 1.5s infinite' }} />
                    LIVE
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'Participants', value: ps.length, color: 'var(--text)' },
                    { label: 'Completed M2', value: completedM2, color: 'var(--sat-green)' },
                    { label: 'Sats out', value: `⚡ ${totalSats}`, color: 'var(--bitcoin)' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: 16, textAlign: 'center',
                    }}>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 700, color, marginBottom: 4 }}>
                            {value}
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
                            {label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 140px 100px',
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase',
                }}>
                    <span>Participant</span><span>Progress</span><span>Sats</span>
                </div>

                {ps.map((p, i) => (
                    <div key={p.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 140px 100px',
                        padding: '12px 16px', alignItems: 'center',
                        borderBottom: i < ps.length - 1 ? '1px solid var(--border)' : 'none',
                        transition: 'background 0.1s',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 30, height: 30, borderRadius: 4,
                                background: 'var(--nostr-dim)', color: 'var(--nostr-purple)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700,
                                flexShrink: 0,
                            }}>
                                {p.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
                        </div>
                        <MissionDots participant={p} />
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--bitcoin)' }}>
                            {p.sats_earned} sats
                        </span>
                    </div>
                ))}

                {ps.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'var(--muted)' }}>
                        No participants yet — share the session link
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
                <button style={{
                    flex: 1, padding: 14, background: 'transparent',
                    border: '1px solid var(--border2)', borderRadius: 4,
                    color: 'var(--text)', fontFamily: "'Syne', sans-serif",
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                    Share session link
                </button>
                <button style={{
                    flex: 1, padding: 14, background: 'var(--bitcoin)',
                    border: 'none', borderRadius: 4, color: '#000',
                    fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                    + Add participant
                </button>
            </div>
        </div>
    )
}
