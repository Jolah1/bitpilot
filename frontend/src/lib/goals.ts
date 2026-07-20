/**
 * Learner-goal presets: a recommended flight path order per goal, nothing more.
 *
 * A goal never locks anything. It sorts the flight path picker and marks the
 * next recommended flight path, replacing the per-card "finish X first" nudges
 * with a single clear pointer. Stored client-side only; the server has no
 * concept of goals (see issue #56 for the possible future column).
 */
import type { Tree } from './types'

export type Goal = 'curious' | 'builder' | 'privacy'

export const GOALS: Record<Goal, { label: string; blurb: string; order: Tree[] }> = {
    curious: {
        label: 'Bitcoin curious',
        blurb: 'Understand it, then hold it safely.',
        order: [
            'money',
            'bitcoin',
            'self-custody',
            'lightning',
            'privacy',
            'ecash',
            'nostr',
            'open-source',
            'sovereignty',
        ],
    },
    builder: {
        label: 'Builder',
        blurb: 'The whole stack, hands-on first.',
        order: [
            'bitcoin',
            'lightning',
            'nostr',
            'ecash',
            'self-custody',
            'open-source',
            'money',
            'privacy',
            'sovereignty',
        ],
    },
    privacy: {
        label: 'Privacy first',
        blurb: 'Keep your money your business.',
        order: [
            'money',
            'bitcoin',
            'privacy',
            'self-custody',
            'ecash',
            'lightning',
            'nostr',
            'open-source',
            'sovereignty',
        ],
    },
}

const GOAL_KEY = 'bitpilot-goal'

export function getSavedGoal(): Goal | null {
    if (typeof localStorage === 'undefined') return null
    const g = localStorage.getItem(GOAL_KEY)
    return g === 'curious' || g === 'builder' || g === 'privacy' ? g : null
}

export function saveGoal(goal: Goal | null) {
    if (typeof localStorage === 'undefined') return
    if (goal === null) localStorage.removeItem(GOAL_KEY)
    else localStorage.setItem(GOAL_KEY, goal)
}
