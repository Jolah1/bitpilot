import { useState } from 'react'
import { Mission } from '../lib/types'

interface Props {
    mission: Mission
    onPass: () => void
}

export function MissionQuiz({ mission, onPass }: Props) {
    const [selected, setSelected] = useState<number | null>(null)
    const [submitted, setSubmitted] = useState(false)

    const isCorrect = selected === mission.quiz.correct
    const letters = ['A', 'B', 'C', 'D']

    const handleSelect = (i: number) => {
        if (submitted) return
        setSelected(i)
    }

    const handleSubmit = () => {
        if (selected === null) return
        setSubmitted(true)
        if (isCorrect) setTimeout(() => onPass(), 1200)
    }

    const handleRetry = () => {
        setSelected(null)
        setSubmitted(false)
    }

    return (
        <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: 6,
            padding: 16,
        }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
                {mission.quiz.q}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mission.quiz.opts.map((opt, i) => {
                    let borderColor = 'var(--border)'
                    let bg = 'var(--surface2)'
                    let color = 'var(--text)'

                    if (submitted) {
                        if (i === mission.quiz.correct) {
                            borderColor = 'var(--sat-green)'; bg = 'var(--sat-green-dim)'; color = 'var(--sat-green)'
                        } else if (i === selected) {
                            borderColor = 'var(--danger)'; bg = '#1A0000'; color = 'var(--danger)'
                        }
                    } else if (selected === i) {
                        borderColor = 'var(--bitcoin)'; bg = 'var(--bitcoin-dim)'
                    }

                    return (
                        <button
                            key={i}
                            onClick={() => handleSelect(i)}
                            disabled={submitted}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px',
                                background: bg, border: `1px solid ${borderColor}`,
                                borderRadius: 4, cursor: submitted ? 'default' : 'pointer',
                                fontSize: 13, color, textAlign: 'left', width: '100%',
                                transition: 'all 0.15s', fontFamily: "'Syne', sans-serif",
                            }}
                        >
                            <span style={{
                                width: 20, height: 20, borderRadius: '50%',
                                border: `1px solid ${borderColor}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                                flexShrink: 0, fontWeight: 700, color,
                            }}>
                                {letters[i]}
                            </span>
                            {opt}
                        </button>
                    )
                })}
            </div>

            {!submitted && (
                <button
                    onClick={handleSubmit}
                    disabled={selected === null}
                    style={{
                        width: '100%', padding: 12, marginTop: 12,
                        background: selected !== null ? 'var(--bitcoin)' : 'var(--surface2)',
                        color: selected !== null ? '#000' : 'var(--muted)',
                        fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700,
                        border: 'none', borderRadius: 4,
                        cursor: selected !== null ? 'pointer' : 'not-allowed',
                    }}
                >
                    Submit answer
                </button>
            )}

            {submitted && (
                <div style={{
                    marginTop: 12, padding: '10px 14px', borderRadius: 4, fontSize: 12, lineHeight: 1.6,
                    background: isCorrect ? 'var(--sat-green-dim)' : '#1A0000',
                    color: isCorrect ? 'var(--sat-green)' : 'var(--danger)',
                    border: `1px solid ${isCorrect ? 'var(--sat-green)' : 'var(--danger)'}`,
                }}>
                    {isCorrect ? '✓ Correct! ' : '✗ Not quite. '}{mission.quiz.explain}
                </div>
            )}

            {submitted && !isCorrect && (
                <button onClick={handleRetry} style={{
                    width: '100%', padding: 12, marginTop: 10,
                    background: 'transparent', color: 'var(--text)',
                    fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600,
                    border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer',
                }}>
                    Try again
                </button>
            )}
        </div>
    )
}
