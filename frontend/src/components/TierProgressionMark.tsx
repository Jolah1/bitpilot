/**
 * Mini compass-medallion mark for tree-badge strips and grids.
 *
 * Trees are peers (not ranked stages), so every tree renders the same
 * 4-point compass medallion — distinguishing information comes from the
 * label and the completion chip next to it, not the glyph. Earned vs
 * locked is conveyed by colour saturation: full bitcoin-orange + cream
 * ₿ when earned, dimmed when still in progress.
 *
 * Larger format (~80px+) than the in-card BadgeCelebrationModal version,
 * which is rendered via TierBadgeCard.
 */
export function TierProgressionMark({
    earned,
    size,
}: {
    /** Tree key — accepted for API symmetry but not currently rendered;
     *  every tree shares the same medallion shape. */
    tier?: string
    earned: boolean
    size: number
}) {
    const starColor = earned ? '#F7931A' : 'rgba(247, 147, 26, 0.55)'
    return (
        <span
            aria-hidden="true"
            style={{ width: size, height: size, display: 'inline-flex', flexShrink: 0 }}
        >
            <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }}>
                <circle
                    cx="32"
                    cy="32"
                    r="30"
                    fill="#0B1220"
                    stroke={earned ? '#F7931A' : 'rgba(247, 147, 26, 0.35)'}
                    strokeWidth="2"
                />
                {/* 4-point cardinal compass — shared across all 8 trees. */}
                <g transform="translate(32 32)" fill={starColor}>
                    <polygon points="0,-25 5,-8 0,-6 -5,-8" />
                    <polygon points="25,0 8,5 6,0 8,-5" />
                    <polygon points="0,25 -5,8 0,6 5,8" />
                    <polygon points="-25,0 -8,-5 -6,0 -8,5" />
                </g>
                <text
                    x="32"
                    y="40"
                    textAnchor="middle"
                    fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
                    fontWeight={900}
                    fontSize={20}
                    fill={earned ? '#FFCCBC' : 'rgba(255, 204, 188, 0.6)'}
                >
                    ₿
                </text>
            </svg>
        </span>
    )
}
