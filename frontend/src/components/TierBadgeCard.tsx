/**
 * Shareable tier-completion badge rendered as inline SVG.
 *
 * Self-contained: no external fonts, no CSS variables — every fill/stroke
 * is a literal hex so the same DOM can be serialized to .svg OR rasterized
 * through canvas to .png. See ShareBadgeModal for the export plumbing.
 *
 * Sized 600x800 portrait. Visual stack (top → bottom):
 *
 *   1. Aurora gradient field — three overlapping radial glows in the tier
 *      palette, on a deep ink base.
 *   2. Dot-grid + holographic shine — a subtle 12-unit dot grid for texture
 *      and a low-opacity conic sweep that reads as foil under light.
 *   3. Top metadata strip — left chip (TIER N + roman) + right serial.
 *   4. Glass medallion — outer aura, brushed metal ring with serial text,
 *      and a frosted glass disc with a custom tier-specific SVG glyph.
 *   5. Rank name (huge bold sans) + subtitle in small caps.
 *   6. Participant name + earned-on date on an accent rule.
 *   7. Italic achievement quote.
 *   8. Footer brand line.
 */
import { forwardRef } from 'react'
import type { Tier } from '../lib/types'

interface Theme {
    /** Vertical gradient on the card background. */
    bg1: string
    bg2: string
    /** Accent — borders, glyph disc, headings. */
    accent: string
    /** Brighter accent for highlights (light side of metallic shimmer). */
    accentLight: string
    /** Dimmed accent — subtle highlights / 35% alpha equivalent. */
    accentDim: string
    /** Secondary accent used for the aurora field — adds depth. */
    accent2: string
    /** "Completed X Training" subtitle on the header. */
    subtitle: string
    /** Roman tier number shown on the chip. */
    roman: string
    /** Two-line achievement description; pre-wrapped to fit. */
    achievement: [string, string]
    /** Numeric tier index, 1..5. */
    number: number
}

