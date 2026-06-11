use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MissionStatus {
    Locked,
    Active,
    Completed,
}

/// Five learning tiers. The (number, tier) mapping lives on the backend so
/// the frontend can't drift — the backend is the only source of truth.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Novice,
    Apprentice,
    Pilot,
    Navigator,
    Captain,
}

impl Tier {
    pub fn from_mission(number: u8) -> Tier {
        match number {
            0..=10 => Tier::Novice,
            11..=20 => Tier::Apprentice,
            21..=30 => Tier::Pilot,
            31..=40 => Tier::Navigator,
            _ => Tier::Captain, // 41..=50
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mission {
    /// Mission number. **Starts at 0** (the Novice tier opens here). The
    /// frontend uses the same numbering — see `frontend/src/lib/types.ts`.
    pub number: u8,
    pub title: String,
    pub description: String,
    /// One of: "bitcoin" | "lightning" | "nostr" | "ecash"
    pub tech: String,
    pub status: MissionStatus,
    pub tier: Tier,
    /// True if the underlying service is a simulation (no real network call).
    /// The frontend uses this to render a clear "Simulated — demo mode" badge.
    pub simulated: bool,
}

/// Compact descriptor: (number, title, description, tech, simulated_default).
/// Tier is computed via `Tier::from_mission` so the table stays short and
/// adding/removing a mission is a one-line edit.
struct Row {
    number: u8,
    title: &'static str,
    description: &'static str,
    tech: &'static str,
    simulated: bool,
}

const CATALOGUE: &[Row] = &[
    // ── Tier 1 — Novice (0-10) ─────────────────────────────────────────
    Row { number: 0,  title: "Welcome aboard",                tech: "bitcoin",   simulated: false, description: "Five minutes on why this exists. No prior knowledge needed." },
    Row { number: 1,  title: "What is Bitcoin?",              tech: "bitcoin",   simulated: false, description: "Money that no government, bank, or company controls." },
    Row { number: 2,  title: "Sats, the unit of account",     tech: "bitcoin",   simulated: false, description: "1 bitcoin = 100,000,000 satoshis. Think in sats." },
    Row { number: 3,  title: "What a wallet actually is",     tech: "bitcoin",   simulated: false, description: "It doesn't hold coins. It holds the keys that authorize moving entries." },
    Row { number: 4,  title: "Addresses: your inbox for sats",tech: "bitcoin",   simulated: false, description: "Long string. Infinite supply. Free to make." },
    Row { number: 5,  title: "Permissionless money",          tech: "bitcoin",   simulated: false, description: "Why nobody has to approve your transaction." },
    Row { number: 6,  title: "Blocks and confirmations",      tech: "bitcoin",   simulated: false, description: "Why people say '1 confirmation' or '6'." },
    Row { number: 7,  title: "Fees and the mempool",          tech: "bitcoin",   simulated: false, description: "Why some payments are free and others cost real money." },
    Row { number: 8,  title: "What miners actually do",       tech: "bitcoin",   simulated: false, description: "Not 'creating bitcoin from thin air'." },
    Row { number: 9,  title: "The halving",                   tech: "bitcoin",   simulated: false, description: "Why bitcoin gets harder to mine every 4 years." },
    Row { number: 10, title: "Custodial vs self-custodial",   tech: "bitcoin",   simulated: false, description: "The difference between a bank account and cash." },

    // ── Tier 2 — Apprentice (11-20) ────────────────────────────────────
    Row { number: 11, title: "Generate a seed phrase",        tech: "bitcoin",   simulated: true,  description: "12 BIP39 words generated in your browser. The backup is the wallet." },
    Row { number: 12, title: "Your seed IS your wallet",      tech: "bitcoin",   simulated: false, description: "Why losing the seed means losing the bitcoin." },
    Row { number: 13, title: "Identity without a server",     tech: "nostr",     simulated: false, description: "How Nostr ditches the username system." },
    Row { number: 14, title: "Generate your Nostr identity",  tech: "nostr",     simulated: false, description: "Real cryptographic identity, generated in your browser." },
    Row { number: 15, title: "Public vs private key",         tech: "nostr",     simulated: false, description: "Quiz yourself: which key do you share?" },
    Row { number: 16, title: "Relays — the dumb pipes",       tech: "nostr",     simulated: false, description: "Where Nostr messages actually live." },
    Row { number: 17, title: "Events — everything is one",    tech: "nostr",     simulated: false, description: "Posts, profiles, follows: all the same shape." },
    Row { number: 18, title: "Mainnet vs testnet vs signet",  tech: "bitcoin",   simulated: false, description: "The Bitcoin networks you can break without losing anything." },
    Row { number: 19, title: "UTXOs — Bitcoin accounting",    tech: "bitcoin",   simulated: false, description: "Why Bitcoin isn't 'balances', it's 'unspent outputs'." },
    Row { number: 20, title: "Five ways people lose bitcoin", tech: "bitcoin",   simulated: false, description: "Read before you ever hold real sats." },

    // ── Tier 3 — Pilot (21-30) ─────────────────────────────────────────
    Row { number: 21, title: "Why Lightning exists",          tech: "lightning", simulated: false, description: "On-chain is great. Just not for coffee." },
    Row { number: 22, title: "Channels — Lightning's primitive", tech: "lightning", simulated: false, description: "Two parties, one escrow, infinite payments." },
    Row { number: 23, title: "Receive sats on Lightning",     tech: "lightning", simulated: true,  description: "Generate a real (or simulated) invoice." },
    Row { number: 24, title: "Send sats on Lightning",        tech: "lightning", simulated: true,  description: "Lightning addresses look like emails — and work the same way." },
    Row { number: 25, title: "How a Lightning payment routes",tech: "lightning", simulated: false, description: "Your sats hop through other people's channels." },
    Row { number: 26, title: "Publish your first Nostr note", tech: "nostr",     simulated: false, description: "A message no company can delete, signed only by you." },
    Row { number: 27, title: "Set up your profile",           tech: "nostr",     simulated: false, description: "Name, bio, picture — all signed, hosted by nobody." },
    Row { number: 28, title: "Reposts, replies, reactions",   tech: "nostr",     simulated: false, description: "How interaction works without a platform." },
    Row { number: 29, title: "Picking relays wisely",         tech: "nostr",     simulated: false, description: "Why your follow list needs relays attached." },
    Row { number: 30, title: "Follow someone on Nostr",       tech: "nostr",     simulated: false, description: "Publish your first contact list to public relays." },

    // ── Tier 4 — Navigator (31-40) ─────────────────────────────────────
    Row { number: 31, title: "What eCash is",                 tech: "ecash",     simulated: false, description: "Private bearer money, backed by a mint." },
    Row { number: 32, title: "Mints — small, replaceable",    tech: "ecash",     simulated: false, description: "Why eCash mints are not banks." },
    Row { number: 33, title: "Claim an eCash token",          tech: "ecash",     simulated: true,  description: "Get a token issued, see what one looks like." },
    Row { number: 34, title: "Spend an eCash token",          tech: "ecash",     simulated: true,  description: "Hand the bearer note to the mint to redeem." },
    Row { number: 35, title: "What is a Zap?",                tech: "nostr",     simulated: false, description: "Bitcoin tips threaded through Lightning + Nostr." },
    Row { number: 36, title: "Receive your first zap",        tech: "nostr",     simulated: true,  description: "Generate a zap receipt against your npub." },
    Row { number: 37, title: "NIP-05: human-readable handles",tech: "nostr",     simulated: false, description: "Why some Nostr names look like emails." },
    Row { number: 38, title: "Lightning addresses, deeper",   tech: "lightning", simulated: false, description: "How alice@example.com resolves to an invoice." },
    Row { number: 39, title: "Custodial vs self-hosted LN",   tech: "lightning", simulated: false, description: "Why your default Lightning wallet is probably custodial." },
    Row { number: 40, title: "L2s, sidechains, and rollups",  tech: "bitcoin",   simulated: false, description: "Lightning is one of many — there are others." },

    // ── Tier 5 — Captain (41-50) ───────────────────────────────────────
    Row { number: 41, title: "Derive your first address",     tech: "bitcoin",   simulated: true,  description: "From 12 words to an actual address — in your browser." },
    Row { number: 42, title: "Send a signet on-chain tx",     tech: "bitcoin",   simulated: false, description: "For the first time in this app, you broadcast to a real blockchain." },
    Row { number: 43, title: "Hardware wallets",              tech: "bitcoin",   simulated: false, description: "Why a $50 device is the cheapest peace of mind in crypto." },
    Row { number: 44, title: "Multisig 101",                  tech: "bitcoin",   simulated: false, description: "2-of-3 keys → you control bitcoin even if one device is lost." },
    Row { number: 45, title: "Cold vs hot storage",           tech: "bitcoin",   simulated: false, description: "Why your savings shouldn't be on your phone." },
    Row { number: 46, title: "Privacy basics",                tech: "bitcoin",   simulated: false, description: "The chain is public — act accordingly." },
    Row { number: 47, title: "Run a node (one day)",          tech: "bitcoin",   simulated: false, description: "Why running your own Bitcoin node matters." },
    Row { number: 48, title: "How rules actually change",     tech: "bitcoin",   simulated: false, description: "Soft forks, hard forks, and why Bitcoin barely changes." },
    Row { number: 49, title: "Why Bitcoin matters globally",  tech: "bitcoin",   simulated: false, description: "It's not really about being rich." },
    Row { number: 50, title: "You made it",                   tech: "bitcoin",   simulated: false, description: "What to do from here." },
];

impl Mission {
    pub fn all() -> Vec<Mission> {
        CATALOGUE
            .iter()
            .map(|r| {
                let tier = Tier::from_mission(r.number);
                Mission {
                    number: r.number,
                    title: r.title.into(),
                    description: r.description.into(),
                    tech: r.tech.into(),
                    status: if r.number == 0 {
                        MissionStatus::Active
                    } else {
                        MissionStatus::Locked
                    },
                    tier,
                    simulated: r.simulated,
                }
            })
            .collect()
    }

    /// First valid mission number. **0** in the new curriculum, not 1.
    pub const FIRST: u8 = 0;

    /// Last valid mission number (inclusive).
    pub const LAST: u8 = 50;

    /// Which `DoKind` does this mission use? Used by `verify_proof` to know
    /// which ledger to check. Kept in lock-step with the frontend's
    /// `DoKind` union in `frontend/src/lib/types.ts`.
    pub fn do_kind(number: u8) -> DoKind {
        match number {
            // Knowledge-only missions (the majority by count) — pure quiz.
            // Listed explicitly so adding a mission doesn't silently fall
            // through to a default that bypasses verification.
            0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 => DoKind::Knowledge,
            12 | 13 | 15 | 16 | 17 | 18 | 19 | 20 => DoKind::Knowledge,
            21 | 22 | 25 | 28 | 29 => DoKind::Knowledge,
            31 | 32 | 35 | 37 | 38 | 39 | 40 => DoKind::Knowledge,
            43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 => DoKind::Knowledge,

            // Action missions:
            11 => DoKind::SeedWords,
            14 => DoKind::NostrIdentity,
            23 => DoKind::Invoice,
            24 => DoKind::Pay,
            26 => DoKind::NostrPublish,
            27 => DoKind::NostrProfile,
            30 => DoKind::NostrFollow,
            33 => DoKind::EcashClaim,
            34 => DoKind::EcashSpend,
            36 => DoKind::NostrZap,
            41 => DoKind::DeriveAddress,
            42 => DoKind::OnchainSignet,

            _ => DoKind::Knowledge, // safe default for out-of-range numbers
        }
    }
}

/// Mission action kinds the verifier knows about. Kept narrow and explicit so
/// missing-arm warnings catch new kinds at compile time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DoKind {
    Knowledge,
    NostrIdentity,
    Invoice,
    Pay,
    EcashClaim,
    EcashSpend,
    NostrPublish,
    NostrProfile,
    NostrFollow,
    NostrZap,
    OnchainSignet,
    SeedWords,
    DeriveAddress,
}
