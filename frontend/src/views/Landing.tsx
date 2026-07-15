import { useRef, type CSSProperties } from 'react'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggle } from '../components/ThemeToggle'
import type { Theme } from '../lib/theme'
import { useRuntime } from '../lib/runtime'
import { TREES } from '../lib/types'
import { card, chip, ghostButton, primaryButton } from '../lib/ui'

// ─── Landing ─────────────────────────────────────────────────────────────────
//
// Landing is intentionally outcome-driven, not curriculum-driven. The job of
// each section, top to bottom:
//
//   1. Hero           , promise the transformation in two sentences.
//   2. How It Works   , show the 4-step loop so the offer feels concrete.
//   3. Your Journey   , eight skill trees in plain language (no NIP-05, no jargon).
//   4. Why this works , emotional section: name the failure mode of video-
//                        based learning and contrast it.
//   5. Safe by design , checklist that defuses the "is this real money?"
//                        fear before the user has to ask.
//   6. Who it's for   , let the visitor self-identify.
//   7. Footer CTA     , one last invitation, then the slim footer.
//
// Copy guideline: never name a protocol the visitor hasn't met yet.
// "NIP-05", "secp256k1", "BIP39" all belong inside missions, not on the door.
//
// This whole module is lazy-loaded from App.tsx, a returning user resuming
// via deep link or a PWA launch never pays for the ~1100 lines of marketing
// JSX below. Keep the section components co-located here so the chunk stays
// self-contained; if you split them across files, Vite will still bundle
// them together but the import graph gets harder to reason about.
export default function Landing({
    theme,
    onToggleTheme,
    onStart,
    onFacilitator,
    onPair,
    hasResumable,
    onContinue,
}: {
    theme: Theme
    onToggleTheme: () => void
    onStart: () => void
    onFacilitator: () => void
    onPair: () => void
    hasResumable: boolean
    onContinue: () => void
}) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg)',
                color: 'var(--text)',
            }}
        >
            <TopNav theme={theme} onToggleTheme={onToggleTheme} onCta={onStart} />

            <main id="main-content" style={{ flex: 1 }}>
                <Hero
                    hasResumable={hasResumable}
                    onStart={onStart}
                    onContinue={onContinue}
                    onFacilitator={onFacilitator}
                    onPair={onPair}
                />
                <HowItWorks />
                <YourJourney />
                <WhyThisWorks />
                <SafeByDesign />
                <WhoItsFor />
                <FinalCTA
                    hasResumable={hasResumable}
                    onStart={onStart}
                    onContinue={onContinue}
                />
            </main>

            <SiteFooter />
        </div>
    )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero({
    hasResumable,
    onStart,
    onContinue,
    onFacilitator,
    onPair,
}: {
    hasResumable: boolean
    onStart: () => void
    onContinue: () => void
    onFacilitator: () => void
    onPair: () => void
}) {
    return (
        <section
            aria-labelledby="hero-headline"
            style={{
                position: 'relative',
                maxWidth: 760,
                margin: '0 auto',
                padding: 'clamp(2rem, 8vw, 4rem) clamp(1rem, 4vw, 1.5rem) clamp(2rem, 6vw, 3rem)',
                textAlign: 'center',
                overflow: 'hidden',
            }}
        >
            {/* Background glow pool. Sits behind the medallion and bleeds
                into the section background, a soft navy-to-bg radial that
                gives the medallion something to "float" against without
                hard edges. Pointer-events:none so it doesn't intercept
                clicks on the CTAs above the fold. */}
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    background:
                        'radial-gradient(circle at 50% 28%, rgba(255, 87, 34, 0.18) 0%, rgba(255, 87, 34, 0.06) 18%, rgba(12, 26, 20, 0) 55%)',
                }}
            />

            <HeroMedallion />

            <span style={{ ...chip('orange'), marginBottom: 20, position: 'relative' }}>
                <span
                    aria-hidden="true"
                    style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: 'var(--bitcoin)',
                        display: 'inline-block',
                    }}
                />
                100% free · no signup · nothing to buy
            </span>

            <h1
                id="hero-headline"
                style={{
                    fontSize: 'clamp(34px, 8.5vw, 64px)',
                    fontWeight: 800,
                    lineHeight: 1.05,
                    letterSpacing: '-0.035em',
                    marginBottom: 18,
                    position: 'relative',
                }}
            >
                Learn Bitcoin
                <br />
                by <span className="gradient-text">actually using it.</span>
            </h1>

            {/* Two short sentences. First names the failure mode; second
                states the cure. Anything longer here turns the hero into
                a paragraph, exactly the documentation-shaped page we're
                trying to escape. */}
            <p
                style={{
                    fontSize: 'clamp(16px, 3.6vw, 19px)',
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    maxWidth: 540,
                    margin: '0 auto 28px',
                    position: 'relative',
                }}
            >
                Most people watch videos about Bitcoin and stay confused.
                BitPilot teaches you by making you{' '}
                <strong style={{ color: 'var(--text)' }}>actually do it</strong>:
                wallets, Lightning, Nostr, the whole stack, in short, hands-on missions.
            </p>

            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    position: 'relative',
                }}
            >
                {hasResumable && (
                    <button
                        className="bp-press"
                        style={{
                            ...primaryButton(),
                            padding: '14px 24px',
                            fontSize: 15,
                            minHeight: 48,
                        }}
                        onClick={onContinue}
                    >
                        ↻ Continue your missions
                    </button>
                )}
                <button
                    className="bp-press"
                    style={{
                        ...(hasResumable ? ghostButton : primaryButton()),
                        padding: '14px 24px',
                        fontSize: 15,
                        minHeight: 48,
                    }}
                    onClick={onStart}
                >
                    {hasResumable ? 'Start fresh' : '⚡ Start Learning Bitcoin'}
                </button>
                <button
                    style={{
                        ...ghostButton,
                        padding: '14px 22px',
                        fontSize: 14,
                        minHeight: 48,
                    }}
                    onClick={onFacilitator}
                >
                    🎓 Run a Workshop
                </button>
                <button
                    style={{
                        ...ghostButton,
                        padding: '14px 22px',
                        fontSize: 14,
                        minHeight: 48,
                    }}
                    onClick={onPair}
                >
                    📲 Continue with a code
                </button>
            </div>

            <p
                style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    marginTop: 18,
                    marginBottom: 0,
                    position: 'relative',
                }}
            >
                About 45 minutes per chapter · works on your phone
            </p>
        </section>
    )
}

