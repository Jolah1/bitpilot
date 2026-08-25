/**
 * Smoke test: mission 84 decodes the official Cashu NUT-00 V3 sample in
 * the browser, displays its facts, and sends only canonical facts as proof.
 *
 *   node e2e/ecash-decode.test.mjs
 */
import {
    apiPost,
    enterTree,
    launch,
    makeReporter,
    openApp,
    passLearnAndQuiz,
    sleep,
} from './_lib.mjs'

const report = makeReporter('ecash-decode')

const SAMPLE =
    'cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vODMzMy5zcGFjZTozMzM4IiwicHJvb2ZzIjpbeyJhbW91bnQiOjIsImlkIjoiMDA5YTFmMjkzMjUzZTQxZSIsInNlY3JldCI6IjQwNzkxNWJjMjEyYmU2MWE3N2UzZTZkMmFlYjRjNzI3OTgwYmRhNTFjZDA2YTZhZmMyOWUyODYxNzY4YTc4MzciLCJDIjoiMDJiYzkwOTc5OTdkODFhZmIyY2M3MzQ2YjVlNDM0NWE5MzQ2YmQyYTUwNmViNzk1ODU5OGE3MmYwY2Y4NTE2M2VhIn0seyJhbW91bnQiOjgsImlkIjoiMDA5YTFmMjkzMjUzZTQxZSIsInNlY3JldCI6ImZlMTUxMDkzMTRlNjFkNzc1NmIwZjhlZTBmMjNhNjI0YWNhYTNmNGUwNDJmNjE0MzNjNzI4YzcwNTdiOTMxYmUiLCJDIjoiMDI5ZThlNTA1MGI4OTBhN2Q2YzA5NjhkYjE2YmMxZDVkNWZhMDQwZWExZGUyODRmNmVjNjlkNjEyOTlmNjcxMDU5In1dfV0sInVuaXQiOiJzYXQiLCJtZW1vIjoiVGhhbmsgeW91LiJ9'
const CANONICAL_PROOF = {
    format: 'cashuA-v3',
    mint: 'https://8333.space:3338',
    amount_sats: 10,
    proof_count: 2,
}

function cashuA(value) {
    return 'cashuA' + Buffer.from(JSON.stringify(value)).toString('base64url')
}

const session = await apiPost('/sessions', { name: 'Cashu Decode E2E' })
const joined = await apiPost('/participants', {
    name: 'E2E',
    session_id: session.session.id,
})
const creds = {
    sid: session.session.id,
    pid: joined.participant.id,
    token: joined.auth_token,
}

for (const mission of [31, 32]) {
    await apiPost('/missions/complete', { mission, proof: 'acknowledged' }, creds.token)
}
const minted = await apiPost('/ecash/mint', { amount_sats: 50 }, creds.token)
await apiPost('/missions/complete', { mission: 33, proof: minted.token }, creds.token)
await apiPost('/ecash/redeem', { token: minted.token }, creds.token)
await apiPost('/missions/complete', { mission: 34, proof: minted.token }, creds.token)

