/**
 * Smoke test: a learner who walks back to a finished mission must be able
 * to read, and copy, the artifact that mission produced.
 *
 * The case this exists for: you derived an address (or an npub) three
 * missions ago and now you need it again. Without this you would have to
 * redo the mission, which the backend refuses.
 *
 *   node e2e/review-archive.test.mjs
 */
import {
    enterTree,
    launch,
    makeReporter,
    openApp,
    seedParticipant,
    sleep,
} from './_lib.mjs'
import { getPublicKey, nip19 } from 'nostr-tools'

const report = makeReporter('review-archive')

const SK = new Uint8Array(32).fill(7)
const NPUB = nip19.npubEncode(getPublicKey(SK))

// Nostr order: [13, 14, 15, ...]. Seed past 14 (the identity mission) so
// the learner is sitting on 15 with 14 behind them.
const creds = await seedParticipant([13, 14])
const browser = await launch()
try {
    const page = await openApp(browser, creds, { npub: NPUB })
    await enterTree(page, 'Nostr')
    await sleep(600)

    // Walk back to the identity mission.
    const prev = page.getByRole('button', { name: /Previous mission on this flight path/i })
    report.assert((await prev.count()) > 0, 'a Previous control is offered')
    await prev.first().click({ force: true })
    await sleep(900)

    // The Do step is where the archive lives, so go to it.
    const doTab = page.getByRole('tab', { name: /Do it/i })
    if (await doTab.count()) {
        await doTab.first().click({ force: true })
        await sleep(700)
    }

    const body = await page.locator('#main-content, main, body').first().innerText()

    report.assert(
        /completed this mission/i.test(body),
        'the revisited mission is shown as already completed',
    )
    report.assert(
        body.includes(NPUB),
        'the npub produced by that mission is shown again',
    )
    report.assert(
        /Your Nostr public key/i.test(body),
        'the artifact is labelled, not dumped as a bare string',
    )

    const copy = page.getByRole('button', { name: /Copy your nostr public key/i })
    report.assert((await copy.count()) > 0, 'a Copy control is offered for the artifact')

    // The learner must be able to get back to where they were.
    const forward = page.getByRole('button', { name: /Next:|Forward/i })
    report.assert(
        (await forward.count()) > 0,
        'a way forward to the current mission is offered',
    )
    if (await forward.count()) {
        await forward.first().click({ force: true })
        await sleep(900)
        const after = await page.locator('#main-content, main, body').first().innerText()
        report.assert(
            !after.includes(NPUB) || /Public vs private key/i.test(after),
            'moving forward leaves the archived mission behind',
        )
    }
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
