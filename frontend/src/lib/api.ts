import { getAuthToken, getFacilitatorToken } from './auth'
import type { Participant, Session } from './types'

const BASE = '/api'

interface RequestOpts extends Omit<RequestInit, 'body'> {
    body?: unknown
    /** Which credential to attach to the request, if any. */
    auth?: 'participant' | 'facilitator' | 'none'
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(opts.headers as Record<string, string> | undefined),
    }

    const auth = opts.auth ?? 'none'
    if (auth === 'participant') {
        const t = getAuthToken()
        if (t) headers['Authorization'] = `Bearer ${t}`
    } else if (auth === 'facilitator') {
        const t = getFacilitatorToken()
        if (t) headers['X-Facilitator-Key'] = t
    }

    const res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Request failed')
    }
    return res.json() as Promise<T>
}

// ── Response shapes ──────────────────────────────────────────────────────

export interface CreateSessionResponse {
    session: Session
    facilitator_token: string
}

export interface SessionResponse {
    session: Session
    participant_count: number
    total_sats_distributed: number
}

export interface JoinSessionResponse {
    participant: Participant
    auth_token: string
}

export interface InvoiceResponse {
    invoice: string
    participant_id: string
    amount_sats: number
}

export interface PaymentResponse {
    payment_hash: string
    participant_id: string
    status: string
}

export interface NostrIdentityResponse {
    npub: string
    nsec: string
    participant_id: string
    warning: string
}

export interface NostrPublishResponse {
    event_id: string
    participant_id: string
    status: string
}

export interface CompleteMissionResponse {
    participant: Participant
    sats_earned: number
    next_mission: number | null
}

export interface RuntimeInfo {
    lightning_real: boolean
    ecash_real: boolean
    nostr_real: boolean
}

// ── API surface ──────────────────────────────────────────────────────────

export const api = {
    runtime: () =>
        request<RuntimeInfo>('/runtime'),

    createSession: (name: string) =>
        request<CreateSessionResponse>('/sessions', { method: 'POST', body: { name } }),

    getSession: (id: string) =>
        request<SessionResponse>(`/sessions/${id}`, { auth: 'facilitator' }),

    listParticipants: (sessionId: string) =>
        request<Participant[]>(`/sessions/${sessionId}/participants`, { auth: 'facilitator' }),

    joinSession: (name: string, sessionId: string) =>
        request<JoinSessionResponse>('/participants', {
            method: 'POST',
            body: { name, session_id: sessionId },
        }),

    getSelf: () =>
        request<Participant>('/participants/me', { auth: 'participant' }),

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

    createNostrIdentity: () =>
        request<NostrIdentityResponse>('/nostr/identity', {
            method: 'POST',
            body: {},
            auth: 'participant',
        }),

    publishNostrNote: (content: string, nsec: string) =>
        request<NostrPublishResponse>('/nostr/publish', {
            method: 'POST',
            body: { content, nsec },
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
