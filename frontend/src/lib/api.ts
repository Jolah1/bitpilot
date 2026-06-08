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
 * The UI layer never touches these directly — it calls the api methods as
 * if the backend were unauthenticated, and this module handles the rest.
 * If you ever need to force-clear them (e.g. user logs out / starts over),
 * call `clearAllTokens()` from `./auth`.
 *
 * Identity material (nsec, BIP39 mnemonic) is *not* in this module — it
 * never crosses the wire except where a specific mission requires sending
 * the nsec for one-shot signing. See ./crypto.ts for client-side
 * generation and ./auth.ts for storage.
 */

import { getAuthToken, getFacilitatorToken, setAuthToken, setFacilitatorToken } from './auth'
import type { Badge, Participant, Session } from './types'

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

export interface SessionResponse {
    session: Session
    participant_count: number
    total_sats_distributed: number
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

export interface ClaimTierRewardResponse {
    tier: string
    amount_sats: number
    payment_hash: string
    simulated: boolean
    paid_at: number
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
    sats_earned: number
    next_mission: number | null
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

// ── API surface ──────────────────────────────────────────────────────────

export const api = {
    runtime: () => request<RuntimeInfo>('/runtime'),

    createSession: async (name: string): Promise<Session> => {
        const wire = await request<CreateSessionWire>('/sessions', {
            method: 'POST',
            body: { name },
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

    joinSession: async (name: string, sessionId: string): Promise<Participant> => {
        const wire = await request<JoinSessionWire>('/participants', {
            method: 'POST',
            body: { name, session_id: sessionId },
        })
        setAuthToken(wire.auth_token)
        return wire.participant
    },

    /** Authenticated self-fetch. */
    getParticipant: () =>
        request<Participant>('/participants/me', { auth: 'participant' }),

    /** Tier badges, derived server-side from the completion ledger. */
    getMyBadges: () =>
        request<Badge[]>('/participants/me/badges', { auth: 'participant' }),

    /** Claim the one-shot tier-completion bonus by paying an invoice the
     *  learner generated in their own wallet. Server enforces tier-earned,
     *  not-already-claimed, and (when payouts are real) exact amount. */
    claimTierReward: (tier: string, invoice: string) =>
        request<ClaimTierRewardResponse>(
            `/participants/me/tier-rewards/${encodeURIComponent(tier)}/claim`,
            { method: 'POST', body: { invoice }, auth: 'participant' },
        ),

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

    publishNostrNote: (content: string, nsec: string) =>
        request<NostrPublishResponse>('/nostr/publish', {
            method: 'POST',
            body: { content, nsec },
            auth: 'participant',
        }),

    publishNostrProfile: (name: string, about: string | null, nsec: string) =>
        request<NostrPublishResponse>('/nostr/profile', {
            method: 'POST',
            body: { name, about, nsec },
            auth: 'participant',
        }),

    publishNostrFollow: (followedNpub: string, nsec: string) =>
        request<NostrPublishResponse>('/nostr/follow', {
            method: 'POST',
            body: { followed_npub: followedNpub, nsec },
            auth: 'participant',
        }),

    /** Currently simulated — produces a synthetic zap receipt event id. */
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
): Promise<{ session: Session; participants: Participant[] }> {
    const [sessionData, participants] = await Promise.all([
        api.getSession(sessionId),
        api.listParticipants(sessionId),
    ])
    return { session: sessionData.session, participants }
}