// ─── Hero medallion ──────────────────────────────────────────────────────────

/**
 * Marketing-grade brand mark. Mirrors the favicon and PWA icon design but
 * scaled to ~clamp(220px, 38vw, 320px) so it can hold the top of the
 * landing page on its own. The slow halo rotation is purely decorative
 * and disabled by `prefers-reduced-motion` via the global CSS rule.
 *
 * Why inline (not an <img src>): we want themed colour responsiveness,
 * crisp scaling, and zero extra round-trip. Also keeps the asset under
 * our CSP without needing `img-src` widened.
 */
function HeroMedallion() {
    return (
        <div
            aria-hidden="true"
            style={{
                position: 'relative',
                // Caps higher on desktop so the mark commands the hero —
                // 320px was right for mobile but tiny on 1440px+ displays.
                width: 'clamp(220px, 36vw, 420px)',
                height: 'clamp(220px, 36vw, 420px)',
                margin: '0 auto 28px',
            }}
        >
            <style>{`
                @keyframes bp-hero-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes bp-hero-pulse {
                    0%, 100% { opacity: 0.55; transform: scale(1); }
                    50% { opacity: 0.85; transform: scale(1.04); }
                }
                .bp-hero-halo {
                    animation: bp-hero-spin 40s linear infinite;
                }
                .bp-hero-glow {
                    animation: bp-hero-pulse 4.5s ease-in-out infinite;
                }
            `}</style>
            <svg
                viewBox="0 0 400 400"
                width="100%"
                height="100%"
                style={{ display: 'block', filter: 'drop-shadow(0 18px 40px rgba(255, 87, 34, 0.25))' }}
            >
                <defs>
                    <radialGradient id="bp-hero-bg" cx="50%" cy="42%" r="60%">
                        <stop offset="0%" stopColor="#1E3B2C" />
                        <stop offset="65%" stopColor="#12241B" />
                        <stop offset="100%" stopColor="#0C1A14" />
                    </radialGradient>
                    <linearGradient id="bp-hero-star" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFCCBC" />
                        <stop offset="50%" stopColor="#FF5722" />
                        <stop offset="100%" stopColor="#D84315" />
                    </linearGradient>
                    <radialGradient id="bp-hero-glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#FF5722" stopOpacity="0.55" />
                        <stop offset="60%" stopColor="#FF5722" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="#FF5722" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Outer glow disc, pulses softly. */}
                <circle cx="200" cy="200" r="190" fill="url(#bp-hero-glow)" className="bp-hero-glow" style={{ transformOrigin: '200px 200px' }} />

                {/* Navy backplate. */}
                <circle cx="200" cy="200" r="160" fill="url(#bp-hero-bg)" stroke="rgba(255, 171, 145, 0.18)" strokeWidth="1" />

                {/* Tick ring, 24 small marks evenly spaced. Rotates slowly
                    to give a sense of an instrument in motion. */}
                <g className="bp-hero-halo" style={{ transformOrigin: '200px 200px' }}>
                    {Array.from({ length: 24 }).map((_, i) => {
                        const angle = (i * 360) / 24
                        const isCardinal = i % 6 === 0
                        return (
                            <rect
                                key={i}
                                x="199"
                                y={isCardinal ? 50 : 54}
                                width="2"
                                height={isCardinal ? 14 : 8}
                                fill={isCardinal ? '#FFAB91' : 'rgba(255, 171, 145, 0.4)'}
                                transform={`rotate(${angle} 200 200)`}
                            />
                        )
                    })}
                    {/* Hairline accent ring just inside the ticks. */}
                    <circle cx="200" cy="200" r="146" fill="none" stroke="rgba(255, 171, 145, 0.35)" strokeWidth="1" />
                </g>

                {/* Compass star, same geometry as favicon, scaled. */}
                <g transform="translate(200 200)">
                    {/* Diagonals (back layer, dimmer). */}
                    <g transform="rotate(45)" fill="url(#bp-hero-star)" opacity="0.55">
                        <polygon points="0,-90 16,-26 0,-16 -16,-26" />
                        <polygon points="90,0 26,16 16,0 26,-16" />
                        <polygon points="0,90 -16,26 0,16 16,26" />
                        <polygon points="-90,0 -26,-16 -16,0 -26,16" />
                    </g>
                    {/* Cardinals (front layer, full saturation). */}
                    <g fill="url(#bp-hero-star)">
                        <polygon points="0,-130 22,-36 0,-26 -22,-36" />
                        <polygon points="130,0 36,22 26,0 36,-22" />
                        <polygon points="0,130 -22,36 0,26 22,36" />
                        <polygon points="-130,0 -36,-22 -26,0 -36,22" />
                    </g>
                    {/* Central medallion. */}
                    <circle cx="0" cy="0" r="56" fill="#0C1A14" stroke="#FF5722" strokeWidth="4" />
                    <circle cx="0" cy="0" r="48" fill="none" stroke="rgba(255, 171, 145, 0.4)" strokeWidth="1" />
                    <text
                        x="0"
                        y="22"
                        textAnchor="middle"
                        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
                        fontWeight={900}
                        fontSize={68}
                        fill="#FFCCBC"
                    >
                        ₿
                    </text>
                </g>

                {/* Scattered sparkle dots, light atmosphere, brand
                    consistency with star gradient. */}
                <g fill="#FFAB91">
                    <circle cx="80" cy="120" r="1.8" opacity="0.7" />
                    <circle cx="330" cy="100" r="1.4" opacity="0.6" />
                    <circle cx="350" cy="280" r="2.2" opacity="0.5" />
                    <circle cx="60" cy="300" r="1.6" opacity="0.6" />
                    <circle cx="200" cy="40" r="1.8" opacity="0.7" />
                    <circle cx="200" cy="370" r="1.5" opacity="0.6" />
                </g>
            </svg>
        </div>
    )
}

