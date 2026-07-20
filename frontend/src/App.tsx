import {
    Suspense,
    lazy,
    useEffect,
    useState,
    type CSSProperties,
} from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import LearnerView from './views/LearnerView'
import {
    ViewErrorBoundary,
    clearChunkReloadFlag,
} from './components/ViewErrorBoundary'
// The marketing landing page is the biggest single chunk of JSX in the app
// (~1100 lines of section markup) but a returning learner who arrives via a
// `?session=` deep link, a PWA launch, or a stored login never sees it.
// Lazy-loading shaves that off their initial JS payload.
const Landing = lazy(() => import('./views/Landing'))
// Facilitator + solo views aren't part of the default learner path. Lazy-load
// them so a fresh learner doesn't pay for ~30KB of code they may never open.
const FacilitatorDashboard = lazy(() => import('./views/FacilitatorDashboard'))
const SoloProgressView = lazy(() => import('./views/SoloProgressView'))
// Public challenge leaderboard, reached via a ?challenge= deep link or the
// landing page's community challenges section.
const ChallengeView = lazy(() => import('./views/ChallengeView'))
// Challenge creation form, reached from the landing page.
const ChallengeCreateView = lazy(() => import('./views/ChallengeCreateView'))
// Token entry for a facilitator returning with a saved token (or on a new
// device); unlocks the standalone dashboard screen below.
const FacilitatorAccessView = lazy(() => import('./views/FacilitatorAccessView'))
// Public badge certificate page, reached via a ?cert= deep link that the
// learner shares as proof.
const CertificateView = lazy(() => import('./views/CertificateView'))
import { BrandMark } from './components/BrandMark'
import { ThemeToggle } from './components/ThemeToggle'
import { ContinueOnDeviceModal } from './components/ContinueOnDeviceModal'
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
    JOURNEYS,
    getJourneyPreferences,
    saveJourney,
    saveJourneyPreferences,
    type JourneyPreferences,
    type JourneyId,
} from './lib/journeys'
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
type Screen =
    | 'landing'
    | 'mode' // solo vs workshop, first onboarding step
    | 'goal' // practical outcome picker, second onboarding step (solo only)
    | 'setup'
    | 'session-not-found'
    | 'app'
    | 'pair'
    | 'challenge'
    | 'create-challenge'
    | 'facilitator-access'
    | 'dashboard'
    | 'certificate'

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
 * legitimately type, the backend only rejects empty names, not unusual
 * ones.
 */
export const SOLO_SESSION_NAME = '__solo__'
export function isSoloSessionName(name: string | null | undefined): boolean {
    return name === SOLO_SESSION_NAME
}

/**
 * On first mount we try to:
 *   1. Restore a previous run from localStorage (full credentials present).
 *   2. Read `?session=<id>` from the URL, facilitators share a QR with this
 *      param, so the participant lands directly on the setup screen with
 *      the session id pre-filled. Note: only `session=` is honored; no auth
 *      tokens come from the URL. The participant must still enter a name.
 */
function rehydrate(): {
    sessionId: string | null
    participantId: string | null
    restored: boolean
    deepLinkSessionId: string | null
    deepLinkChallengeId: string | null
    deepLinkCertId: string | null
} {
    const token = getAuthToken()
    const sid = getSessionId()
    const pid = getParticipantId()

    // ?session= / ?challenge= deep links (facilitator-shared QR / URL,
    // or a publicly announced community challenge).
    let deepLinkSessionId: string | null = null
    let deepLinkChallengeId: string | null = null
    let deepLinkCertId: string | null = null
    try {
        const url = new URL(window.location.href)
        const candidate = url.searchParams.get('session')
        // UUID-shaped only, reject anything else so the URL bar can't
        // be used to inject arbitrary strings into our session_id field.
        if (candidate && /^[0-9a-f-]{36}$/i.test(candidate)) {
            deepLinkSessionId = candidate
        }
        const challenge = url.searchParams.get('challenge')
        if (challenge && /^[0-9a-f-]{36}$/i.test(challenge)) {
            deepLinkChallengeId = challenge
        }
        const cert = url.searchParams.get('cert')
        if (cert && /^[0-9a-f-]{36}$/i.test(cert)) {
            deepLinkCertId = cert
        }
    } catch {
        // SSR or weird URL, ignore.
    }

    if (token && pid && sid) {
        return { sessionId: sid, participantId: pid, restored: true, deepLinkSessionId, deepLinkChallengeId, deepLinkCertId }
    }
    return { sessionId: null, participantId: null, restored: false, deepLinkSessionId, deepLinkChallengeId, deepLinkCertId }
}

