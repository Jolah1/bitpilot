/**
 * Compact compass-medallion brand mark, navbar/footer/chip size.
 * Mirrors the favicon and PWA icon at small sizes: 8-point compass star
 * around a central ₿ medallion on a navy disc. Static (no animation)
 * since this sits in chrome where motion would be distracting.
 *
 * For the large animated marketing version, see HeroMedallion in Landing.
 */
export function BrandMark({ size }: { size: number }) {
    return (
        <span
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                display: 'inline-flex',
                flexShrink: 0,
            }}
        >
            <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }}>
                <defs>
                    <radialGradient id="bp-mini-bg" cx="50%" cy="42%" r="60%">
                        <stop offset="0%" stopColor="#1E3B2C" />
                        <stop offset="100%" stopColor="#0C1A14" />
                    </radialGradient>
                    <linearGradient id="bp-mini-star" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFAB91" />
                        <stop offset="55%" stopColor="#FF5722" />
                        <stop offset="100%" stopColor="#D84315" />
                    </linearGradient>
                </defs>
                <rect width="64" height="64" rx="10" fill="url(#bp-mini-bg)" />
                <g transform="translate(32 32)">
                    <g transform="rotate(45)" fill="url(#bp-mini-star)" opacity="0.55">
                        <polygon points="0,-18 4,-6 0,-4 -4,-6" />
                        <polygon points="18,0 6,4 4,0 6,-4" />
                        <polygon points="0,18 -4,6 0,4 4,6" />
                        <polygon points="-18,0 -6,-4 -4,0 -6,4" />
                    </g>
                    <g fill="url(#bp-mini-star)">
                        <polygon points="0,-26 5,-8 0,-6 -5,-8" />
                        <polygon points="26,0 8,5 6,0 8,-5" />
                        <polygon points="0,26 -5,8 0,6 5,8" />
                        <polygon points="-26,0 -8,-5 -6,0 -8,5" />
                    </g>
                    <circle cx="0" cy="0" r="13" fill="#0C1A14" stroke="#FF5722" strokeWidth="1.6" />
                    <text
                        x="0"
                        y="5"
                        textAnchor="middle"
                        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
                        fontWeight={900}
                        fontSize={16}
                        fill="#FFCCBC"
                    >
                        ₿
                    </text>
                </g>
            </svg>
        </span>
    )
}