// ─── How It Works ────────────────────────────────────────────────────────────

/** A 4-step "how" strip. Deliberately uses plain verbs, no jargon. */
function HowItWorks() {
    const steps: Array<{ n: string; title: string; body: string }> = [
        {
            n: '1',
            title: 'Learn',
            body: 'A short lesson that explains one concept at a time. No filler.',
        },
        {
            n: '2',
            title: 'Quiz',
            body: 'A quick check to prove the idea actually landed.',
        },
        {
            n: '3',
            title: 'Do',
            body: 'Use the real thing: create a wallet, send a payment, publish a Nostr note.',
        },
        {
            n: '4',
            title: 'Level Up',
            body: 'Finish a chapter, earn the medallion, pick the next one.',
        },
    ]
    return (
        <section
            aria-labelledby="how-headline"
            style={{
                maxWidth: 1080,
                margin: '0 auto',
                padding: '0 clamp(1rem, 4vw, 1.5rem) clamp(2.5rem, 7vw, 4rem)',
            }}
        >
            <SectionHeading id="how-headline" eyebrow="How it works" title="Four steps, every mission." />
            <ol
                style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                }}
            >
                {steps.map((s) => (
                    <li
                        key={s.n}
                        style={{
                            ...card,
                            padding: 18,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 'var(--radius-1)',
                                background: 'var(--gradient-bitcoin)',
                                color: '#0A0A0B',
                                fontWeight: 800,
                                fontSize: 15,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {s.n}
                        </span>
                        <h3
                            style={{
                                fontSize: 17,
                                fontWeight: 800,
                                letterSpacing: '-0.02em',
                                margin: 0,
                            }}
                        >
                            {s.title}
                        </h3>
                        <p
                            style={{
                                fontSize: 13.5,
                                color: 'var(--text-soft)',
                                lineHeight: 1.55,
                                margin: 0,
                            }}
                        >
                            {s.body}
                        </p>
                    </li>
                ))}
            </ol>
        </section>
    )
}

