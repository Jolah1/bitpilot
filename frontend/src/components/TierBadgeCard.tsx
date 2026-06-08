/**
 * Shareable tier-completion badge rendered as inline SVG.
 *
 * Self-contained: no external fonts, no CSS variables — every fill/stroke
 * is a literal hex so the same DOM can be serialized to .svg OR rasterized
 * through canvas to .png. See ShareBadgeModal for the export plumbing.
 *
 * Sized 600x800 portrait. Visual structure (top → bottom):
 *
 *   1. Concentric guilloché rings as a subtle textured background.
 *   2. Tier number + decorative dashes header.
 *   3. Big RANK heading and a one-line subtitle.
 *   4. Feathered pilot wings flanking a central medallion. The medallion
 *      has an outer ring with curved text, a starburst behind the inner
 *      disc, and the tier glyph + name + rank stacked inside.
 *   5. A ribbon with the participant's name.
 *   6. An "EARNED ON" date strip.
 *   7. Two-line achievement description.
 *   8. Monospace badge ID line + footer brand.
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
        bg2: '#070708',
        accent: '#F7931A',
        accentLight: '#FFB958',
        accentDim: '#7A4A0E',
        glyph: '₿',
        subtitle: 'Bitcoin Fundamentals',
        achievement: [
            'Generated keys, learned wallets,',
            'completed first Bitcoin missions.',
        ],
        number: 1,
    },
    apprentice: {
        bg1: '#0E1A14',
        bg2: '#060808',
        accent: '#10C57E',
        accentLight: '#4FE2A8',
        accentDim: '#0A6240',
        glyph: '⚿',
        subtitle: 'Wallets & Signing',
        achievement: [
            'Sent and received transactions,',
            'safeguarded private keys.',
        ],
        number: 2,
    },
    pilot: {
        bg1: '#1A1608',
        bg2: '#070707',
        accent: '#FFD23F',
        accentLight: '#FFE680',
        accentDim: '#7F6A20',
        glyph: '⚡',
        subtitle: 'Lightning & Nostr',
        achievement: [
            'Routed Lightning payments,',
            'published Nostr notes to relays.',
        ],
        number: 3,
    },
    navigator: {
        bg1: '#15102A',
        bg2: '#060509',
        accent: '#A78BFA',
        accentLight: '#C9B5FE',
        accentDim: '#54467D',
        glyph: '\u{1F9ED}',
        subtitle: 'eCash & Ecosystem',
        achievement: [
            'Mastered private mint-and-redeem,',
            'zaps, and the wider Nostr ecosystem.',
        ],
        number: 4,
    },
    captain: {
        bg1: '#1F0E0E',
        bg2: '#070606',
        accent: '#E76F51',
        accentLight: '#F39A82',
        accentDim: '#733829',
        glyph: '\u{1F3F4}',
        subtitle: 'Sovereignty',
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

const W = 600
const H = 800
const CX = W / 2
const MEDAL_CY = 348
const MEDAL_R_OUTER = 138
const MEDAL_R_RING = 116
const MEDAL_R_DISC = 92

/**
 * Build one feathered wing as an array of <path>s. The fan has `count`
 * feathers arranged in a small angular sweep, each tapered toward the
 * outer tip. Mirror the result horizontally for the right wing.
 *
 * `side`: -1 (left) or +1 (right).
 */
