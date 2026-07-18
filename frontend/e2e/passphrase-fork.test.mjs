/**
 * Smoke test: mission 92 (the 25th word) must actually derive two
 * different wallets from one seed, and must never send the passphrase.
 *
 * The lesson's whole claim is "the same 12 words with a different
 * passphrase produce a completely different set of addresses". This test
 * checks the app demonstrates that rather than asserting it, and that the
 * passphrase the learner typed stays in the browser.
 *
 *   node e2e/passphrase-fork.test.mjs
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

const report = makeReporter('passphrase-fork')

// A well-known BIP39 test vector, so a failure here is about our
// derivation and not about a mnemonic we invented.
const SEED =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const PASSPHRASE = 'my-first-house-street'

// Self-custody runs [3, 4, 11, 12, 91, 92, ...]; seed up to 92's doorstep.
const creds = await seedParticipant([3, 4, 11, 12, 91])
const browser = await launch()
try {
    const page = await openApp(browser, creds, { seed: SEED })

    // Record what the app sends, so we can prove the passphrase does not
    // leave the browser rather than just trusting the handler.
    const posted = []
    page.on('request', (req) => {
        if (req.url().includes('/missions/complete') && req.method() === 'POST') {
            posted.push(req.postData() ?? '')
        }
    })

    await enterTree(page, 'Self-custody')
    await passLearnAndQuiz(
        page,
        'produce a completely different set of addresses',
        report,
    )

    const input = page.locator('input[type="text"], input:not([type])').first()
    report.assert((await input.count()) > 0, 'reached the Do step with a passphrase input')
    await input.fill(PASSPHRASE)

    const action = page.getByRole('button', { name: /Derive both wallets/i })
    report.assert((await action.count()) > 0, 'the derive action is offered')
    if (await action.count()) await action.first().click({ force: true })
    await sleep(1800)

    const body = await page.locator('#main-content, main, body').first().innerText()

    // Pull the two bech32 addresses the outcome panel rendered.
    const addresses = [...new Set(body.match(/bc1q[0-9a-z]+/gi) ?? [])]
    report.assert(
        addresses.length >= 2,
        `both derived addresses are shown (found ${addresses.length})`,
    )
    report.assert(
        addresses.length >= 2 && addresses[0] !== addresses[1],
        'the two addresses differ, which is the entire lesson',
    )

    report.assert(
        /without a passphrase/i.test(body) && /with your passphrase/i.test(body),
        'each address is labelled so the comparison is legible',
    )

    // The passphrase is as sensitive as the seed. It must never be sent.
    report.assert(posted.length > 0, 'the completion was actually posted')
    report.assert(
        posted.every((b) => !b.includes(PASSPHRASE)),
        'the passphrase was never sent to the server',
    )
    report.assert(
        posted.every((b) => !b.includes('abandon')),
        'the seed phrase was never sent to the server',
    )

    const next = page.getByRole('button', { name: /Next:|Finish BitPilot/i })
    report.assert(
        (await next.count()) > 0 && (await next.first().isDisabled()) === false,
        'the mission completes and Next is enabled',
    )
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