const browser = await launch()
try {
    const page = await openApp(browser, creds)
    const completionProofs = []
    const decodeRequests = []
    let decoding = false
    page.on('request', (request) => {
        if (!decoding) return
        decodeRequests.push(request.url())
        if (request.url().includes('/missions/complete')) {
            const body = JSON.parse(request.postData() ?? '{}')
            completionProofs.push(body.proof)
        }
    })

    await enterTree(page, 'eCash')
    await sleep(500)

    report.assert(
        (await page.getByText(/^Offline sample$/i).count()) > 0,
        'mission 84 is marked as an offline sample',
    )
    report.assert(
        (await page.locator('code', { hasText: SAMPLE }).count()) > 0,
        'the official Cashu V3 sample is selectable lesson code',
    )

    await passLearnAndQuiz(page, 'Whoever currently holds the token', report)

    const field = page.getByLabel('Cashu token to decode', { exact: true })
    const hasField = (await field.count()) > 0
    report.assert(hasField, 'the mission-specific Cashu token field is presented')
    if (hasField) await field.fill(SAMPLE)

    const action = page.getByRole('button', { name: /Decode sample token/i })
    const hasAction = (await action.count()) > 0
    report.assert(hasAction, 'the decoder action is offered')
    if (hasAction) {
        decoding = true
        const invalidSamples = [
            ['malformed base64url', 'cashuA%%%'],
            ['invalid UTF-8', 'cashuA_w'],
            ['invalid JSON', 'cashuA' + Buffer.from('{').toString('base64url')],
            ['wrong prefix', 'tokenA' + SAMPLE.slice(6)],
            ['empty token list', cashuA({ token: [] })],
            [
                'more than one mint entry',
                cashuA({
                    token: [
                        { mint: CANONICAL_PROOF.mint, proofs: [{ amount: 10 }] },
                        { mint: CANONICAL_PROOF.mint, proofs: [{ amount: 10 }] },
                    ],
                }),
            ],
            ['empty mint', cashuA({ token: [{ mint: '', proofs: [{ amount: 10 }] }] })],
            ['missing proofs', cashuA({ token: [{ mint: CANONICAL_PROOF.mint }] })],
            ['empty proofs', cashuA({ token: [{ mint: CANONICAL_PROOF.mint, proofs: [] }] })],
            [
                'non-integer amount',
                cashuA({ token: [{ mint: CANONICAL_PROOF.mint, proofs: [{ amount: 1.5 }] }] }),
            ],
            [
                'non-positive amount',
                cashuA({ token: [{ mint: CANONICAL_PROOF.mint, proofs: [{ amount: 0 }] }] }),
            ],
            [
                'unexpected mint',
                cashuA({ token: [{ mint: 'https://example.com', proofs: [{ amount: 2 }, { amount: 8 }] }] }),
            ],
            [
                'unexpected amount',
                cashuA({ token: [{ mint: CANONICAL_PROOF.mint, proofs: [{ amount: 2 }, { amount: 9 }] }] }),
            ],
            [
                'unexpected proof count',
                cashuA({ token: [{ mint: CANONICAL_PROOF.mint, proofs: [{ amount: 10 }] }] }),
            ],
        ]
        for (const [name, token] of invalidSamples) {
            await field.fill(token)
            await action.first().click({ force: true })
            await sleep(100)
            report.assert(
                (await page.getByRole('alert').count()) > 0,
                `${name} is rejected before completion`,
            )
        }

        await field.fill('cashuBdeadbeef')
        await action.first().click({ force: true })
        await sleep(100)
        const v4Error = await page.getByRole('alert').first().innerText()
        report.assert(
            /cashuB/i.test(v4Error) && /V4/i.test(v4Error) && /CBOR/i.test(v4Error),
            'cashuB receives a focused V4 CBOR explanation',
        )

        await field.fill(SAMPLE)
        await action.first().click({ force: true })
        await sleep(1500)
        decoding = false
    }

    const body = await page.locator('#main-content, main, body').first().innerText()
    report.assert(body.includes('https://8333.space:3338'), 'decoded mint URL is shown')
    report.assert(/10 sats/i.test(body), 'decoded total of 10 sats is shown')
    report.assert(/2 proofs/i.test(body), 'decoded proof count of 2 is shown')
    report.assert(
        completionProofs.length === 1 &&
            completionProofs[0] === JSON.stringify(CANONICAL_PROOF),
        'only canonical decoded facts are submitted as proof',
    )
    report.assert(
        completionProofs.every((proof) => !proof.includes(SAMPLE)),
        'the raw token stays in the browser',
    )
    report.assert(
        decodeRequests.length === 1 && decodeRequests[0].includes('/missions/complete'),
        'decoding makes no network request beyond mission completion',
    )
    report.assert(
        (await page.getByRole('button', { name: /Next: Blind signatures, plainly/i }).count()) > 0,
        'successful completion advances to mission 55',
    )
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