// ─── Your Journey ────────────────────────────────────────────────────────────

/**
 * One-word outcome per skill tree. The old copy was a sentence; on a
 * marketing page that's too dense, especially repeated 8 times in a row.
 * We swap each long sentence for an icon + a single outcome phrase, and
 * rely on the slider to invite exploration instead of dumping it all at once.
 *
 * Keys match `TREES` in `types.ts`. If a tree is renamed there, the
 * lookup quietly falls through to `t.tagline`.
 */
interface TreePitch {
    icon: string
    outcome: string
}
const TREE_PITCH: Record<string, TreePitch> = {
    money:          { icon: '💸', outcome: 'What money is and why bitcoin exists.' },
    bitcoin:        { icon: '₿',  outcome: 'Blocks, fees, miners, the base layer.' },
    lightning:      { icon: '⚡', outcome: 'Fast, cheap, routable bitcoin payments.' },
    nostr:          { icon: '🪪', outcome: 'Identity and notes nobody owns but you.' },
    ecash:          { icon: '🎟️', outcome: 'Private bearer money, redeemable to Lightning.' },
    'self-custody': { icon: '🔑', outcome: 'Wallets, seeds, hardware, multisig.' },
    privacy:        { icon: '🕵️', outcome: 'The chain is public, act accordingly.' },
    sovereignty:    { icon: '🚀', outcome: 'Signet on-chain, your own node, the long game.' },
    'open-source':  { icon: '🛠️', outcome: 'Your first merged PR into a real Bitcoin project.' },
}

/**
 * Horizontally scroll-snapped slider. CSS scroll-snap + overflow-x: auto
 * gives us touch swiping on mobile and mouse-wheel/drag on desktop with
 * no JS library. The arrow buttons on desktop are pure ergonomics, the
 * slider works without them.
 */
