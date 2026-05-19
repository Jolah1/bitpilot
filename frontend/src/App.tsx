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
import { MISSIONS, MISSION_COUNT } from './lib/types'
import {
    card,
    chip,
    ghostButton,
    input,
    label as labelStyle,
    primaryButton,
    techGradient,
    techTone,
} from './lib/ui'

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

type View = 'learner' | 'facilitator'
type Screen = 'landing' | 'setup' | 'app'

// On first mount, rehydrate from localStorage if a previous run left
// credentials behind. We only consider it valid if we have BOTH the auth
// token and the participant id; the api client also re-reads the token
// from localStorage on every request, so a refresh stays authenticated.
function rehydrate(): { sessionId: string | null; participantId: string | null; restored: boolean } {
    const token = getAuthToken()
    const sid = getSessionId()
    const pid = getParticipantId()
    if (token && pid && sid) {
        return { sessionId: sid, participantId: pid, restored: true }
    }
    return { sessionId: null, participantId: null, restored: false }
}

export default function App() {
    const initial = rehydrate()

    const [view, setView] = useState<View>('learner')
    const [theme, setTheme] = useState<Theme>(getSavedTheme)
    // If we successfully rehydrated, jump straight to the app screen so
    // refresh = continue. Otherwise show the landing page.
    const [screen, setScreen] = useState<Screen>(initial.restored ? 'app' : 'landing')
    const [sessionId, setSessionId] = useState<string | null>(initial.sessionId)
    const [participantId, setParticipantId] = useState<string | null>(initial.participantId)
    const [sessionName, setSessionName] = useState('')
    const [participantName, setParticipantName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

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
            // Wipe anything left over from a previous run before issuing
            // fresh credentials. Otherwise a stale Authorization header
            // could leak from one run into the next.
            clearAllTokens()
            const session = await api.createSession(sessionName.trim() || 'BitPilot Session')
            const participant = await api.joinSession(name, session.id)
            setSessionId(session.id)
            setParticipantId(participant.id)
            persistSessionId(session.id)
            persistParticipantId(participant.id)
            setScreen('app')
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
}: {
    theme: Theme
    onToggleTheme: () => void
    onStart: () => void
    onFacilitator: () => void
}) {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
            <TopNav theme={theme} onToggleTheme={onToggleTheme} onCta={onStart} />

            <main id="main-content">
                {/* Hero */}
                <section
                    aria-labelledby="hero-headline"
                    style={{
                        maxWidth: 920,
                        margin: '0 auto',
                        padding: '72px 24px 40px',
                        textAlign: 'center',
                    }}
                >
                    <span
                        style={{
                            ...chip('orange'),
                            marginBottom: 24,
                        }}
                    >
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
                        No experience needed
                    </span>

                    <h1
                        id="hero-headline"
                        style={{
                            fontSize: 'clamp(40px, 7vw, 76px)',
                            fontWeight: 800,
                            lineHeight: 1.04,
                            letterSpacing: '-0.035em',
                            marginBottom: 22,
                        }}
                    >
                        Learn Bitcoin
                        <br />
                        by <span className="gradient-text">actually using it.</span>
                    </h1>

                    <p
                        style={{
                            fontSize: 18,
                            color: 'var(--text-soft)',
                            lineHeight: 1.6,
                            maxWidth: 560,
                            margin: '0 auto 36px',
                        }}
                    >
                        Ten short missions. You'll generate a real Nostr identity, simulate Lightning payments,
                        claim a Cashu-style eCash token, and post your first message to a public network nobody
                        controls.
                    </p>

                    <div
                        style={{
                            display: 'flex',
                            gap: 12,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                            marginBottom: 56,
                        }}
                    >
                        <button
                            style={{ ...primaryButton(), padding: '16px 30px', fontSize: 16 }}
                            onClick={onStart}
                        >
                            ⚡ Start my journey
                        </button>
                        <button
                            style={{ ...ghostButton, padding: '15px 26px', fontSize: 15 }}
                            onClick={onFacilitator}
                        >
                            I'm running a session
                        </button>
                    </div>

                    {/* Honest stats */}
                    <dl
                        style={{
                            display: 'flex',
                            gap: 40,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                            margin: 0,
                        }}
                    >
                        {[
                            ['20 min', 'rough completion time'],
                            [`${MISSION_COUNT}`, 'missions, all explained'],
                            ['Real', 'Nostr keys & relay publish'],
                            ['Free', 'no signup, no wallet'],
                        ].map(([num, label]) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <dt
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 800,
                                        background: 'var(--gradient-bitcoin)',
                                        WebkitBackgroundClip: 'text',
                                        backgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        color: 'transparent',
                                    }}
                                >
                                    {num}
                                </dt>
                                <dd
                                    style={{
                                        fontSize: 11,
                                        color: 'var(--muted)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em',
                                        marginTop: 4,
                                        margin: '4px 0 0',
                                    }}
                                >
                                    {label}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* Missions preview */}
                <section
                    aria-labelledby="missions-headline"
                    style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 80px' }}
                >
                    <h2
                        id="missions-headline"
                        style={{
                            textAlign: 'center',
                            fontSize: 30,
                            fontWeight: 800,
                            marginBottom: 8,
                            letterSpacing: '-0.025em',
                        }}
                    >
                        {MISSION_COUNT} missions, four topics.
                    </h2>
                    <p
                        style={{
                            textAlign: 'center',
                            color: 'var(--muted)',
                            marginBottom: 36,
                            fontSize: 15,
                        }}
                    >
                        Every mission: <strong style={{ color: 'var(--text)' }}>Learn → Quiz → Do</strong>. The
                        quiz blocks the action until you actually understand the idea.
                    </p>
                    <ol
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 14,
                        }}
                    >
                        {MISSIONS.map((m) => (
                            <MissionCard key={m.id} mission={m} />
                        ))}
                    </ol>
                </section>

                <RuntimeBanner />
            </main>

            <footer
                style={{
                    textAlign: 'center',
                    padding: '32px 24px 40px',
                    borderTop: '1px solid var(--border)',
                    fontSize: 13,
                    color: 'var(--muted)',
                }}
            >
                Open source ·{' '}
                <a
                    href="https://github.com/Jolah1/bitpilot"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--bitcoin)', textDecoration: 'none', fontWeight: 600 }}
                >
                    github.com/Jolah1/bitpilot
                </a>
            </footer>
        </div>
    )
}

