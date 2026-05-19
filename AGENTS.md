# AGENTS.md

BitPilot. Two independent projects, not a workspace.

## Layout

- `backend/` — Rust (axum, sqlx + SQLite). Run from `backend/`.
- `frontend/` — React + Vite + TypeScript. Run from `frontend/`.

No root build script. `cd` into the right directory first.

## Commands

Backend (`cd backend`):

- `cargo run` — serves on `0.0.0.0:8080`. Override with `PORT`.
- `cargo check` / `cargo build` — no tests, no formatter.
- Env vars documented in `backend/.env.example`.

Frontend (`cd frontend`):

- `npm run dev` — Vite dev server on `:5173`, proxies `/api/*` to `:8080`.
- `npm run build` — runs `tsc` then `vite build`. This is the only typecheck.

## Mission lists must match

Mission catalogue lives in two places:

- `backend/src/models/mission.rs` — number, tech, reward, simulated flag.
- `frontend/src/lib/types.ts` — number, learn/quiz/do copy.

Adding or removing a mission means editing **both** files. Numbers must line
up — there is no runtime check enforcing it.
