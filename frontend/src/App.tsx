import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import LearnerView from './views/LearnerView'
import FacilitatorDashboard from './views/FacilitatorDashboard'
import SoloProgressView from './views/SoloProgressView'
import { ThemeToggle } from './components/ThemeToggle'
import { applyTheme, getSavedTheme, saveTheme, type Theme } from './lib/theme'
import { api, ApiError } from './lib/api'
import {
    clearAllTokens,
    getAuthToken,
    getParticipantId,
    getSessionId,
    setParticipantId as persistParticipantId,
    setSessionId as persistSessionId,
} from './lib/auth'
import { RuntimeProvider, useRuntime } from './lib/runtime'
import { MISSION_COUNT, TIERS } from './lib/types'
import {
    card,
    chip,
    ghostButton,
    input,
    label as labelStyle,
    primaryButton,
} from './lib/ui'

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

type View = 'learner' | 'facilitator'
type Screen = 'landing' | 'setup' | 'app'

/**
 * Sentinel session name for solo learners.
 *
 * A solo learner is someone who lands on bitpilot.app, hits "Start
 * Learning Bitcoin", and never enters a session name. The backend still
 * needs *a* session row (the schema joins participants to sessions), but
 * we don't want every drive-by visitor showing up as a session named
 * "BitPilot Session" on a future admin dashboard. So we tag those rows
 * with this sentinel, and any facilitator-style UI that happens to
 * render one knows to display "Solo run" instead.
 *
 * Keep the prefix `__` so it can't collide with anything a human would
 * legitimately type — the backend only rejects empty names, not unusual
 * ones.
 */
export const SOLO_SESSION_NAME = '__solo__'
export function isSoloSessionName(name: string | null | undefined): boolean {
    return name === SOLO_SESSION_NAME
}

/**
 * On first mount we try to:
 *   1. Restore a previous run from localStorage (full credentials present).
 *   2. Read `?session=<id>` from the URL — facilitators share a QR with this
 *      param, so the participant lands directly on the setup screen with
 *      the session id pre-filled. Note: only `session=` is honored; no auth
 *      tokens come from the URL. The participant must still enter a name.
 */
function rehydrate(): {
    sessionId: string | null
    participantId: string | null
    restored: boolean
    deepLinkSessionId: string | null
} {
    const token = getAuthToken()
    const sid = getSessionId()
    const pid = getParticipantId()

    // ?session= deep link (facilitator-shared QR / URL).
    let deepLinkSessionId: string | null = null
    try {
        const url = new URL(window.location.href)
        const candidate = url.searchParams.get('session')
        // UUID-shaped only — reject anything else so the URL bar can't
        // be used to inject arbitrary strings into our session_id field.
        if (candidate && /^[0-9a-f-]{36}$/i.test(candidate)) {
            deepLinkSessionId = candidate
        }
    } catch {
        // SSR or weird URL — ignore.
    }

    if (token && pid && sid) {
        return { sessionId: sid, participantId: pid, restored: true, deepLinkSessionId }
    }
    return { sessionId: null, participantId: null, restored: false, deepLinkSessionId }
}

