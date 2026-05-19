# AGENTS.md

BitPilot: 10-mission Bitcoin/Lightning/Nostr/eCash learning app. Rust (axum) backend + React/Vite frontend. No tests, no CI, no README.

## Layout

Two independent projects, not a workspace:

- `backend/` — axum HTTP server, in-memory state, **real Nostr** (nostr-sdk), **real Cashu** (cdk against a testmint), **optional real Lightning** (LNbits)
- `frontend/` — Vite + React 18 + TypeScript SPA

There is no root build script. Run commands inside the relevant directory.

## Commands

Backend (`cd backend`):
- `cargo run` — serves on `0.0.0.0:8080` (override with `PORT`). Health: `GET /api/health`.
- `cargo check` / `cargo build` — `cargo` is the only toolchain. No `rustfmt`/`clippy`/test config; there are no tests.
- Logging via `RUST_LOG`; default filter `bitpilot=debug,info`. Loads `.env` via `dotenvy` — see `.env.example` for all knobs.
- Env vars that change behaviour:
  - `NOSTR_RELAYS` — comma-separated wss:// relay URLs (default: relay.damus.io, nos.lol, relay.nostr.band).
  - `CASHU_MINT_URL` — Cashu mint URL (default: `https://testnut.cashu.space`, a public testmint that auto-pays invoices).
  - `LNBITS_URL` + `LNBITS_ADMIN_KEY` — when **both** are set, Lightning routes hit a real LNbits instance over HTTP. When **either** is blank, Lightning stays simulated. There is no half-real mode.

Frontend (`cd frontend`):
- `npm run dev` — Vite dev server. Proxies `/api/*` to `http://localhost:8080` (see `vite.config.ts:7`). Backend must be running or session creation fails with a clear "Can't reach the BitPilot backend" message.
- `npm run build` — runs `tsc` then `vite build`. This is the only typecheck. There is no lint, no test runner.

Typical dev loop: start backend in one terminal, frontend in another.

## Backend architecture (non-obvious bits)

- Entrypoint: `backend/src/main.rs` mounts: `/api/health`, `/api/runtime`, and nested routers at `/api/sessions`, `/api/participants`, `/api/missions`, and `/api` (which hosts `invoice`, `pay`, `nostr/*`, `ecash/*`). The flat-under-`/api` nest means Lightning routes are `/api/invoice`, `/api/pay` — NOT under `/api/lightning`.
- `GET /api/runtime` — returns `{lightning_real, ecash_real, ecash_mint_url, nostr_relays}`. The frontend polls this once and uses it to drive the per-mission "Testnet"/"Testmint"/"Simulated" badges. Do not remove this endpoint without also updating `frontend/src/lib/runtime.tsx`.
- State: `AppState` (`backend/src/state.rs`) uses `std::sync::Mutex<HashMap<...>>` — **synchronous mutexes**. Never hold a `MutexGuard` across `.await`. See `routes/participants.rs:94` for the lock pattern (scoped block → drop → next lock).
- Errors: `AppError::NotFound` is a unit variant (no message). Do not write `AppError::NotFound("...".into())`.
- **`NostrService` is real.** It uses `nostr-sdk` to generate real secp256k1 keypairs (bech32 `npub`/`nsec`, 63 chars) and signs+publishes kind-1 notes to public relays. Publish response includes `relays: Vec<String>` so the UI can show which relays accepted the event. `simulated: false` always.
- **`EcashService` is real** (against a Cashu testmint via the `cdk` crate). One process-wide hot wallet, lazily initialized on first call, in-memory `cdk-sqlite` store. Mints produce real V4 `cashuB…` tokens any Cashu wallet can read. Note the testmint charges a 1-sat fee, so minting 21 sats and redeeming returns 20 sats — that's authentic mint behaviour, not a bug.
- **`LightningService`** is real when `LNBITS_URL` + `LNBITS_ADMIN_KEY` are both set in env; otherwise simulated. The simulated branch returns plausible-looking BOLT11 strings derived from timestamps so the learner flow doesn't deadlock. `LightningService.simulated: bool` exposes the runtime state to routes.
- **Every response from `/api/invoice`, `/api/pay`, `/api/ecash/mint`, `/api/ecash/redeem`** carries a `simulated: bool` reflecting the live state. The frontend uses this to render the per-result "Simulated" vs "Real" badge.
- **`list_missions` rewrites the `simulated` flag** on each mission based on the live `AppState` before serialising. So `GET /api/missions` is authoritative about what's currently real.
- Missions are hardcoded in `backend/src/models/mission.rs` (**10 missions**, rewards summed): Bitcoin x3, Nostr x3, Lightning x2, eCash x2. Mission progression is strictly sequential: `complete_mission` rejects anything that isn't `participant.current_mission`. Each mission has a `simulated: bool` field driven by which service it touches (rewritten by the route).
- The `proof` field on `POST /api/missions/:pid/complete` is still accepted but ignored. Add validation here if you want real proof-of-completion (signed event id, payment hash, etc).

