import type { Tree } from './types'

/**
 * Outcome-first routes through the existing mission library.
 *
 * Every journey is currently an ordered prefix of one backend skill tree.
 * That matters because the API deliberately requires missions inside a tree
 * to be completed in order. Journeys can share a tree; the learner's saved
 * progress is the source of truth, so switching journeys never loses work.
 */
export type JourneyId =
    | 'receive-payment'
    | 'send-remittance'
    | 'secure-savings'
    | 'publish-independently'
    | 'contribute-code'

export interface Capability {
    mission: number
    label: string
}

export interface Journey {
    id: JourneyId
    icon: string
    title: string
    audience: string
    promise: string
    tree: Tree
    missions: number[]
    minutes: number
    outcome: string
    capabilities: Capability[]
}

export interface JourneyPreferences {
    guidance: 'guided' | 'self-directed'
    sessionMinutes: number
    practiceMode: 'simulation' | 'test-network'
}

export const JOURNEYS: Journey[] = [
    {
        id: 'receive-payment',
        icon: '🧾',
        title: 'Receive a Bitcoin payment',
        audience: 'For freelancers and small businesses',
        promise: 'Create a Lightning invoice and understand what the payer needs.',
        tree: 'lightning',
        missions: [21, 22, 80, 23],
        minutes: 25,
        outcome: 'I can create and explain a Lightning invoice.',
        capabilities: [
            { mission: 22, label: 'Understands how a Lightning payment can move' },
            { mission: 23, label: 'Can create a Lightning invoice' },
        ],
    },
    {
        id: 'send-remittance',
        icon: '🌍',
        title: 'Send money to someone',
        audience: 'For diaspora workers and families',
        promise: 'Practise receiving, then send a Lightning payment safely.',
        tree: 'lightning',
        missions: [10, 21, 22, 80, 23, 24],
        minutes: 30,
        outcome: 'I can send and receive a Lightning payment.',
        capabilities: [
            { mission: 23, label: 'Can create a Lightning invoice' },
            { mission: 24, label: 'Can send a Lightning payment' },
        ],
    },
    {
        id: 'secure-savings',
        icon: '🔐',
        title: 'Secure my Bitcoin savings',
        audience: 'For anyone preparing to hold bitcoin',
        promise: 'Create a practice backup and learn how to avoid permanent loss.',
        tree: 'self-custody',
        missions: [3, 4, 11, 12, 93, 20],
        minutes: 40,
        outcome: 'I can back up a wallet and explain the main ways funds are lost.',
        capabilities: [
            { mission: 11, label: 'Can create and protect a seed phrase' },
            { mission: 20, label: 'Can recognise common ways people lose bitcoin' },
        ],
    },
    {
        id: 'publish-independently',
        icon: '📣',
        title: 'Publish without a platform account',
        audience: 'For journalists, creators, and communities',
        promise: 'Create an independent identity and publish a signed message.',
        tree: 'nostr',
        missions: [13, 14, 15, 97, 16, 26],
        minutes: 35,
        outcome: 'I can protect a Nostr identity and publish a signed note.',
        capabilities: [
            { mission: 14, label: 'Can create and protect a Nostr identity' },
            { mission: 26, label: 'Can publish a signed note to public relays' },
        ],
    },
    {
        id: 'contribute-code',
        icon: '🛠️',
        title: 'Contribute to a Bitcoin project',
        audience: 'For developers and technical writers',
        promise: 'Find a useful change and take it through a real pull request.',
        tree: 'open-source',
        missions: [100, 101, 102, 103, 104, 105],
        minutes: 60,
        outcome: 'I can take a useful open-source change through review and merge.',
        capabilities: [
            { mission: 102, label: 'Can identify a useful documentation fix' },
            { mission: 105, label: 'Has shipped a merged open-source contribution' },
        ],
    },
]

const JOURNEY_KEY = 'bitpilot-journey'
const PREFERENCES_KEY = 'bitpilot-journey-preferences'
const DEFAULT_PREFERENCES: JourneyPreferences = {
    guidance: 'guided',
    sessionMinutes: 30,
    practiceMode: 'simulation',
}

export function journeyById(id: JourneyId | null): Journey | null {
    return JOURNEYS.find((journey) => journey.id === id) ?? null
}

export function getSavedJourneyId(): JourneyId | null {
    if (typeof localStorage === 'undefined') return null
    const value = localStorage.getItem(JOURNEY_KEY)
    return JOURNEYS.some((journey) => journey.id === value)
        ? (value as JourneyId)
        : null
}

export function getSavedJourney(): Journey | null {
    return journeyById(getSavedJourneyId())
}

export function saveJourney(id: JourneyId | null) {
    if (typeof localStorage === 'undefined') return
    if (id === null) localStorage.removeItem(JOURNEY_KEY)
    else localStorage.setItem(JOURNEY_KEY, id)
}

export function getJourneyPreferences(): JourneyPreferences {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES
    try {
        const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}')
        return {
            guidance: value.guidance === 'self-directed' ? 'self-directed' : 'guided',
            sessionMinutes: [15, 30, 60].includes(value.sessionMinutes)
                ? value.sessionMinutes
                : 30,
            practiceMode:
                value.practiceMode === 'test-network' ? 'test-network' : 'simulation',
        }
    } catch {
        return DEFAULT_PREFERENCES
    }
}

export function saveJourneyPreferences(preferences: JourneyPreferences) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
}

export function syncJourneyProfile(participant: {
    journey_id: JourneyId | null
    guidance: JourneyPreferences['guidance']
    session_minutes: number
    practice_mode: JourneyPreferences['practiceMode']
}) {
    saveJourney(participant.journey_id)
    saveJourneyPreferences({
        guidance: participant.guidance,
        sessionMinutes: participant.session_minutes,
        practiceMode: participant.practice_mode,
    })
}

export function journeyProgress(journey: Journey, completed: number[]) {
    const done = journey.missions.filter((mission) => completed.includes(mission)).length
    const nextMission =
        journey.missions.find((mission) => !completed.includes(mission)) ?? null
    return {
        done,
        total: journey.missions.length,
        complete: done === journey.missions.length,
        nextMission,
        percent: Math.round((done / journey.missions.length) * 100),
    }
}
