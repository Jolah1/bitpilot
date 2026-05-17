import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MISSIONS, MissionPhase } from '../lib/types'
import { MissionLearn } from '../components/MissionLearn'
import { MissionQuiz } from '../components/MissionQuiz'
import { MissionDo } from '../components/MissionDo'
import { api } from '../lib/api'

interface Props {
    participantId: string
}

const TECH_COLORS: Record<string, string> = {
    nostr: '#8B5CF6',
    lightning: '#F7931A',
    ecash: '#00C27B',
    bitcoin: '#F7931A',
}

export function LearnerView({ participantId }: Props) {
    const queryClient = useQueryClient()
    const [activeMission, setActiveMission] = useState(1)
    const [phase, setPhase] = useState<MissionPhase>('learn')

    const { data: participant, isLoading } = useQuery({
        queryKey: ['participant', participantId],
        queryFn: () => api.getParticipant(participantId) as any,
        refetchInterval: 5000,
    })

    const completeMutation = useMutation({
        mutationFn: (mission: number) => api.completeMission(participantId, mission),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['participant', participantId] }),
    })

    if (isLoading || !participant) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--bitcoin)', fontSize: 13, letterSpacing: 2 }}>
                    LOADING...
                </div>
            </div>
        )
    }

    const p = participant as any
    const completedMissions: number[] = p.completed_missions ?? []
    const currentMission = p.current_mission ?? 1
    const satsEarned = p.sats_earned ?? 0
    const progress = (completedMissions.length / 5) * 100
    const mission = MISSIONS[activeMission - 1]

    const handleSelectMission = (id: number) => {
        if (id > currentMission && !completedMissions.includes(id)) return
        setActiveMission(id)
        setPhase(completedMissions.includes(id) ? 'do' : 'learn')
    }

    const handleQuizPass = () => setPhase('do')

    const handleComplete = () => {
        queryClient.invalidateQueries({ queryKey: ['participant', participantId] })
    }

    const handleNext = () => {
        const next = activeMission + 1
        setActiveMission(next)
        setPhase('learn')
        queryClient.invalidateQueries({ queryKey: ['participant', participantId] })
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                background: 'var(--surface)', flexShrink: 0,
            }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: 'var(--bitcoin)', letterSpacing: 2 }}>
                    SATQUEST
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--muted)' }}>
                        MISSION <span style={{ color: 'var(--text)' }}>{Math.min(currentMission, 5)}</span>/5
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'var(--bitcoin-dim)', color: 'var(--bitcoin)',
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700,
                        padding: '6px 14px', borderRadius: 4, border: '1px solid var(--bitcoin-dim)',
                    }}>
                        ⚡ {satsEarned} SATS
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 2, background: 'var(--border)', flexShrink: 0 }}>
                <div style={{ height: '100%', background: 'var(--bitcoin)', width: `${progress}%`, transition: 'width 0.6s ease' }} />
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Sidebar */}
                <div style={{
                    width: 220, borderRight: '1px solid var(--border)',
                    background: 'var(--surface)', padding: '16px 0',
                    overflowY: 'auto', flexShrink: 0,
                }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--muted)', letterSpacing: 2, padding: '0 16px 10px', textTransform: 'uppercase' }}>
                        Missions
                    </div>

                    {MISSIONS.map(m => {
                        const isDone = completedMissions.includes(m.id)
                        const isActive = activeMission === m.id
                        const isLocked = m.id > currentMission && !completedMissions.includes(m.id)

                        return (
                            <div
                                key={m.id}
                                onClick={() => handleSelectMission(m.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 16px', cursor: isLocked ? 'not-allowed' : 'pointer',
                                    borderLeft: `2px solid ${isActive ? 'var(--bitcoin)' : 'transparent'}`,
                                    background: isActive ? 'var(--surface2)' : 'transparent',
                                    opacity: isLocked ? 0.3 : 1,
                                    transition: 'background 0.15s',
                                }}
                            >
                                <div style={{
                                    width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700,
                                    background: isDone ? 'var(--sat-green-dim)' : isActive ? 'var(--bitcoin-dim)' : 'var(--surface2)',
                                    color: isDone ? 'var(--sat-green)' : isActive ? 'var(--bitcoin)' : 'var(--muted)',
                                    border: isActive ? '1px solid var(--bitcoin)' : '1px solid transparent',
                                }}>
                                    {isDone ? '✓' : String(m.id).padStart(2, '0')}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: TECH_COLORS[m.tech], letterSpacing: 1, textTransform: 'uppercase' }}>
                                        {m.tech}
                                    </div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {m.title}
                                    </div>
                                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--sat-green)' }}>
                                        +{m.reward} sats
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Main content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                    {/* Phase tabs */}
                    <div style={{
                        display: 'flex', gap: 2, background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: 4,
                        padding: 3, marginBottom: 20, width: 'fit-content',
                    }}>
                        {(['learn', 'quiz', 'do'] as MissionPhase[]).map((ph, i) => {
                            const labels = ['01 Learn', '02 Quiz', '03 Do']
                            const isActive = phase === ph
                            const isDisabled = ph === 'do' && !completedMissions.includes(activeMission) && phase !== 'do'
                            return (
                                <button
                                    key={ph}
                                    onClick={() => { if (!isDisabled) setPhase(ph) }}
                                    style={{
                                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                                        padding: '6px 14px', borderRadius: 2,
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        color: isActive ? '#000' : 'var(--muted)',
                                        background: isActive ? 'var(--bitcoin)' : 'none',
                                        border: 'none', fontWeight: isActive ? 700 : 400,
                                        opacity: isDisabled ? 0.4 : 1, transition: 'all 0.15s',
                                    }}
                                >
                                    {labels[i]}
                                </button>
                            )
                        })}
                    </div>

                    {/* Mission header */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                            color: 'var(--bitcoin)', background: 'var(--bitcoin-dim)',
                            padding: '4px 10px', borderRadius: 2, marginBottom: 10,
                            letterSpacing: 1, textTransform: 'uppercase',
                        }}>
                            ⚡ {mission.tag}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6, lineHeight: 1.2 }}>
                            {mission.title}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
                            {mission.desc}
                        </div>
                    </div>

                    <div style={{ height: 1, background: 'var(--border)', marginBottom: 20 }} />

                    {phase === 'learn' && <MissionLearn mission={mission} onContinue={() => setPhase('quiz')} />}
                    {phase === 'quiz' && <MissionQuiz mission={mission} onPass={handleQuizPass} />}
                    {phase === 'do' && (
                        <MissionDo
                            mission={mission}
                            participantId={participantId}
                            isCompleted={completedMissions.includes(mission.id)}
                            onComplete={handleComplete}
                            onNext={handleNext}
                            isLast={mission.id === 5}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
