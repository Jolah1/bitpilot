/**
 * Breakpoint screenshot sweep (issue #19).
 *
 * Captures the key screens at phone / tablet / desktop widths in both
 * themes and writes PNGs to e2e/screenshots/ (gitignored). This is a
 * manual review tool, not a CI gate: run it before shipping UI work and
 * eyeball the grid.
 *
 *   cd frontend && BP_CHROME=/usr/bin/google-chrome node e2e/screenshot-sweep.mjs
 *
 * Needs the backend on :8080 and the app on :5173, same as the smoke tests.
 */
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { APP, apiPost, seedParticipant, launch, sleep } from './_lib.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
    { name: 'phone', width: 360, height: 740 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
]
const THEMES = ['light', 'dark']

// One participant with some progress for the app screens, and one live
// challenge so the landing section and public page have content.
const creds = await seedParticipant([0, 1, 77])
const nowS = Math.floor(Date.now() / 1000)
const challenge = await apiPost('/challenges', {
    title: 'Sweep sample challenge',
    blurb: 'Fixture for the screenshot sweep.',
    missions: [21, 22, 23, 24],
    starts_at: nowS - 3600,
    ends_at: nowS + 6 * 86400,
})

/**
 * Each shot: a name plus a prepare(page) that navigates to the screen.
 * Shots that need credentials read them from the closure above.
 */
const SHOTS = [
    {
        name: 'landing',
        fullPage: true,
        async prepare(page) {
            await page.goto(APP, { waitUntil: 'networkidle' })
        },
    },
    {
        name: 'onboarding-mode',
        async prepare(page) {
            await page.goto(APP, { waitUntil: 'networkidle' })
            await page.getByRole('button', { name: /Start Learning Bitcoin|Start fresh/i }).first().click()
            await sleep(400)
        },
    },
    {
        name: 'onboarding-goal',
        async prepare(page) {
            await page.goto(APP, { waitUntil: 'networkidle' })
            await page.getByRole('button', { name: /Start Learning Bitcoin|Start fresh/i }).first().click()
            await sleep(300)
            await page.getByRole('button', { name: /Learn solo/i }).first().click()
            await sleep(400)
        },
    },
    {
        name: 'flight-path-picker',
        fullPage: true,
        creds: true,
        async prepare(page) {
            await page.goto(APP, { waitUntil: 'networkidle' })
            const cont = page.getByText(/Continue your missions/i)
            if (await cont.count()) await cont.first().click({ force: true })
            await sleep(900)
        },
    },
    {
        name: 'challenge-page',
        fullPage: true,
        async prepare(page) {
            await page.goto(`${APP}/?challenge=${challenge.challenge.id}`, {
                waitUntil: 'networkidle',
            })
            await sleep(600)
        },
    },
    {
        name: 'challenge-create',
        fullPage: true,
        async prepare(page) {
            await page.goto(APP, { waitUntil: 'networkidle' })
            await page.getByRole('button', { name: /Run a weekly challenge/i }).first().click()
            await sleep(500)
        },
    },
]

const browser = await launch()
let count = 0
for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
        for (const shot of SHOTS) {
            const page = await browser.newPage({
                viewport: { width: vp.width, height: vp.height },
                reducedMotion: 'reduce',
                colorScheme: theme,
            })
            await page.addInitScript(
                ([t, useCreds, sid, pid, token]) => {
                    localStorage.setItem('bitpilot-theme', t)
                    if (useCreds) {
                        localStorage.setItem('bitpilot.auth_token', token)
                        localStorage.setItem('bitpilot.session_id', sid)
                        localStorage.setItem('bitpilot.participant_id', pid)
                    }
                },
                [theme, !!shot.creds, creds.sid, creds.pid, creds.token],
            )
            try {
                await shot.prepare(page)
                const file = join(OUT, `${shot.name}--${vp.name}-${vp.width}--${theme}.png`)
                await page.screenshot({ path: file, fullPage: !!shot.fullPage })
                count++
                console.log(`  shot ${shot.name} @ ${vp.name}/${theme}`)
            } catch (e) {
                console.error(`  FAILED ${shot.name} @ ${vp.name}/${theme}: ${e.message}`)
            } finally {
                await page.close()
            }
        }
    }
}
await browser.close()
console.log(`\n${count} screenshots in ${OUT}`)
