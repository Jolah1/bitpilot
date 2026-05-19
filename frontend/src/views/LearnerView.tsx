import { useEffect, useRef, useState, Fragment, type CSSProperties } from 'react'
import { api, ApiError } from '../lib/api'
import { useIsTechReal } from '../lib/runtime'
import { MISSIONS, MISSION_COUNT, type MissionDef } from '../lib/types'
import {
    callout,
    card,
    chip,
    ghostButton,
    input,
    inputMono,
    label as labelStyle,
    primaryButton,
    techGradient,
    techTone,
} from '../lib/ui'

type Phase = 'learn' | 'quiz' | 'do'

interface DoOutcome {
    summary: string
    /** Optional structured details printed in a mono block. */
    details?: { label: string; value: string }[]
    /** Display "Simulated" badge in the result block? */
    simulated: boolean
}

/**
 * The learner experience. One mission at a time, three phases per mission
 * (Learn → Quiz → Do). Progress is local state — the backend only stores
 * `completed_missions` and `current_mission` for the participant.
 *
 * Accessibility notes:
 *   - phase tabs are real <button>s with aria-current, not divs
 *   - quiz options are <button>s with aria-pressed and disabled correctly
 *   - results blocks are aria-live="polite" so screen readers announce them
 *   - focus is moved to the result heading when a quiz/do step resolves
 */
