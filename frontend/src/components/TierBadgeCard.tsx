/**
 * Shareable tier-completion badge rendered as inline SVG.
 *
 * The SVG is self-contained: no external assets, no CSS variables — every
 * fill/stroke is a literal hex so the same DOM can be serialized to a .svg
 * file or rasterized through canvas to a .png. See ShareBadgeModal for the
 * download/share plumbing.
 *
 * Sized 600x800 (portrait, ~3:4). Twitter card previews crop to a flexible
 * aspect, but a portrait image attached to a tweet renders close to full
 * height in the timeline. The card uses absolute coordinates so layout
 * doesn't depend on container CSS.
 */
import { forwardRef } from 'react'
import type { Tier } from '../lib/types'

interface Theme {
    /** Vertical gradient on the card background. */
    bg1: string
    bg2: string
    /** Accent — borders, glyph disc, headings. */
    accent: string
    /** Secondary accent — subtle highlights. */
    accentDim: string
    /** Single character / emoji placed on the medallion disc. */
    glyph: string
    /** "Completed X Training" subtitle on the header. */
    subtitle: string
    /** Two-line achievement description; pre-wrapped to fit. */
    achievement: [string, string]
    /** Roman tier number shown above the rank label. */
    number: number
}

const THEMES: Record<Tier, Theme> = {
    novice: {
        bg1: '#1A1410',
        bg2: '#0A0A0B',
        accent: '#F7931A',
        accentDim: 'rgba(247, 147, 26, 0.35)',
        glyph: '₿',
        subtitle: 'Completed Bitcoin Fundamentals',
        achievement: [
            'Generated keys, learned wallets,',
            'and completed first Bitcoin missions.',
        ],
        number: 1,
    },
    apprentice: {
        bg1: '#0F1A14',
        bg2: '#0A0A0B',
        accent: '#10C57E',
        accentDim: 'rgba(16, 197, 126, 0.35)',
        glyph: '⚿',
        subtitle: 'Completed Wallet & Signing Training',
        achievement: [
            'Sent and received real transactions;',
            'learned to safeguard private keys.',
        ],
        number: 2,
    },
    pilot: {
        bg1: '#181410',
        bg2: '#0A0A0B',
        accent: '#FFD23F',
        accentDim: 'rgba(255, 210, 63, 0.35)',
        glyph: '⚡',
        subtitle: 'Completed Lightning & Nostr Training',
        achievement: [
            'Routed Lightning payments and published',
            'Nostr notes to real public relays.',
        ],
        number: 3,
    },
    navigator: {
        bg1: '#161024',
        bg2: '#0A0A0B',
        accent: '#A78BFA',
        accentDim: 'rgba(167, 139, 250, 0.35)',
        glyph: '\u{1F9ED}',
        subtitle: 'Completed eCash & Ecosystem Training',
        achievement: [
            'Mastered private mint-and-redeem,',
            'zaps, and the wider Nostr ecosystem.',
        ],
        number: 4,
    },
    captain: {
        bg1: '#1A0F0F',
        bg2: '#0A0A0B',
        accent: '#E76F51',
        accentDim: 'rgba(231, 111, 81, 0.35)',
        glyph: '\u{1F3F4}',
        subtitle: 'Completed Sovereignty Training',
        achievement: [
            'Demonstrated practical sovereignty:',
            'signet on-chain, security, the long game.',
        ],
        number: 5,
    },
}

const RANK_LABEL: Record<Tier, string> = {
    novice: 'NOVICE',
    apprentice: 'APPRENTICE',
    pilot: 'PILOT',
    navigator: 'NAVIGATOR',
    captain: 'CAPTAIN',
}

/**
 * Stable, short badge ID derived from participantId + tier. Looks like
 * `BP-NOV-A3F4B2C1`. Deterministic so the same learner viewing or
 * re-downloading the badge always sees the same identifier.
 */
export function badgeIdFor(participantId: string, tier: Tier): string {
    const prefix = tier.slice(0, 3).toUpperCase()
    const hex = participantId.replace(/-/g, '').slice(0, 8).toUpperCase()
    return `BP-${prefix}-${hex || '00000000'}`
}

/**
 * Format a unix-seconds timestamp as a short English date — "May 18, 2025".
 * Keeps the badge readable across locales without pulling Intl polyfills.
 */
