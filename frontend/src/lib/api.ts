/**
 * BitPilot API client.
 *
 * Two security tokens are issued by the backend and managed transparently
 * by this module via localStorage:
 *
 * - Participant auth token: returned once from `joinSession()`, sent as
 *   `Authorization: Bearer <token>` on every authenticated endpoint.
 * - Facilitator token: returned once from `createSession()`, sent as
 *   `X-Facilitator-Key` on the admin endpoints.
 *
 * The UI layer never touches these directly, it calls the api methods as
 * if the backend were unauthenticated, and this module handles the rest.
 * If you ever need to force-clear them (e.g. user logs out / starts over),
 * call `clearAllTokens()` from `./auth`.
 *
 * Identity material (nsec, BIP39 mnemonic) is *not* in this module, it
 * never crosses the wire except where a specific mission requires sending
 * the nsec for one-shot signing. See ./crypto.ts for client-side
 * generation and ./auth.ts for storage.
 */

import {
    getAuthToken,
    getFacilitatorToken,
    setAuthToken,
    setFacilitatorToken,
    setParticipantId,
    setSessionId,
} from './auth'
import type { Badge, Participant, Session } from './types'
import {
    getJourneyPreferences,
    getSavedJourneyId,
    type JourneyId,
    type JourneyPreferences,
} from './journeys'

const BASE = '/api'

export class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.name = 'ApiError'
        this.status = status
    }
}

type AuthMode = 'participant' | 'facilitator' | 'none'

interface RequestOpts extends Omit<RequestInit, 'body' | 'headers'> {
    body?: unknown
    auth?: AuthMode
    headers?: Record<string, string>
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
    }

    const auth: AuthMode = opts.auth ?? 'none'
    if (auth === 'participant') {
        const t = getAuthToken()
        if (t) headers['Authorization'] = `Bearer ${t}`
    } else if (auth === 'facilitator') {
        const t = getFacilitatorToken()
        if (t) headers['X-Facilitator-Key'] = t
    }

    let res: Response
    try {
        res = await fetch(`${BASE}${path}`, {
            ...opts,
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        })
    } catch {
        throw new ApiError(
            "Can't reach the BitPilot backend. Is `cargo run` running in another terminal?",
            0,
        )
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new ApiError(err.error ?? 'Request failed', res.status)
    }
    return res.json() as Promise<T>
}

// ── Response shapes ──────────────────────────────────────────────────────

/** Backend response from POST /api/sessions. UI sees only the Session. */
interface CreateSessionWire {
    session: Session
    facilitator_token: string
}

/** Backend response from POST /api/participants. UI sees only the Participant. */
interface JoinSessionWire {
    participant: Participant
    auth_token: string
}

/** POST /api/participants/me/pairing-code. */
export interface PairingCode {
    code: string
    /** Unix seconds when the code stops working. */
    expires_at: number
}

/** POST /api/participants/pair. */
interface RedeemPairingWire {
    participant: Participant
    session_id: string
    auth_token: string
}

export interface SessionResponse {
    session: Session
    participant_count: number
    journey_id: JourneyId | null
    guidance: JourneyPreferences['guidance'] | null
    session_minutes: number | null
    practice_mode: JourneyPreferences['practiceMode'] | null
}

export interface SessionAnalytics {
    participants: number
    outcome_ready: number
    used_outside: number
    not_yet_used_outside: number
    average_seconds_to_first_action: number | null
}

export interface InvoiceResponse {
    invoice: string
    participant_id: string
    amount_sats: number
    simulated: boolean
}

export interface PaymentResponse {
    payment_hash: string
    participant_id: string
    status: string
    simulated: boolean
}

/**
 * Returned by `registerNostrIdentity`. The backend only stores the npub —
 * the nsec stays in the browser. `simulated: false` because the keypair is
 * real secp256k1 generated client-side.
 */
export interface NostrRegisterResponse {
    npub: string
    participant_id: string
    simulated: boolean
}

export interface NostrPublishResponse {
    event_id: string
    participant_id: string
    status: string
    relays: string[]
    simulated: boolean
}

export interface NostrZapResponse {
    event_id: string
    participant_id: string
    amount_sats: number
    status: string
    simulated: boolean
}

export interface EcashMintResponse {
    token: string
    participant_id: string
    amount_sats: number
    simulated: boolean
}

export interface EcashRedeemResponse {
    participant_id: string
    amount_sats: number
    status: string
    simulated: boolean
}

export interface CompleteMissionResponse {
    participant: Participant
    next_mission: number | null
}

/** One row of the proof archive: what was submitted, and when. */
export interface CompletionRecord {
    mission: number
    proof: string
    /** Unix seconds. */
    completed_at: number
}

