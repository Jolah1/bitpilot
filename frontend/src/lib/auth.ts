// localStorage wrappers for the credentials and IDs the app needs to
// rehydrate after a page refresh. Originally sessionStorage so closing a
// tab wiped credentials (kiosk threat model), but that made the common case
// — a single learner on their own laptop accidentally refreshing — awful.
//
// localStorage persists. To wipe credentials deliberately (e.g. share the
// laptop with someone else), call `clearAllTokens()` from a "Start fresh"
// button in the UI.

const AUTH_KEY = 'bitpilot.auth_token'
const FAC_KEY = 'bitpilot.facilitator_token'
const SESSION_KEY = 'bitpilot.session_id'
const PARTICIPANT_KEY = 'bitpilot.participant_id'

function safeGet(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string): void {
    try { localStorage.setItem(key, value) } catch { /* quota / private mode */ }
}
function safeRemove(key: string): void {
    try { localStorage.removeItem(key) } catch { /* private mode */ }
}

export function getAuthToken(): string | null            { return safeGet(AUTH_KEY) }
export function setAuthToken(t: string): void            { safeSet(AUTH_KEY, t) }
export function clearAuthToken(): void                   { safeRemove(AUTH_KEY) }

export function getFacilitatorToken(): string | null     { return safeGet(FAC_KEY) }
export function setFacilitatorToken(t: string): void     { safeSet(FAC_KEY, t) }
export function clearFacilitatorToken(): void            { safeRemove(FAC_KEY) }

export function getSessionId(): string | null            { return safeGet(SESSION_KEY) }
export function setSessionId(id: string): void           { safeSet(SESSION_KEY, id) }
export function clearSessionId(): void                   { safeRemove(SESSION_KEY) }

export function getParticipantId(): string | null        { return safeGet(PARTICIPANT_KEY) }
export function setParticipantId(id: string): void       { safeSet(PARTICIPANT_KEY, id) }
export function clearParticipantId(): void               { safeRemove(PARTICIPANT_KEY) }

/** Wipe every stored credential and ID. Use for "Start fresh" / "Log out". */
export function clearAllTokens(): void {
    clearAuthToken()
    clearFacilitatorToken()
    clearSessionId()
    clearParticipantId()
}