export default function App() {
    const initial = rehydrate()

    const [view, setView] = useState<View>('learner')
    const [theme, setTheme] = useState<Theme>(getSavedTheme)
    // Routing rule:
    //   - ?session= deep link → setup (joining)
    //   - otherwise → landing
    // We deliberately do NOT auto-jump to the app screen even if there are
    // valid credentials in localStorage. The user should see what BitPilot
    // is on every visit; if they want to resume, the landing offers a
    // "Continue your missions" pill that reads from `initial.restored`.
    const [screen, setScreen] = useState<Screen>(
        initial.deepLinkSessionId ? 'setup' : 'landing',
    )
    const [sessionId, setSessionId] = useState<string | null>(initial.sessionId)
    const [participantId, setParticipantId] = useState<string | null>(initial.participantId)
    const [sessionName, setSessionName] = useState('')
    const [participantName, setParticipantName] = useState('')
    // If we arrived via a deep link, pre-stash the session id so the setup
    // form knows we're joining (not creating) a session.
    const [joinSessionId, setJoinSessionId] = useState<string | null>(initial.deepLinkSessionId)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    /** Returning user wants to continue. Only valid when `initial.restored`
     *  was true at mount; the IDs are still in state from rehydrate(). */
    const continueExisting = () => {
        if (!sessionId || !participantId) return
        setScreen('app')
    }

    useEffect(() => {
        applyTheme(theme)
        saveTheme(theme)
    }, [theme])

    const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

    const start = async () => {
        const name = participantName.trim()
        if (!name) return
        setLoading(true)
        setError('')
        try {
            clearAllTokens()
            let sid: string
            if (joinSessionId) {
                // Deep-link path: join the existing session, don't create one.
                sid = joinSessionId
            } else {
                // No deep link: we have to create a session for the
                // participant to belong to. If the user typed a session
                // name OR is in the facilitator flow, treat it as a real
                // named session. Otherwise tag it with the solo sentinel
                // so future admin views can hide drive-by learners.
                const typed = sessionName.trim()
                const sessionLabel =
                    typed.length > 0
                        ? typed
                        : view === 'facilitator'
                          ? 'BitPilot Session'
                          : SOLO_SESSION_NAME
                const session = await api.createSession(sessionLabel)
                sid = session.id
            }
            const participant = await api.joinSession(name, sid)
            setSessionId(sid)
            setParticipantId(participant.id)
            persistSessionId(sid)
            persistParticipantId(participant.id)
            setScreen('app')
            // Clean up the URL — no need to keep ?session= hanging around.
            try {
                const url = new URL(window.location.href)
                url.searchParams.delete('session')
                window.history.replaceState({}, '', url.toString())
            } catch {
                /* ignore */
            }
        } catch (e) {
            if (e instanceof ApiError) {
                setError(e.message)
            } else {
                setError('Could not start the session. Try again in a moment.')
            }
        }
        setLoading(false)
    }

    /** "Exit" button — drop back to landing AND wipe credentials. */
    const onExitToLanding = () => {
        clearAllTokens()
        setSessionId(null)
        setParticipantId(null)
        setParticipantName('')
        setSessionName('')
        setJoinSessionId(null)
        setScreen('landing')
    }

    /**
     * Soft "home" — go back to the landing page WITHOUT wiping credentials.
     * Triggered by clicking the BitPilot logo in the app shell. The user
     * lands on the marketing page and the "Continue your missions" pill
     * is visible because `sessionId` and `participantId` are still set.
     *
     * This is distinct from Exit (the explicit "Exit to landing" menu
     * item) which is a clean-slate signal.
     */
    const onHomeFromApp = () => {
        setScreen('landing')
    }

    // Whether the landing page should show a "Continue your missions" pill.
    // We read live state, not just the initial mount, so a user who clicks
    // the logo mid-session still sees the resume option even though
    // `initial.restored` was false when they first arrived.
    const hasResumable = sessionId !== null && participantId !== null

    return (
        <QueryClientProvider client={queryClient}>
            <RuntimeProvider>
                <a href="#main-content" className="skip-link">
                    Skip to content
                </a>
                {screen === 'landing' && (
                    <Landing
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onStart={() => {
                            setView('learner')
                            setScreen('setup')
                        }}
                        onFacilitator={() => {
                            setView('facilitator')
                            setScreen('setup')
                        }}
                        hasResumable={hasResumable}
                        onContinue={continueExisting}
                    />
                )}
                {screen === 'setup' && (
                    <Setup
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onBack={() => setScreen('landing')}
                        participantName={participantName}
                        setParticipantName={setParticipantName}
                        sessionName={sessionName}
                        setSessionName={setSessionName}
                        joinSessionId={joinSessionId}
                        loading={loading}
                        error={error}
                        onStart={start}
                    />
                )}
                {screen === 'app' && (
                    <AppShell
                        view={view}
                        setView={setView}
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onExit={onExitToLanding}
                        onHome={onHomeFromApp}
                        participantId={participantId}
                        sessionId={sessionId}
                    />
                )}
            </RuntimeProvider>
        </QueryClientProvider>
    )
}

// ─── Landing ─────────────────────────────────────────────────────────────────
//
// Landing is intentionally outcome-driven, not curriculum-driven. The job of
// each section, top to bottom:
//
//   1. Hero            — promise the transformation in two sentences.
//   2. How It Works    — show the 4-step loop so the offer feels concrete.
//   3. Your Journey    — five tiers in plain language (no NIP-05, no jargon).
//   4. Why this works  — emotional section: name the failure mode of video-
//                        based learning and contrast it.
//   5. Safe by design  — checklist that defuses the "is this real money?"
//                        fear before the user has to ask.
//   6. Who it's for    — let the visitor self-identify.
//   7. Footer CTA      — one last invitation, then the slim footer.
//
// Copy guideline: never name a protocol the visitor hasn't met yet.
// "NIP-05", "secp256k1", "BIP39" all belong inside missions, not on the door.

