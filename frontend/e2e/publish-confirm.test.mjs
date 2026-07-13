/**
 * Smoke test: publishing a Nostr note (mission 26) must show one calm
 * confirmation naming the public, permanent consequence before broadcasting,
 * with a "go back and edit" path.
 *
 *   node e2e/publish-confirm.test.mjs
 */
import { seedParticipant, launch, openApp, enterTree, passLearnAndQuiz, sleep, makeReporter } from './_lib.mjs'

const report = makeReporter('publish-confirm')

// Nostr tree order: [13, 14, 15, 97, 16, 17, 26, ...]; seed up to mission 26.
const creds = await seedParticipant([13, 14, 15, 97, 16, 17])
const browser = await launch()
try {
    const page = await openApp(browser, creds, {
        nsec: 'nsec1' + 'q'.repeat(58),
        npub: 'npub1' + 'q'.repeat(50),
    })
    await enterTree(page, 'Nostr')
    await passLearnAndQuiz(page, 'On every Nostr relay we successfully publish to', report)

    const textarea = page.locator('textarea')
    if (await textarea.count()) await textarea.first().fill('Finished a BitPilot mission. Learning by doing works.')
    const action = page.getByRole('button', { name: /Sign and publish my note/i })
    report.assert((await action.count()) > 0, 'reached the publish Do step')
    if (await action.count()) await action.first().click({ force: true })
    await sleep(500)

    report.assert(
        (await page.getByText(/public and permanent/i).count()) > 0,
        'a confirmation names the public and permanent consequence before publishing',
    )
    const back = page.getByRole('button', { name: /go back and edit/i })
    report.assert((await back.count()) > 0, 'the confirmation offers a "go back and edit" path')
    if (await back.count()) {
        await back.first().click({ force: true })
        await sleep(400)
        report.assert(
            (await page.locator('textarea').count()) > 0,
            '"go back and edit" returns to the note input',
        )
    }
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
