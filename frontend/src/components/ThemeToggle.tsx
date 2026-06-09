import { type Theme } from '../lib/theme'

interface Props {
    theme: Theme
    onToggle: () => void
}

/**
 * Accessible theme toggle.
 *
 * Switch-only: no visible Dark/Light text. The track colour, thumb
 * position, and aria-label together communicate state. Screen readers
 * still announce "Switch to light/dark mode" via the aria-label.
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
                display: 'inline-flex',
                alignItems: 'center',
                padding: 4,
                background: 'var(--surface2)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
        >
            {/* Track */}
            <span
                aria-hidden="true"
                style={{
                    width: 34,
                    height: 18,
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
                        left: isDark ? 1 : 15,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: isDark ? 'var(--bitcoin)' : 'var(--sat-green)',
                        transition: 'left 0.15s ease',
                        boxShadow:
                            '0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                    }}
                />
            </span>
        </button>
    )
}