export default function LearnerView({ participantId }: { participantId: string }) {
    const [missionIdx, setMissionIdx] = useState(0)
    const [phase, setPhase] = useState<Phase>('learn')

    const [selected, setSelected] = useState<number | null>(null)
    const [quizResult, setQuizResult] = useState<'correct' | 'wrong' | null>(null)

    const [doInput, setDoInput] = useState('')
    const [doOutcome, setDoOutcome] = useState<DoOutcome | null>(null)
    const [doError, setDoError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const [completedMissions, setCompletedMissions] = useState<number[]>([])
    /** nsec generated in mission 3, reused by mission 10's publish step. */
    const [storedNsec, setStoredNsec] = useState<string | null>(null)

    const mission: MissionDef = MISSIONS[missionIdx]
    const isLast = missionIdx === MISSION_COUNT - 1
    const allDone = completedMissions.length === MISSION_COUNT
    const tone = techTone(mission.tech)

    // Move focus to the live result region whenever it appears.
    const resultRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        if (doOutcome && resultRef.current) {
            resultRef.current.focus()
        }
    }, [doOutcome])

    const resetForNext = () => {
        setPhase('learn')
        setSelected(null)
        setQuizResult(null)
        setDoInput('')
        setDoOutcome(null)
        setDoError(null)
    }

    const goNextMission = () => {
        setCompletedMissions((prev) => [...new Set([...prev, missionIdx])])
        if (missionIdx < MISSION_COUNT - 1) {
            setMissionIdx(missionIdx + 1)
            resetForNext()
        }
    }

    const handleQuizSubmit = () => {
        if (selected === null) return
        const correct = mission.quiz.options[selected].correct
        setQuizResult(correct ? 'correct' : 'wrong')
        if (correct) {
            // Slight delay so the user can register the green flash.
            setTimeout(() => setPhase('do'), 700)
        }
    }

    const handleDo = async () => {
        setLoading(true)
        setDoError(null)
        try {
            let outcome: DoOutcome

            switch (mission.do.kind) {
                case 'knowledge': {
                    outcome = {
                        summary: 'Knowledge unlocked.',
                        simulated: false,
                    }
                    break
                }
                case 'nostr-identity': {
                    const r = await api.createNostrIdentity(participantId)
                    setStoredNsec(r.nsec)
                    outcome = {
                        summary: 'Your real Nostr keypair is ready.',
                        details: [
                            { label: 'npub (share)', value: r.npub },
                            { label: 'nsec (NEVER share)', value: r.nsec },
                            { label: 'warning', value: r.warning },
                        ],
                        simulated: r.simulated,
                    }
                    break
                }
                case 'invoice': {
                    const r = await api.createInvoice(participantId, 100, 'BitPilot mission')
                    outcome = {
                        summary: `Invoice for ${r.amount_sats} sats created.`,
                        details: [{ label: 'invoice', value: r.invoice }],
                        simulated: r.simulated,
                    }
                    break
                }
                case 'pay': {
                    if (!doInput.trim()) {
                        setDoError('Type a Lightning address first.')
                        setLoading(false)
                        return
                    }
                    const r = await api.payInvoice(participantId, doInput.trim())
                    outcome = {
                        summary: '50 sats sent.',
                        details: [
                            { label: 'to', value: doInput.trim() },
                            { label: 'payment_hash', value: r.payment_hash },
                        ],
                        simulated: r.simulated,
                    }
                    break
                }
                case 'ecash-claim': {
                    const r = await api.mintEcash(participantId, 50)
                    outcome = {
                        summary: `Token minted — ${r.amount_sats} sats inside.`,
                        details: [{ label: 'token', value: r.token }],
                        simulated: r.simulated,
                    }
                    break
                }
                case 'ecash-spend': {
                    if (!doInput.trim()) {
                        setDoError('Paste a token (starts with cashuA).')
                        setLoading(false)
                        return
                    }
                    const r = await api.redeemEcash(participantId, doInput.trim())
                    outcome = {
                        summary: `Token redeemed for ${r.amount_sats} sats.`,
                        details: [{ label: 'status', value: r.status }],
                        simulated: r.simulated,
                    }
                    break
                }
                case 'nostr-publish': {
                    if (!doInput.trim()) {
                        setDoError("Your note can't be empty.")
                        setLoading(false)
                        return
                    }
                    if (!storedNsec) {
                        setDoError('Generate your Nostr identity first (mission 3).')
                        setLoading(false)
                        return
                    }
                    const r = await api.publishNostrNote(participantId, doInput.trim(), storedNsec)
                    outcome = {
                        summary: 'Note signed and broadcast to public Nostr relays.',
                        details: [
                            { label: 'event_id', value: r.event_id },
                            { label: 'relays', value: r.relays.join(', ') },
                        ],
                        simulated: r.simulated,
                    }
                    break
                }
            }

            // Only credit the mission after the action succeeded.
            await api.completeMission(participantId, mission.id)
            setDoOutcome(outcome)
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Unknown error'
            setDoError(msg)
        }
        setLoading(false)
    }

    // ── Final celebration screen ──
    if (allDone && isLast && doOutcome) {
        return <FinishedScreen />
    }

    return (
        <main
            id="learner-main"
            style={{ padding: '1.5rem 1rem 4rem', maxWidth: 720, margin: '0 auto' }}
            aria-label={`Mission ${mission.id} of ${MISSION_COUNT}: ${mission.name}`}
        >
            <ProgressRail missionIdx={missionIdx} completed={completedMissions} />

            <article style={{ ...card, overflow: 'hidden', marginTop: 24 }}>
                <MissionHeader mission={mission} index={missionIdx} />

                <PhaseTabs phase={phase} onChange={(p) => setPhase(p)} quizPassed={quizResult === 'correct'} />

                <div
                    style={{
                        padding: '20px 22px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                        background: 'var(--gradient-surface)',
                    }}
                >
                    {phase === 'learn' && (
                        <LearnPanel
                            mission={mission}
                            onAdvance={() => {
                                setPhase('quiz')
                                setSelected(null)
                                setQuizResult(null)
                            }}
                        />
                    )}

                    {phase === 'quiz' && (
                        <QuizPanel
                            mission={mission}
                            selected={selected}
                            quizResult={quizResult}
                            onSelect={(i) => !quizResult && setSelected(i)}
                            onSubmit={handleQuizSubmit}
                            onRetry={() => {
                                setSelected(null)
                                setQuizResult(null)
                                setPhase('learn')
                            }}
                        />
                    )}

                    {phase === 'do' && (
                        <DoPanel
                            mission={mission}
                            tone={tone}
                            doInput={doInput}
                            setDoInput={setDoInput}
                            loading={loading}
                            outcome={doOutcome}
                            error={doError}
                            onSubmit={handleDo}
                            onNext={goNextMission}
                            isLast={isLast}
                            resultRef={resultRef}
                            nextMissionName={isLast ? null : MISSIONS[missionIdx + 1].name}
                        />
                    )}
                </div>
            </article>
        </main>
    )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressRail({ missionIdx, completed }: { missionIdx: number; completed: number[] }) {
    return (
        <nav aria-label="Mission progress">
            <ol
                style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${MISSION_COUNT}, 1fr)`,
                    gap: 4,
                }}
            >
                {MISSIONS.map((m, i) => {
                    const done = completed.includes(i)
                    const active = i === missionIdx
                    const tone = techTone(m.tech)
                    return (
                        <li key={m.id} aria-current={active ? 'step' : undefined}>
                            <div
                                title={`Mission ${m.id}: ${m.name}`}
                                style={{
                                    height: 6,
                                    borderRadius: 'var(--radius-pill)',
                                    background: done
                                        ? techGradient(m.tech)
                                        : active
                                            ? techGradient(m.tech)
                                            : 'var(--border)',
                                    opacity: done ? 1 : active ? 1 : 0.6,
                                    transition: 'opacity 0.15s ease',
                                }}
                            />
                            <span
                                aria-hidden="true"
                                style={{
                                    display: 'block',
                                    textAlign: 'center',
                                    marginTop: 4,
                                    fontSize: 10,
                                    color: active ? `var(--${tone === 'orange' ? 'bitcoin' : tone === 'purple' ? 'nostr-purple' : 'ecash-cyan'})` : 'var(--muted)',
                                    fontWeight: active ? 700 : 500,
                                    letterSpacing: '0.04em',
                                }}
                            >
                                {done ? '✓' : m.id}
                            </span>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}

function MissionHeader({ mission, index }: { mission: MissionDef; index: number }) {
    // The runtime decides whether the tech is really live or simulated.
    // mission.simulated is the *default expectation* from the catalogue, but
    // we honour what the backend actually reports.
    const techReal = useIsTechReal(mission.tech)
    const isSimulated = !techReal
    const statusChip =
        mission.tech === 'lightning'
            ? techReal
                ? { label: 'Testnet', tone: 'green' as const }
                : { label: 'Simulated', tone: 'neutral' as const }
            : mission.tech === 'ecash'
              ? techReal
                  ? { label: 'Testmint', tone: 'green' as const }
                  : { label: 'Simulated', tone: 'neutral' as const }
              : mission.do.kind === 'nostr-publish'
                ? { label: 'Live relays', tone: 'green' as const }
                : null
    void isSimulated
    return (
        <header
            style={{
                padding: '22px 22px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    width: 52,
                    height: 52,
                    borderRadius: 'var(--radius-3)',
                    background: techGradient(mission.tech),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    flexShrink: 0,
                    boxShadow: 'var(--shadow-1)',
                }}
            >
                <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}>{mission.emoji}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={labelStyle}>
                        Mission {index + 1} of {MISSION_COUNT}
                    </span>
                    <span style={chip(techTone(mission.tech))}>{mission.topic}</span>
                    {statusChip && (
                        <span
                            style={chip(statusChip.tone)}
                            title={
                                statusChip.label === 'Simulated'
                                    ? "This mission's action is simulated — no real value moves."
                                    : statusChip.label === 'Testnet'
                                      ? 'Real Lightning, but on the signet/testnet network — no mainnet sats.'
                                      : statusChip.label === 'Testmint'
                                        ? 'Real Cashu protocol against a public testmint — fake sats, real tokens.'
                                        : 'Real signed Nostr events to public relays.'
                            }
                        >
                            {statusChip.label}
                        </span>
                    )}
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{mission.name}</h2>
                <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{mission.tagline}</p>
            </div>
        </header>
    )
}

function PhaseTabs({
    phase,
    onChange,
    quizPassed,
}: {
    phase: Phase
    onChange: (p: Phase) => void
    quizPassed: boolean
}) {
    const order: Phase[] = ['learn', 'quiz', 'do']
    const labels: Record<Phase, string> = { learn: 'Read', quiz: 'Quiz', do: 'Do it' }
    return (
        <div
            role="tablist"
            aria-label="Mission phase"
            style={{
                display: 'flex',
                margin: '16px 22px 0',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-2)',
                overflow: 'hidden',
            }}
        >
            {order.map((p, i) => {
                const isActive = phase === p
                const isPast =
                    (p === 'learn' && (phase === 'quiz' || phase === 'do')) ||
                    (p === 'quiz' && phase === 'do' && quizPassed)
                // We don't allow tab clicks to skip ahead — the only way forward
                // is to pass the quiz / complete the mission. Past phases can be
                // revisited though.
                const clickable = isActive || isPast
                return (
                    <button
                        key={p}
                        role="tab"
                        aria-selected={isActive}
                        aria-current={isActive ? 'step' : undefined}
                        disabled={!clickable}
                        onClick={() => clickable && onChange(p)}
                        style={{
                            flex: 1,
                            padding: '10px 8px',
                            background: isActive ? 'var(--bg-elevated)' : 'transparent',
                            color: isActive ? 'var(--text)' : 'var(--muted)',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: 13,
                            border: 'none',
                            borderRight: i < order.length - 1 ? '1px solid var(--border)' : 'none',
                            cursor: clickable ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            fontFamily: 'var(--font-sans)',
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                background: isPast ? 'var(--success)' : isActive ? 'var(--bitcoin)' : 'var(--border)',
                                color: isPast || isActive ? '#0A0A0B' : 'var(--muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                fontWeight: 700,
                            }}
                        >
                            {isPast ? '✓' : i + 1}
                        </span>
                        {labels[p]}
                    </button>
                )
            })}
        </div>
    )
}

function LearnPanel({ mission, onAdvance }: { mission: MissionDef; onAdvance: () => void }) {
    return (
        <>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{mission.learn.heading}</h3>
            {mission.learn.body.split('\n\n').map((para, i) => (
                <p
                    key={i}
                    style={{
                        fontSize: 15,
                        lineHeight: 1.7,
                        margin: 0,
                        color: 'var(--text-soft)',
                        whiteSpace: 'pre-line',
                    }}
                >
                    {para}
                </p>
            ))}
            <div style={callout('info')}>
                <strong style={{ marginRight: 6 }}>Tip:</strong> {mission.learn.tip}
            </div>
            <button style={{ ...primaryButton(), width: '100%' }} onClick={onAdvance}>
                Got it — take the quiz →
            </button>
        </>
    )
}

function QuizPanel({
    mission,
    selected,
    quizResult,
    onSelect,
    onSubmit,
    onRetry,
}: {
    mission: MissionDef
    selected: number | null
    quizResult: 'correct' | 'wrong' | null
    onSelect: (i: number) => void
    onSubmit: () => void
    onRetry: () => void
}) {
    return (
        <>
            <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>{mission.quiz.question}</p>
            <ul
                role="radiogroup"
                aria-label="Quiz options"
                style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
                {mission.quiz.options.map((opt, i) => {
                    const isChosen = selected === i
                    const isCorrect = quizResult === 'correct' && opt.correct
                    const isWrong = quizResult === 'wrong' && isChosen
                    const borderColor = isCorrect
                        ? 'var(--success)'
                        : isWrong
                            ? 'var(--danger)'
                            : isChosen
                                ? 'var(--bitcoin)'
                                : 'var(--border)'
                    const bg = isCorrect
                        ? 'rgba(16, 197, 126, 0.1)'
                        : isWrong
                            ? 'rgba(248, 113, 113, 0.08)'
                            : isChosen
                                ? 'rgba(247, 147, 26, 0.08)'
                                : 'var(--bg)'
                    return (
                        <li key={i}>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={isChosen}
                                disabled={!!quizResult}
                                onClick={() => onSelect(i)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    width: '100%',
                                    padding: '14px 16px',
                                    border: `1.5px solid ${borderColor}`,
                                    borderRadius: 'var(--radius-2)',
                                    background: bg,
                                    cursor: quizResult ? 'default' : 'pointer',
                                    textAlign: 'left',
                                    fontSize: 14,
                                    fontFamily: 'var(--font-sans)',
                                    color: 'var(--text)',
                                    transition: 'border-color 0.12s, background 0.12s',
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: 'var(--surface)',
                                        border: `1.5px solid ${borderColor}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                        color: 'var(--muted)',
                                        fontFamily: 'var(--font-mono)',
                                    }}
                                >
                                    {['A', 'B', 'C', 'D'][i]}
                                </span>
                                <span style={{ flex: 1, lineHeight: 1.45 }}>{opt.text}</span>
                            </button>
                        </li>
                    )
                })}
            </ul>

            <div aria-live="polite">
                {quizResult === 'wrong' && (
                    <div style={callout('danger')}>
                        <strong>Not quite.</strong>
                        {selected !== null && mission.quiz.options[selected].why && (
                            <> {mission.quiz.options[selected].why}</>
                        )}
                        <div style={{ marginTop: 10 }}>
                            <button style={ghostButton} onClick={onRetry}>
                                ← Back to the lesson
                            </button>
                        </div>
                    </div>
                )}
                {quizResult === 'correct' && (
                    <div style={callout('success')}>
                        <strong>Correct.</strong> Opening the next step…
                    </div>
                )}
            </div>

            {!quizResult && (
                <button
                    style={{ ...primaryButton(selected === null), width: '100%' }}
                    onClick={onSubmit}
                    disabled={selected === null}
                >
                    Submit answer
                </button>
            )}
        </>
    )
}

