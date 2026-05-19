import { type Theme } from '../lib/theme'

interface Props {
    theme: Theme
    onToggle: () => void
}

/**
 * Accessible theme toggle.
 *
 * - Rendered as a real <button> with `aria-pressed` so screen readers
 *   announce the current state.
 * - Visible label switches between Dark/Light so sighted users get
 *   the same affordance as the SR users.
 */
export function ThemeToggle({ theme, onToggle }: Props) {
    const isDark = theme === 'dark'
    return (
        <button
            onClick={onToggle}
            aria-pressed={isDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px 6px 6px',
                background: 'var(--surface2)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--muted)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
        >
            {/* Track */}
            <span
                aria-hidden="true"
                style={{
                    width: 30,
                    height: 16,
                    borderRadius: 'var(--radius-pill)',
                    background: isDark ? 'var(--bitcoin-dim)' : 'var(--sat-green-dim)',
                    border: `1px solid ${isDark ? 'var(--bitcoin)' : 'var(--sat-green)'}`,
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background 0.15s ease',
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        top: 1,
                        left: isDark ? 1 : 13,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: isDark ? 'var(--bitcoin)' : 'var(--sat-green)',
                        transition: 'left 0.15s ease',
                    }}
                />
            </span>
            <span aria-hidden="true">{isDark ? 'Dark' : 'Light'}</span>
        </button>
    )
}