export interface RuntimeInfo {
    /** True when Lightning is talking to a real LN node (LNbits). */
    lightning_real: boolean
    /** True when eCash is talking to a real Cashu mint. */
    ecash_real: boolean
    /** Mint URL the eCash service is pointed at. */
    ecash_mint_url: string
    /** Public relays the Nostr service publishes to. */
    nostr_relays: string[]
}

// ── Weekly community challenges ──────────────────────────────────────────

export interface ChallengeInfo {
    id: string
    session_id: string
    title: string
    blurb: string
    missions: number[]
    starts_at: number
    ends_at: number
    status: 'upcoming' | 'live' | 'ended'
    participant_count: number
}

export interface ChallengeResultRow {
    name: string
    cleared: number
    last_clear: number | null
}

export interface ChallengeResults {
    challenge: ChallengeInfo
    results: ChallengeResultRow[]
}

export interface CreateChallengeRequest {
    title: string
    blurb?: string
    missions: number[]
    /** Unix seconds. */
    starts_at: number
    /** Unix seconds, must be after starts_at and in the future. */
    ends_at: number
}

/**
 * POST /api/challenges. The facilitator token belongs to the challenge's
 * backing session and is returned exactly once; the UI must show it to the
 * creator immediately because there is no way to fetch it again.
 */
export interface CreateChallengeResult {
    challenge: ChallengeInfo
    facilitator_token: string
}

// ── Verifiable badge certificates ────────────────────────────────────────

/**
 * A permanent public record that a named learner earned one flight-path
 * badge. `event` is a Nostr kind-8 (badge award) event signed by the
 * server's key; anyone can check its BIP340 signature offline with
 * standard Nostr tooling. `signature_valid` is the server re-checking the
 * stored event on every read.
 */
export interface BadgeCertificate {
    id: string
    tree: string
    tree_label: string
    /** Prose award for sentences, e.g. "Money Basics Wings". */
    rank: string
    participant_name: string
    missions_completed: number
    earned_at: number
    issued_at: number
    event: Record<string, unknown>
    server_pubkey: string
    server_npub: string
    signature_valid: boolean
}

// ── API surface ──────────────────────────────────────────────────────────

