/**
 * Smoke test: mission prose renders its inline emphasis (**bold**, `code`)
 * as real formatting instead of literal markdown markers.
 *
 * Mission 77 "What money even is" (Money Basics, third in the tree) carries
 * "**Medium of exchange**" in its lesson body, so seeding missions [0, 1]
 * lands the learner right on it.
 *
 *   node e2e/mission-prose.test.mjs
 */
import { seedParticipant, launch, openApp, enterTree, sleep, makeReporter } from './_lib.mjs'

const report = makeReporter('mission-prose')

const creds = await seedParticipant([0, 1])
const browser = await launch()
try {
    const page = await openApp(browser, creds)
    await enterTree(page, 'Money Basics')
    await sleep(600)

    report.assert(
        (await page.getByText(/What money even is/i).count()) > 0,
        'landed on the "What money even is" lesson',
    )
    report.assert(
        (await page.locator('strong', { hasText: 'Medium of exchange' }).count()) > 0,
        'lesson emphasis renders as <strong>, not markdown markers',
    )
    report.assert(
        (await page.getByText(/\*\*/).count()) === 0,
        'no literal ** markers remain anywhere on the lesson',
    )
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
