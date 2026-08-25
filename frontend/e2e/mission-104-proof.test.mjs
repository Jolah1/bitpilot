/**
 * Regression test: mission 104 must collect a substantive test or file-link
 * proof through the browser, trim it before transport, and archive it.
 *
 *   node e2e/mission-104-proof.test.mjs
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

const report = makeReporter('mission-104-proof')

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error)
}

function proofFrom(body) {
    try {
        return JSON.parse(body).proof
    } catch {
        return null
    }
}

async function waitForCount(items, expected) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (items.length >= expected) return true
        await sleep(100)
    }
    return false
}

let browser
try {
    let creds
    try {
        // Open Source order is [100, 101, 102, 103, 104, 105]. The shared
        // proof seeder must carry the browser to mission 104's doorstep.
        creds = await seedParticipant([100, 101, 102, 103])
        report.ok('the shared seeder reaches Mission 104')
    } catch (error) {
        report.bad(`the shared seeder reaches Mission 104 (${errorMessage(error)})`)
    }

    if (creds) {
        browser = await launch()
        const page = await openApp(browser, creds)
        const completions = []
        page.on('response', (response) => {
            const request = response.request()
            if (
                request.url().includes('/missions/complete') &&
                request.method() === 'POST'
            ) {
                completions.push({
                    body: request.postData() ?? '',
                    status: response.status(),
                })
            }
        })

        await enterTree(page, 'Open Source')
        await passLearnAndQuiz(
            page,
            'It cannot change runtime behavior, and it documents what the code really does',
            report,
        )

        const textarea = page.locator('textarea')
        const hasTextarea = (await textarea.count()) > 0
        report.assert(hasTextarea, 'Mission 104 renders a textarea control')

        const bodyBeforeSubmit = await page.locator('body').innerText()
        report.assert(
            bodyBeforeSubmit.includes(
                'Paste the test you wrote, or a link to the file containing it.',
            ),
            'Mission 104 shows its test-or-file-link helper',
        )

        let hasPlaceholder = false
        if (hasTextarea) {
            hasPlaceholder =
                (await textarea.first().getAttribute('placeholder')) ===
                'Paste your test snippet or a link to its file'
        }
        report.assert(hasPlaceholder, 'Mission 104 shows its proof placeholder')

        const save = page.getByRole('button', { name: /Save my test/i })
        const hasSave = (await save.count()) > 0
        report.assert(hasSave, 'Mission 104 offers the Save my test action')

        if (hasTextarea && hasSave) {
            await textarea.first().fill('   too short   ')
            await save.first().click({ force: true })
            const sawShortResponse = await waitForCount(completions, 1)
            report.assert(sawShortResponse, 'the short proof reaches the backend')

            const shortCompletion = completions[0]
            report.assert(
                proofFrom(shortCompletion?.body ?? '') === 'too short',
                'the browser submits the whitespace-padded short proof trimmed',
            )
            report.assert(
                shortCompletion?.status === 400,
                'the backend rejects the trimmed short proof',
            )

            await sleep(300)
            const bodyAfterReject = await page.locator('body').innerText()
            report.assert(
                /at least 20 characters/i.test(bodyAfterReject),
                'the backend rejection is shown to the learner',
            )
            report.assert(
                !bodyAfterReject.includes(
                    'Saved. This is your raw material for the final mission.',
                ),
                'a rejected proof exposes no success result',
            )
            report.assert(
                (await page.getByRole('button', { name: /^Next: Ship a real PR$/i }).count()) === 0,
                'a rejected proof exposes no Next action',
            )

            await textarea.first().fill(
                '  \nhttps://github.com/example/project/blob/main/tests/mission-104.test.js\n  ',
            )
            await save.first().click({ force: true })
            const sawAcceptedResponse = await waitForCount(completions, 2)
            report.assert(sawAcceptedResponse, 'the substantive file-link proof reaches the backend')

            const acceptedCompletion = completions[1]
            report.assert(
                proofFrom(acceptedCompletion?.body ?? '') ===
                    'https://github.com/example/project/blob/main/tests/mission-104.test.js',
                'the browser submits the whitespace-padded file link trimmed',
            )
            report.assert(
                acceptedCompletion?.status === 200,
                'the backend accepts the trimmed substantive proof',
            )

            await sleep(300)
            const next = page.getByRole('button', { name: /^Next: Ship a real PR$/i })
            const hasNext = (await next.count()) > 0
            report.assert(hasNext, 'success offers Mission 105 as the next mission')
            if (hasNext) {
                await next.first().click({ force: true })
                await sleep(500)
            }
            report.assert(
                (await page.locator('main[aria-label^="Mission 105 "]').count()) > 0,
                'success advances to Mission 105',
            )

            await page.reload({ waitUntil: 'networkidle' })
            const cont = page.getByText(/Continue your missions/i)
            if (await cont.count()) {
                await cont.first().click({ force: true })
                await sleep(500)
            }
            await enterTree(page, 'Open Source')

            const previous = page.getByRole('button', {
                name: /Previous mission on this flight path/i,
            })
            const canReview104 =
                (await previous.count()) > 0 && !(await previous.first().isDisabled())
            report.assert(canReview104, 'Mission 104 can be revisited after reload')
            if (canReview104) {
                await previous.first().click({ force: true })
                await sleep(500)
            }

            const doTab = page.getByRole('tab', { name: /Do it/i })
            if (await doTab.count()) {
                await doTab.first().click({ force: true })
                await sleep(400)
            }
            const archivedProofs = await page.locator('pre').allTextContents()
            report.assert(
                archivedProofs.includes(
                    'https://github.com/example/project/blob/main/tests/mission-104.test.js',
                ),
                'the reloaded completion archive contains the exact trimmed Mission 104 proof',
            )
        }
    }
} catch (error) {
    report.bad(`the focused Mission 104 browser flow completes (${errorMessage(error)})`)
} finally {
    if (browser) await browser.close()
}

process.exit(report.finish() ? 0 : 1)