// ─── Mission card with live "TESTNET"/"SIMULATED"/"REAL" badge ───────────────

function MissionCard({ mission: m }: { mission: typeof MISSIONS[number] }) {
    const runtime = useRuntime()
    const isLnReal = runtime?.lightning_real ?? false
    const isEcashReal = runtime?.ecash_real ?? false

    // Decide which chip to show based on tech + runtime info.
    // - bitcoin / nostr: always real (no chip — would be noise)
    // - lightning: "Testnet" if LNbits wired, else "Simulated"
    // - ecash: "Testmint" if mint reachable, else "Simulated"
    let statusChip: { label: string; tone: Parameters<typeof chip>[0] } | null = null
    if (m.tech === 'lightning') {
        statusChip = isLnReal
            ? { label: 'Testnet', tone: 'green' }
            : { label: 'Simulated', tone: 'neutral' }
    } else if (m.tech === 'ecash') {
        statusChip = isEcashReal
            ? { label: 'Testmint', tone: 'green' }
            : { label: 'Simulated', tone: 'neutral' }
    } else if (m.tech === 'nostr' && m.do.kind === 'nostr-publish') {
        statusChip = { label: 'Live relays', tone: 'green' }
    }

    return (
        <li
            style={{
                ...card,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                position: 'relative',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div
                    aria-hidden="true"
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--radius-2)',
                        background: techGradient(m.tech),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                    }}
                >
                    {m.emoji}
                </div>
                <span style={chip(techTone(m.tech))}>{m.topic}</span>
                {statusChip && (
                    <span style={{ ...chip(statusChip.tone), fontSize: 10 }}>{statusChip.label}</span>
                )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>
                <span style={{ color: 'var(--muted)', marginRight: 6 }}>{m.id}.</span>
                {m.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{m.tagline}</div>
        </li>
    )
}

// ─── Honest "what's live, what's not" banner ─────────────────────────────────

function RuntimeBanner() {
    const runtime = useRuntime()
    const lnReal = runtime?.lightning_real ?? false
    const ecashReal = runtime?.ecash_real ?? false
    const mintUrl = runtime?.ecash_mint_url ?? 'not configured'

    return (
        <section
            aria-labelledby="honesty-headline"
            style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 80px' }}
        >
            <div style={{ ...card, padding: 22, background: 'var(--surface2)' }}>
                <h2 id="honesty-headline" style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>
                    What's running underneath
                </h2>
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        fontSize: 13.5,
                        color: 'var(--text-soft)',
                        lineHeight: 1.55,
                    }}
                >
                    <RuntimeRow
                        ok
                        label="Nostr"
                        detail="Real secp256k1 keys, real signed events broadcast to public relays."
                    />
                    <RuntimeRow
                        ok={ecashReal}
                        label="eCash"
                        detail={
                            ecashReal
                                ? `Real Cashu protocol against testmint ${mintUrl} — tokens any Cashu wallet can read.`
                                : 'Simulated. Set CASHU_MINT_URL on the backend to point at a real mint.'
                        }
                    />
                    <RuntimeRow
                        ok={lnReal}
                        label="Lightning"
                        detail={
                            lnReal
                                ? 'Real signet/testnet Lightning via LNbits — payments actually settle.'
                                : 'Simulated for now. Set LNBITS_URL + LNBITS_ADMIN_KEY on the backend to enable real testnet invoices.'
                        }
                    />
                    <RuntimeRow
                        ok
                        label="Bitcoin concepts"
                        detail="The three Bitcoin missions are knowledge-only — no network calls needed."
                    />
                </ul>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '14px 0 0', lineHeight: 1.5 }}>
                    Nothing here uses mainnet. No real money moves. The point is to learn the mechanics
                    safely.
                </p>
            </div>
        </section>
    )
}

function RuntimeRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
    return (
        <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
                aria-hidden="true"
                style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: ok ? 'var(--success)' : 'var(--muted)',
                    color: '#0A0A0B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    flexShrink: 0,
                    marginTop: 1,
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
                padding: '16px 24px',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'rgba(10, 10, 11, 0.85)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                zIndex: 50,
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
                    }}
                >
                    ⚡
                </span>
                <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.025em' }}>BitPilot</span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                <button style={{ ...primaryButton(), padding: '10px 18px', fontSize: 14 }} onClick={onCta}>
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
    loading: boolean
    error: string
    onStart: () => void
}) {
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') onStart()
    }
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg)',
                padding: 24,
                position: 'relative',
            }}
        >
            <button
                onClick={onBack}
                style={{ ...ghostButton, position: 'absolute', top: 20, left: 20, padding: '8px 14px' }}
                aria-label="Back to landing page"
            >
                ← Back
            </button>
            <div style={{ position: 'absolute', top: 20, right: 20 }}>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>

            <main id="main-content" style={{ width: '100%', maxWidth: 460 }}>
                <div
                    style={{
                        ...card,
                        padding: 32,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 20,
                    }}
                >
                    <header>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span
                                aria-hidden="true"
                                style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 'var(--radius-2)',
                                    background: 'var(--gradient-bitcoin)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 20,
                                }}
                            >
                                ⚡
                            </span>
                            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', margin: 0 }}>
                                Let's go
                            </h1>
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                            Pick a name to use during the missions. Nothing leaves your browser except a real
                            Nostr note you'll choose to publish at the end.
                        </p>
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

                    <Field
                        label="Session name"
                        optionalNote="(optional, for facilitators)"
                        id="session-name"
                        value={sessionName}
                        onChange={setSessionName}
                        onKeyDown={onKeyDown}
                        placeholder="e.g. Lagos Bitcoin Meetup"
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
                        style={{ ...primaryButton(loading || !participantName.trim()), width: '100%', fontSize: 15 }}
                        onClick={onStart}
                        disabled={loading || !participantName.trim()}
                        aria-busy={loading}
                    >
                        {loading ? 'Starting…' : 'Start earning sats →'}
                    </button>
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
    const tabBtn = (v: View): CSSProperties => ({
        fontSize: 12,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '6px 14px',
        borderRadius: 'var(--radius-1)',
        fontWeight: 700,
        border: `1px solid ${view === v ? 'var(--bitcoin)' : 'var(--border-strong)'}`,
        cursor: 'pointer',
        background: view === v ? 'rgba(247, 147, 26, 0.12)' : 'transparent',
        color: view === v ? 'var(--bitcoin)' : 'var(--muted)',
        fontFamily: 'var(--font-sans)',
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
                    padding: '10px 20px',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        }}
                    >
                        ⚡
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.025em' }}>BitPilot</span>
                </div>
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
                        style={{
                            ...ghostButton,
                            padding: '6px 12px',
                            fontSize: 12,
                        }}
                    >
                        Exit
                    </button>
                </div>
            </header>
            <div id="main-content" style={{ paddingTop: 56 }}>
                {view === 'learner' ? (
                    <LearnerView participantId={participantId!} />
                ) : (
                    <FacilitatorDashboard sessionId={sessionId!} />
                )}
            </div>
        </>
    )
}
