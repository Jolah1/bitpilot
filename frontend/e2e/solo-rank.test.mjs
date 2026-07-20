/**
 * Smoke test: the solo Achievements view leads with the learner's selected
 * practical outcome and named capabilities. Catalogue-wide progress stays
 * behind an explicit disclosure.
 *
 *   node e2e/solo-rank.test.mjs
 */
import {
    API,
    APP,
    apiPost,
    ensureExplorerStub,
    launch,
    makeReporter,
    proofFor,
    sleep,
} from './_lib.mjs'

const report = makeReporter('solo-rank')

/**
 * Seed a solo-style run (sentinel session name) so the second tab is
 * "Achievements". Unlike seedParticipant, keeps the facilitator token:
 * the app needs it to read the session name that flags the run as solo.
 */
async function seedSolo(missions) {
    await ensureExplorerStub()
    const s = await apiPost('/sessions', { name: '__solo__' })
    const j = await apiPost('/participants', {
        name: 'Riko',
        session_id: s.session.id,
        journey_id: 'receive-payment',
        guidance: 'guided',
        session_minutes: 30,
        practice_mode: 'simulation',
    })
    for (const m of missions) {
        await apiPost('/missions/complete', { mission: m, proof: proofFor(m) }, j.auth_token)
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
            localStorage.setItem('bitpilot-journey', 'receive-payment')
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

const LIGHTNING_FOUNDATIONS = [21, 22, 80]

const browser = await launch()
try {
    const learner = await seedSolo(LIGHTNING_FOUNDATIONS)
    const page = await openAchievements(browser, learner)
    report.assert(
        (await page.getByText(/I can create and explain a Lightning invoice/i).count()) > 0,
        'the selected practical outcome is the progress headline',
    )
    report.assert(
        (await page.getByText(/^3\/4 steps$/i).count()) > 0,
        'progress is scoped to the selected journey',
    )
    report.assert(
        (await page.getByText(/Understands how a Lightning payment can move/i).count()) > 0,
        'a completed step is translated into a named capability',
    )
    report.assert(
        (await page.getByText(/Can create a Lightning invoice/i).count()) > 0,
        'the remaining capability is visible',
    )
    report.assert(
        (await page.getByRole('button', { name: /Show complete mission-library progress/i }).count()) > 0,
        'catalogue-wide progress is secondary and explicitly disclosed',
    )
    await page.close()
} finally {
    await browser.close()
}

process.exit(report.finish() ? 0 : 1)