## Frontend architecture (non-obvious bits)

- Single `App.tsx` owns the landing → setup → app screen flow. It now goes through `lib/api.ts` (no more raw `fetch`).
- `lib/api.ts` is the canonical API client. Throws `ApiError` with `status` so callers can branch on it. Keep paths in sync with backend (`/api/invoice` not `/api/lightning/invoice`).
- `lib/runtime.tsx` exposes a `RuntimeProvider` (wraps the whole app inside `App.tsx`) and two hooks: `useRuntime()` (raw runtime info) and `useIsTechReal(tech)` (boolean per tech). Components that need to render a "Simulated" vs "Testmint"/"Testnet" badge should use these hooks rather than the static `simulated` field on `MissionDef` (which is documentation-only now — see the comment in `lib/types.ts`).
- `lib/types.ts` is the **single source of truth on the frontend** for the 10-mission catalogue: emoji, topic, tech, learn copy, quiz options, and the `DoKind` discriminated union that drives which API call the "Do" phase makes. Mission ids 1–10 must match backend `Mission::number`.
- `lib/ui.ts` holds shared inline-style helpers (`card`, `primaryButton(disabled)`, `chip(tone)`, `callout(tone)`, `techGradient(tech)`, etc.) so every view uses the same tokens. New components should reach for these helpers before writing fresh inline styles.
- **Tailwind has been removed.** All components style with inline `style={{...}}` objects referencing CSS variables (`var(--bg)`, `var(--bitcoin)`, `var(--gradient-bitcoin)`, etc.) defined in `lib/theme.ts` and as fallbacks in `index.css`. Do not reintroduce Tailwind without converting the whole codebase.
- Fonts: self-hosted via `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`, imported at the top of `index.css`. `var(--font-sans)` for UI, `var(--font-mono)` for keys/IDs/tokens.
- Gradient tokens: `--gradient-bitcoin`, `--gradient-lightning`, `--gradient-nostr`, `--gradient-ecash`, `--gradient-hero`. Use sparingly for accents/CTAs, never for body text. There's a `.gradient-text` utility class in `index.css` for headline accents.
- Theme persistence key is `bitpilot-theme` in `localStorage` (legacy `satquest-theme` migrated automatically). First-visit default honours OS `prefers-color-scheme`.
- React Query is set up (`QueryClientProvider` in `App.tsx`) and used by `FacilitatorDashboard.tsx` to poll `fetchSessionProgress` every 3s, and by `RuntimeProvider` to fetch `/api/runtime` once on mount. Most other data flow is direct `api.*` calls inside `useState`/`async`.
- Accessibility: skip-to-content link (`.skip-link` in `index.css`), `:focus-visible` rings on every interactive element, `prefers-reduced-motion` overrides, semantic landmarks (`<main>`, `<nav>`, `<header>`), ARIA roles on the phase tabs and quiz radio group, `aria-live` regions on result blocks.

## Conventions

- Backend uses 4-space indent, snake_case JSON fields (`session_id`, `amount_sats`, `participant_id`). Frontend must serialize accordingly.
- All persistence is in-memory; restarting the backend wipes sessions, participants, AND the Cashu wallet's proofs. Don't add tests assuming durability.
- No formatter config committed — match surrounding style when editing.
- When adding a mission, **add it to both** `backend/src/models/mission.rs` (with `tech` + `simulated`) and `frontend/src/lib/types.ts` (with learn/quiz/do). Numbers must line up.

## Things to avoid

- Don't run anything from the repo root expecting it to do both projects; there is no orchestrator.
- Don't claim simulated services are real in UI copy, response payloads, or commit messages. The `simulated: bool` flag exists specifically to keep us honest.
- Don't hold a `Mutex` guard from `AppState` across `.await`.
- Don't drop the `simulated` flag from any LN or eCash response when refactoring — the UI relies on it.
- Don't bypass `lib/api.ts` with raw `fetch` calls — error handling and `ApiError` will be inconsistent.
- Don't read `MissionDef.simulated` to decide what to render — use `useIsTechReal(tech)` instead. The static field is documentation only.
- Don't point `CASHU_MINT_URL` at a mainnet Cashu mint without the user explicitly asking. Default behaviour must remain "no real money at risk".