export default function App() {
    const initial = rehydrate()

    const [view, setView] = useState<View>('learner')
    const [theme, setTheme] = useState<Theme>(getSavedTheme)
    // Routing rule:
    //   - ?challenge= deep link → public challenge leaderboard
    //   - ?session= deep link → setup (joining)
    //   - otherwise → landing
    // We deliberately do NOT auto-jump to the app screen even if there are
    // valid credentials in localStorage. The user should see what BitPilot
    // is on every visit; if they want to resume, the landing offers a
    // "Continue your missions" pill that reads from `initial.restored`.
    const [screen, setScreen] = useState<Screen>(
        initial.deepLinkCertId
            ? 'certificate'
            : initial.deepLinkChallengeId
              ? 'challenge'
              : initial.deepLinkSessionId
                ? 'setup'
                : 'landing',
    )
    const [challengeId, setChallengeId] = useState<string | null>(initial.deepLinkChallengeId)
    // Public certificate page (?cert= deep link). Read-only, no auth.
    const [certId] = useState<string | null>(initial.deepLinkCertId)
    // Standalone facilitator dashboard (token-based entry, no participant).
    const [dashboardSessionId, setDashboardSessionId] = useState<string | null>(null)
    // Session prefill for the token screen when arriving from a challenge page.
    const [facAccessSession, setFacAccessSession] = useState<string | null>(null)
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

    /** Device B finished redeeming a pairing code: `api.redeemPairingCode`
     *  already persisted the fresh credentials, so mirror them into state and
     *  boot straight into the learner view. */
    const onPaired = (participant: { id: string; session_id: string }) => {
        setSessionId(participant.session_id)
        setParticipantId(participant.id)
        setView('learner')
        setScreen('app')
    }

    useEffect(() => {
        applyTheme(theme)
        saveTheme(theme)
    }, [theme])

    // Release the one-reload guard, but only after the app has stayed up
    // for a while. Clearing it on mount would let a chunk that is
    // permanently missing (a genuinely broken deploy, not a stale tab)
    // reload forever, since each reload would restore its own retry. A
    // crash loop fails long before this fires, so the guard survives to
    // show the error panel instead, while a tab that recovered cleanly
    // regains its retry for the next deploy.
    useEffect(() => {
        const t = setTimeout(clearChunkReloadFlag, 30_000)
        return () => clearTimeout(t)
    }, [])

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
            // Clean up the URL, no need to keep ?session= or ?challenge=
            // hanging around once we're in.
            try {
                const url = new URL(window.location.href)
                url.searchParams.delete('session')
                url.searchParams.delete('challenge')
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

    /** "Exit" button, drop back to landing AND wipe credentials. */
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
     * Soft "home", go back to the landing page WITHOUT wiping credentials.
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

    /**
     * Open a challenge's public page from inside the app (landing section,
     * or right after creating one). Mirrors the ?challenge= deep link into
     * the URL so a refresh or share of the address bar lands on the same
     * page.
     */
    const openChallenge = (id: string) => {
        setChallengeId(id)
        setScreen('challenge')
        try {
            const url = new URL(window.location.href)
            url.searchParams.set('challenge', id)
            window.history.replaceState({}, '', url.toString())
        } catch {
            /* ignore */
        }
    }

    /** Token-validated entry into the standalone dashboard screen. */
    const openDashboard = (sid: string) => {
        setDashboardSessionId(sid)
        setScreen('dashboard')
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
                {/* Every view but the learner is lazy loaded, so a tab left
                    open across a deploy can ask for a chunk the server no
                    longer has. Without this the whole app unmounts to a
                    white page with nothing telling the user to reload. */}
                <ViewErrorBoundary>
                {screen === 'landing' && (
                    <Suspense fallback={<ViewLoading />}>
                        <Landing
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            onStart={() => {
                                setView('learner')
                                // Onboarding: solo vs workshop first, then
                                // (for solo) the goal picker, then the name.
                                setScreen('mode')
                            }}
                            onFacilitator={() => {
                                setView('facilitator')
                                setScreen('setup')
                            }}
                            onPair={() => setScreen('pair')}
                            hasResumable={hasResumable}
                            onContinue={continueExisting}
                            onOpenChallenge={openChallenge}
                            onCreateChallenge={() => setScreen('create-challenge')}
                            onFacilitatorAccess={() => {
                                setFacAccessSession(null)
                                setScreen('facilitator-access')
                            }}
                        />
                    </Suspense>
                )}
                {screen === 'mode' && (
                    <ChooseMode
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onBack={() => setScreen('landing')}
                        onSolo={() => {
                            setView('learner')
                            setScreen('goal')
                        }}
                        onWorkshop={() => {
                            setView('facilitator')
                            setScreen('setup')
                        }}
                    />
                )}
                {screen === 'goal' && (
                    <ChooseGoal
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onBack={() => setScreen('mode')}
                        onPick={(journey) => {
                            saveJourney(journey)
                            setScreen('setup')
                        }}
                    />
                )}
                {screen === 'setup' && (
                    <Setup
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onBack={() =>
                            setScreen(
                                joinSessionId
                                    ? 'landing'
                                    : view === 'learner'
                                      ? 'goal'
                                      : 'mode',
                            )
                        }
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
                {screen === 'pair' && (
                    <PairDevice
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onBack={() => setScreen('landing')}
                        onPaired={onPaired}
                    />
                )}
                {screen === 'create-challenge' && (
                    <Suspense fallback={<ViewLoading />}>
                        <ChallengeCreateView
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            onBack={() => setScreen('landing')}
                            onOpenChallenge={openChallenge}
                            onOpenDashboard={openDashboard}
                        />
                    </Suspense>
                )}
                {screen === 'facilitator-access' && (
                    <Suspense fallback={<ViewLoading />}>
                        <FacilitatorAccessView
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            initialSession={facAccessSession}
                            onOpen={openDashboard}
                            onBack={() => {
                                // Return to wherever the entry link lived: the
                                // challenge page when we were prefilled from
                                // one, the landing page otherwise.
                                setScreen(facAccessSession && challengeId ? 'challenge' : 'landing')
                                setFacAccessSession(null)
                            }}
                        />
                    </Suspense>
                )}
                {screen === 'certificate' && certId && (
                    <Suspense fallback={<ViewLoading />}>
                        <CertificateView
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            certId={certId}
                            onHome={() => {
                                setScreen('landing')
                                // Drop the ?cert= param so a refresh lands on
                                // the page the user chose to be on.
                                try {
                                    const url = new URL(window.location.href)
                                    url.searchParams.delete('cert')
                                    window.history.replaceState({}, '', url.toString())
                                } catch {
                                    /* ignore */
                                }
                            }}
                        />
                    </Suspense>
                )}
                {screen === 'dashboard' && dashboardSessionId && (
                    <DashboardShell
                        theme={theme}
                        onToggleTheme={toggleTheme}
                        onBack={() => setScreen('landing')}
                        sessionId={dashboardSessionId}
                    />
                )}
                {screen === 'challenge' && challengeId && (
                    <Suspense fallback={<ViewLoading />}>
                        <ChallengeView
                            challengeId={challengeId}
                            theme={theme}
                            onToggleTheme={toggleTheme}
                            onBack={() => {
                                setScreen('landing')
                                // Drop the ?challenge= param so a refresh
                                // lands on the page the user chose to be on.
                                try {
                                    const url = new URL(window.location.href)
                                    url.searchParams.delete('challenge')
                                    window.history.replaceState({}, '', url.toString())
                                } catch {
                                    /* ignore */
                                }
                            }}
                            onJoin={(sid) => {
                                // Same funnel as a ?session= deep link: the
                                // setup screen joins the backing session.
                                setJoinSessionId(sid)
                                setView('learner')
                                setScreen('setup')
                            }}
                            onFacilitatorAccess={(sid) => {
                                setFacAccessSession(sid)
                                setScreen('facilitator-access')
                            }}
                        />
                    </Suspense>
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
                </ViewErrorBoundary>
            </RuntimeProvider>
        </QueryClientProvider>
    )
}

// ─── Standalone facilitator dashboard shell ──────────────────────────────────

/**
 * Hosts FacilitatorDashboard for token-based entry, where there is no
 * participant and therefore no AppShell: just a slim bar (back, brand,
 * theme) over the dashboard. The token itself was validated and stored by
 * FacilitatorAccessView (or stashed by the challenge create flow) before
 * this screen mounts.
 */
function DashboardShell({
    theme,
    onToggleTheme,
    onBack,
    sessionId,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    sessionId: string
}) {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BrandMark size={26} />
                    <span style={{ fontWeight: 800, letterSpacing: '-0.025em' }}>BitPilot</span>
                </div>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <div id="main-content" style={{ flex: 1 }}>
                <Suspense fallback={<ViewLoading />}>
                    <FacilitatorDashboard sessionId={sessionId} />
                </Suspense>
            </div>
        </div>
    )
}

// ─── Onboarding steps (mode → goal → setup) ──────────────────────────────────

/**
 * Shared frame for the small pre-app step screens: sticky bar with back +
 * theme toggle, then one centered card. Setup and PairDevice predate this
 * helper and keep their own copies of the same markup.
 */
function StepShell({
    theme,
    onToggleTheme,
    onBack,
    children,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    children: React.ReactNode
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
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    gap: 8,
                }}
            >
                <button
                    onClick={onBack}
                    style={{ ...ghostButton, padding: '8px 14px', minHeight: 40 }}
                    aria-label="Go back"
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
                            gap: 16,
                        }}
                    >
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}

/** Big tappable option used by the two onboarding steps. */
function StepOption({
    icon,
    title,
    body,
    onClick,
}: {
    icon?: string
    title: string
    body: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            className="bp-press"
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-3)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text)',
                minHeight: 64,
            }}
        >
            {icon && (
                <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1.2 }}>
                    {icon}
                </span>
            )}
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
                    {title}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                    {body}
                </span>
            </span>
        </button>
    )
}

