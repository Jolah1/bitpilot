/**
 * Run every BitPilot e2e smoke test in sequence and report a combined
 * result. Each test is a separate process so one crash can't take the
 * others down. Requires the backend (:8080) and frontend (:5173) running,
 * plus Google Chrome installed. See README.md.
 *
 *   npm run test:e2e
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const suite = [
    ['secret-reveal.test.mjs', 'seed'],
    ['secret-reveal.test.mjs', 'nostrid'],
    ['sign-event.test.mjs'],
    ['review-archive.test.mjs'],
    ['publish-confirm.test.mjs'],
    ['badge-share.test.mjs'],
    ['passphrase-fork.test.mjs'],
    ['mission-prose.test.mjs'],
    ['solo-rank.test.mjs'],
]

// Fail fast with a clear message if the servers aren't up.
const API = process.env.BP_API ?? 'http://localhost:8080/api'
try {
    const r = await fetch(API + '/runtime')
    if (!r.ok) throw new Error(String(r.status))
} catch {
    console.error(
        `\nCannot reach the backend at ${API}.\n` +
            'Start it first:  (backend) cargo run   (frontend) npm run dev\n',
    )
    process.exit(2)
}

// NOTE: the explorer stub for missions 6 and 51 is started inside each
// test process (see _lib.mjs), not here. spawnSync below blocks this
// process's event loop for the whole child run, so a server started here
// would never accept a connection.

let failed = 0
for (const [file, ...args] of suite) {
    console.log(`\n=== ${file} ${args.join(' ')} ===`)
    const res = spawnSync('node', [join(here, file), ...args], { stdio: 'inherit' })
    if (res.status !== 0) failed++
}

console.log(`\n${failed === 0 ? 'ALL PASSED' : failed + ' TEST FILE(S) FAILED'}`)
process.exit(failed === 0 ? 0 : 1)
