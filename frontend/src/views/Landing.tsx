import { useRef, type CSSProperties } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import type { Theme } from '../lib/theme'
import { useRuntime } from '../lib/runtime'
import { MISSION_COUNT, TIERS } from '../lib/types'
import { card, chip, ghostButton, primaryButton } from '../lib/ui'

// ─── Landing ─────────────────────────────────────────────────────────────────
//
// Landing is intentionally outcome-driven, not curriculum-driven. The job of
// each section, top to bottom:
//
//   1. Hero            — promise the transformation in two sentences.
//   2. How It Works    — show the 4-step loop so the offer feels concrete.
//   3. Your Journey    — five tiers in plain language (no NIP-05, no jargon).
//   4. Why this works  — emotional section: name the failure mode of video-
//                        based learning and contrast it.
//   5. Safe by design  — checklist that defuses the "is this real money?"
//                        fear before the user has to ask.
//   6. Who it's for    — let the visitor self-identify.
//   7. Footer CTA      — one last invitation, then the slim footer.
//
// Copy guideline: never name a protocol the visitor hasn't met yet.
// "NIP-05", "secp256k1", "BIP39" all belong inside missions, not on the door.
//
// This whole module is lazy-loaded from App.tsx — a returning user resuming
// via deep link or a PWA launch never pays for the ~1100 lines of marketing
// JSX below. Keep the section components co-located here so the chunk stays
// self-contained; if you split them across files, Vite will still bundle
// them together but the import graph gets harder to reason about.
export default function Landing({
    theme,
    onToggleTheme,
    onStart,
    onFacilitator,
    hasResumable,
    onContinue,
}: {
    theme: Theme
    onToggleTheme: () => void
    onStart: () => void
    onFacilitator: () => void
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
}: {
    hasResumable: boolean
    onStart: () => void
    onContinue: () => void
    onFacilitator: () => void
}) {
    return (
        <section
            aria-labelledby="hero-headline"
            style={{
                maxWidth: 760,
                margin: '0 auto',
                padding: 'clamp(2rem, 8vw, 4rem) clamp(1rem, 4vw, 1.5rem) clamp(2rem, 6vw, 3rem)',
                textAlign: 'center',
            }}
        >
            <span style={{ ...chip('orange'), marginBottom: 20 }}>
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
                Free · no signup · no real money
            </span>

            <h1
                id="hero-headline"
                style={{
                    fontSize: 'clamp(34px, 8.5vw, 64px)',
                    fontWeight: 800,
                    lineHeight: 1.05,
                    letterSpacing: '-0.035em',
                    marginBottom: 18,
                }}
            >
                Learn Bitcoin
                <br />
                by <span className="gradient-text">actually using it.</span>
            </h1>

            {/* Two short sentences. First names the failure mode; second
                states the cure. Anything longer here turns the hero into
                a paragraph — exactly the documentation-shaped page we're
                trying to escape. */}
            <p
                style={{
                    fontSize: 'clamp(16px, 3.6vw, 19px)',
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    maxWidth: 540,
                    margin: '0 auto 28px',
                }}
            >
                Most people watch videos about Bitcoin and stay confused.
                BitPilot teaches you by making you{' '}
                <strong style={{ color: 'var(--text)' }}>actually do it</strong>{' '}
                — and earn sats as you learn.
            </p>

            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
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
            </div>

            <p
                style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    marginTop: 18,
                    marginBottom: 0,
                }}
            >
                {MISSION_COUNT} missions · about 45 minutes · works on your phone
            </p>
        </section>
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
            body: 'Claim sats, unlock the next tier, take on harder challenges.',
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
 * One-word outcome per tier. The old copy was a sentence; on a marketing
 * page this is too dense, especially repeated 5 times in a row. We swap
 * each long sentence for an icon + a single outcome phrase, and rely on
 * the slider to invite exploration instead of dumping it all at once.
 *
 * Order matches `TIERS` in `types.ts`. If a tier is renamed there, the
 * lookup quietly falls through to `t.tagline`.
 */
interface TierPitch {
    icon: string
    outcome: string
}
const TIER_PITCH: Record<string, TierPitch> = {
    novice: { icon: '🌱', outcome: 'Bitcoin basics, from zero.' },
    apprentice: { icon: '🔑', outcome: 'Wallets, keys, and transactions.' },
    pilot: { icon: '⚡', outcome: 'Lightning and Nostr in real scenarios.' },
    navigator: { icon: '🧭', outcome: 'eCash, zaps and the wider ecosystem.' },
    captain: { icon: '🚀', outcome: 'Self-custody and sovereignty.' },
}

/**
 * Horizontally scroll-snapped slider. CSS scroll-snap + overflow-x: auto
 * gives us touch swiping on mobile and mouse-wheel/drag on desktop with
 * no JS library. The arrow buttons on desktop are pure ergonomics — the
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
                title="From beginner to Bitcoin captain."
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
                    }}
                >
                    {TIERS.map((t, i) => (
                        <TierSlide
                            key={t.key}
                            tier={t}
                            pitch={TIER_PITCH[t.key]}
                            index={i + 1}
                            total={TIERS.length}
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
                {MISSION_COUNT} missions · Earn sats as you progress
            </p>
        </section>
    )
}

function TierSlide({
    tier: t,
    pitch,
    index,
    total,
}: {
    tier: (typeof TIERS)[number]
    pitch: TierPitch | undefined
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
            aria-label={`Tier ${index} of ${total}: ${t.label}`}
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
                Tier {index} / {total}
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
            <button type="button" onClick={onLeft} style={btn} aria-label="Scroll tiers left">
                ←
            </button>
            <button type="button" onClick={onRight} style={btn} aria-label="Scroll tiers right">
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
                {/* One line. The contrast does the work — anything longer
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
        { icon: '🛡️', label: 'No real money', sub: 'Testnet only — mainnet is never touched.' },
        { icon: '🔒', label: 'Your keys, your browser', sub: 'Keys are generated locally and stay with you.' },
        { icon: '🌍', label: 'Open source', sub: 'Every line of code is on GitHub.' },
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
                {/* Column 1 — brand + one-liner */}
                <div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 10,
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                width: 26,
                                height: 26,
                                borderRadius: 'var(--radius-1)',
                                background: 'var(--gradient-bitcoin)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                color: '#0A0A0B',
                                fontWeight: 800,
                            }}
                        >
                            ⚡
                        </span>
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

                {/* Column 2 — links */}
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
                <span
                    aria-hidden="true"
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-1)',
                        background: 'var(--gradient-bitcoin)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        color: '#0A0A0B',
                        fontWeight: 800,
                        flexShrink: 0,
                    }}
                >
                    ⚡
                </span>
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
                    Start →
                </button>
            </div>
        </nav>
    )
}