/** Onboarding step 1: solo run or workshop session. */
function ChooseMode({
    theme,
    onToggleTheme,
    onBack,
    onSolo,
    onWorkshop,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    onSolo: () => void
    onWorkshop: () => void
}) {
    return (
        <StepShell theme={theme} onToggleTheme={onToggleTheme} onBack={onBack}>
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
                        How will you use BitPilot?
                    </h1>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                    Solve a task by yourself or guide a group through one together.
                </p>
            </header>
            <StepOption
                icon="🧑‍🚀"
                title="Complete a task myself"
                body="Choose a practical outcome. Progress saves in this browser, and you can change tasks later."
                onClick={onSolo}
            />
            <StepOption
                icon="🎓"
                title="Run a workshop"
                body="Host a group session: you get a live dashboard and a link learners join with."
                onClick={onWorkshop}
            />
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                Joining someone else's workshop? Open the link or QR code your
                facilitator shared and you'll land straight in their session.
            </p>
        </StepShell>
    )
}

/** Onboarding step 2 (solo only): choose a useful outcome, or explore. */
function ChooseGoal({
    theme,
    onToggleTheme,
    onBack,
    onPick,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    onPick: (journey: JourneyId | null) => void
}) {
    const [preferences, setPreferences] = useState<JourneyPreferences>(
        () => getJourneyPreferences(),
    )
    const updatePreferences = (next: JourneyPreferences) => {
        setPreferences(next)
        saveJourneyPreferences(next)
    }
    return (
        <StepShell theme={theme} onToggleTheme={onToggleTheme} onBack={onBack}>
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
                        What do you need Bitcoin to help you do?
                    </h1>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                    Start with one useful result. You will learn the Bitcoin
                    concepts you need while completing the task.
                </p>
            </header>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <PreferenceButtons
                    label="Guidance"
                    value={preferences.guidance}
                    options={[
                        ['guided', 'Guide me step by step'],
                        ['self-directed', 'Give me a checklist'],
                    ]}
                    onChange={(guidance) =>
                        updatePreferences({ ...preferences, guidance })
                    }
                />
                <PreferenceButtons
                    label="Time available now"
                    value={String(preferences.sessionMinutes)}
                    options={[
                        ['15', '15 min'],
                        ['30', '30 min'],
                        ['60', '60 min'],
                    ]}
                    onChange={(minutes) =>
                        updatePreferences({
                            ...preferences,
                            sessionMinutes: Number(minutes),
                        })
                    }
                />
                <PreferenceButtons
                    label="Practice environment"
                    value={preferences.practiceMode}
                    options={[
                        ['simulation', 'Simulation'],
                        ['test-network', 'Test network'],
                    ]}
                    onChange={(practiceMode) =>
                        updatePreferences({ ...preferences, practiceMode })
                    }
                />
            </div>
            {JOURNEYS.map((journey) => (
                <StepOption
                    key={journey.id}
                    icon={journey.icon}
                    title={journey.title}
                    body={`${journey.audience} · about ${journey.minutes} min. ${journey.promise}`}
                    onClick={() => onPick(journey.id)}
                />
            ))}
            <button
                type="button"
                onClick={() => onPick(null)}
                style={{
                    ...ghostButton,
                    width: '100%',
                    minHeight: 44,
                    fontSize: 13.5,
                    justifyContent: 'center',
                }}
            >
                Explore the complete mission library
            </button>
        </StepShell>
    )
}