export function formatBadgeDate(unixSeconds: number | null | undefined): string {
    if (!unixSeconds) return '—'
    const d = new Date(unixSeconds * 1000)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export interface TierBadgeCardProps {
    tier: Tier
    participantName: string
    earnedAt: number | null
    badgeId: string
    /** Visual scale. Default 1 = 600x800. Pass < 1 for inline previews. */
    scale?: number
}

/**
 * Renders the badge as an SVG element. Wrapped in forwardRef so the parent
 * (ShareBadgeModal) can grab the raw <svg> node for serialization.
 */
export const TierBadgeCard = forwardRef<SVGSVGElement, TierBadgeCardProps>(
    function TierBadgeCard({ tier, participantName, earnedAt, badgeId, scale = 1 }, ref) {
        const theme = THEMES[tier]
        const label = RANK_LABEL[tier]
        const dateStr = formatBadgeDate(earnedAt)
        const safeName = (participantName || 'Bitpilot Learner').trim().slice(0, 32)
        const W = 600
        const H = 800

        return (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={W * scale}
                height={H * scale}
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`${label} tier badge for ${safeName}`}
            >
                <defs>
                    <linearGradient id={`bg-${tier}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={theme.bg1} />
                        <stop offset="1" stopColor={theme.bg2} />
                    </linearGradient>
                    <radialGradient id={`glow-${tier}`} cx="0.5" cy="0.5" r="0.6">
                        <stop offset="0" stopColor={theme.accent} stopOpacity="0.35" />
                        <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Card background */}
                <rect x="0" y="0" width={W} height={H} fill={`url(#bg-${tier})`} />
                <rect
                    x="14"
                    y="14"
                    width={W - 28}
                    height={H - 28}
                    fill="none"
                    stroke={theme.accent}
                    strokeWidth="2"
                    rx="14"
                />
                <rect
                    x="22"
                    y="22"
                    width={W - 44}
                    height={H - 44}
                    fill="none"
                    stroke={theme.accentDim}
                    strokeWidth="1"
                    rx="10"
                />

                {/* Header */}
                <text
                    x={W / 2}
                    y={68}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="13"
                    letterSpacing="4"
                >
                    TIER {theme.number}
                </text>
                <text
                    x={W / 2}
                    y={114}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="900"
                    fontSize="40"
                    letterSpacing="3"
                >
                    {label}
                </text>
                <text
                    x={W / 2}
                    y={144}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="12"
                    letterSpacing="2.5"
                >
                    {theme.subtitle.toUpperCase()}
                </text>

                {/* Medallion */}
                <circle cx={W / 2} cy={340} r="170" fill={`url(#glow-${tier})`} />
                <circle
                    cx={W / 2}
                    cy={340}
                    r="138"
                    fill="#0A0A0B"
                    stroke={theme.accent}
                    strokeWidth="3"
                />
                <circle
                    cx={W / 2}
                    cy={340}
                    r="128"
                    fill="none"
                    stroke={theme.accentDim}
                    strokeWidth="1"
                />
                {/* Wings — abstracted as two stylized arcs */}
                <path
                    d={`M ${W / 2 - 200} 340 Q ${W / 2 - 150} 300 ${W / 2 - 138} 340`}
                    stroke={theme.accent}
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                />
                <path
                    d={`M ${W / 2 + 200} 340 Q ${W / 2 + 150} 300 ${W / 2 + 138} 340`}
                    stroke={theme.accent}
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                />
                <path
                    d={`M ${W / 2 - 180} 340 Q ${W / 2 - 140} 320 ${W / 2 - 138} 340`}
                    stroke={theme.accentDim}
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                />
                <path
                    d={`M ${W / 2 + 180} 340 Q ${W / 2 + 140} 320 ${W / 2 + 138} 340`}
                    stroke={theme.accentDim}
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                />

                <text
                    x={W / 2}
                    y={278}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="13"
                    letterSpacing="3"
                >
                    BITPILOT
                </text>
                <text
                    x={W / 2}
                    y={314}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="900"
                    fontSize="22"
                    letterSpacing="2"
                >
                    {label}
                </text>
                {/* Glyph disc */}
                <circle cx={W / 2} cy={372} r="40" fill={theme.accent} />
                <text
                    x={W / 2}
                    y={388}
                    textAnchor="middle"
                    fill="#0A0A0B"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="900"
                    fontSize="40"
                >
                    {theme.glyph}
                </text>

                {/* Name ribbon */}
                <rect
                    x={W / 2 - 140}
                    y={440}
                    width="280"
                    height="36"
                    fill="#0A0A0B"
                    stroke={theme.accent}
                    strokeWidth="1.5"
                    rx="4"
                />
                <text
                    x={W / 2}
                    y={464}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="14"
                    letterSpacing="1"
                >
                    {safeName}
                </text>

                {/* Completed strip */}
                <text
                    x={W / 2}
                    y={520}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="11"
                    letterSpacing="3"
                >
                    COMPLETED
                </text>
                <text
                    x={W / 2}
                    y={544}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="15"
                    letterSpacing="1"
                >
                    {theme.subtitle.replace(/^Completed /, '')}
                </text>

                {/* Date & Badge ID strip */}
                <rect
                    x="60"
                    y={580}
                    width={W - 120}
                    height="64"
                    fill="rgba(255,255,255,0.04)"
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth="1"
                    rx="8"
                />
                <text
                    x="170"
                    y={605}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.55)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="9"
                    letterSpacing="2"
                >
                    DATE
                </text>
                <text
                    x="170"
                    y={627}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="13"
                >
                    {dateStr}
                </text>
                <text
                    x={W / 2}
                    y={622}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="900"
                    fontSize="22"
                >
                    {'★'}
                </text>
                <text
                    x={W - 170}
                    y={605}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.55)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="9"
                    letterSpacing="2"
                >
                    BADGE ID
                </text>
                <text
                    x={W - 170}
                    y={627}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-monospace, monospace"
                    fontWeight="700"
                    fontSize="13"
                >
                    {badgeId}
                </text>

                {/* Achievement */}
                <text
                    x={W / 2}
                    y={684}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="11"
                    letterSpacing="3"
                >
                    ACHIEVEMENT
                </text>
                <text
                    x={W / 2}
                    y={708}
                    textAnchor="middle"
                    fill="#CFCFD2"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="500"
                    fontSize="13"
                >
                    {theme.achievement[0]}
                </text>
                <text
                    x={W / 2}
                    y={728}
                    textAnchor="middle"
                    fill="#CFCFD2"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="500"
                    fontSize="13"
                >
                    {theme.achievement[1]}
                </text>

                {/* Footer brand */}
                <text
                    x={W / 2}
                    y={776}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.45)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="10"
                    letterSpacing="3"
                >
                    BITPILOT · LEARN BITCOIN BY DOING
                </text>
            </svg>
        )
    },
)
