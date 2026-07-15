import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { missionById } from '../lib/types'
import { BrandMark } from '../components/BrandMark'
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
}: {
    challengeId: string
    theme: Theme
    onToggleTheme: () => void
    /** Funnel into the setup screen, joining the backing session. */
    onJoin: (sessionId: string) => void
    onBack: () => void
}) {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['challenge-results', challengeId],
        queryFn: () => api.getChallengeResults(challengeId),
        // Live leaderboards move; refresh while the tab is open.
        refetchInterval: 15_000,
    })

    const c = data?.challenge
    const live = c?.status === 'live'

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

                        <section style={{ ...card, padding: 'clamp(16px, 4vw, 24px)' }} aria-labelledby="challenge-board">
                            <h2 id="challenge-board" style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>
                                Leaderboard
                            </h2>
                            {data.results.length === 0 ? (
                                <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0 }}>
                                    Nobody has joined yet. First name on the board gets remembered.
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
                                Ranked by missions cleared inside the window; ties go to the earlier finisher. Updates every 15 seconds.
                            </p>
                        </section>
                    </div>
                )}
            </main>
        </div>
    )
}

function fmtWindow(startsAt: number, endsAt: number): string {
    const fmt = (t: number) =>
        new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${fmt(startsAt)} to ${fmt(endsAt)}`
}
