import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { missionById } from '../lib/types'
import { BrandMark } from '../components/BrandMark'
import { LogoQRCanvas } from '../components/LogoQR'
import { ThemeToggle } from '../components/ThemeToggle'
import { card, chip, ghostButton, primaryButton } from '../lib/ui'
import type { Theme } from '../lib/theme'

/**
 * Public read-only challenge page (issue #58), reached via a
 * `?challenge=<id>` deep link. Anyone with the link sees the theme, the
 * mission list, the window, and the live leaderboard; no account, no
 * token. Joining hands over to the ordinary session-join flow against the
 * challenge's backing session.
 */
export default function ChallengeView({
    challengeId,
    theme,
    onToggleTheme,
    onJoin,
    onBack,
    onFacilitatorAccess,
}: {
    challengeId: string
    theme: Theme
    onToggleTheme: () => void
    /** Funnel into the setup screen, joining the backing session. */
    onJoin: (sessionId: string) => void
    onBack: () => void
    /** Token entry for whoever runs this challenge, session prefilled. */
    onFacilitatorAccess: (sessionId: string) => void
}) {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['challenge-results', challengeId],
        queryFn: () => api.getChallengeResults(challengeId),
        // Live leaderboards move; refresh while the tab is open. The
        // refetch also re-renders the countdown, so it never needs its
        // own timer.
        refetchInterval: 15_000,
    })
    const [copied, setCopied] = useState(false)

    const c = data?.challenge
    const live = c?.status === 'live'
    const shareUrl = `${window.location.origin}/?challenge=${challengeId}`
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard can be blocked; the link stays visible to select.
        }
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
                <button onClick={onBack} style={{ ...ghostButton, padding: '8px 14px', minHeight: 40 }} aria-label="Back to landing page">
                    ← Back
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BrandMark size={26} />
                    <span style={{ fontWeight: 800, letterSpacing: '-0.025em' }}>BitPilot</span>
                </div>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>

            <main
                id="main-content"
                style={{ flex: 1, width: '100%', maxWidth: 720, margin: '0 auto', padding: 'clamp(1rem, 4vw, 2rem)' }}
            >
                {isLoading && <p style={{ color: 'var(--muted)' }}>Loading the challenge…</p>}
                {isError && (
                    <div style={{ ...card, padding: 24, textAlign: 'center' }}>
                        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Challenge not found</h1>
                        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
                            This link points to a challenge that no longer exists, or the id is slightly off.
                        </p>
                    </div>
                )}

                {c && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <header style={{ ...card, padding: 'clamp(18px, 4vw, 28px)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={chip(live ? 'green' : 'orange')}>
                                    {c.status === 'live' ? 'Live now' : c.status === 'upcoming' ? 'Starts soon' : 'Final results'}
                                </span>
                                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                                    {fmtWindow(c.starts_at, c.ends_at)}
                                </span>
                                {c.status !== 'ended' && (
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--bitcoin)' }}>
                                        {live
                                            ? `Ends in ${fmtRemaining(c.ends_at)}`
                                            : `Starts in ${fmtRemaining(c.starts_at)}`}
                                    </span>
                                )}
                            </div>
                            <h1 style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 800, letterSpacing: '-0.025em', margin: '10px 0 0' }}>
                                {c.title}
                            </h1>
                            {c.blurb && (
                                <p style={{ fontSize: 14.5, color: 'var(--text-soft)', lineHeight: 1.6, margin: '8px 0 0' }}>{c.blurb}</p>
                            )}
                            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>
                                {c.participant_count} {c.participant_count === 1 ? 'pilot has' : 'pilots have'} joined ·{' '}
                                {c.missions.length} missions count
                            </p>
                            {live && (
                                <>
                                    <button
                                        className="bp-press"
                                        style={{ ...primaryButton(false), marginTop: 16, minHeight: 46, fontSize: 15 }}
                                        onClick={() => onJoin(c.session_id)}
                                    >
                                        Join this challenge
                                    </button>
                                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
                                        The name you pick appears on this public leaderboard, so a nickname is fine.
                                    </p>
                                </>
                            )}
                            {c.status === 'upcoming' && (
                                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '14px 0 0' }}>
                                    Joining opens with the window. You can practice the missions in a solo run today; only
                                    completions inside the window count here.
                                </p>
                            )}
                        </header>

                        <section style={{ ...card, padding: 'clamp(16px, 4vw, 24px)' }} aria-labelledby="challenge-missions">
                            <h2 id="challenge-missions" style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>
                                The missions
                            </h2>
                            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {c.missions.map((id) => {
                                    const m = missionById(id)
                                    return (
                                        <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                                            <span aria-hidden="true">{m?.emoji ?? '✦'}</span>
                                            <span>{m?.name ?? `Mission ${id}`}</span>
                                        </li>
                                    )
                                })}
                            </ol>
                        </section>

                        {c.status !== 'ended' && (
                            <section style={{ ...card, padding: 'clamp(16px, 4vw, 24px)' }} aria-labelledby="challenge-share">
                                <h2 id="challenge-share" style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>
                                    Bring pilots in
                                </h2>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <div style={{ padding: 8, background: '#FFFFFF', borderRadius: 'var(--radius-2)' }}>
                                        <LogoQRCanvas value={shareUrl} size={148} ariaLabel="QR code with the challenge link" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <p style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.55, margin: 0 }}>
                                            Project this page or drop the link in your group chat.
                                            Scanning lands here; joining takes a name, nothing else.
                                        </p>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                border: '1px solid var(--border)',
                                                borderRadius: 'var(--radius-1)',
                                                padding: '6px 10px',
                                                background: 'var(--bg)',
                                            }}
                                        >
                                            <code
                                                style={{
                                                    fontSize: 11,
                                                    color: 'var(--muted)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    flex: 1,
                                                    fontFamily: 'var(--font-mono)',
                                                }}
                                            >
                                                {shareUrl}
                                            </code>
                                            <button
                                                onClick={copyLink}
                                                style={{ ...ghostButton, padding: '4px 10px', fontSize: 11 }}
                                                aria-label={copied ? 'Link copied' : 'Copy challenge link'}
                                            >
                                                {copied ? '✓ Copied' : 'Copy'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        <section style={{ ...card, padding: 'clamp(16px, 4vw, 24px)' }} aria-labelledby="challenge-board">
                            <h2 id="challenge-board" style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>
                                {c.status === 'ended' ? 'Final results' : 'Leaderboard'}
                            </h2>
                            {c.status === 'ended' && data.results.length > 0 && (
                                <FinalRecap
                                    results={data.results}
                                    missionCount={c.missions.length}
                                />
                            )}
                            {data.results.length === 0 ? (
                                <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0 }}>
                                    {c.status === 'ended'
                                        ? 'The window closed with nobody on the board. The next challenge is another chance.'
                                        : 'Nobody has joined yet. First name on the board gets remembered.'}
                                </p>
                            ) : (
                                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {data.results.map((r, i) => {
                                        const done = r.cleared >= c.missions.length
                                        return (
                                            <li
                                                key={`${r.name}-${i}`}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    padding: '10px 12px',
                                                    borderRadius: 'var(--radius-2)',
                                                    background: i === 0 && r.cleared > 0 ? 'rgba(255, 87, 34, 0.08)' : 'var(--surface2)',
                                                    border: `1px solid ${i === 0 && r.cleared > 0 ? 'var(--bitcoin)' : 'var(--border)'}`,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontFamily: 'var(--font-mono)',
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        color: 'var(--muted)',
                                                        width: 26,
                                                    }}
                                                >
                                                    {i + 1}
                                                </span>
                                                <span style={{ fontSize: 14.5, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.name}
                                                    {done && <span aria-label="finished every mission"> 🏁</span>}
                                                </span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: done ? 'var(--bitcoin)' : 'var(--text-soft)' }}>
                                                    {r.cleared}/{c.missions.length}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ol>
                            )}
                            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '12px 0 0' }}>
                                {c.status === 'ended'
                                    ? 'Ranked by missions cleared inside the window; ties went to the earlier finisher.'
                                    : 'Ranked by missions cleared inside the window; ties go to the earlier finisher. Updates every 15 seconds.'}
                            </p>
                        </section>

                        <div style={{ textAlign: 'center', paddingBottom: 8 }}>
                            <button
                                type="button"
                                onClick={() => onFacilitatorAccess(c.session_id)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: 8,
                                    cursor: 'pointer',
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                    color: 'var(--muted)',
                                    textDecoration: 'underline',
                                    fontFamily: 'var(--font-sans)',
                                }}
                            >
                                Running this challenge? Open the facilitator dashboard
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