function Landing({
    theme,
    onToggleTheme,
    onStart,
    onFacilitator,
    hasResumable,
    onContinue,
}: {
    theme: Theme
    onToggleTheme: () => void
    onStart: () => void
    onFacilitator: () => void
    hasResumable: boolean
    onContinue: () => void
}) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg)',
                color: 'var(--text)',
            }}
        >
            <TopNav theme={theme} onToggleTheme={onToggleTheme} onCta={onStart} />

            <main id="main-content" style={{ flex: 1 }}>
                <Hero
                    hasResumable={hasResumable}
                    onStart={onStart}
                    onContinue={onContinue}
                    onFacilitator={onFacilitator}
                />
                <HowItWorks />
                <YourJourney />
                <WhyThisWorks />
                <SafeByDesign />
                <WhoItsFor />
                <FinalCTA
                    hasResumable={hasResumable}
                    onStart={onStart}
                    onContinue={onContinue}
                />
            </main>

            <SiteFooter />
        </div>
    )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero({
    hasResumable,
    onStart,
    onContinue,
    onFacilitator,
}: {
    hasResumable: boolean
    onStart: () => void
    onContinue: () => void
    onFacilitator: () => void
}) {
    return (
        <section
            aria-labelledby="hero-headline"
            style={{
                maxWidth: 760,
                margin: '0 auto',
                padding: 'clamp(2rem, 8vw, 4rem) clamp(1rem, 4vw, 1.5rem) clamp(2rem, 6vw, 3rem)',
                textAlign: 'center',
            }}
        >
            <span style={{ ...chip('orange'), marginBottom: 20 }}>
                <span
                    aria-hidden="true"
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: 'var(--bitcoin)',
                        display: 'inline-block',
                    }}
                />
                Free · no signup · no real money
            </span>

            <h1
                id="hero-headline"
                style={{
                    fontSize: 'clamp(34px, 8.5vw, 64px)',
                    fontWeight: 800,
                    lineHeight: 1.05,
                    letterSpacing: '-0.035em',
                    marginBottom: 18,
                }}
            >
                Learn Bitcoin
                <br />
                by <span className="gradient-text">actually using it.</span>
            </h1>

            {/* Two sentences. The first names the problem we all know
                (videos that go nowhere); the second names the cure. */}
            {/* Two short sentences. First names the failure mode; second
                states the cure. Anything longer here turns the hero into
                a paragraph — exactly the documentation-shaped page we're
                trying to escape. */}
            <p
                style={{
                    fontSize: 'clamp(16px, 3.6vw, 19px)',
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    maxWidth: 540,
                    margin: '0 auto 28px',
                }}
            >
                Most people watch videos about Bitcoin and stay confused.
                BitPilot teaches you by making you{' '}
                <strong style={{ color: 'var(--text)' }}>actually do it</strong>{' '}
                — and earn sats as you learn.
            </p>

            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                }}
            >
                {hasResumable && (
                    <button
                        style={{
                            ...primaryButton(),
                            padding: '14px 24px',
                            fontSize: 15,
                            minHeight: 48,
                        }}
                        onClick={onContinue}
                    >
                        ↻ Continue your missions
                    </button>
                )}
                <button
                    style={{
                        ...(hasResumable ? ghostButton : primaryButton()),
                        padding: '14px 24px',
                        fontSize: 15,
                        minHeight: 48,
                    }}
                    onClick={onStart}
                >
                    {hasResumable ? 'Start fresh' : '⚡ Start Learning Bitcoin'}
                </button>
                <button
                    style={{
                        ...ghostButton,
                        padding: '14px 22px',
                        fontSize: 14,
                        minHeight: 48,
                    }}
                    onClick={onFacilitator}
                >
                    🎓 Run a Workshop
                </button>
            </div>

            <p
                style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    marginTop: 18,
                    marginBottom: 0,
                }}
            >
                {MISSION_COUNT} missions · about 45 minutes · works on your phone
            </p>
        </section>
    )
}

// ─── How It Works ────────────────────────────────────────────────────────────

/** A 4-step "how" strip. Deliberately uses plain verbs, no jargon. */
function HowItWorks() {
    const steps: Array<{ n: string; title: string; body: string }> = [
        {
            n: '1',
            title: 'Learn',
            body: 'A short lesson that explains one concept at a time. No filler.',
        },
        {
            n: '2',
            title: 'Quiz',
            body: 'A quick check to prove the idea actually landed.',
        },
        {
            n: '3',
            title: 'Do',
            body: 'Use the real thing: create a wallet, send a payment, publish a Nostr note.',
        },
        {
            n: '4',
            title: 'Level Up',
            body: 'Claim sats, unlock the next tier, take on harder challenges.',
        },
    ]
    return (
        <section
            aria-labelledby="how-headline"
            style={{
                maxWidth: 1080,
                margin: '0 auto',
                padding: '0 clamp(1rem, 4vw, 1.5rem) clamp(2.5rem, 7vw, 4rem)',
            }}
        >
            <SectionHeading id="how-headline" eyebrow="How it works" title="Four steps, every mission." />
            <ol
                style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                }}
            >
                {steps.map((s) => (
                    <li
                        key={s.n}
                        style={{
                            ...card,
                            padding: 18,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 'var(--radius-1)',
                                background: 'var(--gradient-bitcoin)',
                                color: '#0A0A0B',
                                fontWeight: 800,
                                fontSize: 15,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {s.n}
                        </span>
                        <h3
                            style={{
                                fontSize: 17,
                                fontWeight: 800,
                                letterSpacing: '-0.02em',
                                margin: 0,
                            }}
                        >
                            {s.title}
                        </h3>
                        <p
                            style={{
                                fontSize: 13.5,
                                color: 'var(--text-soft)',
                                lineHeight: 1.55,
                                margin: 0,
                            }}
                        >
                            {s.body}
                        </p>
                    </li>
                ))}
            </ol>
        </section>
    )
}

// ─── Your Journey ────────────────────────────────────────────────────────────

/**
 * One-word outcome per tier. The old copy was a sentence; on a marketing
 * page this is too dense, especially repeated 5 times in a row. We swap
 * each long sentence for an icon + a single outcome phrase, and rely on
 * the slider to invite exploration instead of dumping it all at once.
 *
 * Order matches `TIERS` in `types.ts`. If a tier is renamed there, the
 * lookup quietly falls through to `t.tagline`.
 */
interface TierPitch {
    icon: string
    outcome: string
}
const TIER_PITCH: Record<string, TierPitch> = {
    novice: { icon: '🌱', outcome: 'Bitcoin basics, from zero.' },
    apprentice: { icon: '🔑', outcome: 'Wallets, keys, and transactions.' },
    pilot: { icon: '⚡', outcome: 'Lightning and Nostr in real scenarios.' },
    navigator: { icon: '🧭', outcome: 'eCash, zaps and the wider ecosystem.' },
    captain: { icon: '🚀', outcome: 'Self-custody and sovereignty.' },
}

