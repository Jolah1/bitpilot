/**
 * Shareable tier-completion badge rendered as inline SVG.
 *
 * Self-contained: no external fonts, no CSS variables, every fill/stroke
 * is a literal hex so the same DOM can be serialized to .svg OR rasterized
 * through canvas to .png. See ShareBadgeModal for the export plumbing.
 *
 * Sized 600x800 portrait. Visual stack (top → bottom):
 *
 *   1. Aurora gradient field, three overlapping radial glows in the tier
 *      palette, on a deep ink base.
 *   2. Dot-grid + holographic shine, a subtle 12-unit dot grid for texture
 *      and a low-opacity conic sweep that reads as foil under light.
 *   3. Top metadata strip, left chip (TIER N + roman) + right serial.
 *   4. Glass medallion, outer aura, brushed metal ring with serial text,
 *      and a frosted glass disc with a custom tier-specific SVG glyph.
 *   5. Rank name (huge bold sans) + subtitle in small caps.
 *   6. Participant name + earned-on date on an accent rule.
 *   7. Italic achievement quote.
 *   8. Footer brand line.
 */
import { forwardRef } from 'react'
import type { Tree } from '../lib/types'

interface Theme {
    /** Vertical gradient on the card background. */
    bg1: string
    bg2: string
    /** Accent, borders, glyph disc, headings. */
    accent: string
    /** Brighter accent for highlights (light side of metallic shimmer). */
    accentLight: string
    /** Dimmed accent, subtle highlights / 35% alpha equivalent. */
    accentDim: string
    /** Secondary accent used for the aurora field, adds depth. */
    accent2: string
    /** Subtitle eyebrow above the medallion (small caps). */
    subtitle: string
    /** Short label printed on the chip, e.g. "FLIGHT PATH · LIGHTNING". */
    chipText: string
    /** Two-line achievement description; pre-wrapped to fit. */
    achievement: [string, string]
}

/** The six colour fields every theme carries. */
interface Palette {
    bg1: string
    bg2: string
    accent: string
    accentLight: string
    accentDim: string
    accent2: string
}

/**
 * One palette per flight path so a wall of badges reads as nine distinct
 * awards at a glance, not nine recolours of the same card. Hues are spread
 * around the wheel (orange, gold, yellow, green, teal, cyan, blue, purple,
 * red) and each sits on a dark ink base tinted toward its own hue. Every
 * value stays a literal hex so the SVG rasterizes to PNG unchanged.
 */
const PALETTES: Record<Tree, Palette> = {
    money:          { bg1: '#241511', bg2: '#0C0906', accent: '#FF6A2B', accentLight: '#FFC0A0', accentDim: '#7A3312', accent2: '#FFD8C4' },
    bitcoin:        { bg1: '#221A0B', bg2: '#0B0804', accent: '#F7931A', accentLight: '#FBD48F', accentDim: '#7A4A0A', accent2: '#FCE4B4' },
    lightning:      { bg1: '#211D09', bg2: '#0A0903', accent: '#FFCA28', accentLight: '#FFE6A0', accentDim: '#7E6008', accent2: '#FFF0BE' },
    nostr:          { bg1: '#191230', bg2: '#08060F', accent: '#9B5DE5', accentLight: '#CDB0F5', accentDim: '#47297A', accent2: '#DECDF9' },
    ecash:          { bg1: '#0A211F', bg2: '#030B0A', accent: '#17BEBB', accentLight: '#86E0DE', accentDim: '#0A5654', accent2: '#AEEBEA' },
    'self-custody': { bg1: '#0D1930', bg2: '#05080F', accent: '#3B82F6', accentLight: '#A3C4FB', accentDim: '#1B3F7A', accent2: '#C6DBFC' },
    privacy:        { bg1: '#0B2318', bg2: '#040B07', accent: '#2FB56A', accentLight: '#96E0B4', accentDim: '#135A34', accent2: '#BCEDD0' },
    sovereignty:    { bg1: '#29100F', bg2: '#0E0505', accent: '#E5484D', accentLight: '#F5A3A5', accentDim: '#7A2124', accent2: '#FAC4C5' },
    'open-source':  { bg1: '#0A1F28', bg2: '#030A0D', accent: '#06AEC9', accentLight: '#7FD8E8', accentDim: '#05566A', accent2: '#A8E6F0' },
}

