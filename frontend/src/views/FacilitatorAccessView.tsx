import { useState } from 'react'
import { api, ApiError } from '../lib/api'
import { getFacilitatorToken, setFacilitatorToken, clearFacilitatorToken } from '../lib/auth'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggle } from '../components/ThemeToggle'
import { card, ghostButton, input, inputMono, label as labelStyle, primaryButton } from '../lib/ui'
import type { Theme } from '../lib/theme'

/**
 * Unlock a live facilitator dashboard with a saved token.
 *
 * Before this screen existed the token was a dead end: session creation
 * stashed it in localStorage transparently, but a challenge creator (or a
 * facilitator on a new device) had a copied token and no door to put it
 * in. This is the door.
 *
 * The session can be named three ways: a full BitPilot link with
 * ?session= or ?challenge=, a bare challenge id, or a bare session id.
 * Challenge ids resolve through the public results endpoint (which
 * exposes the backing session id); the token is then validated with one
 * authenticated session read before we commit it to storage.
 */
export default function FacilitatorAccessView({
    theme,
    onToggleTheme,
    onBack,
    initialSession,
    onOpen,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    /** Backing session id when arriving from a challenge page; skips the link field. */
    initialSession: string | null
    onOpen: (sessionId: string) => void
}) {
    const [link, setLink] = useState('')
    const [token, setToken] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

    /** Turn whatever the user pasted into a session id, or throw with advice. */
    const resolveSessionId = async (): Promise<string> => {
        if (initialSession) return initialSession
        const raw = link.trim()
        const uuid = raw.match(UUID)?.[0]
        if (!uuid) {
            throw new Error('Paste the challenge or session link, or the id itself.')
        }
        if (raw.includes('session=')) return uuid
        // A challenge link, or a bare id that might be either. The challenge
        // results endpoint is public, so probing it is free; a miss means
        // the uuid is (or should be) a session id.
        try {
            const res = await api.getChallengeResults(uuid)
            return res.challenge.session_id
        } catch {
            return uuid
        }
    }

    const submit = async () => {
        const t = token.trim()
        if (!t) return
        setLoading(true)
        setError('')
        // Validate before committing: swap the token in, try one
        // authenticated read, and restore the previous token on failure so
        // a typo can never wipe a working login.
        const previous = getFacilitatorToken()
        try {
            const sessionId = await resolveSessionId()
            setFacilitatorToken(t)
            await api.getSession(sessionId)
            onOpen(sessionId)
            return
        } catch (e) {
            if (previous) setFacilitatorToken(previous)
            else clearFacilitatorToken()
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
                setError('That token does not open this session. Check both and try again.')
            } else if (e instanceof ApiError && e.status === 404) {
                setError('No session found for that link or id. It may have ended.')
            } else {
                setError(e instanceof Error ? e.message : 'Could not open the dashboard. Try again.')
            }
        }
        setLoading(false)
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') submit()
    }

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
                <button onClick={onBack} style={{ ...ghostButton, padding: '8px 14px', minHeight: 40 }} aria-label="Go back">
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
                                    Open a facilitator dashboard
                                </h1>
                            </div>
                            <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                                {initialSession
                                    ? 'Paste the facilitator token you saved when this challenge was created.'
                                    : 'Paste your facilitator token and the link (or id) of the session or challenge it belongs to.'}
                            </p>
                        </header>

                        {!initialSession && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label htmlFor="fac-link" style={labelStyle}>
                                    Session or challenge link
                                </label>
                                <input
                                    id="fac-link"
                                    style={inputMono}
                                    value={link}
                                    onChange={(e) => setLink(e.target.value)}
                                    onKeyDown={onKeyDown}
                                    placeholder="https://bitpilot.app/?challenge=... or an id"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label htmlFor="fac-token" style={labelStyle}>
                                Facilitator token
                            </label>
                            <input
                                id="fac-token"
                                type="password"
                                style={{ ...input, fontFamily: 'var(--font-mono)' }}
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                onKeyDown={onKeyDown}
                                placeholder="Shown once when the session or challenge was created"
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </div>

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
                                ...primaryButton(loading || !token.trim()),
                                width: '100%',
                                fontSize: 15,
                                minHeight: 48,
                            }}
                            onClick={submit}
                            disabled={loading || !token.trim()}
                            aria-busy={loading}
                        >
                            {loading ? 'Checking…' : 'Open the dashboard'}
                        </button>
                        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                            The token stays in this browser only. Lost it? Tokens
                            cannot be recovered; create a fresh session or challenge.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
