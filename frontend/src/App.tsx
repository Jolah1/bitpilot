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
                {/* Hero — clearly tells you what BitPilot is in one sentence. */}
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

                    <p
                        style={{
                            fontSize: 'clamp(16px, 3.6vw, 19px)',
                            color: 'var(--text-soft)',
                            lineHeight: 1.55,
                            maxWidth: 560,
                            margin: '0 auto 14px',
                        }}
                    >
                        BitPilot is a hands-on course. You'll do {MISSION_COUNT} short missions
                        on Bitcoin, Lightning, Nostr and eCash — generating real keys, sending
                        real (testnet) payments, and publishing real Nostr posts as you go.
                    </p>
                    <p
                        style={{
                            fontSize: 14,
                            color: 'var(--muted)',
                            lineHeight: 1.55,
                            maxWidth: 520,
                            margin: '0 auto 28px',
                        }}
                    >
                        Every mission is <strong style={{ color: 'var(--text)' }}>Learn → Quiz → Do</strong>.
                        Pass the quiz, do the action, claim sats inside the app, move on.
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
                            {hasResumable ? 'Start fresh' : '⚡ Start my journey'}
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
                            I'm running a session
                        </button>
                    </div>
                </section>

                {/* Tier preview — what you'll actually do. */}
                <section
                    aria-labelledby="tiers-headline"
                    style={{
                        maxWidth: 1080,
                        margin: '0 auto',
                        padding: '0 clamp(1rem, 4vw, 1.5rem) clamp(2rem, 6vw, 4rem)',
                    }}
                >
                    <h2
                        id="tiers-headline"
                        style={{
                            textAlign: 'center',
                            fontSize: 'clamp(20px, 5vw, 28px)',
                            fontWeight: 800,
                            marginBottom: 6,
                            letterSpacing: '-0.025em',
                        }}
                    >
                        From novice to captain in five tiers
                    </h2>
                    <p
                        style={{
                            textAlign: 'center',
                            color: 'var(--muted)',
                            marginBottom: 24,
                            fontSize: 14,
                            paddingInline: 8,
                        }}
                    >
                        Higher tiers ask more of you and pay more sats.
                    </p>
                    <ol
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: 12,
                        }}
                    >
                        {TIERS.map((t) => (
                            <TierCard key={t.key} tier={t} />
                        ))}
                    </ol>
                </section>
            </main>

            <SiteFooter />
        </div>
    )
}

// ─── Tier card on the landing page ───────────────────────────────────────────

function TierCard({ tier: t }: { tier: (typeof TIERS)[number] }) {
    const count = t.range[1] - t.range[0] + 1
    return (
        <li
            style={{
                ...card,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={chip('orange')}>{t.label}</span>
                <span style={{ ...chip('neutral'), fontSize: 10 }}>
                    {count} missions · {t.reward} sats each
                </span>
            </div>
            <div
                style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono)',
                }}
            >
                Missions {t.range[0]}–{t.range[1]}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5 }}>
                {t.tagline}
            </div>
        </li>
    )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

/**
 * Three-column footer with brand, what-it-is, and links. Collapses to a
 * single stacked column on mobile.
 *
 * The "Network honesty" row used to be a big card on the landing page; it
 * belongs down here as a small note so the hero stays focused on the pitch.
 */
function SiteFooter() {
    const runtime = useRuntime()
    const lnReal = runtime?.lightning_real ?? false
    const ecashReal = runtime?.ecash_real ?? false

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
                    padding: 'clamp(2rem, 5vw, 3rem) clamp(1rem, 4vw, 1.5rem)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 'clamp(1.25rem, 3vw, 2rem)',
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
                        Hands-on Bitcoin, Lightning, Nostr and eCash. Built to be
                        finished in an afternoon and remembered for years.
                    </p>
                </div>

                {/* Column 2 — what's safe to do here */}
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
                        Is this safe?
                    </h3>
                    <ul
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                        }}
                    >
                        <FooterFact ok label="Mainnet" detail="Never touched. Nothing here moves real money." />
                        <FooterFact
                            ok
                            label="Nostr"
                            detail="Real keys, real signed events to public relays."
                        />
                        <FooterFact
                            ok={lnReal}
                            label="Lightning"
                            detail={lnReal ? 'Real signet via LNbits.' : 'Simulated until LNbits is wired.'}
                        />
                        <FooterFact
                            ok={ecashReal}
                            label="eCash"
                            detail={ecashReal ? 'Real Cashu testmint.' : 'Simulated for now.'}
                        />
                    </ul>
                </div>

                {/* Column 3 — links */}
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
                            <a href="https://nostr.com" target="_blank" rel="noreferrer" style={footerLinkStyle}>
                                What is Nostr?
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://bitcoin.org"
                                target="_blank"
                                rel="noreferrer"
                                style={footerLinkStyle}
                            >
                                What is Bitcoin?
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
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    gap: 8,
                    maxWidth: 1080,
                    margin: '0 auto',
                }}
            >
                <span>© {new Date().getFullYear()} BitPilot · Open source (MIT)</span>
                <span>
                    Built with Rust, React, sqlx and{' '}
                    <a
                        href="https://github.com/nostr-protocol/nostr"
                        target="_blank"
                        rel="noreferrer"
                        style={footerLinkStyle}
                    >
                        nostr-tools
                    </a>
                    .
                </span>
            </div>
        </footer>
    )
}

const footerLinkStyle: CSSProperties = {
    color: 'var(--bitcoin)',
    textDecoration: 'none',
    fontWeight: 600,
}

function FooterFact({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
    return (
        <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span
                aria-hidden="true"
                style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: ok ? 'var(--success)' : 'var(--muted)',
                    color: '#0A0A0B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 800,
                    flexShrink: 0,
                    marginTop: 3,
                }}
            >
                {ok ? '✓' : '·'}
            </span>
            <span>
                <strong style={{ color: 'var(--text)' }}>{label}.</strong> {detail}
            </span>
        </li>
    )
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
