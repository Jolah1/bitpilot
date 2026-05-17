export type Theme = 'dark' | 'light'

export function applyTheme(theme: Theme) {
    const root = document.documentElement
    if (theme === 'dark') {
        root.style.setProperty('--bitcoin', '#F7931A')
        root.style.setProperty('--bitcoin-dim', '#6B3D06')
        root.style.setProperty('--sat-green', '#00C27B')
        root.style.setProperty('--sat-green-dim', '#003D26')
        root.style.setProperty('--nostr-purple', '#8B5CF6')
        root.style.setProperty('--nostr-dim', '#2D1B6B')
        root.style.setProperty('--bg', '#0A0A0A')
        root.style.setProperty('--surface', '#111111')
        root.style.setProperty('--surface2', '#1A1A1A')
        root.style.setProperty('--border', '#2A2A2A')
        root.style.setProperty('--border2', '#333333')
        root.style.setProperty('--text', '#F0EDE8')
        root.style.setProperty('--muted', '#888888')
        root.style.setProperty('--danger', '#FF4444')
    } else {
        root.style.setProperty('--bitcoin', '#C4680A')
        root.style.setProperty('--bitcoin-dim', '#FDE8CC')
        root.style.setProperty('--sat-green', '#007A4D')
        root.style.setProperty('--sat-green-dim', '#D0F5E8')
        root.style.setProperty('--nostr-purple', '#6D28D9')
        root.style.setProperty('--nostr-dim', '#EDE9FE')
        root.style.setProperty('--bg', '#F5F4F0')
        root.style.setProperty('--surface', '#FFFFFF')
        root.style.setProperty('--surface2', '#F0EDE8')
        root.style.setProperty('--border', '#E2DDD6')
        root.style.setProperty('--border2', '#D0CAC0')
        root.style.setProperty('--text', '#1A1410')
        root.style.setProperty('--muted', '#7A7268')
        root.style.setProperty('--danger', '#DC2626')
    }
}

export function getSavedTheme(): Theme {
    return (localStorage.getItem('satquest-theme') as Theme) ?? 'dark'
}

export function saveTheme(theme: Theme) {
    localStorage.setItem('satquest-theme', theme)
}