/**
 * One-paragraph closing story for an ended challenge: the winner, the
 * turnout, and how many full clears. The list below still shows every row.
 */
function FinalRecap({
    results,
    missionCount,
}: {
    results: { name: string; cleared: number }[]
    missionCount: number
}) {
    const winner = results[0]
    const fullClears = results.filter((r) => r.cleared >= missionCount).length
    const flew = results.length
    return (
        <div
            style={{
                background: 'rgba(255, 87, 34, 0.08)',
                border: '1px solid var(--bitcoin)',
                borderRadius: 'var(--radius-2)',
                padding: '12px 14px',
                marginBottom: 12,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: 'var(--text)',
            }}
        >
            <span aria-hidden="true">🏆 </span>
            <strong>{winner.name}</strong> tops the board with {winner.cleared}/{missionCount}.{' '}
            {flew} {flew === 1 ? 'pilot' : 'pilots'} flew this challenge
            {fullClears > 0
                ? `; ${fullClears} cleared every mission.`
                : '; nobody cleared every mission this time.'}
        </div>
    )
}

function fmtWindow(startsAt: number, endsAt: number): string {
    const fmt = (t: number) =>
        new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${fmt(startsAt)} to ${fmt(endsAt)}`
}

/**
 * Human countdown to a unix-seconds target: "2 days 5 hours", "5 hours
 * 12 minutes", "12 minutes", "under a minute". Two units max; anything
 * finer is noise at leaderboard timescales.
 */
function fmtRemaining(target: number): string {
    const secs = Math.max(0, target - Math.floor(Date.now() / 1000))
    if (secs < 60) return 'under a minute'
    const days = Math.floor(secs / 86400)
    const hours = Math.floor((secs % 86400) / 3600)
    const minutes = Math.floor((secs % 3600) / 60)
    const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
    if (days > 0) return hours > 0 ? `${unit(days, 'day')} ${unit(hours, 'hour')}` : unit(days, 'day')
    if (hours > 0) return minutes > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(hours, 'hour')
    return unit(minutes, 'minute')
}
