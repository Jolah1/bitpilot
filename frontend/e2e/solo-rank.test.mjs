/**
 * Smoke test: the solo Achievements view shows the overall rank ladder
 * (Cadet, Pilot, Captain, Commander) derived from earned flight paths,
 * with a plain-words line naming exactly which paths unlock the next rank.
 *
 *   node e2e/solo-rank.test.mjs
 */
import { API, APP, apiPost, launch, makeReporter, sleep } from './_lib.mjs'

const report = makeReporter('solo-rank')

/**
 * Seed a solo-style run (sentinel session name) so the second tab is
 * "Achievements". Unlike seedParticipant, keeps the facilitator token:
 * the app needs it to read the session name that flags the run as solo.
 */
async function seedSolo(missions) {
    const s = await apiPost('/sessions', { name: '__solo__' })
    const j = await apiPost('/participants', { name: 'Riko', session_id: s.session.id })
    for (const m of missions) {
        await apiPost('/missions/complete', { mission: m, proof: 'acknowledged' }, j.auth_token)
    }
    return {
        sid: s.session.id,
        pid: j.participant.id,
        token: j.auth_token,
        facToken: s.facilitator_token,
    }
}

async function openAchievements(browser, creds) {
    // Wide viewport: below 640px the view tabs hide behind the hamburger
    // menu, and this test wants the inline "Achievements" tab.
    const page = await browser.newPage({
        viewport: { width: 1100, height: 950 },
        reducedMotion: 'reduce',
    })
    await page.addInitScript(
        ([sid, pid, token, fac]) => {
            localStorage.setItem('bitpilot.auth_token', token)
            localStorage.setItem('bitpilot.session_id', sid)
            localStorage.setItem('bitpilot.participant_id', pid)
            localStorage.setItem('bitpilot.facilitator_token', fac)
        },
        [creds.sid, creds.pid, creds.token, creds.facToken],
    )
    await page.goto(APP, { waitUntil: 'networkidle' })
    const cont = page.getByText(/Continue your missions/i)
    if (await cont.count()) await cont.first().click({ force: true })
    await sleep(700)
    const tab = page.getByRole('button', { name: /^Achievements$/i })
    if (await tab.count()) {
        await tab.first().click({ force: true })
        await sleep(900)
    } else {
        report.bad('Achievements tab not found (solo detection failed?)')
    }
    return page
}

const MONEY = [0, 1, 77, 78, 2, 5, 9, 10]
const BITCOIN = [6, 7, 8, 87, 88, 18, 19, 89, 40, 90, 48, 49]

const browser = await launch()
try {
    // A fresh-ish learner (one beginner path done) is still a Cadet.
    const cadet = await seedSolo(MONEY)
    let page = await openAchievements(browser, cadet)
    report.assert(
        (await page.getByLabel('Your rank').getByText(/^Cadet$/).count()) > 0,
        'one beginner path done still shows Cadet',
    )
    report.assert(
        (await page.getByText(/Finish Bitcoin to make/i).count()) > 0,
        'the next-rank line names the missing beginner path',
    )
    await page.close()

    // Both beginner paths done: rank Pilot, next stop Captain.
    const pilot = await seedSolo([...MONEY, ...BITCOIN])
    page = await openAchievements(browser, pilot)
    report.assert(
        (await page.getByLabel('Your rank').getByText(/^Pilot$/).count()) > 0,
        'clearing both beginner paths makes Pilot',
    )
    report.assert(
        (await page.getByText(/Finish Lightning, Nostr and eCash to make/i).count()) > 0,
        'the next-rank line lists all intermediate paths for Captain',
    )
    report.assert(
        (await page.getByRole('listitem').filter({ hasText: /^Commander$/i }).count()) > 0,
        'the rank ladder shows the top rank',
    )
    await page.close()
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