function YourJourney() {
    const trackRef = useRef<HTMLOListElement | null>(null)

    const scrollBy = (dir: -1 | 1) => {
        const el = trackRef.current
        if (!el) return
        // Step one card-width at a time. We read clientWidth so the step
        // adapts when the viewport changes.
        const step = Math.min(el.clientWidth * 0.85, 360)
        el.scrollBy({ left: step * dir, behavior: 'smooth' })
    }

    return (
        <section
            aria-labelledby="journey-headline"
            style={{
                maxWidth: 1080,
                margin: '0 auto',
                padding: '0 clamp(1rem, 4vw, 1.5rem) clamp(2.5rem, 7vw, 4rem)',
            }}
        >
            <SectionHeading
                id="journey-headline"
                eyebrow="Your journey"
                title="Nine chapters, take them in any order."
            />

            <div style={{ position: 'relative' }}>
                <ol
                    ref={trackRef}
                    className="no-scrollbar"
                    style={{
                        listStyle: 'none',
                        padding: '4px 4px 16px',
                        margin: 0,
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        scrollSnapType: 'x mandatory',
                        scrollPaddingInline: '4px',
                        // The class above hides the visible scrollbar in
                        // every modern browser; we keep the inline style
                        // for the (rare) Firefox case as belt-and-braces.
                        scrollbarWidth: 'none',
                        WebkitOverflowScrolling: 'touch',
                        // Fade the clipped card at the right edge so the
                        // cut-off reads as "scroll for more", not a broken
                        // layout. Constant 56px fade; subtle enough not to
                        // matter on the last slide.
                        maskImage:
                            'linear-gradient(90deg, #000 0%, #000 calc(100% - 56px), transparent 100%)',
                        WebkitMaskImage:
                            'linear-gradient(90deg, #000 0%, #000 calc(100% - 56px), transparent 100%)',
                    }}
                >
                    {TREES.map((t, i) => (
                        <TierSlide
                            key={t.key}
                            tree={t}
                            pitch={TREE_PITCH[t.key]}
                            index={i + 1}
                            total={TREES.length}
                        />
                    ))}
                </ol>

                {/* Arrow buttons: hidden on touch viewports via media query
                    isn't possible without CSS; keep them visible but small
                    so they don't dominate on mobile. */}
                <SliderArrows onLeft={() => scrollBy(-1)} onRight={() => scrollBy(1)} />
            </div>

            <p
                style={{
                    textAlign: 'center',
                    fontSize: 13,
                    color: 'var(--muted)',
                    marginTop: 12,
                }}
            >
                Nine chapters · short missions · pick any starting point
            </p>
        </section>
    )
}

function TierSlide({
    tree: t,
    pitch,
    index,
    total,
}: {
    tree: (typeof TREES)[number]
    pitch: TreePitch | undefined
    index: number
    total: number
}) {
    const meta = pitch ?? { icon: '✦', outcome: t.tagline }
    return (
        <li
            style={{
                ...card,
                padding: 20,
                flex: '0 0 min(280px, 80vw)',
                scrollSnapAlign: 'start',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minHeight: 200,
            }}
            aria-label={`Chapter ${index} of ${total}: ${t.label}`}
        >
            <div
                aria-hidden="true"
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: 'var(--radius-3)',
                    background: 'var(--gradient-bitcoin)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    color: '#0A0A0B',
                    boxShadow: 'var(--shadow-1)',
                }}
            >
                {meta.icon}
            </div>
            <div
                style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                }}
            >
                Chapter {index} / {total}
            </div>
            <h3
                style={{
                    fontSize: 20,
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.02em',
                }}
            >
                {t.label}
            </h3>
            <p
                style={{
                    fontSize: 14,
                    color: 'var(--text-soft)',
                    margin: 0,
                    lineHeight: 1.5,
                }}
            >
                {meta.outcome}
            </p>
        </li>
    )
}

