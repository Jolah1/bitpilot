/**
 * Smoke test: the seed phrase (mission 11) and Nostr identity (mission 14)
 * Do steps must hide the generated secret behind a deliberate reveal, drop
 * the server-commitment line from the learner view, and hold the Next
 * button until the learner confirms they saved the secret.
 *
 * Run one target at a time:  node e2e/secret-reveal.test.mjs seed
 *                            node e2e/secret-reveal.test.mjs nostrid
 */
import { seedParticipant, launch, openApp, enterTree, passLearnAndQuiz, sleep, makeReporter } from './_lib.mjs'

const TARGET = process.argv[2] ?? 'seed'
const CFG = {
    seed: {
        tree: 'Self-custody',
        prior: [3, 4], // Self-custody tree: [3,4,11,...]
        correct: 'Written on paper, two copies, physically separated',
        action: 'Generate my 12 words',
        commitmentGone: true,
    },
    nostrid: {
        tree: 'Nostr',
        prior: [13], // Nostr tree: [13,14,...]
        correct: 'they ARE you on Nostr',
        action: 'Generate my Nostr identity',
        commitmentGone: false,
    },
}[TARGET]

if (!CFG) {
    console.error('Unknown target. Use "seed" or "nostrid".')
    process.exit(2)
}

const report = makeReporter(`secret-reveal:${TARGET}`)

const creds = await seedParticipant(CFG.prior)
const browser = await launch()
try {
    const page = await openApp(browser, creds)
    await enterTree(page, CFG.tree)
    await passLearnAndQuiz(page, CFG.correct, report)

    const action = page.getByRole('button', { name: new RegExp(CFG.action, 'i') })
    report.assert((await action.count()) > 0, 'quiz answered correctly, reached the Do step')
    if (await action.count()) await action.first().click({ force: true })
    await sleep(1500)

    const bodyText = (await page.locator('#main-content, main, body').first().innerText()).toLowerCase()

    if (CFG.commitmentGone) {
        report.assert(
            !bodyText.includes('commitment (sent to server)'),
            'commitment (sent to server) line is absent from the learner view',
        )
    }

    const reveal = page.getByRole('button', { name: /tap to reveal/i })
    report.assert((await reveal.count()) > 0, 'secret is hidden behind a Tap to reveal control')

    const next = page.getByRole('button', { name: /Next:|Finish BitPilot/i })
    report.assert(
        (await next.count()) > 0 && (await next.first().isDisabled()) === true,
        'Next is disabled before the save is confirmed',
    )

    if (await reveal.count()) {
        await reveal.first().click({ force: true })
        await sleep(300)
        report.assert(
            (await page.getByRole('button', { name: /^Hide$/i }).count()) > 0,
            'reveal shows the secret and offers Hide',
        )
    }

    const cb = page.locator('input[type="checkbox"]')
    if (await cb.count()) await cb.first().check({ force: true })
    await sleep(300)
    report.assert(
        (await next.count()) > 0 && (await next.first().isDisabled()) === false,
        'confirming "I saved this" enables Next',
    )
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