/**
 * Horizontally scroll-snapped slider. CSS scroll-snap + overflow-x: auto
 * gives us touch swiping on mobile and mouse-wheel/drag on desktop with
 * no JS library. The arrow buttons on desktop are pure ergonomics — the
 * slider works without them.
 */
function YourJourney() {
    const trackRef = useRef<HTMLOListElement | null>(null)

    const scrollBy = (dir: -1 | 1) => {
        const el = trackRef.current
        if (!el) return
        // Step one card-width at a time. We read clientWidth so the step
        // adapts when the viewport changes.
        const step = Math.min(el.clientWidth * 0.85, 360)
        el.scrollBy({ left: step * dir, behavior: 'smooth' })
    }

    return (
        <section
            aria-labelledby="journey-headline"
            style={{
                maxWidth: 1080,
                margin: '0 auto',
                padding: '0 clamp(1rem, 4vw, 1.5rem) clamp(2.5rem, 7vw, 4rem)',
            }}
        >
            <SectionHeading
                id="journey-headline"
                eyebrow="Your journey"
                title="From beginner to Bitcoin captain."
            />

            <div style={{ position: 'relative' }}>
                <ol
                    ref={trackRef}
                    className="no-scrollbar"
                    style={{
                        listStyle: 'none',
                        padding: '4px 4px 16px',
                        margin: 0,
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        scrollSnapType: 'x mandatory',
                        scrollPaddingInline: '4px',
                        // The class above hides the visible scrollbar in
                        // every modern browser; we keep the inline style
                        // for the (rare) Firefox case as belt-and-braces.
                        scrollbarWidth: 'none',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {TIERS.map((t, i) => (
                        <TierSlide
                            key={t.key}
                            tier={t}
                            pitch={TIER_PITCH[t.key]}
                            index={i + 1}
                            total={TIERS.length}
                        />
                    ))}
                </ol>

                {/* Arrow buttons: hidden on touch viewports via media query
                    isn't possible without CSS; keep them visible but small
                    so they don't dominate on mobile. */}
                <SliderArrows onLeft={() => scrollBy(-1)} onRight={() => scrollBy(1)} />
            </div>

            <p
                style={{
                    textAlign: 'center',
                    fontSize: 13,
                    color: 'var(--muted)',
                    marginTop: 12,
                }}
            >
                {MISSION_COUNT} missions · Earn sats as you progress
            </p>
        </section>
    )
}

function TierSlide({
    tier: t,
    pitch,
    index,
    total,
}: {
    tier: (typeof TIERS)[number]
    pitch: TierPitch | undefined
    index: number
    total: number
}) {
    const meta = pitch ?? { icon: '✦', outcome: t.tagline }
    return (
        <li
            style={{
                ...card,
                padding: 20,
                flex: '0 0 min(280px, 80vw)',
                scrollSnapAlign: 'start',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minHeight: 200,
            }}
            aria-label={`Tier ${index} of ${total}: ${t.label}`}
        >
            <div
                aria-hidden="true"
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: 'var(--radius-3)',
                    background: 'var(--gradient-bitcoin)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    color: '#0A0A0B',
                    boxShadow: 'var(--shadow-1)',
                }}
            >
                {meta.icon}
            </div>
            <div
                style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                }}
            >
                Tier {index} / {total}
            </div>
            <h3
                style={{
                    fontSize: 20,
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.02em',
                }}
            >
                {t.label}
            </h3>
            <p
                style={{
                    fontSize: 14,
                    color: 'var(--text-soft)',
                    margin: 0,
                    lineHeight: 1.5,
                }}
            >
                {meta.outcome}
            </p>
        </li>
    )
}

function SliderArrows({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
    const btn: CSSProperties = {
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        color: 'var(--text)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontFamily: 'inherit',
        boxShadow: 'var(--shadow-1)',
    }
    return (
        <div
            aria-hidden="true"
            style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginTop: 4,
            }}
        >
            <button type="button" onClick={onLeft} style={btn} aria-label="Scroll tiers left">
                ←
            </button>
            <button type="button" onClick={onRight} style={btn} aria-label="Scroll tiers right">
                →
            </button>
        </div>
    )
}

// ─── Why this works (emotional section) ──────────────────────────────────────

