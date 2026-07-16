import { useState } from 'react'
import { api, ApiError, type CreateChallengeResult } from '../lib/api'
import { missionById } from '../lib/types'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggle } from '../components/ThemeToggle'
import { card, chip, ghostButton, input, inputMono, label as labelStyle, primaryButton } from '../lib/ui'
import type { Theme } from '../lib/theme'

/**
 * Create a weekly community challenge without touching curl (issue list:
 * "complete #58's story"). A challenge is a themed public leaderboard over
 * a mission subset and a time window; creation is open, same trust model
 * as session creation, with rate limiting as the abuse control.
 *
 * The success screen matters more than the form: the facilitator token of
 * the backing session is returned exactly once, so it is displayed with a
 * save-this warning next to the public share link.
 */

/** The four ready-made themes from the README, plus a custom escape hatch. */
const PRESETS: { key: string; title: string; blurb: string; missions: number[] }[] = [
    {
        key: 'tx',
        title: 'Understand a transaction',
        blurb: 'Read a real Bitcoin transaction: inputs, outputs, fees.',
        missions: [6, 7, 19],
    },
    {
        key: 'lightning',
        title: 'First Lightning payment',
        blurb: 'Receive and send your first Lightning payment.',
        missions: [21, 22, 23, 24],
    },
    {
        key: 'nostr',
        title: 'Publish your first note',
        blurb: 'Make a real Nostr identity and publish a signed note.',
        missions: [13, 14, 26],
    },
    {
        key: 'seed',
        title: 'Seed phrase bootcamp',
        blurb: 'Generate, back up, and reason about a real seed phrase.',
        missions: [11, 12, 41],
    },
]

