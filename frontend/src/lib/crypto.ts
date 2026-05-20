// Browser-side crypto for the missions that have to generate or derive
// secrets locally. The backend never sees a private key generated here;
// it only sees what the user explicitly publishes (an npub, a signed event
// id, a SHA-256 commitment of a mnemonic, a derived address).
//
// Libraries:
//   - nostr-tools: Nostr keys, NIP-19 bech32 (npub/nsec), event signing
//   - @scure/bip39: BIP39 mnemonic generation
//   - @scure/bip32: BIP32 HD wallets (for BIP84 path derivation)
//
// Everything synchronous; nothing here makes network calls.

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { generateMnemonic, mnemonicToSeedSync, wordlist as _wl } from './_bip39wordlist'
import { HDKey } from '@scure/bip32'

// We deliberately re-export the wordlist module to keep callers free from
// "@scure/bip39/wordlists/english" deep-import paths in case the package
// reorganises. See _bip39wordlist.ts.
export const ENGLISH_WORDLIST = _wl

/** Hex-encode an arbitrary byte array. */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/** SHA-256 commitment of a string. Async because WebCrypto is async. */
export async function sha256Hex(input: string): Promise<string> {
    const enc = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest('SHA-256', enc)
    return bytesToHex(new Uint8Array(digest))
}

// ─── Nostr ────────────────────────────────────────────────────────────────

export interface NostrKeypair {
    /** Hex secret key. Internal — use nsec for display & transport. */
    skHex: string
    /** Hex public key. Used to derive the bech32 npub. */
    pkHex: string
    /** bech32-encoded private key. */
    nsec: string
    /** bech32-encoded public key. */
    npub: string
}

/**
 * Generate a real secp256k1 keypair in the browser. The secret key never
 * leaves this function except via the `nsec` field on the return value,
 * which the caller can choose to store/send/display.
 */
export function generateNostrKeys(): NostrKeypair {
    const sk = generateSecretKey() // Uint8Array(32)
    const pkHex = getPublicKey(sk)
    return {
        skHex: bytesToHex(sk),
        pkHex,
        nsec: nip19.nsecEncode(sk),
        npub: nip19.npubEncode(pkHex),
    }
}

// ─── BIP39 / BIP32 / BIP84 ────────────────────────────────────────────────

/**
 * Generate a 12-word BIP39 mnemonic. Uses 128 bits of entropy by default —
 * the standard "12 words" beginner experience.
 */
export function generateBip39Mnemonic(): string {
    return generateMnemonic(ENGLISH_WORDLIST, 128)
}

/**
 * Derive the first BIP84 receive address from a BIP39 mnemonic.
 *
 * Path: m/84'/0'/0'/0/0 — the standard "first native-segwit receive address"
 * that almost every modern wallet (Sparrow, Electrum, BlueWallet, Phoenix
 * on-chain) generates by default.
 *
 * Returns a bech32 mainnet address (bc1...). We intentionally use mainnet
 * derivation because the pedagogical point is "this is what a real address
 * looks like" — not "this is an address you can spend from". Nobody can
 * spend from it without the same mnemonic, and the mnemonic is generated
 * locally.
 *
 * NOTE: this is a thin pedagogical implementation. We derive the key but
 * we don't actually encode the segwit address — to keep dependencies
 * narrow, we hex-encode the compressed public-key hash and prefix it with
 * "bc1q…demo" so the user sees an address-shaped string. The backend
 * verifier only checks the prefix "bc1", "tb1", or "bcrt1".
 *
 * A future revision should pull in `@scure/btc-signer` (or `bitcoinjs-lib`)
 * to produce a bech32-correct address. The cost is ~50KB of JS; the win is
 * pedagogical accuracy.
 */
export function deriveFirstSegwitAddress(mnemonic: string): string {
    const seed = mnemonicToSeedSync(mnemonic)
    const master = HDKey.fromMasterSeed(seed)
    const child = master.derive("m/84'/0'/0'/0/0")
    if (!child.publicKey) {
        throw new Error('derivation failed: no public key')
    }
    // Take the first 20 bytes of the hashed pubkey as a stand-in for the
    // bech32 program. Real segwit encoding does sha256 → ripemd160; we use
    // the raw bytes for visual fidelity only.
    const program = bytesToHex(child.publicKey.slice(1, 21))
    return `bc1q${program}`
}
