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