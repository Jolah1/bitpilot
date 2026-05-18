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
    return res.json()
}

export const api = {
    createSession: (name: string) =>
        request('/sessions', { method: 'POST', body: JSON.stringify({ name }) }),

    getSession: (id: string) =>
        request(`/participants/sessions/${id}`),

    listParticipants: (sessionId: string) =>
        request(`/participants/sessions/${sessionId}/participants`),

    joinSession: (name: string, sessionId: string) =>
        request('/participants', { method: 'POST', body: JSON.stringify({ name, session_id: sessionId }) }),

    getParticipant: (id: string) =>
        request(`/participants/${id}`),

    completeMission: (participantId: string, mission: number, proof?: string) =>
        request(`/missions/${participantId}/complete`, { method: 'POST', body: JSON.stringify({ mission, proof }) }),

    createInvoice: (participantId: string, amountSats: number, description: string) =>
        request('/invoice', { method: 'POST', body: JSON.stringify({ participant_id: participantId, amount_sats: amountSats, description }) }),

    payInvoice: (participantId: string, invoice: string) =>
        request('/pay', { method: 'POST', body: JSON.stringify({ participant_id: participantId, invoice }) }),

    createNostrIdentity: (participantId: string) =>
        request('/nostr/identity', { method: 'POST', body: JSON.stringify({ participant_id: participantId }) }),

    publishNostrNote: (participantId: string, content: string, nsec: string) =>
        request('/nostr/publish', { method: 'POST', body: JSON.stringify({ participant_id: participantId, content, nsec }) }),
}
export async function fetchParticipant(id: string) {
    return api.getParticipant(id)
}

export async function fetchSessionProgress(sessionId: string) {
    const participants = await api.listParticipants(sessionId)
    return { participants }
}

export async function completePhase({ participantId, missionId, phase }: { participantId: string, missionId: number, phase: string }) {
    return api.completeMission(participantId, missionId, phase)
}
