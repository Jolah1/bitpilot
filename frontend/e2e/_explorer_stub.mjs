/**
 * A tiny stand-in for an Esplora block explorer, so the e2e suite can seed
 * a learner past the missions that verify against live chain data
 * (mission 6 reads the block height, mission 51 reads the genesis
 * address's transaction count).
 *
 * Without this, seeding would need today's real block height and CI would
 * fail whenever a third-party explorer was slow, rate-limiting, or down.
 * Point the backend at this with:
 *
 *   BITPILOT_MAINNET_EXPLORERS=http://127.0.0.1:8099/api
 *
 * The backend still makes a real HTTP request and still compares the
 * learner's answer properly; only the chain data is fixed.
 */
import { createServer } from 'node:http'

/** Values the stub reports. `proofFor` in _lib.mjs must submit these. */
export const STUB_TIP_HEIGHT = 800000
export const STUB_GENESIS_TX_COUNT = 63700

const GENESIS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

/**
 * Start the stub once per process, and don't hold the process open with it.
 *
 * It has to live in whichever process is running the tests, not in
 * run.mjs: that runner uses spawnSync, which blocks the Node event loop
 * for the whole child run, so a server there would never get to accept a
 * connection.
 */
let stubPromise = null
export function ensureExplorerStub(port = 8099) {
    stubPromise ??= startExplorerStub(port).then((server) => {
        server.unref()
        return server
    })
    return stubPromise
}

export function startExplorerStub(port = 8099) {
    const server = createServer((req, res) => {
        const send = (code, body) => {
            res.writeHead(code, { 'content-type': 'application/json' })
            res.end(body)
        }
        if (req.url === '/api/blocks/tip/height') {
            return send(200, String(STUB_TIP_HEIGHT))
        }
        if (req.url === `/api/address/${GENESIS}`) {
            return send(
                200,
                JSON.stringify({
                    address: GENESIS,
                    chain_stats: { tx_count: STUB_GENESIS_TX_COUNT },
                    mempool_stats: { tx_count: 0 },
                }),
            )
        }
        send(404, '{"error":"not found"}')
    })
    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(server))
    })
}
