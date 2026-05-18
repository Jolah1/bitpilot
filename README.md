# ⚡ BitPilot

> **Hands-on Bitcoin onboarding** — participants learn by actually doing. Real Lightning. Real Nostr. Real eCash. No prior knowledge needed.

---

## What is BitPilot?

BitPilot is an open-source, facilitated onboarding experience for Bitcoin. A facilitator runs a session — at a meetup, workshop, school, or online — and participants work through  hands-on missions using real Bitcoin technology.

This is **not** a course. There are no videos to watch or slides to read. Every mission ends with a real action:

- A real Lightning invoice
- A real sat payment
- A real Nostr note on the network
- A real eCash token

By the end, someone who has never touched Bitcoin has sent and received real money, created an uncensorable identity, and published a permanent message — in under 15 minutes.

---

## The 5 missions

Each mission has three mandatory phases — **Read → Quiz → Do**. You cannot skip ahead.

| # | Mission | What the participant actually does |
|---|---------|-----------------------------------|
| 1 | 🪪 **Get your Bitcoin ID** | Generate a real Nostr keypair (npub/nsec) |
| 2 | 📥 **Receive real Bitcoin** | Create a Lightning invoice and receive sats |
| 3 | 📤 **Send 50 sats** | Pay a Lightning address |
| 4 | 🎟️ **Claim a secret token** | Receive and redeem a Cashu eCash token |
| 5 | 📢 **Post your first note** | Publish a signed Nostr note to the network |

---

## Who is this for?

- **Participants** — anyone. Your mum, your neighbour, a student, a market trader. No prior knowledge needed.
- **Facilitators** — Bitcoin meetup organisers, educators, community leaders, anyone running a Bitcoin onboarding session.
- **Developers** — the backend is Rust + Axum, the frontend is React + TypeScript. Mock mode means you can run everything locally with zero external dependencies.

---

## Quick start

You need two terminals.

### Terminal 1 — Backend

```bash
git clone https://github.com/Jolah1/bitpilot.git
cd bitpilot/backend
cargo run
# → Listening on http://localhost:8080
```

### Terminal 2 — Frontend

```bash
cd bitpilot/frontend
npm install
npm run dev
# → http://localhost:5173
```

Open `http://localhost:5173` in your browser. Enter a session name and your name. Start Mission 1.

> No Lightning node, no Nostr relay, no wallet required. Everything runs in mock mode by default.

---

## How a session works

```
Facilitator creates session
        ↓
Participants join via link or QR code
        ↓
Everyone works through 5 missions independently
        ↓
Facilitator dashboard shows live progress
        ↓
Optional: race mechanic — first to finish wins a sat prize
```

The facilitator dashboard updates every 3 seconds. It shows each participant's name, which mission they're on, and their phase (Read / Quiz / Do).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust · Axum · Tokio |
| Lightning | `ldk-node` (mock by default) |
| Nostr | `nostr-sdk` (mock by default) |
| eCash | Cashu protocol |
| Frontend | React 18 · TypeScript · Vite |
| Styling | Tailwind · CSS variables · dark/light theme |
| State | React Query |
| QR codes | `qrcode` npm package |

---

## Project structure

```
bitpilot/
├── backend/
│   └── src/
│       ├── main.rs               # Axum server + routes
│       ├── state.rs              # AppState
│       ├── error.rs              # Error handling
│       ├── models/               # Session, Participant, Mission
│       ├── services/
│       │   ├── ldk_service.rs    # Lightning (mock + real)
│       │   └── nostr_service.rs  # Nostr (mock + real)
│       └── routes/
│           ├── participants.rs   # Sessions + participants
│           ├── missions.rs       # Mission completion
│           ├── lightning.rs      # Invoice, pay, nostr
│           └── race.rs           # Race mechanic
└── frontend/
    └── src/
        ├── App.tsx               # Landing + setup + app shell
        ├── views/
        │   ├── LearnerView.tsx   # 5-mission participant flow
        │   └── FacilitatorDashboard.tsx
        ├── components/
        │   ├── QRJoinFlow.tsx    # QR card + join page
        │   └── ThemeToggle.tsx
        └── lib/
            ├── api.ts            # All backend calls
            └── types.ts          # Shared types
```

---

## Enabling real Lightning (signet / Mutinynet)

```bash
cd backend
USE_MOCK=false \
  LDK_NETWORK=signet \
  LDK_ESPLORA_URL=https://mutinynet.com/api \
  LDK_STORAGE_DIR=./ldk-data \
  cargo run --features real_lightning
```

Get free signet coins at [faucet.mutinynet.com](https://faucet.mutinynet.com).

---

## Enabling real Nostr

```bash
cd backend
USE_MOCK=false \
  NOSTR_RELAY_URL=wss://relay.damus.io \
  cargo run --features real_nostr
```

Published notes appear on [nostr.band](https://nostr.band) within seconds.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_MOCK` | `true` | Use mock services (no external deps) |
| `PORT` | `8080` | Backend port |
| `LDK_NETWORK` | `signet` | Bitcoin network |
| `LDK_ESPLORA_URL` | `https://mutinynet.com/api` | Esplora endpoint |
| `LDK_STORAGE_DIR` | `./ldk-data` | Node data directory |
| `NOSTR_RELAY_URL` | `wss://relay.damus.io` | Nostr relay |

---

## API reference

### Sessions
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create session |
| `GET` | `/api/sessions/:id` | Get session |
| `GET` | `/api/sessions/:id/participants` | List participants |

### Participants
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/participants` | Join session |
| `GET` | `/api/participants/:id` | Get participant |

### Missions
| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/missions/:id/complete` | `{ mission, proof? }` |

### Lightning + Nostr
| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/invoice` | `{ participant_id, amount_sats, description }` |
| `POST` | `/api/pay` | `{ participant_id, invoice }` |
| `POST` | `/api/nostr/identity` | `{ participant_id }` |
| `POST` | `/api/nostr/publish` | `{ participant_id, content, nsec }` |

---

## Contributing

Contributions are welcome. Please open an issue before starting large changes.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with clear messages: `git commit -m "feat: add leaderboard"`
4. Push and open a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details.

---

## Roadmap

- [ ] SQLite persistence (sessions survive restarts)
- [ ] Docker Compose (one-command setup)
- [ ] Real Cashu token minting (`cashu-ts`)
- [ ] WebSocket push for live dashboard (replace polling)
- [ ] Deployed demo (Vercel + Fly.io)
- [ ] `CONTRIBUTING.md`
- [ ] GitHub Actions CI (`cargo clippy` + `npm run build`)
- [ ] Leaderboard by completion time
- [ ] Multi-language support

---

## License

MIT — see [LICENSE](LICENSE).

---

