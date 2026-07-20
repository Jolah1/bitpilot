/** Smoke test: Pidgin is device-local, survives reload, and does not overflow mobile or desktop. */
import { APP, launch, makeReporter } from './_lib.mjs'

const report = makeReporter('language')
const browser = await launch()

try {
    for (const viewport of [{ width: 360, height: 800 }, { width: 1440, height: 900 }]) {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' })
        await page.addInitScript(() => localStorage.setItem('bitpilot-language', 'pcm'))
        await page.goto(APP, { waitUntil: 'networkidle' })
        report.assert(
            (await page.getByText(/do something wey useful/i).count()) > 0,
            `Pidgin hero renders at ${viewport.width}px`,
        )
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        report.assert(!overflow, `no horizontal overflow at ${viewport.width}px`)
        await page.reload({ waitUntil: 'networkidle' })
        report.assert(
            (await page.locator('select[aria-label="Language"]').inputValue()) === 'pcm',
            `device-only language choice survives reload at ${viewport.width}px`,
        )
        await page.close()
    }
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