function WhyThisWorks() {
    return (
        <section
            aria-labelledby="why-headline"
            style={{
                background: 'var(--surface)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div
                style={{
                    maxWidth: 640,
                    margin: '0 auto',
                    padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
                    textAlign: 'center',
                }}
            >
                <h2
                    id="why-headline"
                    style={{
                        fontSize: 'clamp(24px, 6vw, 36px)',
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        lineHeight: 1.15,
                        margin: '0 0 16px',
                    }}
                >
                    Most Bitcoin education fails.
                </h2>
                {/* One line. The contrast does the work — anything longer
                    reads as a lecture, which is exactly what we're
                    accusing the alternative of. */}
                <p
                    style={{
                        fontSize: 'clamp(15px, 3.5vw, 17px)',
                        color: 'var(--text-soft)',
                        lineHeight: 1.65,
                        maxWidth: 480,
                        margin: '0 auto 8px',
                    }}
                >
                    You watch the videos. You read the threads. You still never use Bitcoin.
                </p>
                <p
                    style={{
                        fontSize: 'clamp(16px, 3.6vw, 18px)',
                        color: 'var(--text)',
                        lineHeight: 1.45,
                        maxWidth: 480,
                        margin: '0 auto',
                        fontWeight: 700,
                    }}
                >
                    BitPilot makes you actually do it.
                </p>
            </div>
        </section>
    )
}

// ─── Safe by design ──────────────────────────────────────────────────────────

/**
 * Three visual tiles, not a bullet list. Each tile is one big icon, a
 * short label, and a one-line clarification. This is the highest-anxiety
 * section ("am I about to lose real money?") so we want it to feel
 * confident and self-evident, not defensive.
 *
 * The tiny "Lightning/eCash currently simulated" disclaimer is still
 * here, but shrunk and visually demoted under the tiles where it
 * belongs.
 */
function SafeByDesign() {
    const runtime = useRuntime()
    const lnReal = runtime?.lightning_real ?? false
    const ecashReal = runtime?.ecash_real ?? false
    const anySimulated = !lnReal || !ecashReal

    const tiles: Array<{ icon: string; label: string; sub: string }> = [
        { icon: '🛡️', label: 'No real money', sub: 'Testnet only — mainnet is never touched.' },
        { icon: '🔒', label: 'Your keys, your browser', sub: 'Keys are generated locally and stay with you.' },
        { icon: '🌍', label: 'Open source', sub: 'Every line of code is on GitHub.' },
    ]

    return (
        <section
            aria-labelledby="safe-headline"
            style={{
                maxWidth: 1080,
                margin: '0 auto',
                padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
            }}
        >
            <SectionHeading id="safe-headline" eyebrow="Safe by design" title="No real money. No risk." />
            <ul
                style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    maxWidth: 880,
                    marginInline: 'auto',
                }}
            >
                {tiles.map((t) => (
                    <SafetyTile key={t.label} {...t} />
                ))}
            </ul>
            {anySimulated && (
                <p
                    style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginTop: 18,
                        textAlign: 'center',
                        maxWidth: 480,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        lineHeight: 1.5,
                    }}
                >
                    {!lnReal && !ecashReal
                        ? 'Lightning and eCash integrations are currently simulated.'
                        : !lnReal
                          ? 'Lightning is currently simulated.'
                          : 'eCash is currently simulated.'}
                </p>
            )}
        </section>
    )
}

function SafetyTile({ icon, label, sub }: { icon: string; label: string; sub: string }) {
    return (
        <li
            style={{
                ...card,
                padding: '22px 18px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 10,
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'var(--gradient-bitcoin)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 30,
                    color: '#0A0A0B',
                    boxShadow: 'var(--shadow-1)',
                }}
            >
                {icon}
            </div>
            <h3
                style={{
                    fontSize: 16,
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.02em',
                }}
            >
                {label}
            </h3>
            <p
                style={{
                    fontSize: 13,
                    color: 'var(--text-soft)',
                    margin: 0,
                    lineHeight: 1.5,
                    maxWidth: 200,
                }}
            >
                {sub}
            </p>
        </li>
    )
}

// ─── Who it's for ────────────────────────────────────────────────────────────

function WhoItsFor() {
    // Trimmed to four items, learner-first. The old list ran to five and
    // started repeating itself ("students and communities" + "people who
    // tried videos" both said roughly the same thing). Tighter is better.
    const items = [
        'Anyone curious about Bitcoin',
        'People who tried videos and gave up',
        'Communities, study groups, and classrooms',
        'Workshop facilitators running sessions',
    ]
    return (
        <section
            aria-labelledby="who-headline"
            style={{
                background: 'var(--surface)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div
                style={{
                    maxWidth: 760,
                    margin: '0 auto',
                    padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
                }}
            >
                <SectionHeading id="who-headline" eyebrow="Who it's for" title="Built for the curious." />
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '0 auto',
                        maxWidth: 480,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                    }}
                >
                    {items.map((line) => (
                        <li
                            key={line}
                            style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                                fontSize: 15,
                                color: 'var(--text-soft)',
                                lineHeight: 1.5,
                            }}
                        >
                            <CheckDot />
                            <span>{line}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

// ─── Final CTA ──────────────────────────────────────────────────────────────

function FinalCTA({
    hasResumable,
    onStart,
    onContinue,
}: {
    hasResumable: boolean
    onStart: () => void
    onContinue: () => void
}) {
    return (
        <section
            aria-labelledby="final-cta-headline"
            style={{
                maxWidth: 760,
                margin: '0 auto',
                padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
                textAlign: 'center',
            }}
        >
            <h2
                id="final-cta-headline"
                style={{
                    fontSize: 'clamp(24px, 6vw, 36px)',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.15,
                    margin: '0 0 12px',
                }}
            >
                Ready to actually use Bitcoin?
            </h2>
            <p
                style={{
                    fontSize: 15,
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    maxWidth: 420,
                    margin: '0 auto 22px',
                }}
            >
                About 45 minutes. You'll come out the other side actually using it.
            </p>
            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                }}
            >
                <button
                    style={{
                        ...primaryButton(),
                        padding: '14px 24px',
                        fontSize: 15,
                        minHeight: 48,
                    }}
                    onClick={hasResumable ? onContinue : onStart}
                >
                    {hasResumable ? '↻ Continue your missions' : '⚡ Start Learning Bitcoin'}
                </button>
            </div>
        </section>
    )
}

// ─── Small shared bits ───────────────────────────────────────────────────────

function SectionHeading({
    id,
    eyebrow,
    title,
}: {
    id: string
    eyebrow: string
    title: string
}) {
    return (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--bitcoin)',
                    marginBottom: 8,
                }}
            >
                {eyebrow}
            </div>
            <h2
                id={id}
                style={{
                    fontSize: 'clamp(22px, 5vw, 32px)',
                    fontWeight: 800,
                    letterSpacing: '-0.025em',
                    lineHeight: 1.2,
                    margin: 0,
                }}
            >
                {title}
            </h2>
        </div>
    )
}