function PreferenceButtons<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: T
    options: [T, string][]
    onChange: (value: T) => void
}) {
    return (
        <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {options.map(([option, text]) => {
                    const active = value === option
                    return (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange(option)}
                            style={{
                                padding: '7px 10px',
                                borderRadius: 'var(--radius-pill)',
                                border: active
                                    ? '1px solid var(--bitcoin)'
                                    : '1px solid var(--border)',
                                background: active
                                    ? 'rgba(255, 87, 34, 0.1)'
                                    : 'transparent',
                                color: active ? 'var(--bitcoin)' : 'var(--text-soft)',
                                fontFamily: 'var(--font-sans)',
                                fontSize: 11.5,
                                cursor: 'pointer',
                            }}
                        >
                            {text}
                        </button>
                    )
                })}
            </div>
        </div>
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
                            nickname is fine, this is the point of entry where a
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
                            {loading ? 'Starting…' : 'Start the first mission'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}

// ─── Continue with a code (device B) ─────────────────────────────────────────
//
// The receiving side of "continue on another device". The learner opens
// BitPilot on a new device, lands here, and types the one-time code shown on
// their first device. On redeem, `api.redeemPairingCode` persists the fresh
// credentials and we boot straight into their session, same progress, new
// device. (The first device is signed out server-side; see the pairing route.)
function PairDevice({
    theme,
    onToggleTheme,
    onBack,
    onPaired,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    onPaired: (p: { id: string; session_id: string }) => void
}) {
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const submit = async () => {
        const c = code.trim()
        if (!c) return
        setLoading(true)
        setError('')
        try {
            const p = await api.redeemPairingCode(c)
            onPaired(p)
        } catch (e) {
            setError(
                e instanceof ApiError
                    ? e.message
                    : 'Could not continue. Check the code and try again.',
            )
            setLoading(false)
        }
    }
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') submit()
    }

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
                                    Continue with a code
                                </h1>
                            </div>
                            <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                                On your other device, open BitPilot and choose{' '}
                                <strong style={{ color: 'var(--text)' }}>Continue on another device</strong> to get a
                                code. It moves your progress here.
                            </p>
                        </header>

                        <Field
                            label="Your code"
                            id="pair-code"
                            value={code}
                            onChange={setCode}
                            onKeyDown={onKeyDown}
                            placeholder="e.g. K7QP-2ML9"
                            required
                            autoFocus
                        />

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
                                ...primaryButton(loading || !code.trim()),
                                width: '100%',
                                fontSize: 15,
                                minHeight: 48,
                            }}
                            onClick={submit}
                            disabled={loading || !code.trim()}
                            aria-busy={loading}
                        >
                            {loading ? 'Continuing…' : 'Continue'}
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
// useful action, start a fresh solo run.
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
                            longer exists, it may have ended, or the code is
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
                            Start a fresh solo run
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
    const [deviceModalOpen, setDeviceModalOpen] = useState(false)
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
        background: view === v ? 'rgba(255, 87, 34, 0.12)' : 'transparent',
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
                {/* Clickable logo, soft "home". Goes back to the landing
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
                        {view === 'learner' && (
                            <button
                                onClick={() => setDeviceModalOpen(true)}
                                style={{ ...ghostButton, padding: '8px 14px', fontSize: 12, minHeight: 36 }}
                                title="Continue on another device"
                            >
                                📲 Another device
                            </button>
                        )}
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

            {/* Mobile menu, slides in below the header */}
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
                    {view === 'learner' && (
                        <button
                            onClick={() => pick(() => setDeviceModalOpen(true))}
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
                            📲 Continue on another device
                        </button>
                    )}
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
                            <SoloProgressView
                                participantId={participantId!}
                                onResume={() => setView('learner')}
                            />
                        ) : (
                            <FacilitatorDashboard sessionId={sessionId!} />
                        )}
                    </Suspense>
                )}
            </div>

            <ContinueOnDeviceModal
                open={deviceModalOpen}
                onClose={() => setDeviceModalOpen(false)}
            />
        </>
    )
}
