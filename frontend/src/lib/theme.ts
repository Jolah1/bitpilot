export type Theme = 'dark' | 'light'

/**
 * The full design-token set. Both themes ship the same keys so consumers
 * can rely on every var being defined. Contrast for body text was verified
 * against WCAG AA (4.5:1) for both modes.
 */
const TOKENS: Record<Theme, Record<string, string>> = {
    dark: {
        '--bitcoin': '#F7931A',
        '--bitcoin-strong': '#FFA940',
        '--bitcoin-dim': '#6B3D06',
        '--gold': '#FFAB91',
        '--gold-strong': '#FFCCBC',
        '--sat-green': '#10C57E',
        '--sat-green-dim': '#0A3D2A',
        '--nostr-purple': '#A78BFA',
        '--nostr-dim': '#2D1B6B',
        '--ecash-cyan': '#5EEAD4',
        '--ecash-dim': '#0F3D38',

        '--bg': '#0B1220',
        '--bg-elevated': '#121A30',
        '--surface': '#16203A',
        '--surface2': '#1C2945',
        '--border': '#2A3656',
        '--border-strong': '#3A4A75',

        '--text': '#F4F2EE',
        '--text-soft': '#CFCCC6',
        '--muted': '#9A968F',
        '--danger': '#F87171',
        '--success': '#10C57E',
        '--warning': '#FF5722',

        '--gradient-bitcoin': 'linear-gradient(135deg, #F7931A 0%, #FFB74D 100%)',
        '--gradient-lightning': 'linear-gradient(135deg, #F7931A 0%, #FFAB91 100%)',
        '--gradient-nostr': 'linear-gradient(135deg, #A78BFA 0%, #5EEAD4 100%)',
        '--gradient-ecash': 'linear-gradient(135deg, #5EEAD4 0%, #10C57E 100%)',
        '--gradient-hero': 'linear-gradient(135deg, #F7931A 0%, #FFAB91 100%)',
        '--gradient-surface': 'linear-gradient(180deg, rgba(247, 147, 26, 0.05) 0%, rgba(11, 18, 32, 0.0) 100%)',

        '--shadow-1': '0 1px 2px rgba(0, 0, 0, 0.4)',
        '--shadow-2': '0 6px 24px rgba(0, 0, 0, 0.35)',
        '--shadow-focus': '0 0 0 3px rgba(247, 147, 26, 0.45)',
    },
    light: {
        // Light-mode tokens. Bitcoin orange is darkened to clear AA contrast on
        // light surfaces; the deep-orange accent likewise — a pale tint would vanish on
        // off-white. The dark mode goes navy; light mode stays warm parchment
        // so the two themes feel like daylight + night sky rather than two
        // mismatched colour systems.
        '--bitcoin': '#B45A06',
        '--bitcoin-strong': '#C76C0F',
        '--bitcoin-dim': '#FDE8CC',
        '--gold': '#B84A0E',
        '--gold-strong': '#93380B',
        '--sat-green': '#0F7A4F',
        '--sat-green-dim': '#D0F5E8',
        '--nostr-purple': '#6D28D9',
        '--nostr-dim': '#EDE9FE',
        '--ecash-cyan': '#0F766E',
        '--ecash-dim': '#CCFBF1',

        '--bg': '#F7F6F2',
        '--bg-elevated': '#FFFFFF',
        '--surface': '#FFFFFF',
        '--surface2': '#F0EDE6',
        '--border': '#E2DCD2',
        '--border-strong': '#CFC8BC',

        '--text': '#1A1410',
        '--text-soft': '#3F3833',
        '--muted': '#6E6760',
        '--danger': '#B91C1C',
        '--success': '#0F7A4F',
        '--warning': '#C2410C',

        '--gradient-bitcoin': 'linear-gradient(135deg, #B45A06 0%, #E2872A 100%)',
        '--gradient-lightning': 'linear-gradient(135deg, #B45A06 0%, #B84A0E 100%)',
        '--gradient-nostr': 'linear-gradient(135deg, #6D28D9 0%, #0F766E 100%)',
        '--gradient-ecash': 'linear-gradient(135deg, #0F766E 0%, #0F7A4F 100%)',
        '--gradient-hero': 'linear-gradient(135deg, #B45A06 0%, #B84A0E 100%)',
        '--gradient-surface': 'linear-gradient(180deg, rgba(180, 90, 6, 0.05) 0%, rgba(184, 74, 14, 0.02) 100%)',

        '--shadow-1': '0 1px 2px rgba(0, 0, 0, 0.06)',
        '--shadow-2': '0 8px 28px rgba(0, 0, 0, 0.08)',
        '--shadow-focus': '0 0 0 3px rgba(180, 90, 6, 0.35)',
    },
}

export function applyTheme(theme: Theme) {
    const root = document.documentElement
    const tokens = TOKENS[theme]
    for (const [k, v] of Object.entries(tokens)) {
        root.style.setProperty(k, v)
    }
    // Tell the browser which colour scheme is active so it can render native
    // UI (scrollbar arrows, autofill chip, etc.) sensibly.
    root.style.colorScheme = theme
    // Keep <meta name="theme-color"> in sync with the active theme so the
    // mobile address bar matches.
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null
    if (meta) meta.content = tokens['--bg']
}

const THEME_KEY = 'bitpilot-theme'
const LEGACY_THEME_KEY = 'satquest-theme'

export function getSavedTheme(): Theme {
    if (typeof localStorage === 'undefined') return 'dark'
    const current = localStorage.getItem(THEME_KEY)
    if (current === 'dark' || current === 'light') return current
    const legacy = localStorage.getItem(LEGACY_THEME_KEY)
    if (legacy === 'dark' || legacy === 'light') {
        localStorage.setItem(THEME_KEY, legacy)
        localStorage.removeItem(LEGACY_THEME_KEY)
        return legacy
    }
    // Honour OS preference on first visit.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
        return 'light'
    }
    return 'dark'
}

export function saveTheme(theme: Theme) {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_KEY, theme)
    }
}