function feathers(side: -1 | 1, accent: string, accentLight: string) {
    const count = 7
    const out: JSX.Element[] = []
    const innerX = CX + side * (MEDAL_R_OUTER + 4)
    const innerY = MEDAL_CY + 8
    for (let i = 0; i < count; i += 1) {
        // Angle sweep: top feathers angled up, bottom feathers angled down.
        // Range -22deg .. +18deg from horizontal.
        const t = i / (count - 1)
        const angle = -22 + t * 40
        const len = 165 - Math.abs(t - 0.4) * 70 // longest near top of fan
        const rad = (angle * Math.PI) / 180
        const tipX = innerX + side * Math.cos(rad) * len
        const tipY = innerY + Math.sin(rad) * len
        // A feather is a leaf shape: a quadratic curve out, then back. The
        // perpendicular offset gives it width; we taper width with `len`.
        const widthHalf = 7 + (1 - Math.abs(t - 0.4)) * 4
        const perpRad = rad + Math.PI / 2
        const offX = Math.cos(perpRad) * widthHalf
        const offY = Math.sin(perpRad) * widthHalf
        const midX = (innerX + tipX) / 2 - offX * 0.5
        const midY = (innerY + tipY) / 2 - offY * 0.5
        const midBackX = (innerX + tipX) / 2 + offX * 0.5
        const midBackY = (innerY + tipY) / 2 + offY * 0.5
        const d =
            `M ${innerX.toFixed(1)} ${innerY.toFixed(1)} ` +
            `Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)} ` +
            `Q ${midBackX.toFixed(1)} ${midBackY.toFixed(1)} ${innerX.toFixed(1)} ${innerY.toFixed(1)} Z`
        out.push(
            <path
                key={`f-${side}-${i}`}
                d={d}
                fill={i % 2 === 0 ? accent : accentLight}
                opacity={0.82 - Math.abs(t - 0.4) * 0.35}
            />,
        )
        // Quill highlight — a thin centerline that gives the feather depth.
        out.push(
            <line
                key={`q-${side}-${i}`}
                x1={innerX}
                y1={innerY}
                x2={tipX}
                y2={tipY}
                stroke="#0A0A0B"
                strokeWidth="0.7"
                opacity="0.45"
            />,
        )
    }
    return out
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
        // Build a circle path for the ring text. Reverse direction so text
        // reads left-to-right along the top of the circle.
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
                aria-label={`${label} tier badge for ${safeName}`}
            >
                <defs>
                    <linearGradient id={`bg-${tier}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={theme.bg1} />
                        <stop offset="1" stopColor={theme.bg2} />
                    </linearGradient>
                    <radialGradient
                        id={`glow-${tier}`}
                        cx="0.5"
                        cy={`${(MEDAL_CY / H).toFixed(3)}`}
                        r="0.55"
                    >
                        <stop offset="0" stopColor={theme.accent} stopOpacity="0.30" />
                        <stop offset="0.6" stopColor={theme.accent} stopOpacity="0.06" />
                        <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id={`disc-${tier}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={theme.accentLight} />
                        <stop offset="1" stopColor={theme.accent} />
                    </linearGradient>
                    {/* Name-ribbon gradient is a fixed bold green for every
                        tier, Tando-style — it pops against any tier accent
                        and gives the participant's name its own visual seat. */}
                    <linearGradient id={`ribbon-${tier}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#4FE2A8" />
                        <stop offset="0.5" stopColor="#10C57E" />
                        <stop offset="1" stopColor="#066E47" />
                    </linearGradient>
                    <path id={ringTextId} d={ringTextPath} />
                </defs>

                {/* Card background + double border */}
                <rect x="0" y="0" width={W} height={H} fill={`url(#bg-${tier})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#glow-${tier})`} />

                {/* Guilloché rings — concentric thin circles behind the medallion. */}
                {Array.from({ length: 9 }, (_, i) => (
                    <circle
                        key={`g-${i}`}
                        cx={CX}
                        cy={MEDAL_CY}
                        r={MEDAL_R_OUTER + 30 + i * 18}
                        fill="none"
                        stroke={theme.accent}
                        strokeWidth="0.6"
                        opacity={0.07 - i * 0.005}
                    />
                ))}

                <rect
                    x="16"
                    y="16"
                    width={W - 32}
                    height={H - 32}
                    fill="none"
                    stroke={theme.accent}
                    strokeWidth="2.2"
                    rx="16"
                />
                <rect
                    x="24"
                    y="24"
                    width={W - 48}
                    height={H - 48}
                    fill="none"
                    stroke={theme.accentDim}
                    strokeWidth="1"
                    rx="11"
                />
                {/* Inner corner ornaments */}
                {(
                    [
                        [38, 38, 1, 1],
                        [W - 38, 38, -1, 1],
                        [38, H - 38, 1, -1],
                        [W - 38, H - 38, -1, -1],
                    ] as const
                ).map(([x, y, sx, sy], i) => (
                    <g key={`corner-${i}`}>
                        <path
                            d={`M ${x} ${y + sy * 18} L ${x} ${y} L ${x + sx * 18} ${y}`}
                            fill="none"
                            stroke={theme.accent}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        />
                    </g>
                ))}

                {/* TIER N + flanking dashes */}
                <line x1={CX - 90} y1={68} x2={CX - 50} y2={68} stroke={theme.accent} strokeWidth="1" />
                <line x1={CX + 50} y1={68} x2={CX + 90} y2={68} stroke={theme.accent} strokeWidth="1" />
                <text
                    x={CX}
                    y={73}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="12"
                    letterSpacing="5"
                >
                    TIER {theme.number}
                </text>

                {/* RANK heading */}
                <text
                    x={CX}
                    y={120}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="900"
                    fontSize="44"
                    letterSpacing="4"
                >
                    {label}
                </text>

                {/* Star divider + subtitle */}
                <g transform={`translate(${CX} 148)`}>
                    <line x1="-110" y1="0" x2="-12" y2="0" stroke={theme.accent} strokeWidth="0.8" />
                    <line x1="12" y1="0" x2="110" y2="0" stroke={theme.accent} strokeWidth="0.8" />
                    <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill={theme.accent}
                        fontSize="10"
                        fontWeight="900"
                    >
                        ★
                    </text>
                </g>
                <text
                    x={CX}
                    y={172}
                    textAnchor="middle"
                    fill={theme.accentLight}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="13"
                    letterSpacing="3"
                >
                    {theme.subtitle.toUpperCase()}
                </text>

                {/* ── Medallion stack ──────────────────────────────────────── */}

                {/* Starburst behind the medallion: 24 short lines radiating out. */}
                {Array.from({ length: 24 }, (_, i) => {
                    const a = (i / 24) * 2 * Math.PI
                    const rIn = MEDAL_R_OUTER + 18
                    const rOut = MEDAL_R_OUTER + 36 + (i % 2 === 0 ? 8 : 0)
                    const x1 = CX + Math.cos(a) * rIn
                    const y1 = MEDAL_CY + Math.sin(a) * rIn
                    const x2 = CX + Math.cos(a) * rOut
                    const y2 = MEDAL_CY + Math.sin(a) * rOut
                    return (
                        <line
                            key={`ray-${i}`}
                            x1={x1.toFixed(1)}
                            y1={y1.toFixed(1)}
                            x2={x2.toFixed(1)}
                            y2={y2.toFixed(1)}
                            stroke={theme.accent}
                            strokeWidth={i % 2 === 0 ? 1.4 : 0.7}
                            opacity={i % 2 === 0 ? 0.55 : 0.25}
                            strokeLinecap="round"
                        />
                    )
                })}

                {/* Wings (left + right). Drawn before the medallion so the disc
                    overlaps the innermost feathers cleanly. */}
                <g>{feathers(-1, theme.accent, theme.accentLight)}</g>
                <g>{feathers(1, theme.accent, theme.accentLight)}</g>

                {/* Outer medallion ring */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER}
                    fill="#0A0A0B"
                    stroke={theme.accent}
                    strokeWidth="3"
                />
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER - 6}
                    fill="none"
                    stroke={theme.accentDim}
                    strokeWidth="1"
                />

                {/* Curved ring text */}
                <text
                    fill={theme.accentLight}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="11"
                    letterSpacing="3"
                >
                    <textPath href={`#${ringTextId}`} startOffset="50%" textAnchor="middle">
                        ★ BITPILOT · LEARN BITCOIN BY DOING · ★
                    </textPath>
                </text>

                {/* Inner ring divider */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_DISC + 6}
                    fill="none"
                    stroke={theme.accent}
                    strokeWidth="0.8"
                    opacity="0.6"
                />

                {/* Inner disc — accent gradient */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_DISC}
                    fill={`url(#disc-${tier})`}
                />
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_DISC - 4}
                    fill="none"
                    stroke="#0A0A0B"
                    strokeWidth="0.7"
                    opacity="0.4"
                />

                {/* Glyph on disc */}
                <text
                    x={CX}
                    y={MEDAL_CY - 8}
                    textAnchor="middle"
                    fill="#0A0A0B"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="900"
                    fontSize="60"
                >
                    {theme.glyph}
                </text>
                <text
                    x={CX}
                    y={MEDAL_CY + 36}
                    textAnchor="middle"
                    fill="#0A0A0B"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="12"
                    letterSpacing="3"
                >
                    {label}
                </text>

                {/* ── Ribbon ───────────────────────────────────────────────── */}
                {/* Forked-end ribbon under the medallion */}
                {(() => {
                    const ry = 524
                    const rx = CX - 156
                    const rw = 312
                    const rh = 44
                    const tail = 16
                    const cut = 18
                    // Banner shape: rectangle with notched ends
                    const d =
                        `M ${rx - tail} ${ry} ` +
                        `L ${rx} ${ry} ` +
                        `L ${rx} ${ry + rh} ` +
                        `L ${rx - tail} ${ry + rh} ` +
                        `L ${rx - tail + cut} ${ry + rh / 2} ` +
                        `Z ` +
                        `M ${rx + rw} ${ry} ` +
                        `L ${rx + rw + tail} ${ry} ` +
                        `L ${rx + rw + tail - cut} ${ry + rh / 2} ` +
                        `L ${rx + rw + tail} ${ry + rh} ` +
                        `L ${rx + rw} ${ry + rh} ` +
                        `Z`
                    return (
                        <>
                            {/* tails (slightly behind) — darker green so they
                                read as the ribbon's fold instead of the tier
                                accent color. */}
                            <path d={d} fill="#044A2F" />
                            {/* main bar */}
                            <rect
                                x={rx}
                                y={ry}
                                width={rw}
                                height={rh}
                                fill={`url(#ribbon-${tier})`}
                            />
                            <rect
                                x={rx + 3}
                                y={ry + 3}
                                width={rw - 6}
                                height={rh - 6}
                                fill="none"
                                stroke="#0A0A0B"
                                strokeWidth="0.8"
                                opacity="0.6"
                                rx="2"
                            />
                            <text
                                x={CX}
                                y={ry + rh / 2 + 6}
                                textAnchor="middle"
                                fill="#FFFFFF"
                                fontFamily="ui-sans-serif, system-ui, sans-serif"
                                fontWeight="900"
                                fontSize="19"
                                letterSpacing="1.5"
                            >
                                {safeName}
                            </text>
                        </>
                    )
                })()}

                {/* ── Earned-on date strip ─────────────────────────────────── */}
                <g transform={`translate(${CX} 600)`}>
                    <line x1="-150" y1="0" x2="-58" y2="0" stroke={theme.accentDim} strokeWidth="1" />
                    <line x1="58" y1="0" x2="150" y2="0" stroke={theme.accentDim} strokeWidth="1" />
                    <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fill={theme.accentLight}
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                        fontWeight="800"
                        fontSize="10"
                        letterSpacing="3"
                    >
                        EARNED · {dateStr.toUpperCase()}
                    </text>
                </g>

                {/* ── Achievement text ─────────────────────────────────────── */}
                <text
                    x={CX}
                    y={638}
                    textAnchor="middle"
                    fill={theme.accent}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="10"
                    letterSpacing="4"
                >
                    ACHIEVEMENT
                </text>
                <text
                    x={CX}
                    y={664}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="14"
                >
                    {theme.achievement[0]}
                </text>
                <text
                    x={CX}
                    y={684}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="14"
                >
                    {theme.achievement[1]}
                </text>

                {/* ── Badge ID strip ───────────────────────────────────────── */}
                <rect
                    x={CX - 130}
                    y={714}
                    width={260}
                    height={32}
                    fill="rgba(255,255,255,0.04)"
                    stroke={theme.accentDim}
                    strokeWidth="1"
                    rx="6"
                />
                <text
                    x={CX}
                    y={735}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-monospace, monospace"
                    fontWeight="800"
                    fontSize="13"
                    letterSpacing="1"
                >
                    {badgeId}
                </text>

                {/* Footer brand */}
                <text
                    x={CX}
                    y={774}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.6)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="800"
                    fontSize="9"
                    letterSpacing="4"
                >
                    BITPILOT · LEARN BITCOIN BY DOING
                </text>
            </svg>
        )
    },
)
