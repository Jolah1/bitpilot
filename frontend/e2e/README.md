# End-to-end smoke tests

Browser-driven checks for the highest-stakes, safety-critical UX in BitPilot.
They drive the real app in a real browser against a real backend and assert
on what the learner actually sees.

## What they cover

| File | Guards |
| --- | --- |
| `secret-reveal.test.mjs seed` | Seed phrase (mission 11): secret hidden behind a reveal, no server-commitment line, Next gated by a save confirmation |
| `secret-reveal.test.mjs nostrid` | Nostr identity (mission 14): same reveal + save gate on the `nsec` |
| `publish-confirm.test.mjs` | Publishing a Nostr note (mission 26): public/permanent confirmation before broadcast, with a go-back path |
| `badge-share.test.mjs` | Tree completion: badge celebration, `Share to Nostr` option, and a public-post confirmation |

## Requirements

- **Backend** running on `:8080`, pointed at the explorer stub:

  ```
  cd backend && BITPILOT_MAINNET_EXPLORERS=http://127.0.0.1:8099/api cargo run
  ```

  Missions 6 and 51 verify a learner's answer against a live block
  explorer (the current block height, and the genesis address's
  transaction count). Seeding a participant past them would otherwise
  need today's real chain data, so `_explorer_stub.mjs` serves fixed
  values and `proofFor` submits them. Without that env var the backend
  asks the real explorers and seeding fails with "that is not the current
  tip".
- **Frontend** running on `:5173` (`cd frontend && npm run dev`)
- **Google Chrome** installed (the tests use `playwright-core` with the
  system Chrome, so no browser is downloaded)

## Run

```bash
cd frontend
npm run test:e2e          # all of them, with a fail-fast server check
node e2e/badge-share.test.mjs   # or one at a time
```

## Visual sweep (manual)

`screenshot-sweep.mjs` captures the key screens (landing, onboarding steps,
flight path picker, challenge page, challenge creation) at phone, tablet,
and desktop widths in both themes, writing PNGs to `e2e/screenshots/`
(gitignored). It is a review tool for UI work, not a CI gate:

```bash
node e2e/screenshot-sweep.mjs   # servers must be running, like the tests
```

## How they stay fast

Missions gate per tree, so each test seeds only the handful of prior
completions in the target tree through the API, then lands directly on the
mission under test. Credentials are injected into `localStorage` so the app
rehydrates straight into the learner view.

## Environment overrides

| Variable | Default | Purpose |
| --- | --- | --- |
| `BP_API` | `http://localhost:8080/api` | Backend base URL |
| `BP_APP` | `http://localhost:5173` | Frontend URL |
| `BP_CHROME` | (uses installed Chrome) | Explicit Chrome executable path |

## Maintenance note

These are smoke tests, not a full suite. They hard-code each target
mission's correct quiz answer, so if the curriculum content for missions 10,
11, 14, or 26 changes, update the `correct` strings here to match.