function DoPanel({
    mission,
    tone,
    doInput,
    setDoInput,
    loading,
    outcome,
    error,
    onSubmit,
    onNext,
    isLast,
    resultRef,
    nextMissionName,
}: {
    mission: MissionDef
    tone: 'orange' | 'purple' | 'cyan'
    doInput: string
    setDoInput: (v: string) => void
    loading: boolean
    outcome: DoOutcome | null
    error: string | null
    onSubmit: () => void
    onNext: () => void
    isLast: boolean
    resultRef: React.RefObject<HTMLDivElement>
    nextMissionName: string | null
}) {
    const needsTextInput = mission.do.kind === 'pay' || mission.do.kind === 'ecash-spend'
    const needsTextarea = mission.do.kind === 'nostr-publish'

    return (
        <>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{mission.do.helper}</p>

            {!outcome && needsTextInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor={`do-input-${mission.id}`} style={labelStyle}>
                        {mission.do.kind === 'pay' ? 'Lightning address' : 'Cashu token'}
                    </label>
                    <input
                        id={`do-input-${mission.id}`}
                        style={inputMono}
                        value={doInput}
                        onChange={(e) => setDoInput(e.target.value)}
                        placeholder={mission.do.placeholder}
                        maxLength={mission.do.maxLength}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                    />
                </div>
            )}

            {!outcome && needsTextarea && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor={`do-input-${mission.id}`} style={labelStyle}>
                        Your Nostr note
                    </label>
                    <textarea
                        id={`do-input-${mission.id}`}
                        value={doInput}
                        onChange={(e) => setDoInput(e.target.value)}
                        placeholder={mission.do.placeholder}
                        maxLength={mission.do.maxLength}
                        rows={4}
                        style={{ ...input, minHeight: 100, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    <span
                        style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            alignSelf: 'flex-end',
                            fontFamily: 'var(--font-mono)',
                        }}
                    >
                        {doInput.length} / {mission.do.maxLength}
                    </span>
                </div>
            )}

            {outcome ? (
                <ResultBlock outcome={outcome} resultRef={resultRef} tone={tone} />
            ) : (
                error && (
                    <div style={callout('danger')} role="alert">
                        <strong>Something went wrong.</strong> {error}
                    </div>
                )
            )}

            {outcome ? (
                <button style={{ ...primaryButton(), width: '100%' }} onClick={onNext}>
                    {isLast ? '🎉 Finish BitPilot' : `Next: ${nextMissionName} →`}
                </button>
            ) : (
                <button
                    style={{ ...primaryButton(loading), width: '100%' }}
                    onClick={onSubmit}
                    disabled={loading}
                    aria-busy={loading}
                >
                    {loading ? 'Working…' : `${mission.emoji}  ${mission.do.actionLabel}`}
                </button>
            )}
        </>
    )
}