function SliderArrows({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
    const btn: CSSProperties = {
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        color: 'var(--text)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontFamily: 'inherit',
        boxShadow: 'var(--shadow-1)',
    }
    return (
        <div
            aria-hidden="true"
            style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginTop: 4,
            }}
        >
            <button type="button" onClick={onLeft} style={btn} aria-label="Scroll chapters left">
                ←
            </button>
            <button type="button" onClick={onRight} style={btn} aria-label="Scroll chapters right">
                →
            </button>
        </div>
    )
}

// ─── Why this works (emotional section) ──────────────────────────────────────

function WhyThisWorks() {
    return (
        <section
            aria-labelledby="why-headline"
            style={{
                background: 'var(--surface)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div
                style={{
                    maxWidth: 640,
                    margin: '0 auto',
                    padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
                    textAlign: 'center',
                }}
            >
                <h2
                    id="why-headline"
                    style={{
                        fontSize: 'clamp(24px, 6vw, 36px)',
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        lineHeight: 1.15,
                        margin: '0 0 16px',
                    }}
                >
                    Most Bitcoin education fails.
                </h2>
                {/* One line. The contrast does the work, anything longer
                    reads as a lecture, which is exactly what we're
                    accusing the alternative of. */}
                <p
                    style={{
                        fontSize: 'clamp(15px, 3.5vw, 17px)',
                        color: 'var(--text-soft)',
                        lineHeight: 1.65,
                        maxWidth: 480,
                        margin: '0 auto 8px',
                    }}
                >
                    You watch the videos. You read the threads. You still never use Bitcoin.
                </p>
                <p
                    style={{
                        fontSize: 'clamp(16px, 3.6vw, 18px)',
                        color: 'var(--text)',
                        lineHeight: 1.45,
                        maxWidth: 480,
                        margin: '0 auto',
                        fontWeight: 700,
                    }}
                >
                    BitPilot makes you actually do it.
                </p>
            </div>
        </section>
    )
}

// ─── Safe by design ──────────────────────────────────────────────────────────

/**
 * Three visual tiles, not a bullet list. Each tile is one big icon, a
 * short label, and a one-line clarification. This is the highest-anxiety
 * section ("am I about to lose real money?") so we want it to feel
 * confident and self-evident, not defensive.
 *
 * The tiny "Lightning/eCash currently simulated" disclaimer is still
 * here, but shrunk and visually demoted under the tiles where it
 * belongs.
 */
function SafeByDesign() {
    const runtime = useRuntime()
    const lnReal = runtime?.lightning_real ?? false
    const ecashReal = runtime?.ecash_real ?? false
    const anySimulated = !lnReal || !ecashReal

    const tiles: Array<{ icon: string; label: string; sub: string }> = [
        { icon: '🛡️', label: 'No real money', sub: 'Testnet only, mainnet is never touched.' },
        { icon: '🔒', label: 'Your keys, your browser', sub: 'Keys are generated locally and stay with you.' },
        { icon: '🌍', label: 'Open source', sub: 'Every line of code is on GitHub.' },
        { icon: '🎁', label: 'Free forever', sub: 'No accounts, no upsells, nothing to buy.' },
    ]

    return (
        <section
            aria-labelledby="safe-headline"
            style={{
                maxWidth: 1080,
                margin: '0 auto',
                padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
            }}
        >
            <SectionHeading id="safe-headline" eyebrow="Safe by design" title="No real money. No risk." />
            <ul
                style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    maxWidth: 880,
                    marginInline: 'auto',
                }}
            >
                {tiles.map((t) => (
                    <SafetyTile key={t.label} {...t} />
                ))}
            </ul>
            {anySimulated && (
                <p
                    style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginTop: 18,
                        textAlign: 'center',
                        maxWidth: 480,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        lineHeight: 1.5,
                    }}
                >
                    {!lnReal && !ecashReal
                        ? 'Lightning and eCash integrations are currently simulated.'
                        : !lnReal
                          ? 'Lightning is currently simulated.'
                          : 'eCash is currently simulated.'}
                </p>
            )}
        </section>
    )
}

