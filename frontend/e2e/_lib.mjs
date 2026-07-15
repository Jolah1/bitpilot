/**
 * Shared helpers for the BitPilot end-to-end smoke tests.
 *
 * These drive the real app in a real browser against a real backend. They
 * are deliberately small and dependency-light: playwright-core plus the
 * Google Chrome already installed on the machine (no bundled browser
 * download). See e2e/README.md for how to run them.
 *
 * The tests seed prerequisite mission completions through the API so a run
 * can land directly on the mission under test instead of playing the whole
 * curriculum. Because missions gate per tree, only a handful of prior
 * completions are ever needed.
 */
import crypto from 'node:crypto'

export const API = process.env.BP_API ?? 'http://localhost:8080/api'
export const APP = process.env.BP_APP ?? 'http://localhost:5173'

/** POST JSON to the backend, optionally as an authenticated participant. */
export async function apiPost(path, body, token) {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(API + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`)
    return res.json()
}

/**
 * Proof the backend will accept for a given mission number, mirroring
 * backend/src/routes/missions.rs:verify_proof. Only covers the kinds these
 * smoke tests need to seed past.
 */
export function proofFor(mission) {
    if (mission === 14) return 'npub1' + 'q'.repeat(50) // NostrIdentity: format-checked only
    if (mission === 11) return crypto.createHash('sha256').update('seed').digest('hex') // SeedWords: 64 hex
    return 'acknowledged' // Knowledge
}

/** Create a session, join it, and complete `prior` missions in order. */
export async function seedParticipant(priorMissions = []) {
    const s = await apiPost('/sessions', { name: 'E2E Smoke' })
    const sid = s.session.id
    const j = await apiPost('/participants', { name: 'E2E', session_id: sid })
    const token = j.auth_token
    const pid = j.participant.id
    for (const m of priorMissions) {
        await apiPost('/missions/complete', { mission: m, proof: proofFor(m) }, token)
    }
    return { sid, pid, token }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A tiny pass/fail collector so each script prints a clean summary. */
export function makeReporter(name) {
    const pass = []
    const fail = []
    return {
        ok(m) {
            pass.push(m)
            console.log('  PASS  ' + m)
        },
        bad(m) {
            fail.push(m)
            console.log('  FAIL  ' + m)
        },
        assert(cond, m) {
            cond ? this.ok(m) : this.bad(m)
        },
        finish() {
            console.log(`\n  ${name}: ${pass.length} passed, ${fail.length} failed`)
            return fail.length === 0
        },
    }
}

/**
 * Launch Chrome via playwright-core. Prefers the installed Google Chrome
 * (channel) so we do not download a browser; honour BP_CHROME to override.
 */
export async function launch() {
    const { chromium } = await import('playwright-core')
    const executablePath = process.env.BP_CHROME
    return chromium.launch(
        executablePath
            ? { executablePath, args: ['--no-sandbox'] }
            : { channel: 'chrome', args: ['--no-sandbox'] },
    )
}

/**
 * Open the app with the given credentials pre-seeded into localStorage and
 * click through to the learner view. `identity` optionally injects a Nostr
 * key/seed so identity-dependent screens behave.
 */
export async function openApp(browser, creds, identity = {}) {
    const page = await browser.newPage({
        viewport: { width: 430, height: 950 },
        // Kill the celebration's infinite animations so buttons are stable.
        reducedMotion: 'reduce',
    })
    await page.addInitScript(
        ([sid, pid, token, nsec, npub, seed]) => {
            localStorage.setItem('bitpilot.auth_token', token)
            localStorage.setItem('bitpilot.session_id', sid)
            localStorage.setItem('bitpilot.participant_id', pid)
            if (nsec) localStorage.setItem('bitpilot.nsec', nsec)
            if (npub) localStorage.setItem('bitpilot.npub', npub)
            if (seed) localStorage.setItem('bitpilot.seed_phrase', seed)
        },
        [creds.sid, creds.pid, creds.token, identity.nsec, identity.npub, identity.seed],
    )
    await page.goto(APP, { waitUntil: 'networkidle' })
    const cont = page.getByText(/Continue your missions/i)
    if (await cont.count()) await cont.first().click({ force: true })
    await sleep(700)
    return page
}

/** From the learner view, open a tree's current mission by label. */
export async function enterTree(page, treeLabel) {
    const back = page.getByRole('button', { name: /^Flight paths|← Flight paths/i })
    if (await back.count()) {
        await back.first().click({ force: true })
        await sleep(400)
    }
    // Scope to the picker section: the badge strip above it renders its own
    // buttons named after the same trees, and it pops in asynchronously once
    // badges load, so an unscoped `.first()` match is a race on slow runners.
    const picker = page.locator('[aria-label="Pick a flight path to learn"]')
    const card = picker.getByRole('button', { name: new RegExp(treeLabel, 'i') })
    // Click, then confirm we actually left the picker (the mission nav's
    // back button appears). Retry a few times to ride out hydration races.
    const navBack = page.getByRole('button', { name: /Back to flight paths/i })
    for (let attempt = 0; attempt < 5; attempt++) {
        if (await card.count()) await card.first().click({ force: true })
        await sleep(600)
        if (await navBack.count()) return
        await sleep(400)
    }
}

/**
 * Drive a single mission's Learn (wait out the dwell) and Quiz (pick the
 * option matching `correct`) steps, landing on the Do phase.
 */
export async function passLearnAndQuiz(page, correct, report) {
    const quizBtn = page.getByRole('button', { name: /take the quiz/i })
    let advanced = false
    // The dwell timer caps at 20s, so a 20s poll budget (40 x 500ms) races
    // it exactly and loses on a slow CI runner. Give it 30s of headroom.
    for (let i = 0; i < 60; i++) {
        if ((await quizBtn.count()) && !(await quizBtn.first().isDisabled())) {
            await quizBtn.first().click({ force: true })
            advanced = true
            break
        }
        await sleep(500)
    }
    report.assert(advanced, 'Learn dwell completed, advanced to the quiz')
    await sleep(400)
    const escaped = correct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const opt = page.getByRole('radio', { name: new RegExp(escaped, 'i') })
    if (await opt.count()) await opt.first().click({ force: true })
    else report.bad('correct quiz option not found')
    const submit = page.getByRole('button', { name: /submit answer/i })
    if (await submit.count()) await submit.first().click({ force: true })
    await sleep(1400)
}