export const api = {
    runtime: () => request<RuntimeInfo>('/runtime'),

    /** Public list of community challenges, newest window first. */
    listChallenges: () => request<ChallengeInfo[]>('/challenges'),

    /** Public read-only leaderboard for one challenge. No auth. */
    getChallengeResults: (id: string) =>
        request<ChallengeResults>(`/challenges/${id}/results`),

    /** Open like session creation; rate limiting is the abuse control. */
    createChallenge: (body: CreateChallengeRequest) =>
        request<CreateChallengeResult>('/challenges', { method: 'POST', body }),

    /**
     * Issue (or fetch the already-issued) certificate for one earned badge.
     * Idempotent: one certificate per learner per flight path.
     */
    issueBadgeCertificate: (tree: string) =>
        request<BadgeCertificate>(`/participants/me/badges/${tree}/certificate`, {
            method: 'POST',
            auth: 'participant',
        }),

    /** Public certificate lookup. No auth: the id is the capability. */
    getCertificate: (id: string) =>
        request<BadgeCertificate>(`/certificates/${id}`),

    createSession: async (name: string): Promise<Session> => {
        const preferences = getJourneyPreferences()
        const wire = await request<CreateSessionWire>('/sessions', {
            method: 'POST',
            body: {
                name,
                journey_id: getSavedJourneyId(),
                guidance: preferences.guidance,
                session_minutes: preferences.sessionMinutes,
                practice_mode: preferences.practiceMode,
            },
        })
        // Stash the facilitator token transparently. The UI gets back just
        // the Session, exactly as the UI session expected.
        setFacilitatorToken(wire.facilitator_token)
        return wire.session
    },

    getSession: (id: string) =>
        request<SessionResponse>(`/sessions/${id}`, { auth: 'facilitator' }),

    listParticipants: (sessionId: string) =>
        request<Participant[]>(`/sessions/${sessionId}/participants`, { auth: 'facilitator' }),

    getSessionAnalytics: (sessionId: string) =>
        request<SessionAnalytics>(`/sessions/${sessionId}/analytics`, {
            auth: 'facilitator',
        }),

    joinSession: async (name: string, sessionId: string): Promise<Participant> => {
        const preferences = getJourneyPreferences()
        const wire = await request<JoinSessionWire>('/participants', {
            method: 'POST',
            body: {
                name,
                session_id: sessionId,
                journey_id: getSavedJourneyId(),
                guidance: preferences.guidance,
                session_minutes: preferences.sessionMinutes,
                practice_mode: preferences.practiceMode,
            },
        })
        setAuthToken(wire.auth_token)
        return wire.participant
    },

    /** Authenticated self-fetch. */
    getParticipant: () =>
        request<Participant>('/participants/me', { auth: 'participant' }),

    updateJourneyProfile: (
        journeyId: JourneyId | null,
        preferences: JourneyPreferences,
    ) =>
        request<Participant>('/participants/me/profile', {
            method: 'PATCH',
            auth: 'participant',
            body: {
                journey_id: journeyId,
                guidance: preferences.guidance,
                session_minutes: preferences.sessionMinutes,
                practice_mode: preferences.practiceMode,
            },
        }),

    updateOutcomeFeedback: (usedOutside: boolean) =>
        request<Participant>('/participants/me/outcome-feedback', {
            method: 'PATCH',
            auth: 'participant',
            body: { used_outside: usedOutside },
        }),

    updateBlocker: (reason: Participant['blocker_reason'], comment = '') =>
        request<Participant>('/participants/me/blocker', {
            method: 'PATCH',
            auth: 'participant',
            body: { reason, comment },
        }),

    /**
     * Device A: mint a one-time code to continue on another device. Redeeming
     * it on the other device signs this one out (the server rotates the token).
     */
    createPairingCode: () =>
        request<PairingCode>('/participants/me/pairing-code', {
            method: 'POST',
            auth: 'participant',
        }),

    /**
     * Device B: redeem a pairing code, inheriting the other device's progress.
     * Persists the fresh credentials so the app boots straight into the
     * learner's session. Nostr keys are not transferred (they never leave the
     * origin device); a key-dependent mission will ask the learner to re-enter
     * their seed.
     */
    redeemPairingCode: async (code: string): Promise<Participant> => {
        const wire = await request<RedeemPairingWire>('/participants/pair', {
            method: 'POST',
            body: { code },
        })
        setAuthToken(wire.auth_token)
        setSessionId(wire.session_id)
        setParticipantId(wire.participant.id)
        return wire.participant
    },

    /** Skill-tree badges, derived server-side from the completion ledger. */
    getMyBadges: () =>
        request<Badge[]>('/participants/me/badges', { auth: 'participant' }),

    /**
     * Proof archive: what the learner submitted for each mission they've
     * finished. Lets a revisited mission show the artifact it produced
     * (an address, an npub, a txid) so they can copy it again later.
     */
    getMyCompletions: () =>
        request<CompletionRecord[]>('/participants/me/completions', {
            auth: 'participant',
        }),

    completeMission: (mission: number, proof: string) =>
        request<CompleteMissionResponse>('/missions/complete', {
            method: 'POST',
            body: { mission, proof },
            auth: 'participant',
        }),

    createInvoice: (amountSats: number, description: string) =>
        request<InvoiceResponse>('/invoice', {
            method: 'POST',
            body: { amount_sats: amountSats, description },
            auth: 'participant',
        }),

    payInvoice: (invoice: string) =>
        request<PaymentResponse>('/pay', {
            method: 'POST',
            body: { invoice },
            auth: 'participant',
        }),

    /**
     * Register the npub generated client-side. The backend stores it on
     * the participant row so future Nostr-event verifiers can know "this
     * identity belongs to this participant".
     */
    registerNostrIdentity: (npub: string) =>
        request<NostrRegisterResponse>('/nostr/register', {
            method: 'POST',
            body: { npub },
            auth: 'participant',
        }),

    /**
     * Broadcast an already-signed Nostr event. The event is built and
     * signed in the browser via the helpers in `./crypto.ts`; the backend
     * verifies the signature, checks the embedded pubkey against the
     * participant's registered npub, and forwards to the configured
     * relays. The nsec never leaves the browser.
     */
    broadcastNostrEvent: (event: unknown) =>
        request<NostrPublishResponse>('/nostr/broadcast', {
            method: 'POST',
            body: { event },
            auth: 'participant',
        }),

    /** Currently simulated, produces a synthetic zap receipt event id. */
    simulateNostrZap: () =>
        request<NostrZapResponse>('/nostr/zap', {
            method: 'POST',
            body: {},
            auth: 'participant',
        }),

    mintEcash: (amountSats: number) =>
        request<EcashMintResponse>('/ecash/mint', {
            method: 'POST',
            body: { amount_sats: amountSats },
            auth: 'participant',
        }),

    redeemEcash: (token: string) =>
        request<EcashRedeemResponse>('/ecash/redeem', {
            method: 'POST',
            body: { token },
            auth: 'participant',
        }),
}

export async function fetchSessionProgress(
    sessionId: string,
): Promise<{ session: Session; sessionProfile: SessionResponse; participants: Participant[]; analytics: SessionAnalytics }> {
    const [sessionData, participants, analytics] = await Promise.all([
        api.getSession(sessionId),
        api.listParticipants(sessionId),
        api.getSessionAnalytics(sessionId),
    ])
    return { session: sessionData.session, sessionProfile: sessionData, participants, analytics }
}
