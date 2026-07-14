// localStorage wrappers for the credentials, identity material, and IDs the
// app needs to rehydrate after a page refresh. Originally sessionStorage so
// closing a tab wiped credentials (kiosk threat model), but that made the
// common case, a single learner on their own laptop accidentally refreshing
//, awful.
//
// localStorage persists. To wipe everything deliberately (e.g. share the
// laptop with someone else), call `clearAllTokens()` from a "Start fresh"
// button in the UI.
//
// SECURITY NOTE on nsec/seed storage:
// The Nostr nsec and BIP39 mnemonic are stored here too. This is the same
// threat model as the auth_token: anything in localStorage is readable by
// JavaScript running on this origin. We don't ship third-party scripts, but
// it is what it is. For a real Nostr/Bitcoin identity, the user would copy
// the nsec / seed phrase OUT of BitPilot into a password manager, both the
// curriculum and the UI explicitly tell them so. localStorage is just so
// progressing missions doesn't force them to re-enter the secret each time.

const AUTH_KEY = 'bitpilot.auth_token'
const FAC_KEY = 'bitpilot.facilitator_token'
const SESSION_KEY = 'bitpilot.session_id'
const PARTICIPANT_KEY = 'bitpilot.participant_id'
// Identity material generated in the browser. None of these are sent to
// the backend except where a mission explicitly requires it (see api.ts).
const NSEC_KEY = 'bitpilot.nsec'           // mission 14, Nostr private key (bech32)
const NPUB_KEY = 'bitpilot.npub'           // mission 14, Nostr public key  (bech32)
const SEED_KEY = 'bitpilot.seed_phrase'    // mission 11, BIP39 mnemonic (space-separated)

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

export function getNsec(): string | null                 { return safeGet(NSEC_KEY) }
export function setNsec(v: string): void                 { safeSet(NSEC_KEY, v) }
export function clearNsec(): void                        { safeRemove(NSEC_KEY) }

export function getNpub(): string | null                 { return safeGet(NPUB_KEY) }
export function setNpub(v: string): void                 { safeSet(NPUB_KEY, v) }
export function clearNpub(): void                        { safeRemove(NPUB_KEY) }

export function getSeedPhrase(): string | null           { return safeGet(SEED_KEY) }
export function setSeedPhrase(v: string): void           { safeSet(SEED_KEY, v) }
export function clearSeedPhrase(): void                  { safeRemove(SEED_KEY) }

/** Wipe every stored credential and ID. Use for "Start fresh" / "Log out". */
export function clearAllTokens(): void {
    clearAuthToken()
    clearFacilitatorToken()
    clearSessionId()
    clearParticipantId()
    clearNsec()
    clearNpub()
    clearSeedPhrase()
}
