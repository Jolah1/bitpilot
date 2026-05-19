const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Request failed')
    }
    return res.json() as Promise<T>
}

import type { Participant, Session } from './types'

export interface SessionResponse {
    session: Session
    participant_count: number
    total_sats_distributed: number
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

export const api = {
    createSession: (name: string) =>
        request<Session>('/sessions', { method: 'POST', body: JSON.stringify({ name }) }),

    getSession: (id: string) =>
        request<SessionResponse>(`/sessions/${id}`),

    listParticipants: (sessionId: string) =>
        request<Participant[]>(`/sessions/${sessionId}/participants`),

    joinSession: (name: string, sessionId: string) =>
        request<Participant>('/participants', { method: 'POST', body: JSON.stringify({ name, session_id: sessionId }) }),

    getParticipant: (id: string) =>
        request<Participant>(`/participants/${id}`),

    completeMission: (participantId: string, mission: number, proof?: string) =>
        request<CompleteMissionResponse>(`/missions/${participantId}/complete`, { method: 'POST', body: JSON.stringify({ mission, proof }) }),

    createInvoice: (participantId: string, amountSats: number, description: string) =>
        request<InvoiceResponse>('/invoice', { method: 'POST', body: JSON.stringify({ participant_id: participantId, amount_sats: amountSats, description }) }),

    payInvoice: (participantId: string, invoice: string) =>
        request<PaymentResponse>('/pay', { method: 'POST', body: JSON.stringify({ participant_id: participantId, invoice }) }),

    createNostrIdentity: (participantId: string) =>
        request<NostrIdentityResponse>('/nostr/identity', { method: 'POST', body: JSON.stringify({ participant_id: participantId }) }),

    publishNostrNote: (participantId: string, content: string, nsec: string) =>
        request<NostrPublishResponse>('/nostr/publish', { method: 'POST', body: JSON.stringify({ participant_id: participantId, content, nsec }) }),
}

export async function fetchParticipant(id: string): Promise<Participant> {
    return api.getParticipant(id)
}

export async function fetchSessionProgress(sessionId: string): Promise<{ session: Session; participants: Participant[] }> {
    const [sessionData, participants] = await Promise.all([
        api.getSession(sessionId),
        api.listParticipants(sessionId),
    ])
    return { session: sessionData.session, participants }
}