function CheckDot() {
    return (
        <span
            aria-hidden="true"
            style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--success)',
                color: '#0A0A0B',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 800,
                flexShrink: 0,
            }}
        >
            ✓
        </span>
    )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

/**
 * Slim two-column footer: brand on the left, project links on the right.
 *
 * The runtime-honesty checklist that used to live here moved up into the
 * `SafeByDesign` section, so the footer can go back to being a footer —
 * an exit, not a feature. We deliberately do NOT brag about the tech
 * stack ("built with Rust, sqlx, ..."); visitors don't care, and it
 * pulled the eye away from the actual sign-off line.
 */
function SiteFooter() {
    return (
        <footer
            style={{
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--muted)',
                fontSize: 13,
                lineHeight: 1.55,
            }}
        >
            <div
                style={{
                    maxWidth: 1080,
                    margin: '0 auto',
                    padding: 'clamp(1.75rem, 5vw, 2.5rem) clamp(1rem, 4vw, 1.5rem)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 'clamp(1.25rem, 3vw, 2rem)',
                    alignItems: 'start',
                }}
            >
                {/* Column 1 — brand + one-liner */}
                <div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 10,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 26,
                                height: 26,
                                borderRadius: 'var(--radius-1)',
                                background: 'var(--gradient-bitcoin)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                color: '#0A0A0B',
                                fontWeight: 800,
                            }}
                        >
                            ⚡
                        </span>
                        <span
                            style={{
                                color: 'var(--text)',
                                fontSize: 15,
                                fontWeight: 800,
                                letterSpacing: '-0.025em',
                            }}
                        >
                            BitPilot
                        </span>
                    </div>
                    <p style={{ margin: 0 }}>
                        Learn Bitcoin by actually using it. Built to be finished in an
                        afternoon and remembered for years.
                    </p>
                </div>

                {/* Column 2 — links */}
                <div>
                    <h3
                        style={{
                            color: 'var(--text)',
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            margin: '0 0 10px',
                        }}
                    >
                        Project
                    </h3>
                    <ul
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <li>
                            <a
                                href="https://github.com/Jolah1/bitpilot"
                                target="_blank"
                                rel="noreferrer"
                                style={footerLinkStyle}
                            >
                                GitHub repository
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://github.com/Jolah1/bitpilot/issues"
                                target="_blank"
                                rel="noreferrer"
                                style={footerLinkStyle}
                            >
                                Report an issue
                            </a>
                        </li>
                        <li>
                            <a href="https://bitcoin.org" target="_blank" rel="noreferrer" style={footerLinkStyle}>
                                What is Bitcoin?
                            </a>
                        </li>
                        <li>
                            <a href="https://nostr.com" target="_blank" rel="noreferrer" style={footerLinkStyle}>
                                What is Nostr?
                            </a>
                        </li>
                    </ul>
                </div>
            </div>

            <div
                style={{
                    borderTop: '1px solid var(--border)',
                    padding: '14px clamp(1rem, 4vw, 1.5rem)',
                    fontSize: 12,
                    color: 'var(--muted)',
                    textAlign: 'center',
                }}
            >
                Open source · MIT licensed · Built for Bitcoin education ·{' '}
                © {new Date().getFullYear()} BitPilot
            </div>
        </footer>
    )
}

const footerLinkStyle: CSSProperties = {
    color: 'var(--bitcoin)',
    textDecoration: 'none',
    fontWeight: 600,
}

