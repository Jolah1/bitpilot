/**
 * Smoke test: mission 17 (events, everything is one) must sign a real
 * event in the browser, show the learner its anatomy, and publish nothing.
 *
 * The lesson claims the id is a hash of the event and the sig is that id
 * signed by your key. This drives the flow and checks the app actually
 * demonstrates it, that the private key never leaves the browser, and that
 * no relay is contacted, since publishing is mission 26's job.
 *
 *   node e2e/sign-event.test.mjs
 */
import {
    enterTree,
    launch,
    makeReporter,
    openApp,
    passLearnAndQuiz,
    seedParticipant,
    sleep,
} from './_lib.mjs'
import { finalizeEvent, getPublicKey, nip19 } from 'nostr-tools'

const report = makeReporter('sign-event')

// Same deterministic identity the seeding uses, so the key the browser
// signs with matches the npub registered at mission 14.
const SK = new Uint8Array(32).fill(7)
const NSEC = nip19.nsecEncode(SK)
const NPUB = nip19.npubEncode(getPublicKey(SK))

// Nostr tree order: [13, 14, 15, 97, 16, 17, ...]; seed up to mission 17.
const creds = await seedParticipant([13, 14, 15, 97, 16])
const browser = await launch()
try {
    const page = await openApp(browser, creds, { nsec: NSEC, npub: NPUB })

    const posted = []
    let relayCalls = 0
    page.on('request', (req) => {
        const u = req.url()
        if (u.includes('/missions/complete') && req.method() === 'POST') {
            posted.push(req.postData() ?? '')
        }
        if (u.includes('/nostr/broadcast') || u.startsWith('ws')) relayCalls++
    })

    await enterTree(page, 'Nostr')
    await passLearnAndQuiz(page, 'Kind 1', report)

    const textarea = page.locator('textarea')
    report.assert((await textarea.count()) > 0, 'reached the Do step with a text input')
    await textarea.first().fill('learning what an event really is')

    const action = page.getByRole('button', { name: /Sign an event and open it up/i })
    report.assert((await action.count()) > 0, 'the sign action is offered')
    if (await action.count()) await action.first().click({ force: true })
    await sleep(1800)

    const body = await page.locator('#main-content, main, body').first().innerText()

    // The five fields the lesson names should be visible, not just described.
    for (const field of ['kind', 'content', 'pubkey', 'id', 'sig']) {
        report.assert(
            new RegExp(`\\b${field}\\b`, 'i').test(body),
            `the ${field} field is shown to the learner`,
        )
    }

    // Nothing was published: mission 26 is where that happens.
    report.assert(relayCalls === 0, 'no relay or broadcast call was made')
    report.assert(
        !/published to|broadcast/i.test(body),
        'the outcome does not claim the event was published',
    )

    // The submitted proof is the signed event, and it verifies.
    report.assert(posted.length > 0, 'the completion was posted')
    const proof = JSON.parse(JSON.parse(posted[0]).proof)
    report.assert(
        proof.pubkey === getPublicKey(SK),
        'the event was signed by the learner\'s own registered key',
    )
    // Re-sign the same content and confirm the id is content-derived: same
    // inputs give the same id, which is what "the id is a hash" means.
    const same = finalizeEvent(
        { kind: proof.kind, tags: proof.tags, content: proof.content, created_at: proof.created_at },
        SK,
    )
    report.assert(same.id === proof.id, 'the id is a hash of the event contents, reproducibly')
    report.assert(
        finalizeEvent(
            { kind: 1, tags: [], content: proof.content + '!', created_at: proof.created_at },
            SK,
        ).id !== proof.id,
        'changing one character changes the id, as the lesson claims',
    )

    // The private key must never appear in anything we sent.
    report.assert(
        posted.every((b) => !b.includes(NSEC)),
        'the nsec was never sent to the server',
    )
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
