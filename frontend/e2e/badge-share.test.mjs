/**
 * Smoke test: completing a tree shows the badge celebration, and the share
 * modal offers a private, on-brand "Share to Nostr" option that (like
 * "Share on X") passes through a public-post confirmation.
 *
 *   node e2e/badge-share.test.mjs
 */
import { seedParticipant, launch, openApp, enterTree, passLearnAndQuiz, sleep, makeReporter } from './_lib.mjs'

const report = makeReporter('badge-share')

// Money Basics tree = [0,1,77,78,2,5,9,10]; seed all but the final mission.
const creds = await seedParticipant([0, 1, 77, 78, 2, 5, 9])
const browser = await launch()
try {
    const page = await openApp(browser, creds, {
        nsec: 'nsec1' + 'q'.repeat(58), // enables Share to Nostr
        npub: 'npub1' + 'q'.repeat(50),
    })
    await enterTree(page, 'Money Basics')
    await passLearnAndQuiz(page, 'only a company can reset your access', report)

    // Knowledge Do step: acknowledge, then the Next/Finish button fires the
    // tree-completion celebration.
    const got = page.getByRole('button', { name: /You got it/i })
    if (await got.count()) await got.first().click({ force: true })
    await sleep(1200)
    const finish = page.getByRole('button', { name: /Finish BitPilot|Next:/i })
    if (await finish.count()) await finish.first().click({ force: true })
    await sleep(1800)

    report.assert(
        (await page.getByText(/Chapter complete/i).count()) > 0 &&
            (await page.getByText(/You earned the .*badge/i).count()) > 0,
        'badge celebration appears on tree completion',
    )

    // Open the share modal. The celebration badge art overlaps the buttons,
    // so invoke the handler directly rather than a coordinate click.
    const saveShare = page.getByRole('button', { name: /Save .*share badge|share badge/i })
    if (await saveShare.count()) {
        await saveShare.first().evaluate((el) => el.click())
        await sleep(700)
    } else report.bad('Save/share button not found in the celebration')

    report.assert(
        (await page.getByRole('button', { name: /Share to Nostr/i }).count()) > 0,
        'the share modal offers "Share to Nostr"',
    )
    report.assert(
        (await page.getByRole('button', { name: /Share on X/i }).count()) > 0,
        '"Share on X" is still offered',
    )

    const nostr = page.getByRole('button', { name: /Share to Nostr/i })
    if (await nostr.count()) {
        await nostr.first().evaluate((el) => el.click())
        await sleep(400)
        report.assert(
            (await page.getByText(/posts publicly/i).count()) > 0,
            'a public-post confirmation appears before sharing',
        )
        report.assert(
            (await page.getByRole('button', { name: /Post to Nostr/i }).count()) > 0,
            'the confirmation offers "Post to Nostr"',
        )
        report.assert(
            (await page.getByRole('button', { name: /^Cancel$/i }).count()) > 0,
            'the confirmation offers Cancel',
        )
    }
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