function SafetyTile({ icon, label, sub }: { icon: string; label: string; sub: string }) {
    return (
        <li
            style={{
                ...card,
                padding: '22px 18px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 10,
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'var(--gradient-bitcoin)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 30,
                    color: '#0A0A0B',
                    boxShadow: 'var(--shadow-1)',
                }}
            >
                {icon}
            </div>
            <h3
                style={{
                    fontSize: 16,
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '-0.02em',
                }}
            >
                {label}
            </h3>
            <p
                style={{
                    fontSize: 13,
                    color: 'var(--text-soft)',
                    margin: 0,
                    lineHeight: 1.5,
                    maxWidth: 200,
                }}
            >
                {sub}
            </p>
        </li>
    )
}

// ─── Who it's for ────────────────────────────────────────────────────────────

function WhoItsFor() {
    // Trimmed to four items, learner-first. The old list ran to five and
    // started repeating itself ("students and communities" + "people who
    // tried videos" both said roughly the same thing). Tighter is better.
    const items = [
        'Anyone curious about Bitcoin',
        'People who tried videos and gave up',
        'Communities, study groups, and classrooms',
        'Workshop facilitators running sessions',
    ]
    return (
        <section
            aria-labelledby="who-headline"
            style={{
                background: 'var(--surface)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <div
                style={{
                    maxWidth: 760,
                    margin: '0 auto',
                    padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
                }}
            >
                <SectionHeading id="who-headline" eyebrow="Who it's for" title="Built for the curious." />
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '0 auto',
                        maxWidth: 480,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                    }}
                >
                    {items.map((line) => (
                        <li
                            key={line}
                            style={{
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                                fontSize: 15,
                                color: 'var(--text-soft)',
                                lineHeight: 1.5,
                            }}
                        >
                            <CheckDot />
                            <span>{line}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

// ─── Final CTA ──────────────────────────────────────────────────────────────

function FinalCTA({
    hasResumable,
    onStart,
    onContinue,
}: {
    hasResumable: boolean
    onStart: () => void
    onContinue: () => void
}) {
    return (
        <section
            aria-labelledby="final-cta-headline"
            style={{
                maxWidth: 760,
                margin: '0 auto',
                padding: 'clamp(2.5rem, 7vw, 4rem) clamp(1rem, 4vw, 1.5rem)',
                textAlign: 'center',
            }}
        >
            <h2
                id="final-cta-headline"
                style={{
                    fontSize: 'clamp(24px, 6vw, 36px)',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.15,
                    margin: '0 0 12px',
                }}
            >
                Ready to actually use Bitcoin?
            </h2>
            <p
                style={{
                    fontSize: 15,
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    maxWidth: 420,
                    margin: '0 auto 22px',
                }}
            >
                About 45 minutes. You'll come out the other side actually using it.
            </p>
            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                }}
            >
                <button
                    className="bp-press"
                    style={{
                        ...primaryButton(),
                        padding: '14px 24px',
                        fontSize: 15,
                        minHeight: 48,
                    }}
                    onClick={hasResumable ? onContinue : onStart}
                >
                    {hasResumable ? '↻ Continue your missions' : '⚡ Start Learning Bitcoin'}
                </button>
            </div>
        </section>
    )
}

// ─── Small shared bits ───────────────────────────────────────────────────────

function SectionHeading({
    id,
    eyebrow,
    title,
}: {
    id: string
    eyebrow: string
    title: string
}) {
    return (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--bitcoin)',
                    marginBottom: 8,
                }}
            >
                {eyebrow}
            </div>
            <h2
                id={id}
                style={{
                    fontSize: 'clamp(22px, 5vw, 32px)',
                    fontWeight: 800,
                    letterSpacing: '-0.025em',
                    lineHeight: 1.2,
                    margin: 0,
                }}
            >
                {title}
            </h2>
        </div>
    )
}

function CheckDot() {
    return (
        <span
            aria-hidden="true"
            style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--success)',
                color: '#0A0A0B',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 800,
                flexShrink: 0,
            }}
        >
            ✓
        </span>
    )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

