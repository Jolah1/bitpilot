# BitPilot

> Learn Bitcoin by using it.

BitPilot is a beginner-friendly onboarding app that teaches:
- Bitcoin
- Lightning
- Nostr
- eCash

through short interactive missions.

Instead of long explanations, users learn by:
- sending payments
- scanning QR codes
- creating identities
- completing simple tasks

Built for:
- workshops
- hackathons
- classrooms
- communities
- self-learning

---

## Features

- Mission-based onboarding
- Learn → Quiz → Do flow
- Real Lightning & Nostr interactions
- Facilitator dashboard
- Beginner-friendly UX
- SQLite-powered backend
- Rust + React stack

---

## Stack

### Backend
- Rust
- Axum
- SQLx
- SQLite

### Frontend
- React
- TypeScript
- Vite

---

## Running Locally

### Backend

```bash
cd backend
cargo run
```

Runs on:

```text
http://localhost:8080
```

---

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on:

```text
http://localhost:5173
```

---

## Project Structure

```text
bitpilot/
├── backend/     Rust API server
├── frontend/    React frontend
└── README.md
```

---

## Current Status

BitPilot currently uses:
- simulated rewards
- optional LNbits integration
- SQLite local storage

No real funds are required to use the app.

---

## Running a weekly challenge

A challenge is a themed public leaderboard over a mission subset and a time window. The easiest way to create one is the app itself: open the landing page, scroll to "Community challenges", and hit "Run a weekly challenge". The form offers the theme presets below, shows the share link, and displays the facilitator token once.

Prefer scripting it? The same endpoint takes a single request (creation is open, like session creation; rate limiting controls abuse):

```bash
curl -s -X POST https://<your-backend>/api/challenges \
  -H 'content-type: application/json' \
  -d '{
    "title": "Lightning week",
    "blurb": "Receive and send your first Lightning payment.",
    "missions": [21, 22, 23, 24],
    "starts_at": 1760000000,
    "ends_at": 1760604800
  }'
```

The response contains the challenge `id` (share `https://<your-app>/?challenge=<id>` as the public page; it shows the missions, a join button while live, and the read-only leaderboard) and a `facilitator_token` for the live facilitator dashboard of the backing session. Completions count only between `starts_at` and `ends_at` (unix seconds).

Theme ideas that map cleanly onto the catalogue:

| Theme | Missions |
| --- | --- |
| Understand a transaction | `[6, 7, 19]` |
| First Lightning payment | `[21, 22, 23, 24]` |
| Publish your first note | `[13, 14, 26]` |
| Seed phrase bootcamp | `[11, 12, 41]` |

---

## Vision

BitPilot aims to make Bitcoin onboarding:
- simple
- interactive
- practical
- beginner-friendly

especially for communities that are new to Bitcoin and Lightning.

---

## License

MIT License.