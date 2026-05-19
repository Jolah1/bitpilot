// Tiny session-storage wrapper for the participant auth token + the
// facilitator token. We use sessionStorage (not localStorage) so closing the
// tab clears credentials — appropriate for a classroom kiosk-style app.
//
// Two keys:
//   bitpilot.auth_token     — bearer token for the joined participant
//   bitpilot.facilitator    — per-session facilitator token (set when the
//                             user creates a session, not when they join one)

const AUTH_KEY = 'bitpilot.auth_token'
const FAC_KEY = 'bitpilot.facilitator_token'

export function getAuthToken(): string | null {
    try { return sessionStorage.getItem(AUTH_KEY) } catch { return null }
}
export function setAuthToken(token: string): void {
    try { sessionStorage.setItem(AUTH_KEY, token) } catch { /* private mode */ }
}
export function clearAuthToken(): void {
    try { sessionStorage.removeItem(AUTH_KEY) } catch { /* private mode */ }
}

export function getFacilitatorToken(): string | null {
    try { return sessionStorage.getItem(FAC_KEY) } catch { return null }
}
export function setFacilitatorToken(token: string): void {
    try { sessionStorage.setItem(FAC_KEY, token) } catch { /* private mode */ }
}
export function clearFacilitatorToken(): void {
    try { sessionStorage.removeItem(FAC_KEY) } catch { /* private mode */ }
}