function TopNav({
    theme,
    onToggleTheme,
    onCta,
}: {
    theme: Theme
    onToggleTheme: () => void
    onCta: () => void
}) {
    return (
        <nav
            aria-label="Primary"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px clamp(1rem, 4vw, 1.5rem)',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'var(--bg-elevated)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                zIndex: 50,
                gap: 8,
            }}
        >
            <a
                href="#main-content"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textDecoration: 'none',
                    color: 'var(--text)',
                    minWidth: 0,
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-1)',
                        background: 'var(--gradient-bitcoin)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        color: '#0A0A0B',
                        fontWeight: 800,
                        flexShrink: 0,
                    }}
                >
                    ⚡
                </span>
                <span
                    style={{
                        fontSize: 17,
                        fontWeight: 800,
                        letterSpacing: '-0.025em',
                    }}
                >
                    BitPilot
                </span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                <button
                    style={{
                        ...primaryButton(),
                        padding: '10px 16px',
                        fontSize: 14,
                        minHeight: 40,
                    }}
                    onClick={onCta}
                >
                    Start →
                </button>
            </div>
        </nav>
    )
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function Setup({
    theme,
    onToggleTheme,
    onBack,
    participantName,
    setParticipantName,
    sessionName,
    setSessionName,
    joinSessionId,
    loading,
    error,
    onStart,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    participantName: string
    setParticipantName: (v: string) => void
    sessionName: string
    setSessionName: (v: string) => void
    joinSessionId: string | null
    loading: boolean
    error: string
    onStart: () => void
}) {
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') onStart()
    }
    const joining = joinSessionId !== null
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg)',
            }}
        >
            {/* Mobile-safe sticky bar: back left, theme toggle right. Was
                position:absolute which caused overlap on narrow viewports. */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    gap: 8,
                }}
            >
                <button
                    onClick={onBack}
                    style={{ ...ghostButton, padding: '8px 14px', minHeight: 40 }}
                    aria-label="Back to landing page"
                >
                    ← Back
                </button>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>

            <main
                id="main-content"
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'clamp(1rem, 4vw, 1.5rem)',
                }}
            >
                <div style={{ width: '100%', maxWidth: 460 }}>
                    <div
                        style={{
                            ...card,
                            padding: 'clamp(20px, 5vw, 32px)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 18,
                        }}
                    >
                        <header>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <span
                                    aria-hidden="true"
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 'var(--radius-2)',
                                        background: 'var(--gradient-bitcoin)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 18,
                                    }}
                                >
                                    ⚡
                                </span>
                                <h1
                                    style={{
                                        fontSize: 'clamp(20px, 5vw, 24px)',
                                        fontWeight: 800,
                                        letterSpacing: '-0.025em',
                                        margin: 0,
                                    }}
                                >
                                    {joining ? 'Join the session' : "Let's go"}
                                </h1>
                            </div>
                            <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                                {joining
                                    ? "You're joining via a session link. Pick a name and you're in."
                                    : 'Pick a name to use during the missions. Nothing leaves your browser except a real Nostr note you choose to publish later.'}
                            </p>
                            {joining && (
                                <div
                                    style={{
                                        marginTop: 12,
                                        fontSize: 11,
                                        color: 'var(--muted)',
                                        fontFamily: 'var(--font-mono)',
                                        wordBreak: 'break-all',
                                    }}
                                >
                                    session · {joinSessionId!.slice(0, 8)}…
                                </div>
                            )}
                        </header>

                        <Field
                            label="Your name"
                            id="participant-name"
                            value={participantName}
                            onChange={setParticipantName}
                            onKeyDown={onKeyDown}
                            placeholder="e.g. Amaka, Chidi, Fatima…"
                            required
                            autoFocus
                            autoComplete="given-name"
                        />

                        {!joining && (
                            <Field
                                label="Session name"
                                optionalNote="(optional, for facilitators)"
                                id="session-name"
                                value={sessionName}
                                onChange={setSessionName}
                                onKeyDown={onKeyDown}
                                placeholder="e.g. Lagos Bitcoin Meetup"
                            />
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

                        <button
                            style={{
                                ...primaryButton(loading || !participantName.trim()),
                                width: '100%',
                                fontSize: 15,
                                minHeight: 48,
                            }}
                            onClick={onStart}
                            disabled={loading || !participantName.trim()}
                            aria-busy={loading}
                        >
                            {loading ? 'Starting…' : 'Start earning sats →'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}

function Field({
    label,
    id,
    value,
    onChange,
    onKeyDown,
    placeholder,
    autoFocus,
    required,
    optionalNote,
    autoComplete,
}: {
    label: string
    id: string
    value: string
    onChange: (v: string) => void
    onKeyDown?: (e: React.KeyboardEvent) => void
    placeholder?: string
    autoFocus?: boolean
    required?: boolean
    optionalNote?: string
    autoComplete?: string
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor={id} style={labelStyle}>
                {label}
                {optionalNote && (
                    <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: 'var(--muted)' }}>
                        {optionalNote}
                    </span>
                )}
            </label>
            <input
                id={id}
                style={input}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoFocus={autoFocus}
                required={required}
                autoComplete={autoComplete}
                spellCheck={false}
                aria-required={required}
            />
        </div>
    )
}

// ─── App shell (top bar + active view) ───────────────────────────────────────

/**
 * Mobile-first app shell.
 *
 * The old version put everything in one horizontal row:
 *   [logo] [learner tab] [facilitator tab] [theme toggle] [exit button]
 * On viewports <420px the Exit button was pushed off-screen, dead.
 *
 * New design: logo + a hamburger-style menu button. The menu reveals the
 * view-switcher and exit. On desktop (≥640px) the menu items are shown
 * inline. CSS-less: a single boolean + media-style breakpoints via inline
 * matchMedia.
 */