/**
 * Per-tree copy laid over each palette. What distinguishes trees beyond
 * colour is (a) the chip text, (b) the subtitle eyebrow, and (c) the
 * two-line achievement quote.
 */
const THEMES: Record<Tree, Theme> = {
    money: {
        ...PALETTES.money,
        subtitle: 'Money Basics',
        chipText: 'FLIGHT PATH · MONEY BASICS',
        achievement: [
            'Learned what bitcoin is and',
            'why thinking in sats matters.',
        ],
    },
    bitcoin: {
        ...PALETTES.bitcoin,
        subtitle: 'Bitcoin Protocol',
        chipText: 'FLIGHT PATH · BITCOIN',
        achievement: [
            'Blocks, fees, miners, and how',
            'bitcoin moves, the base layer.',
        ],
    },
    lightning: {
        ...PALETTES.lightning,
        subtitle: 'Lightning Network',
        chipText: 'FLIGHT PATH · LIGHTNING',
        achievement: [
            'Opened the door to fast,',
            'cheap, routable bitcoin payments.',
        ],
    },
    nostr: {
        ...PALETTES.nostr,
        subtitle: 'Nostr & Zaps',
        chipText: 'FLIGHT PATH · NOSTR',
        achievement: [
            'Real cryptographic identity,',
            'notes signed against no one.',
        ],
    },
    ecash: {
        ...PALETTES.ecash,
        subtitle: 'eCash & Mints',
        chipText: 'FLIGHT PATH · eCASH',
        achievement: [
            'Bearer money in your pocket,',
            'redeemable to Lightning.',
        ],
    },
    'self-custody': {
        ...PALETTES['self-custody'],
        subtitle: 'Self-custody',
        chipText: 'FLIGHT PATH · SELF-CUSTODY',
        achievement: [
            'Keys, seeds, addresses, backups:',
            'your bitcoin, your responsibility.',
        ],
    },
    privacy: {
        ...PALETTES.privacy,
        subtitle: 'Privacy',
        chipText: 'FLIGHT PATH · PRIVACY',
        achievement: [
            'The chain is public.',
            'Now you know how to behave.',
        ],
    },
    sovereignty: {
        ...PALETTES.sovereignty,
        subtitle: 'Full Independence',
        chipText: 'FLIGHT PATH · SOVEREIGNTY',
        achievement: [
            'Signet on-chain, your own node,',
            'the long game.',
        ],
    },
    'open-source': {
        ...PALETTES['open-source'],
        subtitle: 'Open Source',
        chipText: 'FLIGHT PATH · OPEN SOURCE',
        achievement: [
            'A real merged PR:',
            'code strangers now run.',
        ],
    },
}

/**
 * The big wordmark on the card. Each flight path earns its "Wings" (you
 * earn your Bitcoin Wings), the per-path award. This is deliberately NOT
 * "Pilot": "Pilot" is a tier on the overall rank ladder (Cadet, Pilot,
 * Captain, Commander in rank.ts), and using it here too confused learners.
 * Wings = subject mastery; the rank ladder = overall seniority.
 */
const RANK_LABEL: Record<Tree, string> = {
    money: 'MONEY BASICS WINGS',
    bitcoin: 'BITCOIN WINGS',
    lightning: 'LIGHTNING WINGS',
    nostr: 'NOSTR WINGS',
    ecash: 'ECASH WINGS',
    'self-custody': 'SELF-CUSTODY WINGS',
    privacy: 'PRIVACY WINGS',
    sovereignty: 'INDEPENDENCE WINGS',
    'open-source': 'OPEN SOURCE WINGS',
}

/**
 * Prose form of the award for sentences ("You earned the Money Basics Wings
 * badge"). Mirrored by `Tree::wings_title()` on the backend so the
 * certificate wording matches the UI.
 */
export function rankTitleFor(tree: Tree): string {
    const titles: Record<Tree, string> = {
        money: 'Money Basics Wings',
        bitcoin: 'Bitcoin Wings',
        lightning: 'Lightning Wings',
        nostr: 'Nostr Wings',
        ecash: 'eCash Wings',
        'self-custody': 'Self-custody Wings',
        privacy: 'Privacy Wings',
        sovereignty: 'Independence Wings',
        'open-source': 'Open Source Wings',
    }
    return titles[tree]
}

/**
 * Stable, short badge ID derived from participantId + tree. Looks like
 * `BP-LIG-A3F4B2C1`. Deterministic so re-downloads always show the same id.
 * Self-custody collapses to "SEL", slugs with hyphens drop them first.
 */
