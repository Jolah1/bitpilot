# ⚡ SatQuest

> A live, learn-by-doing onboarding platform for Bitcoin meetups.

Participants don't just *learn* Bitcoin — they *use* it. Complete missions, earn real sats, and unlock the next level only when you've actually done the thing.

Built with **Rust + React** for [Hack4Freedom](https://hack4freedom.com).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + Tailwind + Framer Motion |
| Backend | Rust + Axum |
| Lightning | ldk-node |
| Nostr | nostr-sdk |
| eCash | Cashu Dev Kit (cdk) |

---

## Missions

| # | Mission | Tech | Reward |
|---|---|---|---|
| 1 | Generate your Nostr identity | Nostr | 100 sats |
| 2 | Receive sats via Lightning | Lightning | 100 sats |
| 3 | Send sats to a peer | Lightning | 75 sats |
| 4 | Receive a private eCash token | Cashu | 75 sats |
| 5 | Post your first Nostr note | Nostr | 50 sats |

---

## Getting started

### Backend (Rust)

```bash
cd backend
cp .env.example .env
cargo run
# Server runs on http://localhost:8080
```

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

---

## Project structure

```
satquest/
├── backend/
│   ├── src/
│   │   ├── main.rs        # Axum server setup
│   │   ├── routes.rs      # All API endpoints
│   │   ├── state.rs       # Shared app state & types
│   │   ├── lightning.rs   # LDK-node integration
│   │   ├── nostr.rs       # nostr-sdk integration
│   │   └── error.rs       # Error handling
│   ├── Cargo.toml
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── views/
    │   │   ├── LearnerView.tsx         # Mission flow UI
    │   │   └── FacilitatorDashboard.tsx # Live session monitor
    │   ├── components/
    │   │   └── MissionCard.tsx
    │   └── lib/
    │       ├── api.ts     # All backend calls
    │       └── types.ts   # Shared TypeScript types
    └── package.json
```

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sessions` | Create a facilitator session |
| GET | `/api/sessions/:id` | Get session + stats |
| GET | `/api/sessions/:id/participants` | List all participants |
| POST | `/api/participants` | Join a session |
| POST | `/api/participants/:id/mission/complete` | Mark mission done |
| POST | `/api/lightning/invoice` | Generate Lightning invoice |
| POST | `/api/lightning/pay` | Pay a Lightning invoice |
| POST | `/api/nostr/identity` | Generate Nostr keypair |
| POST | `/api/nostr/publish` | Publish a Nostr note |

---

## Development notes

Both `lightning.rs` and `nostr.rs` have a `USE_MOCK = true` flag at the top. This means the app runs fully without an LDK node or Nostr relay — perfect for building the UI first.

When you're ready to go live:
1. Set `USE_MOCK = false`
2. Fill in your `.env` values
3. Uncomment the real SDK calls in each module

---

## License

MIT — build freely. 🧡