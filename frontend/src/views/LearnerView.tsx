import {
    Fragment,
    Suspense,
    lazy,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from 'react'
import { api, ApiError } from '../lib/api'
import { useIsTechReal } from '../lib/runtime'
import {
    MISSIONS,
    MISSION_COUNT,
    TIERS,
    tierFor,
    type Badge,
    type MissionDef,
} from '../lib/types'
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
import {
    getNpub,
    getNsec,
    getSeedPhrase,
    setNpub,
    setNsec,
    setSeedPhrase,
} from '../lib/auth'
import {
    deriveFirstSegwitAddress,
    generateBip39Mnemonic,
    generateNostrKeys,
    sha256Hex,
} from '../lib/crypto'
// Badge modals only render after a tier completes. Lazy-load so the
// first ~10 missions (where no badge can be earned yet) don't pay for
// the SVG renderer + PNG rasteriser + share UI.
const BadgeCelebrationModal = lazy(() =>
    import('../components/BadgeCelebrationModal').then((m) => ({
        default: m.BadgeCelebrationModal,
    })),
)
const ShareBadgeModal = lazy(() =>
    import('../components/ShareBadgeModal').then((m) => ({
        default: m.ShareBadgeModal,
    })),
)

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
 * (Learn → Quiz → Do). The backend stores progress; the frontend hydrates
 * from `/api/participants/me` on mount.
 *
 * Mobile-first: padding shrinks on small viewports, primary action button
 * stays visible (no fixed widths that overflow), ProgressRail is tier-based
 * not per-mission so 51 missions don't pile up into invisible slivers.
 */
export default function LearnerView({ participantId }: { participantId: string }) {
    // `missionIdx` is the mission the learner is *viewing*. `currentMission`
    // is the server's pointer — the highest mission they're allowed to
    // *complete*. Decoupling these two is what makes the "← Previous"
    // button work: the learner can scroll back through their finished
    // missions to re-read them without the completion flow getting
    // confused about where they are.
    //
    // Invariant: `missionIdx <= currentMission` at all times. The nav
    // buttons enforce this; nothing else should write `missionIdx`
    // directly except the initial hydration and `goNextMission`.
    const [missionIdx, setMissionIdx] = useState(0)
    const [currentMission, setCurrentMission] = useState(0)
    const [phase, setPhase] = useState<Phase>('learn')

    const [selected, setSelected] = useState<number | null>(null)
    const [quizResult, setQuizResult] = useState<'correct' | 'wrong' | null>(null)

    const [doInput, setDoInput] = useState('')
    const [doInputB, setDoInputB] = useState('') // secondary input (e.g. about/bio)
    const [doOutcome, setDoOutcome] = useState<DoOutcome | null>(null)
    const [doError, setDoError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const [completedMissions, setCompletedMissions] = useState<number[]>([])
    const [badges, setBadges] = useState<Badge[]>([])
    // Tier key of the most recently unlocked badge that we haven't yet
    // shown a celebration for. `null` once dismissed. Persists across
    // the (missionIdx, phase) state churn that resets per-mission UI.
    const [justEarnedBadge, setJustEarnedBadge] = useState<Badge | null>(null)
    // Participant display name — used on the shareable badge image. We
    // capture it on hydrate so the share modal doesn't need to re-fetch.
    const [participantName, setParticipantName] = useState<string>('')
    // The badge currently displayed in the share/download modal, if any.
    const [sharingBadge, setSharingBadge] = useState<Badge | null>(null)

    // The mission catalogue lookup is by id (mission number). missionIdx
    // is BOTH the position in MISSIONS *and* the mission number, because
    // MISSIONS is contiguous 0..50 in order. Keep these synonymous below.
    const mission: MissionDef = MISSIONS[missionIdx]
    const isLast = missionIdx === MISSION_COUNT - 1
    const allDone = completedMissions.length === MISSION_COUNT
    const tone = techTone(mission.tech)
    /** True when the learner is *re-viewing* a mission they've already
     *  completed AND there's no fresh result block on screen.
     *
     *  Two distinct UI states share this code path:
     *    - **Just finished it** (`doOutcome` is set): show the celebratory
     *      result block + "Next: …" button. Not review mode.
     *    - **Came back later** (no `doOutcome`, mission is in
     *      `completedMissions` OR `missionIdx < currentMission`): show the
     *      "✓ You've completed this mission" callout in DoPanel.
     *
     *  Mixing these would erase the celebration the moment the action
     *  succeeds, which feels wrong. */
    const isReviewing =
        !doOutcome &&
        (missionIdx < currentMission || completedMissions.includes(missionIdx))

    // Move focus to the live result region whenever it appears.
    const resultRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        if (doOutcome && resultRef.current) {
            resultRef.current.focus()
        }
    }, [doOutcome])

    // On first mount, rehydrate progress from the server. The backend is
    // the source of truth: even if local state was wiped by a refresh, the
    // participant's `current_mission` and `completed_missions` are stored
    // in SQLite and come back via /api/participants/me.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [p, b] = await Promise.all([api.getParticipant(), api.getMyBadges()])
                if (cancelled) return
                setCompletedMissions(p.completed_missions ?? [])
                setBadges(b)
                setParticipantName(p.name ?? '')
                // current_mission is the same as missionIdx (both 0-indexed
                // in the new curriculum). Clamp defensively in case the
                // catalogue shrank under a participant.
                const idx = Math.max(0, Math.min(MISSION_COUNT - 1, p.current_mission ?? 0))
                setMissionIdx(idx)
                setCurrentMission(idx)
            } catch {
                // If the fetch fails (network down, token rejected), just
                // start at mission 0. The Do action will fail loudly if
                // the token is bad, which is the right place to surface it.
            }
        })()
        return () => {
            cancelled = true
        }
        // participantId only changes when the user starts a fresh session,
        // at which point we want to re-fetch anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [participantId])

    const resetForNext = () => {
        setPhase('learn')
        setSelected(null)
        setQuizResult(null)
        setDoInput('')
        setDoInputB('')
        setDoOutcome(null)
        setDoError(null)
    }

    const goNextMission = () => {
        setCompletedMissions((prev) => [...new Set([...prev, missionIdx])])
        if (missionIdx < MISSION_COUNT - 1) {
            const next = missionIdx + 1
            setMissionIdx(next)
            // Advance the server-truth pointer too. The Do action that
            // just succeeded was on the highest unfinished mission, so
            // `next` is the new floor.
            setCurrentMission((c) => Math.max(c, next))
            resetForNext()
        }
        // Refresh badges and surface any newly-earned one. We do this even
        // when the mission isn't the last in its tier (cheap call, simpler
        // than gating on tier boundaries here).
        ;(async () => {
            try {
                const next = await api.getMyBadges()
                setBadges((prev) => {
                    const freshlyEarned = next.find(
                        (b) => b.earned && !prev.find((p) => p.tier === b.tier)?.earned,
                    )
                    if (freshlyEarned) setJustEarnedBadge(freshlyEarned)
                    return next
                })
            } catch {
                // Badge refresh failing isn't blocking — the completion
                // already succeeded server-side; badges will repopulate on
                // the next mount.
            }
        })()
    }

    /**
     * Step navigation. `Previous` walks back through any completed
     * mission; `Next` only advances if the learner is currently
     * reviewing — never past `currentMission`. The actual completion
     * flow uses `goNextMission`, not this.
     */
    const goPrev = () => {
        if (missionIdx > 0) {
            setMissionIdx(missionIdx - 1)
            resetForNext()
        }
    }
    const goNextReview = () => {
        if (missionIdx < currentMission) {
            setMissionIdx(missionIdx + 1)
            resetForNext()
        }
    }

    const handleQuizSubmit = () => {
        if (selected === null) return
        const correct = mission.quiz.options[selected].correct
        setQuizResult(correct ? 'correct' : 'wrong')
        if (correct) {
            setTimeout(() => setPhase('do'), 700)
        }
    }

    /**
     * Action dispatch. Every branch must produce a `proof` string that the
     * backend's `verify_proof()` will accept — see backend/src/routes/
     * missions.rs. For knowledge missions, proof = "acknowledged".
     */
    const handleDo = async () => {
        setLoading(true)
        setDoError(null)
        try {
            let outcome: DoOutcome
            let proof: string

            switch (mission.do.kind) {
                case 'knowledge': {
                    proof = 'acknowledged'
                    outcome = { summary: 'Knowledge unlocked.', simulated: false }
                    break
                }

                case 'seed-words': {
                    // Generate a real BIP39 mnemonic in the browser. We
                    // never send the mnemonic itself; we send a SHA-256
                    // commitment so the backend can verify "you generated
                    // something" without seeing the secret.
                    const mnemonic = generateBip39Mnemonic()
                    setSeedPhrase(mnemonic)
                    proof = await sha256Hex(mnemonic)
                    outcome = {
                        summary: 'Your 12 words — write these down on paper.',
                        details: [
                            { label: 'seed phrase', value: mnemonic },
                            { label: 'commitment (sent to server)', value: proof },
                        ],
                        simulated: true,
                    }
                    break
                }

                case 'nostr-identity': {
                    // Generate a real secp256k1 keypair in the browser.
                    // Only the npub gets sent to the backend.
                    const keys = generateNostrKeys()
                    setNsec(keys.nsec)
                    setNpub(keys.npub)
                    await api.registerNostrIdentity(keys.npub)
                    proof = keys.npub
                    outcome = {
                        summary: 'Your real Nostr keypair is ready.',
                        details: [
                            { label: 'npub (share freely)', value: keys.npub },
                            { label: 'nsec (NEVER share)', value: keys.nsec },
                            {
                                label: 'next step',
                                value: 'Copy your nsec into a password manager before continuing.',
                            },
                        ],
                        simulated: false,
                    }
                    break
                }

                case 'invoice': {
                    const r = await api.createInvoice(100, 'BitPilot mission')
                    proof = r.invoice
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
                    const r = await api.payInvoice(doInput.trim())
                    proof = r.payment_hash
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
                    const r = await api.mintEcash(50)
                    proof = r.token
                    outcome = {
                        summary: `Token minted — ${r.amount_sats} sats inside.`,
                        details: [{ label: 'token', value: r.token }],
                        simulated: r.simulated,
                    }
                    break
                }

                case 'ecash-spend': {
                    if (!doInput.trim()) {
                        setDoError('Paste a token (starts with cashuA/cashuB).')
                        setLoading(false)
                        return
                    }
                    const r = await api.redeemEcash(doInput.trim())
                    proof = doInput.trim()
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
                    const nsec = getNsec()
                    if (!nsec) {
                        setDoError('Generate your Nostr identity first (mission 14).')
                        setLoading(false)
                        return
                    }
                    const r = await api.publishNostrNote(doInput.trim(), nsec)
                    proof = r.event_id
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

                case 'nostr-profile': {
                    if (!doInput.trim()) {
                        setDoError('Pick a display name.')
                        setLoading(false)
                        return
                    }
                    const nsec = getNsec()
                    if (!nsec) {
                        setDoError('Generate your Nostr identity first (mission 14).')
                        setLoading(false)
                        return
                    }
                    const about = doInputB.trim() || null
                    const r = await api.publishNostrProfile(doInput.trim(), about, nsec)
                    proof = r.event_id
                    outcome = {
                        summary: 'Profile (kind-0) published to public relays.',
                        details: [
                            { label: 'event_id', value: r.event_id },
                            { label: 'name', value: doInput.trim() },
                            ...(about ? [{ label: 'about', value: about }] : []),
                        ],
                        simulated: r.simulated,
                    }
                    break
                }

                case 'nostr-follow': {
                    const nsec = getNsec()
                    if (!nsec) {
                        setDoError('Generate your Nostr identity first (mission 14).')
                        setLoading(false)
                        return
                    }
                    // Pre-baked npubs to follow. Picking one for them is
                    // friendlier than asking a beginner to find an npub.
                    // fiatjaf is the inventor of Nostr. jb55 is Damus.
                    const FOLLOW_TARGETS: Record<string, string> = {
                        fiatjaf: 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',
                        jb55: 'npub1xtscya34g58tk0z605fvr788k263gsu6cy9x0mhnm87echrgufzsevkk5s',
                    }
                    const chosen = doInput.trim() || 'fiatjaf'
                    const target = FOLLOW_TARGETS[chosen] ?? FOLLOW_TARGETS.fiatjaf
                    const r = await api.publishNostrFollow(target, nsec)
                    proof = r.event_id
                    outcome = {
                        summary: `Follow list (kind-3) published — following ${chosen}.`,
                        details: [
                            { label: 'followed npub', value: target },
                            { label: 'event_id', value: r.event_id },
                        ],
                        simulated: r.simulated,
                    }
                    break
                }

                case 'nostr-zap': {
                    const r = await api.simulateNostrZap()
                    proof = r.event_id
                    outcome = {
                        summary: `Zap receipt generated — ${r.amount_sats} sats.`,
                        details: [{ label: 'event_id', value: r.event_id }],
                        simulated: r.simulated,
                    }
                    break
                }

                case 'derive-address': {
                    const seed = getSeedPhrase()
                    if (!seed) {
                        setDoError('Generate your seed phrase first (mission 11).')
                        setLoading(false)
                        return
                    }
                    const address = deriveFirstSegwitAddress(seed)
                    proof = address
                    outcome = {
                        summary: 'Derived your first receive address from the seed.',
                        details: [
                            { label: 'path', value: "m/84'/0'/0'/0/0" },
                            { label: 'address', value: address },
                        ],
                        simulated: true,
                    }
                    break
                }

                case 'onchain-signet': {
                    if (!doInput.trim()) {
                        setDoError('Paste your signet transaction id (64 hex characters).')
                        setLoading(false)
                        return
                    }
                    proof = doInput.trim().toLowerCase()
                    outcome = {
                        summary: 'Your signet transaction is real — confirmed via mempool.space.',
                        details: [
                            { label: 'txid', value: proof },
                            {
                                label: 'view on mempool',
                                value: `mempool.space/signet/tx/${proof}`,
                            },
                        ],
                        simulated: false,
                    }
                    break
                }

                // Generic "paste this thing" — currently unused but reserved
                // for future missions (e.g. "paste your npub here").
                case 'paste-value': {
                    if (!doInput.trim()) {
                        setDoError('Paste a value first.')
                        setLoading(false)
                        return
                    }
                    proof = doInput.trim()
                    outcome = { summary: 'Captured.', simulated: false }
                    break
                }
            }

            // Only credit the mission after the action succeeded.
            await api.completeMission(mission.id, proof)
            setDoOutcome(outcome)
            // Mark complete *now*, not when the user clicks Next. Without
            // this, navigating away with Previous and returning with Next
            // would re-show the action button and let the user re-fire
            // the request (which the backend would 400, but the UX would
            // still be wrong). Marking it here means review-mode kicks in
            // immediately after a successful action.
            setCompletedMissions((prev) => [...new Set([...prev, missionIdx])])
        } catch (e) {
            const msg =
                e instanceof ApiError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : 'Unknown error'
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
            // Mobile: shrink padding aggressively so content uses the viewport.
            // Desktop: comfortable 720-px reading width centered.
            style={{
                padding: 'clamp(0.75rem, 3vw, 1.5rem) clamp(0.5rem, 3vw, 1rem) 5rem',
                maxWidth: 720,
                margin: '0 auto',
            }}
            aria-label={`Mission ${mission.id} of ${MISSION_COUNT - 1}: ${mission.name}`}
        >
            <ProgressRail missionIdx={missionIdx} completed={completedMissions} />

            <BadgesStrip badges={badges} onShareBadge={setSharingBadge} />

            {/* No fallback UI: modals open after explicit user action.
                Network is fine, a tiny extra delay is invisible. */}
            <Suspense fallback={null}>
                {justEarnedBadge && (
                    <BadgeCelebrationModal
                        badge={justEarnedBadge}
                        participantId={participantId}
                        participantName={participantName}
                        onClose={() => setJustEarnedBadge(null)}
                        onClaimed={(claim) => {
                            // Mirror the new claim into the badges list so
                            // the BadgesStrip and the celebration modal both
                            // see the claim immediately, without re-fetching.
                            setBadges((prev) =>
                                prev.map((b) =>
                                    b.tier === justEarnedBadge.tier
                                        ? { ...b, reward_claim: claim }
                                        : b,
                                ),
                            )
                            setJustEarnedBadge((j) =>
                                j ? { ...j, reward_claim: claim } : j,
                            )
                        }}
                    />
                )}

                {sharingBadge && (
                    <ShareBadgeModal
                        badge={sharingBadge}
                        participantId={participantId}
                        participantName={participantName}
                        onClose={() => setSharingBadge(null)}
                    />
                )}
            </Suspense>

            <MissionNav
                missionIdx={missionIdx}
                currentMission={currentMission}
                onPrev={goPrev}
                onNext={goNextReview}
            />

            <article style={{ ...card, overflow: 'hidden', marginTop: 14 }}>
                <MissionHeader mission={mission} />

                <PhaseTabs
                    phase={phase}
                    onChange={(p) => setPhase(p)}
                    quizPassed={quizResult === 'correct'}
                />

                <div
                    style={{
                        padding: 'clamp(14px, 4vw, 22px)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
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
                            doInputB={doInputB}
                            setDoInputB={setDoInputB}
                            loading={loading}
                            outcome={doOutcome}
                            error={doError}
                            onSubmit={handleDo}
                            onNext={goNextMission}
                            isLast={isLast}
                            isReviewing={isReviewing}
                            onReviewNext={goNextReview}
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

/**
 * Step navigation row above the mission card.
 *
 *   ← Previous · Mission n / N · Next →
 *
 * - **Previous** is enabled whenever `missionIdx > 0` so the learner can
 *   walk back through anything they've finished. When they land on a
 *   completed mission the DoPanel switches to read-only mode.
 * - **Next** is enabled only while *reviewing* — i.e. `missionIdx <
 *   currentMission`. We never advance past the server-truth pointer with
 *   this button; the way to unlock the next mission is to complete the
 *   current one via the action button inside DoPanel.
 *
 * The bar is intentionally compact so it doesn't compete with the
 * mission card below. On the active mission, Next looks disabled — that
 * is correct: the only way forward is to finish.
 */
function MissionNav({
    missionIdx,
    currentMission,
    onPrev,
    onNext,
}: {
    missionIdx: number
    currentMission: number
    onPrev: () => void
    onNext: () => void
}) {
    const canPrev = missionIdx > 0
    const canNext = missionIdx < currentMission
    return (
        <nav
            aria-label="Mission navigation"
            style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
            }}
        >
            <button
                type="button"
                onClick={onPrev}
                disabled={!canPrev}
                aria-label="Previous mission"
                style={navButtonStyle(canPrev)}
            >
                ← Previous
            </button>
            <span
                style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}
                title={
                    missionIdx < currentMission
                        ? `Reviewing — your current mission is #${currentMission}`
                        : 'Your current mission'
                }
            >
                {missionIdx < currentMission ? 'Reviewing' : 'Current'} · #{missionIdx}
            </span>
            <button
                type="button"
                onClick={onNext}
                disabled={!canNext}
                aria-label="Next mission"
                style={navButtonStyle(canNext)}
                title={
                    canNext
                        ? 'Next mission'
                        : 'Finish this mission to unlock the next one'
                }
            >
                Next →
            </button>
        </nav>
    )
}

function navButtonStyle(enabled: boolean): CSSProperties {
    return {
        padding: '8px 14px',
        minHeight: 40,
        fontSize: 13,
        fontWeight: 600,
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2)',
        color: enabled ? 'var(--text)' : 'var(--muted)',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.5,
        fontFamily: 'var(--font-sans)',
    }
}

/**
 * Tier-grouped progress rail. Shows 5 stacked bars (one per tier), with
 * a sub-line showing the current mission within the active tier.
 *
 * Why not 51 per-mission ticks? At 51 missions, each one would be 6-7px
 * wide on mobile — invisible, useless. Tier rails communicate progress in
 * a way you can read at a glance.
 */
function ProgressRail({
    missionIdx,
    completed,
}: {
    missionIdx: number
    completed: number[]
}) {
    const currentTier = tierFor(missionIdx)
    return (
        <nav aria-label="Mission progress" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ol
                style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${TIERS.length}, 1fr)`,
                    gap: 4,
                }}
            >
                {TIERS.map((t) => {
                    const [lo, hi] = t.range
                    const total = hi - lo + 1
                    const doneInTier = completed.filter((m) => m >= lo && m <= hi).length
                    const isActive = missionIdx >= lo && missionIdx <= hi
                    const pct = isActive
                        ? Math.max(((missionIdx - lo + (doneInTier === missionIdx - lo + 1 ? 1 : 0.4)) / total) * 100, 8)
                        : doneInTier === total
                          ? 100
                          : (doneInTier / total) * 100
                    return (
                        <li key={t.key}>
                            <div
                                style={{
                                    position: 'relative',
                                    height: 8,
                                    borderRadius: 'var(--radius-pill)',
                                    background: 'var(--border)',
                                    overflow: 'hidden',
                                }}
                                title={`${t.label}: ${doneInTier}/${total}`}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: `${pct}%`,
                                        background: isActive
                                            ? 'var(--gradient-bitcoin)'
                                            : doneInTier === total
                                              ? 'var(--success)'
                                              : 'var(--border-strong)',
                                        transition: 'width 0.3s ease',
                                    }}
                                />
                            </div>
                            <div
                                style={{
                                    marginTop: 4,
                                    fontSize: 10,
                                    textAlign: 'center',
                                    color: isActive ? 'var(--bitcoin)' : 'var(--muted)',
                                    fontWeight: isActive ? 700 : 500,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                    // Hide labels on very narrow viewports to avoid wrapping;
                                    // the title attribute still gives the info.
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {t.label}
                            </div>
                        </li>
                    )
                })}
            </ol>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono)',
                    flexWrap: 'wrap',
                }}
            >
                <span style={{ color: 'var(--text)' }}>
                    Mission {missionIdx}/{MISSION_COUNT - 1}
                </span>
                <span aria-hidden="true">·</span>
                <span>{currentTier.label} tier</span>
                <span aria-hidden="true">·</span>
                <span>{currentTier.reward} sats reward</span>
            </div>
        </nav>
    )
}

/**
 * Five tier-badge medallions, one per learning band. Filled = earned (the
 * learner finished every mission in the tier); outlined = locked, with a
 * "n/m" counter showing progress toward the unlock.
 *
 * Renders nothing on first paint before `getMyBadges()` resolves, so the
 * page doesn't flash a row of empty placeholders.
 */
function BadgesStrip({
    badges,
    onShareBadge,
}: {
    badges: Badge[]
    onShareBadge: (b: Badge) => void
}) {
    if (badges.length === 0) return null
    const tierEmoji: Record<string, string> = {
        novice: '🥚',
        apprentice: '🌱',
        pilot: '⚡',
        navigator: '🧭',
        captain: '🏴',
    }
    return (
        <section
            aria-label="Tier badges"
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${badges.length}, 1fr)`,
                gap: 6,
                marginTop: 8,
            }}
        >
            {badges.map((b) => {
                const tierMeta = TIERS.find((t) => t.key === b.tier)
                const label = tierMeta?.label ?? b.tier
                const interactive = b.earned
                const title = interactive
                    ? `${label} earned · ${b.required}/${b.required} missions · click to share`
                    : `${label} locked · ${b.completed}/${b.required} missions`
                return (
                    <div
                        key={b.tier}
                        title={title}
                        aria-label={title}
                        role={interactive ? 'button' : undefined}
                        tabIndex={interactive ? 0 : -1}
                        onClick={interactive ? () => onShareBadge(b) : undefined}
                        onKeyDown={
                            interactive
                                ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          onShareBadge(b)
                                      }
                                  }
                                : undefined
                        }
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 2,
                            padding: '6px 4px',
                            borderRadius: 'var(--radius-2)',
                            background: b.earned ? 'rgba(247, 147, 26, 0.10)' : 'transparent',
                            border: b.earned
                                ? '1px solid rgba(247, 147, 26, 0.35)'
                                : '1px dashed var(--border)',
                            opacity: b.earned ? 1 : 0.55,
                            cursor: interactive ? 'pointer' : 'default',
                        }}
                    >
                        <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">
                            {tierEmoji[b.tier] ?? '🏅'}
                        </span>
                        <span
                            style={{
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                color: b.earned ? 'var(--bitcoin)' : 'var(--muted)',
                                fontFamily: 'var(--font-sans)',
                            }}
                        >
                            {label}
                        </span>
                        <span
                            style={{
                                fontSize: 9,
                                color: 'var(--muted)',
                                fontFamily: 'var(--font-mono)',
                            }}
                        >
                            {b.completed}/{b.required}
                        </span>
                    </div>
                )
            })}
        </section>
    )
}