/**
 * Slim two-column footer: brand on the left, project links on the right.
 *
 * The runtime-honesty checklist that used to live here moved up into the
 * `SafeByDesign` section, so the footer can go back to being a footer —
 * an exit, not a feature. We deliberately do NOT brag about the tech
 * stack ("built with Rust, sqlx, ..."); visitors don't care, and it
 * pulled the eye away from the actual sign-off line.
 */
function SiteFooter() {
    return (
        <footer
            style={{
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--muted)',
                fontSize: 13,
                lineHeight: 1.55,
            }}
        >
            <div
                style={{
                    maxWidth: 1080,
                    margin: '0 auto',
                    padding: 'clamp(1.75rem, 5vw, 2.5rem) clamp(1rem, 4vw, 1.5rem)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 'clamp(1.25rem, 3vw, 2rem)',
                    alignItems: 'start',
                }}
            >
                {/* Column 1, brand + one-liner */}
                <div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 10,
                        }}
                    >
                        <BrandMark size={26} />
                        <span
                            style={{
                                color: 'var(--text)',
                                fontSize: 15,
                                fontWeight: 800,
                                letterSpacing: '-0.025em',
                            }}
                        >
                            BitPilot
                        </span>
                    </div>
                    <p style={{ margin: 0 }}>
                        Learn Bitcoin by actually using it. Built to be finished in an
                        afternoon and remembered for years.
                    </p>
                </div>

                {/* Column 2, links */}
                <div>
                    <h3
                        style={{
                            color: 'var(--text)',
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            margin: '0 0 10px',
                        }}
                    >
                        Project
                    </h3>
                    <ul
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <li>
                            <a
                                href="https://github.com/Jolah1/bitpilot"
                                target="_blank"
                                rel="noreferrer"
                                style={footerLinkStyle}
                            >
                                GitHub repository
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://github.com/Jolah1/bitpilot/issues"
                                target="_blank"
                                rel="noreferrer"
                                style={footerLinkStyle}
                            >
                                Report an issue
                            </a>
                        </li>
                        <li>
                            <a href="https://bitcoin.org" target="_blank" rel="noreferrer" style={footerLinkStyle}>
                                What is Bitcoin?
                            </a>
                        </li>
                        <li>
                            <a href="https://nostr.com" target="_blank" rel="noreferrer" style={footerLinkStyle}>
                                What is Nostr?
                            </a>
                        </li>
                    </ul>
                </div>
            </div>

            <div
                style={{
                    borderTop: '1px solid var(--border)',
                    padding: '14px clamp(1rem, 4vw, 1.5rem)',
                    fontSize: 12,
                    color: 'var(--muted)',
                    textAlign: 'center',
                }}
            >
                Open source · MIT licensed · Built for Bitcoin education ·{' '}
                © {new Date().getFullYear()} BitPilot
            </div>
        </footer>
    )
}

const footerLinkStyle: CSSProperties = {
    color: 'var(--bitcoin)',
    textDecoration: 'none',
    fontWeight: 600,
}

function TopNav({
    theme,
    onToggleTheme,
    onCta,
}: {
    theme: Theme
    onToggleTheme: () => void
    onCta: () => void
}) {
    return (
        <nav
            aria-label="Primary"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px clamp(1rem, 4vw, 1.5rem)',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'var(--bg-elevated)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                zIndex: 50,
                gap: 8,
            }}
        >
            <a
                href="#main-content"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textDecoration: 'none',
                    color: 'var(--text)',
                    minWidth: 0,
                }}
            >
                <BrandMark size={28} />
                <span
                    style={{
                        fontSize: 17,
                        fontWeight: 800,
                        letterSpacing: '-0.025em',
                    }}
                >
                    BitPilot
                </span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                <button
                    className="bp-press"
                    style={{
                        ...primaryButton(),
                        padding: '10px 16px',
                        fontSize: 14,
                        minHeight: 40,
                    }}
                    onClick={onCta}
                >
                    Start
                </button>
            </div>
        </nav>
    )
}