const THEMES: Record<Tier, Theme> = {
    novice: {
        bg1: '#1A1410',
        bg2: '#050507',
        accent: '#F7931A',
        accentLight: '#FFC36B',
        accentDim: '#7A4A0E',
        accent2: '#F26B1F',
        subtitle: 'Bitcoin Fundamentals',
        roman: 'I',
        achievement: [
            'Generated keys, learned wallets,',
            'and completed first Bitcoin missions.',
        ],
        number: 1,
    },
    apprentice: {
        bg1: '#0C1A14',
        bg2: '#040608',
        accent: '#10C57E',
        accentLight: '#5DEAA9',
        accentDim: '#0A6240',
        accent2: '#1FA8D8',
        subtitle: 'Wallets & Signing',
        roman: 'II',
        achievement: [
            'Sent and received transactions,',
            'safeguarded private keys.',
        ],
        number: 2,
    },
    pilot: {
        bg1: '#1A1608',
        bg2: '#060507',
        accent: '#FFD23F',
        accentLight: '#FFEB8C',
        accentDim: '#7F6A20',
        accent2: '#A78BFA',
        subtitle: 'Lightning & Nostr',
        roman: 'III',
        achievement: [
            'Routed Lightning payments,',
            'published Nostr notes to relays.',
        ],
        number: 3,
    },
    navigator: {
        bg1: '#14102A',
        bg2: '#050409',
        accent: '#A78BFA',
        accentLight: '#D3C2FF',
        accentDim: '#54467D',
        accent2: '#5EEAD4',
        subtitle: 'eCash & Ecosystem',
        roman: 'IV',
        achievement: [
            'Mastered private mint-and-redeem,',
            'zaps, and the wider Nostr ecosystem.',
        ],
        number: 4,
    },
    captain: {
        bg1: '#1F0D0E',
        bg2: '#060304',
        accent: '#FF7A59',
        accentLight: '#FFB59A',
        accentDim: '#733829',
        accent2: '#FFD23F',
        subtitle: 'Sovereignty',
        roman: 'V',
        achievement: [
            'Practical sovereignty: signet,',
            'security, and the long game.',
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
 * `BP-NOV-A3F4B2C1`. Deterministic so re-downloads always show the same id.
 */
export function badgeIdFor(participantId: string, tier: Tier): string {
    const prefix = tier.slice(0, 3).toUpperCase()
    const hex = participantId.replace(/-/g, '').slice(0, 8).toUpperCase()
    return `BP-${prefix}-${hex || '00000000'}`
}

/**
 * Format a unix-seconds timestamp as a short English date — "MAY 18 · 2025".
 * Keeps the badge readable across locales without pulling Intl polyfills.
 */
export function formatBadgeDate(unixSeconds: number | null | undefined): string {
    if (!unixSeconds) return '—'
    const d = new Date(unixSeconds * 1000)
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()} · ${d.getUTCFullYear()}`
}

export interface TierBadgeCardProps {
    tier: Tier
    participantName: string
    earnedAt: number | null
    badgeId: string
    /** Visual scale. Default 1 = 600x800. Pass < 1 for inline previews. */
    scale?: number
}

const W = 600
const H = 800
const CX = W / 2
const MEDAL_CY = 360
const MEDAL_R_OUTER = 150
const MEDAL_R_RING = 128
const MEDAL_R_DISC = 100

/**
 * Tier-specific iconography drawn as inline SVG paths. Each returns a <g>
 * group centered at (0,0); the parent translates it into the medallion.
 *
 * Custom glyphs (not emoji) so the badge renders identically on every OS
 * when serialized to PNG — emoji fonts vary wildly between platforms.
 */
function TierGlyph({ tier, fill }: { tier: Tier; fill: string }) {
    switch (tier) {
        case 'novice':
            // Bitcoin ₿: bold sans glyph drawn from path so it renders the
            // same shape regardless of font availability. Two horizontal
            // crossbars are subtle short rectangles.
            return (
                <g>
                    <text
                        x="0"
                        y="22"
                        textAnchor="middle"
                        fill={fill}
                        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                        fontWeight="900"
                        fontSize="92"
                        letterSpacing="-0.04em"
                    >
                        ₿
                    </text>
                </g>
            )
        case 'apprentice':
            // Key: head + shaft + two teeth. Outlined for crispness.
            return (
                <g fill="none" stroke={fill} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="-20" cy="0" r="22" />
                    <circle cx="-20" cy="0" r="8" fill={fill} stroke="none" />
                    <line x1="2" y1="0" x2="44" y2="0" />
                    <line x1="32" y1="0" x2="32" y2="14" />
                    <line x1="42" y1="0" x2="42" y2="10" />
                </g>
            )
        case 'pilot':
            // Lightning bolt with a stylised soft shadow for depth.
            return (
                <g>
                    <path
                        d="M -8 -42 L -32 8 L -6 8 L -14 42 L 32 -10 L 6 -10 L 14 -42 Z"
                        fill={fill}
                        stroke="rgba(0,0,0,0.25)"
                        strokeWidth="1"
                        strokeLinejoin="round"
                    />
                </g>
            )
        case 'navigator':
            // 4-point compass star with a tiny center dot.
            return (
                <g fill={fill}>
                    <path d="M 0 -44 L 8 -8 L 44 0 L 8 8 L 0 44 L -8 8 L -44 0 L -8 -8 Z" />
                    <path
                        d="M 0 -22 L 4 -4 L 22 0 L 4 4 L 0 22 L -4 4 L -22 0 L -4 -4 Z"
                        fill="rgba(0,0,0,0.35)"
                    />
                    <circle cx="0" cy="0" r="3" fill={fill} />
                </g>
            )
        case 'captain':
            // Anchor: ring + shaft + crossbar + arms. Reads as authority.
            return (
                <g fill="none" stroke={fill} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="0" cy="-26" r="8" />
                    <line x1="0" y1="-18" x2="0" y2="28" />
                    <line x1="-18" y1="-8" x2="18" y2="-8" />
                    <path d="M -28 14 Q 0 40 28 14" />
                    <line x1="-28" y1="14" x2="-22" y2="8" />
                    <line x1="28" y1="14" x2="22" y2="8" />
                </g>
            )
    }
}

/**
 * Renders the badge as a self-contained SVG. Wrapped in forwardRef so
 * ShareBadgeModal can grab the raw <svg> for serialization.
 */
export const TierBadgeCard = forwardRef<SVGSVGElement, TierBadgeCardProps>(
    function TierBadgeCard({ tier, participantName, earnedAt, badgeId, scale = 1 }, ref) {
        const theme = THEMES[tier]
        const label = RANK_LABEL[tier]
        const dateStr = formatBadgeDate(earnedAt)
        const safeName = (participantName || 'BitPilot Learner').trim().slice(0, 28)
        const ringTextId = `ring-${tier}`
        // Circle path for ring text. Drawn clockwise starting at 9 o'clock
        // so the text reads naturally along the top arc.
        const ringTextPath =
            `M ${CX - MEDAL_R_RING} ${MEDAL_CY} ` +
            `a ${MEDAL_R_RING} ${MEDAL_R_RING} 0 1 1 ${MEDAL_R_RING * 2} 0 ` +
            `a ${MEDAL_R_RING} ${MEDAL_R_RING} 0 1 1 ${-MEDAL_R_RING * 2} 0`

        return (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={W * scale}
                height={H * scale}
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={
                    earnedAt
                        ? `${label} tier badge for ${safeName}, earned ${dateStr}. Badge ID ${badgeId}.`
                        : `${label} tier badge for ${safeName}. Badge ID ${badgeId}.`
                }
            >
                <defs>
                    {/* ── Aurora field ──────────────────────────────────── */}
                    <linearGradient id={`bg-${tier}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={theme.bg1} />
                        <stop offset="0.6" stopColor={theme.bg2} />
                        <stop offset="1" stopColor="#000000" />
                    </linearGradient>
                    {/* Three overlapping radial gradients give the aurora
                        a sense of depth without painting a busy texture. */}
                    <radialGradient id={`aurora-1-${tier}`} cx="0.18" cy="0.18" r="0.55">
                        <stop offset="0" stopColor={theme.accent} stopOpacity="0.34" />
                        <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={`aurora-2-${tier}`} cx="0.82" cy="0.30" r="0.55">
                        <stop offset="0" stopColor={theme.accent2} stopOpacity="0.28" />
                        <stop offset="1" stopColor={theme.accent2} stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={`aurora-3-${tier}`} cx="0.5" cy={`${(MEDAL_CY / H).toFixed(3)}`} r="0.5">
                        <stop offset="0" stopColor={theme.accentLight} stopOpacity="0.22" />
                        <stop offset="0.65" stopColor={theme.accent} stopOpacity="0.05" />
                        <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
                    </radialGradient>

                    {/* ── Medallion fills ───────────────────────────────── */}
                    <radialGradient id={`disc-${tier}`} cx="0.5" cy="0.32" r="0.78">
                        <stop offset="0" stopColor="rgba(255,255,255,0.20)" />
                        <stop offset="0.55" stopColor="rgba(255,255,255,0.04)" />
                        <stop offset="1" stopColor="rgba(0,0,0,0.55)" />
                    </radialGradient>
                    <linearGradient id={`ring-${tier}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={theme.accentLight} />
                        <stop offset="0.5" stopColor={theme.accent} />
                        <stop offset="1" stopColor={theme.accentDim} />
                    </linearGradient>
                    <linearGradient id={`shine-${tier}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
                        <stop offset="0.45" stopColor="rgba(255,255,255,0.05)" />
                        <stop offset="1" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>

                    {/* ── Dot-grid + holographic patterns ───────────────── */}
                    <pattern id={`dots-${tier}`} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="0.85" fill={theme.accentLight} fillOpacity="0.07" />
                    </pattern>

                    <path id={ringTextId} d={ringTextPath} />
                </defs>

                {/* ── Layer 1: aurora background ──────────────────────────── */}
                <rect x="0" y="0" width={W} height={H} fill={`url(#bg-${tier})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#dots-${tier})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#aurora-1-${tier})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#aurora-2-${tier})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#aurora-3-${tier})`} />

                {/* ── Layer 2: card frame ─────────────────────────────────── */}
                <rect
                    x="14"
                    y="14"
                    width={W - 28}
                    height={H - 28}
                    fill="none"
                    stroke={theme.accent}
                    strokeOpacity="0.55"
                    strokeWidth="1.5"
                    rx="22"
                />
                <rect
                    x="22"
                    y="22"
                    width={W - 44}
                    height={H - 44}
                    fill="none"
                    stroke={theme.accentLight}
                    strokeOpacity="0.18"
                    strokeWidth="1"
                    rx="18"
                />

                {/* ── Layer 3: top metadata strip ─────────────────────────── */}
                {/* Tier chip — left */}
                <g transform={`translate(48 56)`}>
                    <rect
                        x="0"
                        y="0"
                        width="116"
                        height="28"
                        rx="14"
                        fill="rgba(0,0,0,0.35)"
                        stroke={theme.accent}
                        strokeOpacity="0.6"
                        strokeWidth="1"
                    />
                    <circle cx="14" cy="14" r="4" fill={theme.accent} />
                    <text
                        x="26"
                        y="19"
                        fill={theme.accentLight}
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                        fontWeight="800"
                        fontSize="11"
                        letterSpacing="3"
                    >
                        TIER {theme.roman}
                    </text>
                </g>
                {/* Badge ID — right */}
                <g transform={`translate(${W - 48} 56)`}>
                    <text
                        x="0"
                        y="19"
                        textAnchor="end"
                        fill="rgba(255,255,255,0.55)"
                        fontFamily="ui-monospace, 'SF Mono', monospace"
                        fontWeight="700"
                        fontSize="11"
                        letterSpacing="1.5"
                    >
                        {badgeId}
                    </text>
                </g>

                {/* ── Layer 4: subtitle eyebrow (above medallion) ─────────── */}
                <text
                    x={CX}
                    y={148}
                    textAnchor="middle"
                    fill={theme.accentLight}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="11"
                    letterSpacing="5"
                    opacity="0.85"
                >
                    {theme.subtitle.toUpperCase()}
                </text>

                {/* ── Layer 5: medallion ──────────────────────────────────── */}

                {/* Outer aura halo — two concentric soft rings */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER + 38}
                    fill="none"
                    stroke={theme.accent}
                    strokeOpacity="0.10"
                    strokeWidth="2"
                />
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER + 22}
                    fill="none"
                    stroke={theme.accent}
                    strokeOpacity="0.20"
                    strokeWidth="1"
                />

                {/* Tick marks around the outer aura — 60 small dashes */}
                {Array.from({ length: 60 }, (_, i) => {
                    const a = (i / 60) * 2 * Math.PI - Math.PI / 2
                    const rIn = MEDAL_R_OUTER + 6
                    const rOut = MEDAL_R_OUTER + (i % 5 === 0 ? 14 : 10)
                    const x1 = CX + Math.cos(a) * rIn
                    const y1 = MEDAL_CY + Math.sin(a) * rIn
                    const x2 = CX + Math.cos(a) * rOut
                    const y2 = MEDAL_CY + Math.sin(a) * rOut
                    return (
                        <line
                            key={`t-${i}`}
                            x1={x1.toFixed(1)}
                            y1={y1.toFixed(1)}
                            x2={x2.toFixed(1)}
                            y2={y2.toFixed(1)}
                            stroke={theme.accent}
                            strokeWidth={i % 5 === 0 ? 1.4 : 0.8}
                            opacity={i % 5 === 0 ? 0.65 : 0.30}
                            strokeLinecap="round"
                        />
                    )
                })}

                {/* Brushed metal outer ring */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER}
                    fill={`url(#ring-${tier})`}
                />
                {/* Inner darker base under the glass */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER - 4}
                    fill="#0A0A0B"
                />
                {/* Brushed metal pinstripe */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER - 2}
                    fill="none"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="0.6"
                />

                {/* Curved ring text along the inside of the brushed ring */}
                <text
                    fill={theme.accentLight}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="10"
                    letterSpacing="4"
                >
                    <textPath href={`#${ringTextId}`} startOffset="50%" textAnchor="middle">
                        ★ BITPILOT · LEARN BITCOIN BY DOING · ★
                    </textPath>
                </text>

                {/* Inner ring divider */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_DISC + 8}
                    fill="none"
                    stroke={theme.accent}
                    strokeWidth="0.8"
                    opacity="0.55"
                />

                {/* Frosted glass disc */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_DISC}
                    fill={theme.accent}
                    fillOpacity="0.18"
                />
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_DISC}
                    fill={`url(#disc-${tier})`}
                />
                {/* Disc highlight crescent — top-left arc that gives the glass life */}
                <path
                    d={`M ${CX - MEDAL_R_DISC * 0.78} ${MEDAL_CY - MEDAL_R_DISC * 0.35} ` +
                        `A ${MEDAL_R_DISC * 0.9} ${MEDAL_R_DISC * 0.9} 0 0 1 ` +
                        `${CX + MEDAL_R_DISC * 0.2} ${MEDAL_CY - MEDAL_R_DISC * 0.78}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                />
                {/* Disc inner shadow at bottom — sells the depth */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_DISC - 2}
                    fill="none"
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth="2"
                    strokeDasharray="0"
                    opacity="0.35"
                />

                {/* Tier-specific glyph */}
                <g transform={`translate(${CX} ${MEDAL_CY})`}>
                    <TierGlyph tier={tier} fill={theme.accentLight} />
                </g>

                {/* Holographic shine across the medallion */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER}
                    fill={`url(#shine-${tier})`}
                    opacity="0.45"
                />

                {/* ── Layer 6: rank wordmark ──────────────────────────────── */}
                <text
                    x={CX}
                    y={580}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                    fontWeight="900"
                    fontSize="54"
                    letterSpacing="6"
                >
                    {label}
                </text>

                {/* ── Layer 7: participant + date strip ───────────────────── */}
                {/* Accent rule with end caps */}
                <g transform={`translate(${CX} 612)`}>
                    <line x1="-140" y1="0" x2="-12" y2="0" stroke={theme.accent} strokeWidth="1" opacity="0.7" />
                    <line x1="12" y1="0" x2="140" y2="0" stroke={theme.accent} strokeWidth="1" opacity="0.7" />
                    <circle cx="-152" cy="0" r="2" fill={theme.accent} opacity="0.7" />
                    <circle cx="152" cy="0" r="2" fill={theme.accent} opacity="0.7" />
                </g>

                <text
                    x={CX}
                    y={650}
                    textAnchor="middle"
                    fill={theme.accentLight}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="24"
                    letterSpacing="0.5"
                >
                    {safeName}
                </text>
                <text
                    x={CX}
                    y={676}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.65)"
                    fontFamily="ui-monospace, 'SF Mono', monospace"
                    fontWeight="700"
                    fontSize="11"
                    letterSpacing="3"
                >
                    EARNED · {dateStr}
                </text>

                {/* ── Layer 8: achievement quote ──────────────────────────── */}
                <text
                    x={CX}
                    y={714}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.78)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontStyle="italic"
                    fontWeight="500"
                    fontSize="13"
                >
                    {theme.achievement[0]}
                </text>
                <text
                    x={CX}
                    y={732}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.78)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontStyle="italic"
                    fontWeight="500"
                    fontSize="13"
                >
                    {theme.achievement[1]}
                </text>

                {/* ── Layer 9: footer brand ───────────────────────────────── */}
                <text
                    x={CX}
                    y={772}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.45)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="9"
                    letterSpacing="5"
                >
                    BITPILOT · LEARN BITCOIN BY DOING
                </text>
            </svg>
        )
    },
)
