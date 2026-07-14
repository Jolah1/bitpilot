import {
    Suspense,
    lazy,
    useEffect,
    useState,
    type CSSProperties,
} from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import LearnerView from './views/LearnerView'
// The marketing landing page is the biggest single chunk of JSX in the app
// (~1100 lines of section markup) but a returning learner who arrives via a
// `?session=` deep link, a PWA launch, or a stored login never sees it.
// Lazy-loading shaves that off their initial JS payload.
const Landing = lazy(() => import('./views/Landing'))
// Facilitator + solo views aren't part of the default learner path. Lazy-load
// them so a fresh learner doesn't pay for ~30KB of code they may never open.
const FacilitatorDashboard = lazy(() => import('./views/FacilitatorDashboard'))
const SoloProgressView = lazy(() => import('./views/SoloProgressView'))
import { BrandMark } from './components/BrandMark'
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
import { RuntimeProvider } from './lib/runtime'
import {
    card,
    ghostButton,
    input,
    label as labelStyle,
    primaryButton,
} from './lib/ui'

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

type View = 'learner' | 'facilitator'
type Screen = 'landing' | 'setup' | 'session-not-found' | 'app'

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
                // Stale deep-link: the facilitator's QR points at a session
                // that's been pruned or never existed. Route to a dedicated
                // splash instead of dumping a raw "not found" into the form.
                if (e.status === 404 && joinSessionId) {
                    setScreen('session-not-found')
                } else {
                    setError(e.message)
                }
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
                    <Suspense fallback={<ViewLoading />}>
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
                    </Suspense>
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
                {screen === 'session-not-found' && (
                    <SessionNotFound
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onStartFresh={onExitToLanding}
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
                                <BrandMark size={36} />
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
                            {!joining && (
                                <p
                                    style={{
                                        marginTop: 10,
                                        marginBottom: 0,
                                        fontSize: 12,
                                        color: 'var(--muted)',
                                        letterSpacing: '0.03em',
                                    }}
                                >
                                    100% free · no signup · nothing to buy
                                </p>
                            )}
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

                        {/* Joining a session means the name lands on the host's
                            live dashboard. Say so plainly, and make clear a
                            nickname is fine — this is the point of entry where a
                            learner in a sensitive context would want to know. */}
                        {joining && (
                            <p
                                style={{
                                    marginTop: -8,
                                    marginBottom: 0,
                                    fontSize: 12.5,
                                    color: 'var(--muted)',
                                    lineHeight: 1.5,
                                }}
                            >
                                This name is shown to the person running your
                                session, so a nickname is fine.
                            </p>
                        )}

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
                            className="bp-press"
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
                            {loading ? 'Starting…' : 'Start the first mission →'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}

// ─── Session not found ───────────────────────────────────────────────────────
//
// Shown when the participant arrives via a stale `?session=<id>` deep link —
// the QR code in someone's slide deck, a bookmarked URL from a workshop
// months ago, a screenshot in a Telegram group. The backend returns 404 on
// the join call (the session row was pruned, or the id was typo'd via the
// /^[0-9a-f-]{36}$/ shape check but doesn't actually exist).
//
// Why a dedicated screen instead of an inline form error: the form copy
// reads "Pick a name and you're in" which is a lie when the session is
// gone. A separate splash sets expectations honestly and offers the only
// useful action — start a fresh solo run.
function SessionNotFound({
    theme,
    onToggleTheme,
    onStartFresh,
}: {
    theme: Theme
    onToggleTheme: () => void
    onStartFresh: () => void
}) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg)',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                }}
            >
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
                            textAlign: 'center',
                        }}
                    >
                        <div
                            aria-hidden="true"
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: 'var(--radius-2)',
                                background: 'var(--surface-2)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 26,
                                margin: '0 auto',
                            }}
                        >
                            🧭
                        </div>
                        <h1
                            style={{
                                fontSize: 'clamp(20px, 5vw, 24px)',
                                fontWeight: 800,
                                letterSpacing: '-0.025em',
                                margin: 0,
                            }}
                        >
                            This session has sailed
                        </h1>
                        <p
                            style={{
                                fontSize: 14,
                                color: 'var(--muted)',
                                lineHeight: 1.6,
                                margin: 0,
                            }}
                        >
                            The link you opened points to a session that no
                            longer exists — it may have ended, or the code is
                            slightly off. No worries: you can still earn every
                            badge on your own.
                        </p>
                        <button
                            className="bp-press"
                            style={{
                                ...primaryButton(false),
                                width: '100%',
                                fontSize: 15,
                                minHeight: 48,
                            }}
                            onClick={onStartFresh}
                        >
                            Start a fresh solo run →
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

// Lightweight Suspense fallback for the lazy-loaded views. Renders a soft
// pulsing card so the layout doesn't jump while the chunk arrives.
function ViewLoading() {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-label="Loading"
            style={{
                maxWidth: 960,
                margin: '32px auto',
                padding: '0 clamp(0.5rem, 3vw, 1rem)',
            }}
        >
            <div
                style={{
                    height: 160,
                    borderRadius: 'var(--radius-3)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    opacity: 0.7,
                    animation: 'bp-skeleton-pulse 1.4s ease-in-out infinite',
                }}
            />
            <style>{`@keyframes bp-skeleton-pulse {
                0%, 100% { opacity: 0.45; }
                50% { opacity: 0.8; }
            }`}</style>
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
                    <BrandMark size={26} />
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
                ) : (
                    <Suspense fallback={<ViewLoading />}>
                        {isSolo ? (
                            <SoloProgressView participantId={participantId!} />
                        ) : (
                            <FacilitatorDashboard sessionId={sessionId!} />
                        )}
                    </Suspense>
                )}
            </div>
        </>
    )
}
