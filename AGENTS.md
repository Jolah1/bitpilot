# AGENTS.md

BitPilot: 5-mission Bitcoin/Lightning/Nostr learning app. Rust (axum) backend + React/Vite frontend. No tests, no CI, no README.

## Layout

Two independent projects, not a workspace:

- `backend/` — axum HTTP server, in-memory state, mock Lightning/Nostr
- `frontend/` — Vite + React 18 + TypeScript SPA

There is no root build script. Run commands inside the relevant directory.

## Commands

Backend (`cd backend`):
- `cargo run` — serves on `0.0.0.0:8080` (override with `PORT`). Health: `GET /api/health`.
- `cargo check` / `cargo build` — `cargo` is the only toolchain. No `rustfmt`/`clippy`/test config; there are no tests.
- Logging via `RUST_LOG`; default filter `bitpilot=debug,info`. Loads `.env` via `dotenvy` (`.env.example` is empty).

Frontend (`cd frontend`):
- `npm run dev` — Vite dev server. Proxies `/api/*` to `http://localhost:8080` (see `vite.config.ts:7`). Backend must be running or the landing flow fails with "Backend not reachable".
- `npm run build` — runs `tsc` then `vite build`. This is the only typecheck. There is no lint, no test runner.

Typical dev loop: start backend in one terminal, frontend in another.

## Backend architecture (non-obvious bits)

- Entrypoint: `backend/src/main.rs:32` — routers are nested at `/api/sessions`, `/api/participants`, `/api/missions`, and `/api` (lightning + nostr). The `/api` nest means Lightning routes are `/api/invoice`, `/api/pay`, `/api/nostr/identity`, `/api/nostr/publish` — not under `/api/lightning`.
- State: `AppState` (`backend/src/state.rs`) uses `std::sync::Mutex<HashMap<...>>` — **synchronous mutexes held across `.await` in some handlers**; pattern is `lock` → mutate → `drop` before any further `.lock()` to avoid deadlocks (see `routes/participants.rs:46`). Do not hold a lock across `.await`.
- Errors: `AppError::NotFound` is a unit variant (no message). Do not write `AppError::NotFound("...".into())`.
- Services `LightningService` / `NostrService` are **mock-only**. They fabricate strings from timestamps. Cargo features `real_lightning` and `real_nostr` are declared in `Cargo.toml` but not referenced anywhere yet.
- Missions are hardcoded in `backend/src/models/mission.rs` (5 missions, rewards 100/100/75/75/50 sats). Mission progression is strictly sequential: `complete_mission` rejects anything that isn't `participant.current_mission`.
- `backend/src/routes/race.rs` is a **draft, not wired up**. It is not declared in `routes/mod.rs` so it never compiles. It assumes a different `AppState` shape (`DashMap`, a `races` field, `AppError::NotFound(String)`). Either rewrite to match current state or delete — do not assume it works.

## Frontend architecture (non-obvious bits)

- Single `App.tsx` owns the landing → setup → app screen flow and calls `/api/sessions` + `/api/participants` directly with `fetch` (it bypasses `lib/api.ts`).
- `lib/api.ts` is the canonical API client used by views/hooks. Keep it in sync with backend route paths (see above; `/api/invoice` not `/api/lightning/invoice`).
- **Tailwind is configured but not used.** All components style with inline `style={{...}}` objects referencing CSS variables (`var(--bg)`, `var(--bitcoin)`, etc.) defined imperatively in `lib/theme.ts` on `document.documentElement`. There is no `index.css` Tailwind layer in use. Match this style when editing existing components; do not introduce `className="bg-..."` without aligning with the rest of the codebase.
- Theme persistence key is `satquest-theme` in `localStorage` (legacy name).
- React Query is set up (`QueryClientProvider` in `App.tsx`) but most data flow is plain `fetch`/`useEffect`.

## Conventions

- Backend uses 4-space indent, snake_case JSON fields (`session_id`, `amount_sats`, `participant_id`). Frontend must serialize accordingly.
- All persistence is in-memory; restarting the backend wipes sessions and participants. Don't add tests assuming durability.
- No formatter config committed — match surrounding style when editing.

## Things to avoid

- Don't run anything from the repo root expecting it to do both projects; there is no orchestrator.
- Don't trust `routes/race.rs` as the source of truth for any data model.
- Don't add Tailwind classes to existing components without converting the whole component; the runtime CSS-variable theme will not match Tailwind colors.
- Don't hold a `Mutex` guard from `AppState` across `.await`.