function ResultBlock({
    outcome,
    resultRef,
    tone,
}: {
    outcome: DoOutcome
    resultRef: React.RefObject<HTMLDivElement>
    tone: 'orange' | 'purple' | 'cyan'
}) {
    const detailStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '4px 12px',
        marginTop: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        wordBreak: 'break-all',
    }
    return (
        <div
            ref={resultRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            style={{
                ...callout('success'),
                outline: 'none',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span aria-hidden="true" style={{ fontSize: 18 }}>
                    ✓
                </span>
                <strong style={{ fontSize: 14 }}>{outcome.summary}</strong>
                {outcome.simulated ? (
                    <span style={{ ...chip('neutral'), marginLeft: 'auto' }} title="No real network call — this action was simulated.">
                        Simulated
                    </span>
                ) : (
                    <span style={{ ...chip('green'), marginLeft: 'auto' }} title="This really happened — on a real network (Nostr relays, testnet, or testmint).">
                        Real
                    </span>
                )}
            </div>
            {outcome.details && outcome.details.length > 0 && (
                <div style={detailStyle}>
                    {outcome.details.map((d) => (
                        <Fragment key={d.label}>
                            <span style={{ color: 'var(--muted)' }}>{d.label}:</span>
                            <span style={{ color: 'var(--text)' }}>{d.value}</span>
                        </Fragment>
                    ))}
                </div>
            )}
            {/* tone is currently unused in the result block, but kept as a prop
              so we can later tint the check icon to match the mission. */}
            <span style={{ display: 'none' }}>{tone}</span>
        </div>
    )
}

function FinishedScreen() {
    return (
        <main
            id="learner-main"
            style={{
                maxWidth: 640,
                margin: '0 auto',
                padding: '4rem 1rem',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 18,
            }}
            aria-label="BitPilot complete"
        >
            <div
                aria-hidden="true"
                style={{
                    width: 96,
                    height: 96,
                    borderRadius: '50%',
                    background: 'var(--gradient-hero)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 44,
                    boxShadow: 'var(--shadow-2)',
                }}
            >
                🎉
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: '-0.025em' }}>
                <span className="gradient-text">You did it.</span>
            </h1>
            <p style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.6, margin: 0, maxWidth: 480 }}>
                You just used <strong style={{ color: 'var(--text)' }}>Bitcoin</strong>,{' '}
                <strong style={{ color: 'var(--text)' }}>Lightning</strong>,{' '}
                <strong style={{ color: 'var(--text)' }}>Nostr</strong>, and{' '}
                <strong style={{ color: 'var(--text)' }}>eCash</strong> — and you actually understand what each one
                does. That puts you ahead of about 99% of people on earth.
            </p>
            <ul
                style={{
                    listStyle: 'none',
                    padding: '20px 24px',
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    width: '100%',
                    maxWidth: 420,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-3)',
                    textAlign: 'left',
                }}
            >
                {MISSIONS.map((m) => (
                    <li
                        key={m.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 14,
                            color: 'var(--text-soft)',
                        }}
                    >
                        <span aria-hidden="true" style={{ color: 'var(--success)', fontWeight: 700 }}>
                            ✓
                        </span>
                        <span aria-hidden="true">{m.emoji}</span>
                        <span>{m.name}</span>
                    </li>
                ))}
            </ul>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                Your Nostr note from mission 10 is now live on public relays — open any Nostr client and paste your{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>npub</code> to find it.
            </p>
        </main>
    )
}
