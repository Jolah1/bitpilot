/**
 * Mini compass-medallion mark for tier-badge strips and grids. Each tier
 * adds another layer to the same emblem so a row of five reads as a
 * single shape leveling up rather than five unrelated icons:
 *
 *   novice (I)     → bare ₿ on a navy disc
 *   apprentice (II)→ ₿ + 2 cardinal star points (N/S)
 *   pilot (III)    → ₿ + 4 cardinal star points
 *   navigator (IV) → ₿ + 8-point star (cardinals + dim diagonals)
 *   captain (V)    → ₿ + 8-point star + outer gold tick ring
 *
 * Locked badges render the same shape with dimmed star fills and a
 * lighter glyph so the row tells the learner what they're working
 * toward — not just what's gone.
 *
 * Larger format (~80px+) than the in-card BadgeCelebrationModal version,
 * which is rendered via TierBadgeCard.
 */
const TIER_RANK: Record<string, number> = {
    novice: 1,
    apprentice: 2,
    pilot: 3,
    navigator: 4,
    captain: 5,
}

export function TierProgressionMark({
    tier,
    earned,
    size,
}: {
    tier: string
    earned: boolean
    size: number
}) {
    const rank = TIER_RANK[tier] ?? 1
    const starColor = earned ? '#F7931A' : 'rgba(247, 147, 26, 0.55)'
    const diagColor = earned ? 'rgba(247, 147, 26, 0.6)' : 'rgba(247, 147, 26, 0.3)'
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
                {rank >= 5 && (
                    <g>
                        {Array.from({ length: 12 }).map((_, i) => (
                            <rect
                                key={i}
                                x="31.5"
                                y="3"
                                width="1"
                                height="4"
                                fill="#FFD27A"
                                opacity={earned ? 0.8 : 0.4}
                                transform={`rotate(${i * 30} 32 32)`}
                            />
                        ))}
                    </g>
                )}
                {rank >= 4 && (
                    <g transform="translate(32 32) rotate(45)" fill={diagColor}>
                        <polygon points="0,-22 4,-7 0,-5 -4,-7" />
                        <polygon points="22,0 7,4 5,0 7,-4" />
                        <polygon points="0,22 -4,7 0,5 4,7" />
                        <polygon points="-22,0 -7,-4 -5,0 -7,4" />
                    </g>
                )}
                {rank >= 3 && (
                    <g transform="translate(32 32)" fill={starColor}>
                        <polygon points="0,-25 5,-8 0,-6 -5,-8" />
                        <polygon points="25,0 8,5 6,0 8,-5" />
                        <polygon points="0,25 -5,8 0,6 5,8" />
                        <polygon points="-25,0 -8,-5 -6,0 -8,5" />
                    </g>
                )}
                {rank === 2 && (
                    <g transform="translate(32 32)" fill={starColor}>
                        <polygon points="0,-25 5,-8 0,-6 -5,-8" />
                        <polygon points="0,25 -5,8 0,6 5,8" />
                    </g>
                )}
                <text
                    x="32"
                    y="40"
                    textAnchor="middle"
                    fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
                    fontWeight={900}
                    fontSize={20}
                    fill={earned ? '#FFE7C2' : 'rgba(255, 231, 194, 0.6)'}
                >
                    ₿
                </text>
            </svg>
        </span>
    )
}
