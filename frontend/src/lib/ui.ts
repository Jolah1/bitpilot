// Shared inline-style helpers. The whole codebase styles components with
// inline style objects pointing at CSS variables (`var(--bg)` etc.) — keeping
// the styles centralized here means a typo or token rename only needs fixing
// in one place.

import type { CSSProperties } from 'react'
import type { Tree } from './types'

// A layered background paints a 1px translucent highlight along the top
// edge over the surface colour. It's the trick that makes the card read
// as a screen bezel rather than a flat rectangle — CSS pseudo-elements
// don't work in inline styles, but a gradient layer does.
const TOP_EDGE_HIGHLIGHT =
    'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0px, transparent 1.5px)'

export const card: CSSProperties = {
    background: `${TOP_EDGE_HIGHLIGHT}, var(--surface)`,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-3)',
    boxShadow: 'var(--shadow-1)',
}

export const cardElevated: CSSProperties = {
    background: `${TOP_EDGE_HIGHLIGHT}, var(--bg-elevated)`,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-3)',
    boxShadow: 'var(--shadow-2)',
}

export const input: CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '1.5px solid var(--border)',
    borderRadius: 'var(--radius-2)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 15,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    boxSizing: 'border-box',
}

export const inputMono: CSSProperties = {
    ...input,
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
}

export const primaryButton = (disabled = false): CSSProperties => ({
    background: 'var(--gradient-bitcoin)',
    color: '#0A0A0B',
    border: 'none',
    borderRadius: 'var(--radius-2)',
    padding: '13px 22px',
    fontWeight: 700,
    fontSize: 15,
    fontFamily: 'var(--font-sans)',
    letterSpacing: '-0.005em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    opacity: disabled ? 0.5 : 1,
    // The top inset highlight is what makes the button look like a
    // physical chip rather than a coloured rectangle. Hover/active
    // transforms live in .bp-press in index.css — pair this style with
    // className="bp-press" to get the lift on hover.
    boxShadow:
        '0 1px 0 rgba(0,0,0,0.1), 0 4px 16px rgba(247, 147, 26, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
})

/** className to pair with primaryButton / ghostButton for hover + press
 *  microinteractions. Pure CSS so reduced-motion users opt out for free. */
export const pressClass = 'bp-press'

export const ghostButton: CSSProperties = {
    background: 'transparent',
    color: 'var(--text)',
    border: '1.5px solid var(--border-strong)',
    borderRadius: 'var(--radius-2)',
    padding: '11px 18px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontFamily: 'var(--font-sans)',
}

export const subtleButton: CSSProperties = {
    background: 'transparent',
    color: 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-1)',
    padding: '6px 12px',
    fontWeight: 500,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
}

export const label: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--muted)',
}

export const chip = (tone: 'orange' | 'purple' | 'cyan' | 'green' | 'red' | 'neutral' = 'orange'): CSSProperties => {
    const toneMap: Record<string, { bg: string; fg: string; border: string }> = {
        orange: { bg: 'rgba(247, 147, 26, 0.1)', fg: 'var(--bitcoin)', border: 'rgba(247, 147, 26, 0.3)' },
        purple: { bg: 'rgba(167, 139, 250, 0.1)', fg: 'var(--nostr-purple)', border: 'rgba(167, 139, 250, 0.3)' },
        cyan: { bg: 'rgba(94, 234, 212, 0.1)', fg: 'var(--ecash-cyan)', border: 'rgba(94, 234, 212, 0.3)' },
        green: { bg: 'rgba(16, 197, 126, 0.1)', fg: 'var(--success)', border: 'rgba(16, 197, 126, 0.3)' },
        red: { bg: 'rgba(248, 113, 113, 0.1)', fg: 'var(--danger)', border: 'rgba(248, 113, 113, 0.3)' },
        neutral: { bg: 'var(--surface2)', fg: 'var(--muted)', border: 'var(--border)' },
    }
    const t = toneMap[tone] ?? toneMap.neutral
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--radius-pill)',
        padding: '4px 12px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-sans)',
    }
}

export const callout = (tone: 'info' | 'warn' | 'danger' | 'success' = 'info'): CSSProperties => {
    const toneMap: Record<string, { bg: string; border: string; fg: string }> = {
        info: { bg: 'rgba(247, 147, 26, 0.08)', border: 'rgba(247, 147, 26, 0.25)', fg: 'var(--text)' },
        warn: { bg: 'rgba(255, 87, 34, 0.08)', border: 'rgba(255, 87, 34, 0.3)', fg: 'var(--text)' },
        danger: { bg: 'rgba(248, 113, 113, 0.08)', border: 'rgba(248, 113, 113, 0.3)', fg: 'var(--danger)' },
        success: { bg: 'rgba(16, 197, 126, 0.08)', border: 'rgba(16, 197, 126, 0.3)', fg: 'var(--text)' },
    }
    const t = toneMap[tone]
    return {
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--radius-2)',
        padding: '12px 14px',
        fontSize: 14,
        color: t.fg,
        lineHeight: 1.5,
    }
}

/** Tech-tinted accent colour, for chips and gradient highlights. */
export const techTone = (tech: 'bitcoin' | 'lightning' | 'nostr' | 'ecash'): 'orange' | 'purple' | 'cyan' => {
    switch (tech) {
        case 'bitcoin':
        case 'lightning':
            return 'orange'
        case 'nostr':
            return 'purple'
        case 'ecash':
            return 'cyan'
    }
}

/**
 * A distinct colour per skill tree, so a facilitator can read a learner's
 * progress strip at a glance and map any bar back to the legend. There are
 * eight trees but only four tech accent colours, so the four extra trees get
 * their own hues, chosen for maximum separation on the navy background rather
 * than strict brand fidelity. Warm (money/bitcoin/lightning) sit next to each
 * other in the fixed strip order, where position also disambiguates them.
 */
const TREE_COLORS: Record<Tree, string> = {
    money: '#FF5722', // deep orange
    bitcoin: '#F7931A', // bitcoin orange
    lightning: '#FF8A50', // bright coral orange
    nostr: '#A78BFA', // nostr purple
    ecash: '#5EEAD4', // ecash cyan
    'self-custody': '#34D399', // green
    privacy: '#60A5FA', // blue
    sovereignty: '#F472B6', // pink
}

export const treeColor = (tree: Tree): string => TREE_COLORS[tree] ?? 'var(--bitcoin)'

export const techGradient = (tech: 'bitcoin' | 'lightning' | 'nostr' | 'ecash'): string => {
    switch (tech) {
        case 'bitcoin':
            return 'var(--gradient-bitcoin)'
        case 'lightning':
            return 'var(--gradient-lightning)'
        case 'nostr':
            return 'var(--gradient-nostr)'
        case 'ecash':
            return 'var(--gradient-ecash)'
    }
}
