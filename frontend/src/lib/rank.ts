/**
 * Overall learner rank, derived from which flight paths are earned.
 *
 * Ranks climb by curriculum depth, mirroring the per-path badge titles
 * (MONEY PILOT etc.): clear every Beginner path to make Pilot, add the
 * Intermediate paths for Captain, clear all nine for Commander. Everyone
 * starts as Cadet. Pure derivation from the badges list — no server
 * state, so the rank can never drift from the completions that earn it.
 */
import { TREES, type Badge, type Difficulty } from './types'

export type RankKey = 'cadet' | 'pilot' | 'captain' | 'commander'

export interface RankInfo {
    key: RankKey
    /** Display name, e.g. "Captain". */
    title: string
    /** One-line meaning of the rank in plain words. */
    blurb: string
    /** How to climb. null at Commander, the top rank. */
    next: {
        title: string
        /** Flight path labels still to finish to reach `title`. */
        remaining: string[]
    } | null
}

/** Rank ladder in climbing order, for progress displays. */
export const RANK_LADDER: { key: RankKey; title: string }[] = [
    { key: 'cadet', title: 'Cadet' },
    { key: 'pilot', title: 'Pilot' },
    { key: 'captain', title: 'Captain' },
    { key: 'commander', title: 'Commander' },
]

function remainingOf(difficulty: Difficulty, earned: Set<string>): string[] {
    return TREES.filter((t) => t.difficulty === difficulty && !earned.has(t.key)).map(
        (t) => t.label,
    )
}

/** Join labels for prose: "Lightning, Nostr and eCash". */
export function listLabels(labels: string[]): string {
    if (labels.length <= 1) return labels[0] ?? ''
    return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

export function rankFor(badges: Badge[]): RankInfo {
    const earned = new Set(badges.filter((b) => b.earned).map((b) => b.tree))
    const beginnerLeft = remainingOf('Beginner', earned)
    const intermediateLeft = remainingOf('Intermediate', earned)
    const advancedLeft = remainingOf('Advanced', earned)

    if (beginnerLeft.length === 0 && intermediateLeft.length === 0 && advancedLeft.length === 0) {
        return {
            key: 'commander',
            title: 'Commander',
            blurb: 'Every flight path on BitPilot, cleared. The top rank.',
            next: null,
        }
    }
    if (beginnerLeft.length === 0 && intermediateLeft.length === 0) {
        return {
            key: 'captain',
            title: 'Captain',
            blurb: 'All beginner and intermediate flight paths cleared.',
            next: { title: 'Commander', remaining: advancedLeft },
        }
    }
    if (beginnerLeft.length === 0) {
        return {
            key: 'pilot',
            title: 'Pilot',
            blurb: 'All beginner flight paths cleared.',
            next: { title: 'Captain', remaining: intermediateLeft },
        }
    }
    return {
        key: 'cadet',
        title: 'Cadet',
        blurb: 'Everyone starts here.',
        next: { title: 'Pilot', remaining: beginnerLeft },
    }
}