function MissionHeader({ mission }: { mission: MissionDef }) {
    const techReal = useIsTechReal(mission.tech)
    const statusChip =
        mission.tech === 'lightning'
            ? techReal
                ? { label: 'Testnet', tone: 'green' as const }
                : { label: 'Simulated', tone: 'neutral' as const }
            : mission.tech === 'ecash'
              ? techReal
                  ? { label: 'Testmint', tone: 'green' as const }
                  : { label: 'Simulated', tone: 'neutral' as const }
              : mission.do.kind === 'nostr-publish' ||
                  mission.do.kind === 'nostr-profile' ||
                  mission.do.kind === 'nostr-follow'
                ? { label: 'Live relays', tone: 'green' as const }
                : mission.do.kind === 'nostr-zap'
                  ? { label: 'Simulated', tone: 'neutral' as const }
                  : mission.do.kind === 'onchain-signet'
                    ? { label: 'Signet', tone: 'green' as const }
                    : null
    const tier = tierFor(mission.id)

    return (
        <header
            style={{
                padding: 'clamp(14px, 4vw, 20px) clamp(14px, 4vw, 22px) 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--radius-3)',
                    background: techGradient(mission.tech),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    flexShrink: 0,
                    boxShadow: 'var(--shadow-1)',
                }}
            >
                <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}>{mission.emoji}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        marginBottom: 4,
                    }}
                >
                    <span style={{ ...labelStyle, fontSize: 10 }}>
                        #{mission.id} · {tier.label}
                    </span>
                    <span style={{ ...chip(techTone(mission.tech)), fontSize: 10 }}>
                        {mission.topic}
                    </span>
                    {statusChip && (
                        <span
                            style={{ ...chip(statusChip.tone), fontSize: 10 }}
                            title={
                                statusChip.label === 'Simulated'
                                    ? "Action is simulated — no real value moves."
                                    : statusChip.label === 'Testnet'
                                      ? 'Real Lightning, signet network — no mainnet sats.'
                                      : statusChip.label === 'Testmint'
                                        ? 'Real Cashu protocol against a public testmint.'
                                        : statusChip.label === 'Signet'
                                          ? 'Real on-chain transaction on signet.'
                                          : 'Real signed Nostr events to public relays.'
                            }
                        >
                            {statusChip.label}
                        </span>
                    )}
                </div>
                <h2
                    style={{
                        fontSize: 'clamp(17px, 4.5vw, 21px)',
                        fontWeight: 700,
                        margin: '0 0 3px',
                        letterSpacing: '-0.02em',
                        wordBreak: 'break-word',
                    }}
                >
                    {mission.name}
                </h2>
                <p
                    style={{
                        fontSize: 13,
                        color: 'var(--muted)',
                        margin: 0,
                        lineHeight: 1.45,
                    }}
                >
                    {mission.tagline}
                </p>
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
                margin: '14px clamp(14px, 4vw, 22px) 0',
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
                            padding: '10px 6px',
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
                            minHeight: 44, // iOS recommended tap target
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
            <h3
                style={{
                    fontSize: 'clamp(16px, 4vw, 18px)',
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: '-0.01em',
                }}
            >
                {mission.learn.heading}
            </h3>
            {mission.learn.body.split('\n\n').map((para, i) => (
                <p
                    key={i}
                    style={{
                        fontSize: 14.5,
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
            <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
                {mission.quiz.question}
            </p>
            <ul
                role="radiogroup"
                aria-label="Quiz options"
                style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
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
                                    padding: '12px 14px',
                                    border: `1.5px solid ${borderColor}`,
                                    borderRadius: 'var(--radius-2)',
                                    background: bg,
                                    cursor: quizResult ? 'default' : 'pointer',
                                    textAlign: 'left',
                                    fontSize: 14,
                                    fontFamily: 'var(--font-sans)',
                                    color: 'var(--text)',
                                    transition: 'border-color 0.12s, background 0.12s',
                                    minHeight: 48,
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
    doInputB,
    setDoInputB,
    loading,
    outcome,
    error,
    onSubmit,
    onNext,
    isLast,
    isReviewing,
    onReviewNext,
    resultRef,
    nextMissionName,
}: {
    mission: MissionDef
    tone: 'orange' | 'purple' | 'cyan'
    doInput: string
    setDoInput: (v: string) => void
    doInputB: string
    setDoInputB: (v: string) => void
    loading: boolean
    outcome: DoOutcome | null
    error: string | null
    onSubmit: () => void
    onNext: () => void
    isLast: boolean
    /** True when the learner is revisiting a previously-completed mission. */
    isReviewing: boolean
    /** Walks to mission +1 from review mode (does NOT mark anything complete). */
    onReviewNext: () => void
    resultRef: React.RefObject<HTMLDivElement>
    nextMissionName: string | null
}) {
    // Decide what input UI to show. Each branch labels its own field so
    // the user understands what they're typing.
    const ui = useMemo(() => uiForKind(mission.do.kind), [mission.do.kind])

    // Review mode: this mission was completed in a past session (or
    // earlier in this one) and the learner navigated back to re-read it.
    // The action button is replaced with a "completed" badge so they
    // can't accidentally re-submit — the backend would reject it, but
    // the UI shouldn't even offer.
    if (isReviewing) {
        return (
            <>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                    {mission.do.helper}
                </p>
                <div style={callout('success')}>
                    <strong>✓ You've completed this mission.</strong>{' '}
                    Use Previous/Next above to navigate, or jump back to your current
                    mission below.
                </div>
                <button style={{ ...primaryButton(), width: '100%' }} onClick={onReviewNext}>
                    {nextMissionName ? `Next: ${nextMissionName} →` : 'Forward →'}
                </button>
            </>
        )
    }

    return (
        <>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                {mission.do.helper}
            </p>

            {!outcome && ui.primary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor={`do-input-${mission.id}`} style={labelStyle}>
                        {ui.primary.label}
                    </label>
                    {ui.primary.type === 'textarea' ? (
                        <>
                            <textarea
                                id={`do-input-${mission.id}`}
                                value={doInput}
                                onChange={(e) => setDoInput(e.target.value)}
                                placeholder={mission.do.placeholder ?? ui.primary.placeholder}
                                maxLength={mission.do.maxLength}
                                rows={4}
                                style={{
                                    ...input,
                                    minHeight: 100,
                                    resize: 'vertical',
                                    lineHeight: 1.5,
                                }}
                            />
                            {mission.do.maxLength && (
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
                            )}
                        </>
                    ) : (
                        <input
                            id={`do-input-${mission.id}`}
                            style={ui.primary.mono ? inputMono : input}
                            value={doInput}
                            onChange={(e) => setDoInput(e.target.value)}
                            placeholder={mission.do.placeholder ?? ui.primary.placeholder}
                            maxLength={mission.do.maxLength ?? ui.primary.maxLength}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                        />
                    )}
                </div>
            )}

            {!outcome && ui.secondary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor={`do-input-b-${mission.id}`} style={labelStyle}>
                        {ui.secondary.label}
                    </label>
                    <input
                        id={`do-input-b-${mission.id}`}
                        style={input}
                        value={doInputB}
                        onChange={(e) => setDoInputB(e.target.value)}
                        placeholder={ui.secondary.placeholder}
                        maxLength={ui.secondary.maxLength}
                        autoComplete="off"
                        spellCheck={false}
                    />
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

/**
 * Per-DoKind UI hints: labels, placeholders, whether to use mono input,
 * whether a textarea is needed, whether a secondary input slot is shown.
 * Centralised so the DoPanel itself stays compact.
 */
interface DoUi {
    primary?: {
        label: string
        placeholder?: string
        maxLength?: number
        mono?: boolean
        type?: 'input' | 'textarea'
    }
    secondary?: {
        label: string
        placeholder?: string
        maxLength?: number
    }
}

function uiForKind(kind: MissionDef['do']['kind']): DoUi {
    switch (kind) {
        case 'pay':
            return { primary: { label: 'Lightning address', placeholder: 'demo@ln.tips', maxLength: 80, mono: true } }
        case 'ecash-spend':
            return { primary: { label: 'Cashu token', placeholder: 'cashuB…', maxLength: 400, mono: true } }
        case 'nostr-publish':
            return {
                primary: {
                    label: 'Your Nostr note',
                    type: 'textarea',
                    placeholder: 'GM Nostr — I just finished BitPilot ⚡',
                    maxLength: 280,
                },
            }
        case 'nostr-profile':
            return {
                primary: { label: 'Display name', placeholder: 'e.g. Amaka', maxLength: 40 },
                secondary: { label: 'About (optional)', placeholder: 'one-line bio', maxLength: 200 },
            }
        case 'nostr-follow':
            return {
                primary: {
                    label: 'Who to follow (type "fiatjaf" or "jb55")',
                    placeholder: 'fiatjaf',
                    maxLength: 20,
                },
            }
        case 'onchain-signet':
            return {
                primary: {
                    label: 'Your signet transaction id',
                    placeholder: '64-character hex',
                    maxLength: 64,
                    mono: true,
                },
            }
        default:
            // knowledge, seed-words, nostr-identity, invoice, ecash-claim,
            // nostr-zap, derive-address, paste-value with no UI need.
            return {}
    }
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
        gap: '6px 12px',
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
            style={{ ...callout('success'), outline: 'none' }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                    flexWrap: 'wrap',
                }}
            >
                <span aria-hidden="true" style={{ fontSize: 18 }}>
                    ✓
                </span>
                <strong style={{ fontSize: 14, flex: '1 1 auto', minWidth: 0 }}>
                    {outcome.summary}
                </strong>
                {outcome.simulated ? (
                    <span style={{ ...chip('neutral'), fontSize: 10 }} title="Simulated action.">
                        Simulated
                    </span>
                ) : (
                    <span style={{ ...chip('green'), fontSize: 10 }} title="Really happened on a real network.">
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
                padding: 'clamp(2rem, 8vw, 4rem) 1rem',
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
            <h1
                style={{
                    fontSize: 'clamp(26px, 7vw, 34px)',
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.025em',
                }}
            >
                <span className="gradient-text">You did it.</span>
            </h1>
            <p
                style={{
                    fontSize: 16,
                    color: 'var(--muted)',
                    lineHeight: 1.6,
                    margin: 0,
                    maxWidth: 480,
                }}
            >
                51 missions. Five tiers. You used Bitcoin, Lightning, Nostr, and eCash for real, and you actually understand what each one
                does. That puts you ahead of about 99% of people on earth.
            </p>
            <ul
                style={{
                    listStyle: 'none',
                    padding: '20px 24px',
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    width: '100%',
                    maxWidth: 420,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-3)',
                    textAlign: 'left',
                }}
            >
                {TIERS.map((t) => (
                    <li
                        key={t.key}
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
                        <span style={{ flex: 1 }}>
                            <strong style={{ color: 'var(--text)' }}>{t.label}</strong> ·{' '}
                            {t.range[1] - t.range[0] + 1} missions · {t.reward} sats each
                        </span>
                    </li>
                ))}
            </ul>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                Your Nostr identity and notes are real — open any Nostr client and search your npub.
            </p>
        </main>
    )
}
