export const CASHU_V3_SAMPLE =
    'cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vODMzMy5zcGFjZTozMzM4IiwicHJvb2ZzIjpbeyJhbW91bnQiOjIsImlkIjoiMDA5YTFmMjkzMjUzZTQxZSIsInNlY3JldCI6IjQwNzkxNWJjMjEyYmU2MWE3N2UzZTZkMmFlYjRjNzI3OTgwYmRhNTFjZDA2YTZhZmMyOWUyODYxNzY4YTc4MzciLCJDIjoiMDJiYzkwOTc5OTdkODFhZmIyY2M3MzQ2YjVlNDM0NWE5MzQ2YmQyYTUwNmViNzk1ODU5OGE3MmYwY2Y4NTE2M2VhIn0seyJhbW91bnQiOjgsImlkIjoiMDA5YTFmMjkzMjUzZTQxZSIsInNlY3JldCI6ImZlMTUxMDkzMTRlNjFkNzc1NmIwZjhlZTBmMjNhNjI0YWNhYTNmNGUwNDJmNjE0MzNjNzI4YzcwNTdiOTMxYmUiLCJDIjoiMDI5ZThlNTA1MGI4OTBhN2Q2YzA5NjhkYjE2YmMxZDVkNWZhMDQwZWExZGUyODRmNmVjNjlkNjEyOTlmNjcxMDU5In1dfV0sInVuaXQiOiJzYXQiLCJtZW1vIjoiVGhhbmsgeW91LiJ9'

export interface CashuV3Facts {
    mint: string
    amountSats: number
    proofCount: number
}

const OFFICIAL_FACTS: CashuV3Facts = {
    mint: 'https://8333.space:3338',
    amountSats: 10,
    proofCount: 2,
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHexString(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length % 2 === 0 &&
        /^[0-9a-f]+$/i.test(value)
    )
}

function decodeBase64Url(payload: string): Uint8Array {
    if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) {
        throw new Error('The cashuA payload is not valid base64url.')
    }

    const standard = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
    let binary: string
    try {
        binary = atob(padded)
    } catch {
        throw new Error('The cashuA payload is not valid base64url.')
    }

    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    let encoded = ''
    for (const byte of bytes) encoded += String.fromCharCode(byte)
    const canonical = btoa(encoded)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    if (canonical !== payload) {
        throw new Error('The cashuA payload is not valid base64url.')
    }
    return bytes
}

export function decodeCashuV3Sample(input: string): CashuV3Facts {
    const token = input.trim()
    if (token.startsWith('cashuB')) {
        throw new Error(
            'cashuB is the current V4 CBOR format. This exercise uses the bundled cashuA V3 JSON sample.',
        )
    }
    if (!token.startsWith('cashuA')) {
        throw new Error('Paste a cashuA token. This exercise uses the bundled V3 JSON sample.')
    }

    const bytes = decodeBase64Url(token.slice('cashuA'.length))
    let json: string
    try {
        json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
        throw new Error('The cashuA payload is not valid UTF-8 text.')
    }

    let decoded: unknown
    try {
        decoded = JSON.parse(json)
    } catch {
        throw new Error('The cashuA payload is not valid JSON.')
    }
    if (!isRecord(decoded) || !Array.isArray(decoded.token) || decoded.token.length !== 1) {
        throw new Error('The sample must contain exactly one mint entry.')
    }
    if (decoded.unit !== undefined && decoded.unit !== 'sat') {
        throw new Error('This exercise can only report a Cashu token denominated in sats.')
    }

    const entry = decoded.token[0]
    if (!isRecord(entry) || typeof entry.mint !== 'string' || !entry.mint.trim()) {
        throw new Error('The sample mint entry must include a mint URL.')
    }
    if (!Array.isArray(entry.proofs) || entry.proofs.length === 0) {
        throw new Error('The sample mint entry must include at least one proof.')
    }

    let amountSats = 0
    for (const proof of entry.proofs) {
        if (
            !isRecord(proof) ||
            typeof proof.amount !== 'number' ||
            !Number.isSafeInteger(proof.amount) ||
            proof.amount <= 0
        ) {
            throw new Error('Every proof amount must be a positive integer.')
        }
        if (
            !isHexString(proof.id) ||
            typeof proof.secret !== 'string' ||
            !isHexString(proof.C)
        ) {
            throw new Error('Every V3 proof must include a hexadecimal id and C, plus a string secret.')
        }
        amountSats += proof.amount
        if (!Number.isSafeInteger(amountSats)) {
            throw new Error('The proof total is too large to decode safely.')
        }
    }

    const facts = {
        mint: entry.mint,
        amountSats,
        proofCount: entry.proofs.length,
    }
    if (
        facts.mint !== OFFICIAL_FACTS.mint ||
        facts.amountSats !== OFFICIAL_FACTS.amountSats ||
        facts.proofCount !== OFFICIAL_FACTS.proofCount
    ) {
        throw new Error(
            'Use the bundled sample exactly as shown. It decodes to https://8333.space:3338, 10 sats, and 2 proofs.',
        )
    }
    return facts
}

export function cashuV3CompletionProof(facts: CashuV3Facts): string {
    return JSON.stringify({
        format: 'cashuA-v3',
        mint: facts.mint,
        amount_sats: facts.amountSats,
        proof_count: facts.proofCount,
    })
}