function AppShell({
    view,
    setView,
    theme,
    onToggleTheme,
    onExit,
    onHome,
    participantId,
    sessionId,
}: {
    view: View
    setView: (v: View) => void
    theme: Theme
    onToggleTheme: () => void
    onExit: () => void
    onHome: () => void
    participantId: string | null
    sessionId: string | null
}) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [isWide, setIsWide] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true
        return window.matchMedia('(min-width: 640px)').matches
    })

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 640px)')
        const onChange = () => setIsWide(mq.matches)
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    // Solo detection: a solo session has the sentinel name "__solo__". When
    // it does, the second view becomes a personal "Achievements" dashboard
    // rather than the multi-participant facilitator dashboard.
    const { data: session } = useQuery({
        queryKey: ['session', sessionId],
        queryFn: () => api.getSession(sessionId!),
        enabled: !!sessionId,
        staleTime: 60_000,
    })
    const isSolo = isSoloSessionName(session?.session?.name)
    // Label for the second tab. Facilitator views never see "Achievements"
    // since they only show up in solo sessions.
    const secondViewLabel = isSolo ? 'Achievements' : 'Facilitator'

    // Close the menu after any selection so mobile users get a clean state.
    const pick = (action: () => void) => {
        action()
        setMenuOpen(false)
    }

    const tabBtn = (v: View): CSSProperties => ({
        fontSize: 12,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '8px 14px',
        borderRadius: 'var(--radius-1)',
        fontWeight: 700,
        border: `1px solid ${view === v ? 'var(--bitcoin)' : 'var(--border-strong)'}`,
        cursor: 'pointer',
        background: view === v ? 'rgba(247, 147, 26, 0.12)' : 'transparent',
        color: view === v ? 'var(--bitcoin)' : 'var(--muted)',
        fontFamily: 'var(--font-sans)',
        minHeight: 36,
    })

    return (
        <>
            <header
                role="banner"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px clamp(0.75rem, 3vw, 1.25rem)',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border)',
                    gap: 8,
                }}
            >
                {/* Clickable logo — soft "home". Goes back to the landing
                    page without clearing credentials, so the user can hit
                    "Continue your missions" to come right back. Styled as
                    a bare button so it inherits the same visual treatment
                    as the marketing nav. */}
                <button
                    type="button"
                    onClick={onHome}
                    aria-label="Back to landing page"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    <span
                        aria-hidden="true"
                        style={{
                            width: 26,
                            height: 26,
                            borderRadius: 'var(--radius-1)',
                            background: 'var(--gradient-bitcoin)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            color: '#0A0A0B',
                            flexShrink: 0,
                        }}
                    >
                        ⚡
                    </span>
                    <span
                        style={{
                            fontSize: 15,
                            fontWeight: 800,
                            letterSpacing: '-0.025em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--text)',
                        }}
                    >
                        BitPilot
                    </span>
                </button>

                {/* Wide: inline tab pills + theme + exit. Narrow: hamburger. */}
                {isWide ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(['learner', 'facilitator'] as View[]).map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                style={tabBtn(v)}
                                aria-pressed={view === v}
                            >
                                {v === 'facilitator' ? secondViewLabel : v}
                            </button>
                        ))}
                        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                        <button
                            onClick={onExit}
                            style={{ ...ghostButton, padding: '8px 14px', fontSize: 12, minHeight: 36 }}
                        >
                            Exit
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                        <button
                            onClick={() => setMenuOpen((v) => !v)}
                            aria-expanded={menuOpen}
                            aria-controls="app-shell-menu"
                            aria-label="Open menu"
                            style={{
                                ...ghostButton,
                                padding: '6px 10px',
                                fontSize: 18,
                                lineHeight: 1,
                                minHeight: 36,
                                minWidth: 36,
                            }}
                        >
                            {menuOpen ? '✕' : '☰'}
                        </button>
                    </div>
                )}
            </header>

            {/* Mobile menu — slides in below the header */}
            {!isWide && menuOpen && (
                <div
                    id="app-shell-menu"
                    role="menu"
                    style={{
                        position: 'fixed',
                        top: 50,
                        right: 8,
                        left: 8,
                        zIndex: 99,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-3)',
                        boxShadow: 'var(--shadow-2)',
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    <span style={{ ...labelStyle, fontSize: 10 }}>View</span>
                    {(['learner', 'facilitator'] as View[]).map((v) => (
                        <button
                            key={v}
                            onClick={() => pick(() => setView(v))}
                            style={{ ...tabBtn(v), width: '100%', justifyContent: 'flex-start' }}
                            aria-pressed={view === v}
                            role="menuitem"
                        >
                            {v === 'facilitator' ? secondViewLabel : v}
                        </button>
                    ))}
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <button
                        onClick={() => pick(onExit)}
                        style={{
                            ...ghostButton,
                            padding: '10px 12px',
                            fontSize: 13,
                            width: '100%',
                            justifyContent: 'flex-start',
                            minHeight: 40,
                        }}
                        role="menuitem"
                    >
                        Exit to landing
                    </button>
                </div>
            )}

            <div
                id="main-content"
                style={{ paddingTop: 52, minHeight: '100vh' }}
                onClick={() => menuOpen && setMenuOpen(false)}
            >
                {view === 'learner' ? (
                    <LearnerView participantId={participantId!} />
                ) : isSolo ? (
                    <SoloProgressView participantId={participantId!} />
                ) : (
                    <FacilitatorDashboard sessionId={sessionId!} />
                )}
            </div>
        </>
    )
}