/** Format a Date as a `datetime-local` input value in local time. */
function toLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ChallengeCreateView({
    theme,
    onToggleTheme,
    onBack,
    onOpenChallenge,
}: {
    theme: Theme
    onToggleTheme: () => void
    onBack: () => void
    /** Jump to the public challenge page that was just created. */
    onOpenChallenge: (id: string) => void
}) {
    const [presetKey, setPresetKey] = useState<string>('lightning')
    const preset = PRESETS.find((p) => p.key === presetKey)
    const [title, setTitle] = useState('')
    const [blurb, setBlurb] = useState('')
    const [customMissions, setCustomMissions] = useState('')
    const now = new Date()
    const [startsLocal, setStartsLocal] = useState(() => toLocalInput(now))
    const [endsLocal, setEndsLocal] = useState(() =>
        toLocalInput(new Date(now.getTime() + 7 * 24 * 3600 * 1000)),
    )
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [created, setCreated] = useState<CreateChallengeResult | null>(null)
    const [copied, setCopied] = useState<'link' | 'token' | null>(null)

    const effectiveTitle = title.trim() || preset?.title || ''
    const effectiveBlurb = blurb.trim() || preset?.blurb || ''
    const missions: number[] = preset
        ? preset.missions
        : customMissions
              .split(/[\s,]+/)
              .filter(Boolean)
              .map((s) => Number(s))
              .filter((n) => Number.isInteger(n) && n >= 0)

    const submit = async () => {
        setError('')
        const starts = Math.floor(new Date(startsLocal).getTime() / 1000)
        const ends = Math.floor(new Date(endsLocal).getTime() / 1000)
        if (!effectiveTitle) {
            setError('Give the challenge a title.')
            return
        }
        if (missions.length === 0) {
            setError('Pick a theme, or list at least one mission number.')
            return
        }
        if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
            setError('The end of the window must come after the start.')
            return
        }
        setLoading(true)
        try {
            const res = await api.createChallenge({
                title: effectiveTitle,
                blurb: effectiveBlurb,
                missions,
                starts_at: starts,
                ends_at: ends,
            })
            setCreated(res)
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not create the challenge. Try again.')
        }
        setLoading(false)
    }

    const copy = async (what: 'link' | 'token', value: string) => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(what)
            setTimeout(() => setCopied(null), 2000)
        } catch {
            // Clipboard can be blocked; the value stays visible to select.
        }
    }

    const shareUrl = created
        ? `${window.location.origin}/?challenge=${created.challenge.id}`
        : ''

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
                <button onClick={onBack} style={{ ...ghostButton, padding: '8px 14px', minHeight: 40 }} aria-label="Back to landing page">
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
                <div style={{ width: '100%', maxWidth: 560 }}>
                    <div
                        style={{
                            ...card,
                            padding: 'clamp(20px, 5vw, 32px)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                        }}
                    >
                        {created ? (
                            <ChallengeCreated
                                title={created.challenge.title}
                                shareUrl={shareUrl}
                                facilitatorToken={created.facilitator_token}
                                copied={copied}
                                onCopy={copy}
                                onOpen={() => onOpenChallenge(created.challenge.id)}
                            />
                        ) : (
                            <>
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
                                            Run a weekly challenge
                                        </h1>
                                    </div>
                                    <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>
                                        A themed public leaderboard over a few missions and a
                                        time window. Anyone with the link can watch; anyone can
                                        join while it runs. Free, no account.
                                    </p>
                                </header>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <span style={labelStyle}>Theme</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {PRESETS.map((p) => {
                                            const active = presetKey === p.key
                                            return (
                                                <button
                                                    key={p.key}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() => setPresetKey(p.key)}
                                                    style={presetChip(active)}
                                                >
                                                    {p.title}
                                                </button>
                                            )
                                        })}
                                        <button
                                            type="button"
                                            aria-pressed={presetKey === 'custom'}
                                            onClick={() => setPresetKey('custom')}
                                            style={presetChip(presetKey === 'custom')}
                                        >
                                            Custom missions
                                        </button>
                                    </div>
                                    {preset ? (
                                        <ul
                                            style={{
                                                listStyle: 'none',
                                                margin: '4px 0 0',
                                                padding: 0,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 4,
                                            }}
                                        >
                                            {preset.missions.map((id) => {
                                                const m = missionById(id)
                                                return (
                                                    <li key={id} style={{ fontSize: 12.5, color: 'var(--text-soft)', display: 'flex', gap: 8 }}>
                                                        <span aria-hidden="true">{m?.emoji ?? '✦'}</span>
                                                        <span>{m?.name ?? `Mission ${id}`}</span>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    ) : (
                                        <input
                                            style={inputMono}
                                            value={customMissions}
                                            onChange={(e) => setCustomMissions(e.target.value)}
                                            placeholder="Mission numbers, e.g. 6, 7, 19"
                                            aria-label="Custom mission numbers"
                                            spellCheck={false}
                                        />
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <label htmlFor="ch-title" style={labelStyle}>
                                        Title
                                        <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: 'var(--muted)' }}>
                                            (defaults to the theme)
                                        </span>
                                    </label>
                                    <input
                                        id="ch-title"
                                        style={input}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder={preset?.title ?? 'e.g. Lagos Lightning week'}
                                        maxLength={120}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <label htmlFor="ch-blurb" style={labelStyle}>
                                        Blurb
                                        <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: 'var(--muted)' }}>
                                            (optional, shown on the public page)
                                        </span>
                                    </label>
                                    <input
                                        id="ch-blurb"
                                        style={input}
                                        value={blurb}
                                        onChange={(e) => setBlurb(e.target.value)}
                                        placeholder={preset?.blurb ?? 'One sentence on what pilots will do.'}
                                        maxLength={280}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <label htmlFor="ch-starts" style={labelStyle}>Starts</label>
                                        <input
                                            id="ch-starts"
                                            type="datetime-local"
                                            style={input}
                                            value={startsLocal}
                                            onChange={(e) => setStartsLocal(e.target.value)}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <label htmlFor="ch-ends" style={labelStyle}>Ends</label>
                                        <input
                                            id="ch-ends"
                                            type="datetime-local"
                                            style={input}
                                            value={endsLocal}
                                            onChange={(e) => setEndsLocal(e.target.value)}
                                        />
                                    </div>
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
                                    style={{ ...primaryButton(loading), width: '100%', fontSize: 15, minHeight: 48 }}
                                    onClick={submit}
                                    disabled={loading}
                                    aria-busy={loading}
                                >
                                    {loading ? 'Creating…' : 'Create the challenge'}
                                </button>
                                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                                    Completions count only inside the window. Names on the
                                    leaderboard are whatever joiners pick, so nicknames are fine.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}

function ChallengeCreated({
    title,
    shareUrl,
    facilitatorToken,
    copied,
    onCopy,
    onOpen,
}: {
    title: string
    shareUrl: string
    facilitatorToken: string
    copied: 'link' | 'token' | null
    onCopy: (what: 'link' | 'token', value: string) => void
    onOpen: () => void
}) {
    return (
        <>
            <header style={{ textAlign: 'center' }}>
                <div aria-hidden="true" style={{ fontSize: 40, marginBottom: 6 }}>🏁</div>
                <h1 style={{ fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 800, letterSpacing: '-0.025em', margin: 0 }}>
                    {title} is live
                </h1>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55, margin: '8px 0 0' }}>
                    Share the public link anywhere. The page shows the missions,
                    a join button while the window is open, and the leaderboard.
                </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Public share link</span>
                <div style={copyRow}>
                    <code style={copyValue}>{shareUrl}</code>
                    <button
                        onClick={() => onCopy('link', shareUrl)}
                        style={{ ...ghostButton, padding: '4px 10px', fontSize: 11 }}
                        aria-label={copied === 'link' ? 'Link copied' : 'Copy share link'}
                    >
                        {copied === 'link' ? '✓ Copied' : 'Copy'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Facilitator token</span>
                <div style={copyRow}>
                    <code style={copyValue}>{facilitatorToken}</code>
                    <button
                        onClick={() => onCopy('token', facilitatorToken)}
                        style={{ ...ghostButton, padding: '4px 10px', fontSize: 11 }}
                        aria-label={copied === 'token' ? 'Token copied' : 'Copy facilitator token'}
                    >
                        {copied === 'token' ? '✓ Copied' : 'Copy'}
                    </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                    <strong style={{ color: 'var(--text)' }}>Save this now.</strong>{' '}
                    It unlocks the live facilitator dashboard for this challenge
                    and is shown exactly once; it cannot be recovered.
                </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="bp-press" style={{ ...primaryButton(false), flex: 1, minHeight: 46 }} onClick={onOpen}>
                    Open the challenge page
                </button>
            </div>
            <div style={{ textAlign: 'center' }}>
                <span style={chip('green')}>Anyone with the link can join while it runs</span>
            </div>
        </>
    )
}

const copyRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-1)',
    padding: '8px 10px',
    background: 'var(--bg)',
}

const copyValue: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-soft)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    fontFamily: 'var(--font-mono)',
}

function presetChip(active: boolean): React.CSSProperties {
    return {
        padding: '8px 14px',
        fontSize: 12.5,
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        background: active ? 'rgba(255, 87, 34, 0.12)' : 'transparent',
        border: active ? '1px solid var(--bitcoin)' : '1px solid var(--border)',
        color: active ? 'var(--bitcoin)' : 'var(--text-soft)',
        minHeight: 38,
    }
}