export function badgeIdFor(participantId: string, tree: Tree): string {
    const prefix = tree.replace(/-/g, '').slice(0, 3).toUpperCase()
    // Derive the code from an FNV-1a hash of (participant, tree) rather than
    // exposing a raw slice of the participant id. Two consequences that
    // matter for the high-risk users this app serves: the code no longer
    // reveals part of the internal id, and because it is salted per tree,
    // two badges shared publicly by the same person can't be correlated by a
    // shared id fragment. Same BP-XXX-8hex shape, so the badge art is
    // unchanged.
    let h = 0x811c9dc5
    const seed = `${participantId}:${tree}`
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    const code = (h >>> 0).toString(16).toUpperCase().padStart(8, '0')
    return `BP-${prefix}-${code}`
}

/**
 * Format a unix-seconds timestamp as a short English date, "MAY 18 · 2025".
 * Keeps the badge readable across locales without pulling Intl polyfills.
 */
export function formatBadgeDate(unixSeconds: number | null | undefined): string {
    if (!unixSeconds) return '·'
    const d = new Date(unixSeconds * 1000)
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()} · ${d.getUTCFullYear()}`
}

export interface TierBadgeCardProps {
    tree: Tree
    participantName: string
    earnedAt: number | null
    badgeId: string
    /** Visual scale. Default 1 = 600x800. Pass < 1 for inline previews. */
    scale?: number
    /**
     * Fill the parent element instead of a fixed pixel size. Modals use
     * this so the card shrinks with the viewport and never pushes the
     * action buttons off a phone screen. Exporters must reset width and
     * height to 600x800 on the serialized clone (ShareBadgeModal does).
     */
    fluid?: boolean
}

const W = 600
const H = 800
/** Corner radius of the physical card. */
const CARD_R = 28
const CX = W / 2
const MEDAL_CY = 360
const MEDAL_R_OUTER = 150
const MEDAL_R_RING = 128
const MEDAL_R_DISC = 100

/**
 * Compass medallion glyph, the same 4-point cardinal compass + ₿ for
 * every tree. Trees are peers, not ranked stages, so they share one
 * emblem; the chip text and subtitle do the per-tree work.
 *
 * Drawn as inline paths (not emoji or fonts) so the same SVG rasterizes
 * identically across every OS when serialized to PNG. `accent` is the
 * bitcoin-orange star fill; `glyph` is the cream ₿.
 */
function TreeGlyph({ accent, glyph }: { accent: string; glyph: string }) {
    return (
        <g>
            <g fill={accent}>
                <polygon points="0,-72 12,-20 0,-14 -12,-20" />
                <polygon points="72,0 20,12 14,0 20,-12" />
                <polygon points="0,72 -12,20 0,14 12,20" />
                <polygon points="-72,0 -20,-12 -14,0 -20,12" />
            </g>
            <text
                x="0"
                y="22"
                textAnchor="middle"
                fill={glyph}
                fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                fontWeight="900"
                fontSize="62"
                letterSpacing="-0.04em"
            >
                ₿
            </text>
        </g>
    )
}

/**
 * Renders the badge as a self-contained SVG. Wrapped in forwardRef so
 * ShareBadgeModal can grab the raw <svg> for serialization.
 */
export const TierBadgeCard = forwardRef<SVGSVGElement, TierBadgeCardProps>(
    function TierBadgeCard({ tree, participantName, earnedAt, badgeId, scale = 1, fluid = false }, ref) {
        const theme = THEMES[tree]
        const label = RANK_LABEL[tree]
        // Chip auto-sizing. The old formula (chars * 7.2) ignored the 3px
        // letter-spacing and the text's left inset, so longer labels spilled
        // out of the pill. Size the text region from a per-glyph advance that
        // includes the spacing, then pad for the leading dot and a trailing
        // gutter. textLength on the <text> below locks it to exactly this.
        const CHIP_TEXT_X = 26
        const chipTextW = theme.chipText.length * 9.6
        const chipW = CHIP_TEXT_X + chipTextW + 16
        // Long labels ("SELF-CUSTODY WINGS") shrink to stay inside the card;
        // solved from width ≈ chars*0.74*size + (chars-1)*spacing ≤ 508
        // (0.74em per glyph measured at weight 900; 508 keeps clear of the
        // inner frame at x=22/578). Shrunk labels also get an exact
        // textLength so no OS font metric can push them past the frame.
        const RANK_MAX_W = 508
        const rankSize = Math.min(
            54,
            Math.floor((RANK_MAX_W - (label.length - 1) * 6) / (label.length * 0.74)),
        )
        const rankFitted = rankSize < 54
        const dateStr = formatBadgeDate(earnedAt)
        const safeName = (participantName || 'BitPilot Learner').trim().slice(0, 28)
        // NOT `ring-${tree}`: that id belongs to the ring's linearGradient
        // below, and a duplicate id makes textPath resolve to the gradient,
        // silently dropping the curved brand text from exports.
        const ringTextId = `ring-text-${tree}`
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
                width={fluid ? '100%' : W * scale}
                height={fluid ? '100%' : H * scale}
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={
                    earnedAt
                        ? `${label} badge for ${safeName}, earned ${dateStr}. Badge ID ${badgeId}.`
                        : `${label} badge for ${safeName}. Badge ID ${badgeId}.`
                }
            >
                <defs>
                    {/* ── Aurora field ──────────────────────────────────── */}
                    <linearGradient id={`bg-${tree}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={theme.bg1} />
                        <stop offset="0.6" stopColor={theme.bg2} />
                        <stop offset="1" stopColor="#000000" />
                    </linearGradient>
                    {/* Three overlapping radial gradients give the aurora
                        a sense of depth without painting a busy texture. */}
                    <radialGradient id={`aurora-1-${tree}`} cx="0.18" cy="0.18" r="0.55">
                        <stop offset="0" stopColor={theme.accent} stopOpacity="0.34" />
                        <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={`aurora-2-${tree}`} cx="0.82" cy="0.30" r="0.55">
                        <stop offset="0" stopColor={theme.accent2} stopOpacity="0.28" />
                        <stop offset="1" stopColor={theme.accent2} stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={`aurora-3-${tree}`} cx="0.5" cy={`${(MEDAL_CY / H).toFixed(3)}`} r="0.5">
                        <stop offset="0" stopColor={theme.accentLight} stopOpacity="0.22" />
                        <stop offset="0.65" stopColor={theme.accent} stopOpacity="0.05" />
                        <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
                    </radialGradient>

                    {/* ── Medallion fills ───────────────────────────────── */}
                    <radialGradient id={`disc-${tree}`} cx="0.5" cy="0.32" r="0.78">
                        <stop offset="0" stopColor="rgba(255,255,255,0.20)" />
                        <stop offset="0.55" stopColor="rgba(255,255,255,0.04)" />
                        <stop offset="1" stopColor="rgba(0,0,0,0.55)" />
                    </radialGradient>
                    <linearGradient id={`ring-${tree}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={theme.accentLight} />
                        <stop offset="0.5" stopColor={theme.accent} />
                        <stop offset="1" stopColor={theme.accentDim} />
                    </linearGradient>
                    <linearGradient id={`shine-${tree}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
                        <stop offset="0.45" stopColor="rgba(255,255,255,0.05)" />
                        <stop offset="1" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>

                    {/* ── Dot-grid + holographic patterns ───────────────── */}
                    <pattern id={`dots-${tree}`} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="0.85" fill={theme.accentLight} fillOpacity="0.07" />
                    </pattern>

                    <path id={ringTextId} d={ringTextPath} />

                    {/* Rounded-corner clip: everything renders inside this,
                        so the card reads as a solid physical object with a
                        border radius, in the UI and in PNG/SVG exports. */}
                    <clipPath id={`card-clip-${tree}`}>
                        <rect x="0" y="0" width={W} height={H} rx={CARD_R} />
                    </clipPath>
                </defs>

                <g clipPath={`url(#card-clip-${tree})`}>

                {/* ── Layer 1: aurora background ──────────────────────────── */}
                <rect x="0" y="0" width={W} height={H} fill={`url(#bg-${tree})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#dots-${tree})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#aurora-1-${tree})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#aurora-2-${tree})`} />
                <rect x="0" y="0" width={W} height={H} fill={`url(#aurora-3-${tree})`} />

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
                {/* Tree chip, left. Width auto-sized to fit longer tree
                    names like "SELF-CUSTODY" without truncation. */}
                <g transform={`translate(48 56)`}>
                    <rect
                        x="0"
                        y="0"
                        width={chipW}
                        height="28"
                        rx="14"
                        fill="rgba(0,0,0,0.35)"
                        stroke={theme.accent}
                        strokeOpacity="0.6"
                        strokeWidth="1"
                    />
                    <circle cx="14" cy="14" r="4" fill={theme.accent} />
                    {/* textLength pins the wordmark to the width the chip was
                        sized for, so no OS font metric can push it past the
                        pill's rounded end (long labels like SELF-CUSTODY). */}
                    <text
                        x={CHIP_TEXT_X}
                        y="19"
                        fill={theme.accentLight}
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                        fontWeight="800"
                        fontSize="11"
                        letterSpacing="3"
                        textLength={chipTextW}
                        lengthAdjust="spacingAndGlyphs"
                    >
                        {theme.chipText}
                    </text>
                </g>
                {/* Badge ID, right */}
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

                {/* ── Layer 4: achievement eyebrow (above medallion) ──────── */}
                {/* The subject moved next to the wordmark below, so this
                    states the achievement instead of repeating the path. */}
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
                    FLIGHT PATH COMPLETE
                </text>

                {/* ── Layer 5: medallion ──────────────────────────────────── */}

                {/* Outer aura halo, two concentric soft rings */}
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

                {/* Tick marks around the outer aura, 60 small dashes */}
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
                    fill={`url(#ring-${tree})`}
                />
                {/* Inner darker base under the glass */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER - 4}
                    fill="#0C1A14"
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
                    fill={`url(#disc-${tree})`}
                />
                {/* Disc highlight crescent, top-left arc that gives the glass life */}
                <path
                    d={`M ${CX - MEDAL_R_DISC * 0.78} ${MEDAL_CY - MEDAL_R_DISC * 0.35} ` +
                        `A ${MEDAL_R_DISC * 0.9} ${MEDAL_R_DISC * 0.9} 0 0 1 ` +
                        `${CX + MEDAL_R_DISC * 0.2} ${MEDAL_CY - MEDAL_R_DISC * 0.78}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                />
                {/* Disc inner shadow at bottom, sells the depth */}
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

                {/* Compass medallion glyph (shared across all trees). */}
                <g transform={`translate(${CX} ${MEDAL_CY})`}>
                    <TreeGlyph accent={theme.accent} glyph={theme.accentLight} />
                </g>

                {/* Holographic shine across the medallion */}
                <circle
                    cx={CX}
                    cy={MEDAL_CY}
                    r={MEDAL_R_OUTER}
                    fill={`url(#shine-${tree})`}
                    opacity="0.45"
                />

                {/* ── Layer 6: rank wordmark + flight path line ───────────── */}
                <text
                    x={CX}
                    y={580}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
                    fontWeight="900"
                    fontSize={rankSize}
                    letterSpacing="6"
                    {...(rankFitted
                        ? { textLength: RANK_MAX_W, lengthAdjust: 'spacingAndGlyphs' as const }
                        : {})}
                >
                    {label}
                </text>
                <text
                    x={CX}
                    y={608}
                    textAnchor="middle"
                    fill={theme.accentLight}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontWeight="700"
                    fontSize="12"
                    letterSpacing="3"
                    opacity="0.85"
                >
                    {theme.subtitle.toUpperCase()} FLIGHT PATH
                </text>

                {/* ── Layer 7: participant + date strip ───────────────────── */}
                {/* Accent rule with end caps */}
                <g transform={`translate(${CX} 630)`}>
                    <line x1="-140" y1="0" x2="-12" y2="0" stroke={theme.accent} strokeWidth="1" opacity="0.7" />
                    <line x1="12" y1="0" x2="140" y2="0" stroke={theme.accent} strokeWidth="1" opacity="0.7" />
                    <circle cx="-152" cy="0" r="2" fill={theme.accent} opacity="0.7" />
                    <circle cx="152" cy="0" r="2" fill={theme.accent} opacity="0.7" />
                </g>

                <text
                    x={CX}
                    y={664}
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
                    y={688}
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
                    y={720}
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
                    y={738}
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

                {/* Solid card edge, drawn last so it sits on top of the
                    aurora. Follows the same radius as the clip. */}
                <rect
                    x="1.5"
                    y="1.5"
                    width={W - 3}
                    height={H - 3}
                    rx={CARD_R - 1.5}
                    fill="none"
                    stroke={theme.accent}
                    strokeOpacity="0.85"
                    strokeWidth="3"
                />
                </g>
            </svg>
        )
    },
)
