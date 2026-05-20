import { useEffect, useState, type CSSProperties } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LearnerView from './views/LearnerView'
import FacilitatorDashboard from './views/FacilitatorDashboard'
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
                const session = await api.createSession(sessionName.trim() || 'BitPilot Session')
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
                        hasResumable={initial.restored}
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
            <p
                style={{
                    fontSize: 'clamp(16px, 3.6vw, 19px)',
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    maxWidth: 580,
                    margin: '0 auto 28px',
                }}
            >
                Most people watch videos about Bitcoin and still feel confused.
                BitPilot teaches you by making you{' '}
                <strong style={{ color: 'var(--text)' }}>do things for real</strong> — create
                wallets, send payments, use Lightning, publish on Nostr, and earn sats as
                you learn.
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
 * Tier descriptions deliberately diverge from `TIERS[].tagline` (which is
 * written for the in-app view, where the user already knows the jargon).
 * Here we want outcome statements — what the visitor will *be able to do*.
 *
 * The mapping by `key` is intentional: if a tier is renamed or reordered
 * in `types.ts`, the lookup just drops the missing one rather than
 * crashing the landing page.
 */
const TIER_PITCH: Record<string, string> = {
    novice: 'Learn the basics of Bitcoin. Why it exists, what a wallet is, how it actually works.',
    apprentice: 'Create real wallets. Understand keys, addresses, and how money moves.',
    pilot: 'Use Lightning and Nostr in real scenarios — send payments, publish your first note.',
    navigator: 'Explore eCash, zaps and the wider Bitcoin ecosystem.',
    captain: 'Master self-custody, on-chain transactions, and Bitcoin sovereignty.',
}

function YourJourney() {
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
                {TIERS.map((t) => (
                    <TierCard key={t.key} tier={t} pitch={TIER_PITCH[t.key] ?? t.tagline} />
                ))}
            </ol>
            <p
                style={{
                    textAlign: 'center',
                    fontSize: 13,
                    color: 'var(--muted)',
                    marginTop: 18,
                }}
            >
                {MISSION_COUNT} missions total · Earn sats as you progress
            </p>
        </section>
    )
}

function TierCard({ tier: t, pitch }: { tier: (typeof TIERS)[number]; pitch: string }) {
    return (
        <li
            style={{
                ...card,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={chip('orange')}>{t.label}</span>
            </div>
            <p
                style={{
                    fontSize: 13.5,
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    margin: 0,
                }}
            >
                {pitch}
            </p>
        </li>
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
                    maxWidth: 760,
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
                <p
                    style={{
                        fontSize: 'clamp(15px, 3.5vw, 17px)',
                        color: 'var(--text-soft)',
                        lineHeight: 1.65,
                        maxWidth: 560,
                        margin: '0 auto 20px',
                    }}
                >
                    You watch videos. You read threads. You memorise terms. And you still
                    never actually use Bitcoin.
                </p>
                <p
                    style={{
                        fontSize: 'clamp(16px, 3.6vw, 18px)',
                        color: 'var(--text)',
                        lineHeight: 1.55,
                        maxWidth: 560,
                        margin: '0 auto 24px',
                        fontWeight: 600,
                    }}
                >
                    BitPilot is different. Every mission is hands-on.
                </p>
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '0 auto',
                        maxWidth: 380,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        textAlign: 'left',
                    }}
                >
                    {[
                        'Real wallets, generated in your browser',
                        'Real cryptographic keys you control',
                        'Real Lightning payment flows',
                        'Real Nostr posts to public relays',
                        'Real learning — without risking real money',
                    ].map((line) => (
                        <li
                            key={line}
                            style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                fontSize: 14.5,
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

// ─── Safe by design ──────────────────────────────────────────────────────────

/**
 * Defuses the "is this real money?" anxiety before it's asked. We also use
 * the live runtime to add a single honest line about which integrations
 * are currently simulated — without making it the centrepiece.
 */
function SafeByDesign() {
    const runtime = useRuntime()
    const lnReal = runtime?.lightning_real ?? false
    const ecashReal = runtime?.ecash_real ?? false
    const anySimulated = !lnReal || !ecashReal

    const points = [
        'No real money required',
        'Uses testnet Bitcoin only — mainnet is never touched',
        'Learn without financial risk',
        'Open source and transparent',
        'Real Nostr interactions for authentic learning',
    ]
    return (
        <section
            aria-labelledby="safe-headline"
            style={{
                maxWidth: 760,
                margin: '0 auto',
                padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
            }}
        >
            <SectionHeading id="safe-headline" eyebrow="Safe by design" title="No real money. No risk." />
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
                {points.map((p) => (
                    <li
                        key={p}
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
                        <span>{p}</span>
                    </li>
                ))}
            </ul>
            {anySimulated && (
                <p
                    style={{
                        fontSize: 12.5,
                        color: 'var(--muted)',
                        marginTop: 20,
                        textAlign: 'center',
                        maxWidth: 480,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        lineHeight: 1.55,
                    }}
                >
                    {/* Tiny honest note — kept small on purpose. */}
                    {!lnReal && !ecashReal
                        ? 'Lightning and eCash are currently simulated while infrastructure is being finalised.'
                        : !lnReal
                          ? 'Lightning is currently simulated while infrastructure is being finalised.'
                          : 'eCash is currently simulated while infrastructure is being finalised.'}
                </p>
            )}
        </section>
    )
}

// ─── Who it's for ────────────────────────────────────────────────────────────

function WhoItsFor() {
    // Ordered learner-first. Facilitators are a real audience (the hero
    // has a "Run a Workshop" CTA for them) but they belong at the end,
    // framed as a role someone takes — not as the primary identity this
    // page speaks to.
    const items = [
        'Anyone curious about Bitcoin',
        'People who tried videos and gave up',
        'Students learning by doing',
        'Communities and study groups',
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
                    maxWidth: 480,
                    margin: '0 auto 22px',
                }}
            >
                It takes about 45 minutes. You'll come out the other side knowing more than
                most people who've held Bitcoin for years.
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
    participantId,
    sessionId,
}: {
    view: View
    setView: (v: View) => void
    theme: Theme
    onToggleTheme: () => void
    onExit: () => void
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
                        }}
                    >
                        BitPilot
                    </span>
                </div>

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
                                {v}
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
                            {v}
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
                ) : (
                    <FacilitatorDashboard sessionId={sessionId!} />
                )}
            </div>
        </>
    )
}
