import { Theme } from '../lib/theme'

interface Props {
    theme: Theme
    onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: Props) {
    const isDark = theme === 'dark'

    return (
        <button
            onClick={onToggle}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                background: 'var(--surface2)',
                border: '1px solid var(--border2)',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                color: 'var(--muted)',
                letterSpacing: 1,
                textTransform: 'uppercase',
                transition: 'all 0.2s',
            }}
        >
            {/* Track */}
            <div style={{
                width: 28, height: 16, borderRadius: 8,
                background: isDark ? 'var(--bitcoin-dim)' : 'var(--sat-green-dim)',
                border: `1px solid ${isDark ? 'var(--bitcoin)' : 'var(--sat-green)'}`,
                position: 'relative', flexShrink: 0,
                transition: 'all 0.2s',
            }}>
                {/* Thumb */}
                <div style={{
                    position: 'absolute',
                    top: 2, left: isDark ? 2 : 12,
                    width: 10, height: 10, borderRadius: '50%',
                    background: isDark ? 'var(--bitcoin)' : 'var(--sat-green)',
                    transition: 'left 0.2s',
                }} />
            </div>
            {isDark ? '🌙 Dark' : '☀️ Light'}
        </button>
    )
}
