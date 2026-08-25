use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MissionStatus {
    Locked,
    Active,
    Completed,
}

/// Nine skill trees. The (mission, tree) mapping lives on the backend so
/// the frontend can't drift — the backend is the only source of truth.
///
/// Each mission belongs to exactly one tree. Within a tree, lessons are
/// taken in order; across trees, learners pick freely (Money 101 first
/// for newcomers, Lightning first for someone who already knows Bitcoin).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum Tree {
    Money,
    Bitcoin,
    Lightning,
    Nostr,
    Ecash,
    SelfCustody,
    Privacy,
    Sovereignty,
    OpenSource,
}

impl Tree {
    /// Every tree in display order. Mirrored on the frontend in `TREES`.
    pub const ALL: &'static [Tree] = &[
        Tree::Money,
        Tree::Bitcoin,
        Tree::Lightning,
        Tree::Nostr,
        Tree::Ecash,
        Tree::SelfCustody,
        Tree::Privacy,
        Tree::Sovereignty,
        Tree::OpenSource,
    ];

    /// Ordered mission ids that make up this tree, in pedagogical order.
    /// Single source of truth — `from_mission` and the badge code both
    /// derive from this, and the frontend `TREES` constant mirrors it.
    pub fn missions(self) -> &'static [u8] {
        match self {
            Tree::Money       => &[0, 1, 77, 78, 2, 5, 9, 10, 106, 108, 110],
            Tree::Bitcoin     => &[6, 7, 8, 87, 88, 18, 19, 89, 40, 90, 48, 49],
            Tree::Lightning   => &[21, 22, 79, 80, 23, 24, 25, 38, 81, 82, 39, 83, 107, 109],
            Tree::Nostr       => &[13, 14, 15, 97, 16, 17, 26, 27, 98, 28, 29, 30, 35, 36, 37, 99],
            Tree::Ecash       => &[31, 32, 33, 34, 84, 55, 56, 85, 57, 86],
            Tree::SelfCustody => &[3, 4, 11, 12, 91, 92, 93, 20, 41, 94, 95, 43, 44, 45, 96],
            Tree::Privacy     => &[46, 51, 52, 58, 59, 60, 61, 62, 63, 64, 65, 66],
            // 50 ("You made it") stays last — it's the graduation lesson.
            Tree::Sovereignty => &[42, 47, 53, 54, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 50],
            // 105 graduates with a real merged GitHub PR (issue #57).
            Tree::OpenSource  => &[100, 101, 102, 103, 104, 105],
        }
    }

    /// Human display name, mirrored from the frontend `TREES` labels.
    /// Used in certificate wording, where the backend has no access to
    /// the frontend's metadata table.
    pub fn label(self) -> &'static str {
        match self {
            Tree::Money       => "Money Basics",
            Tree::Bitcoin     => "Bitcoin",
            Tree::Lightning   => "Lightning",
            Tree::Nostr       => "Nostr",
            Tree::Ecash       => "eCash",
            Tree::SelfCustody => "Self-custody",
            Tree::Privacy     => "Privacy",
            Tree::Sovereignty => "Full Independence",
            Tree::OpenSource  => "Open Source",
        }
    }

    /// Prose award printed on certificates ("earned the Bitcoin Wings
    /// badge"). Each flight path earns its "Wings"; this is deliberately
    /// NOT "Pilot", which is a tier on the overall rank ladder (Cadet,
    /// Pilot, Captain, Commander). Mirrored by `rankTitleFor` in the
    /// frontend so UI and certificate wording match.
    pub fn wings_title(self) -> &'static str {
        match self {
            Tree::Money       => "Money Basics Wings",
            Tree::Bitcoin     => "Bitcoin Wings",
            Tree::Lightning   => "Lightning Wings",
            Tree::Nostr       => "Nostr Wings",
            Tree::Ecash       => "eCash Wings",
            Tree::SelfCustody => "Self-custody Wings",
            Tree::Privacy     => "Privacy Wings",
            Tree::Sovereignty => "Independence Wings",
            Tree::OpenSource  => "Open Source Wings",
        }
    }

    /// Parse the kebab-case wire slug (the serde form, e.g. "self-custody")
    /// back into a Tree. Goes through serde so the two can't drift.
    pub fn from_slug(slug: &str) -> Option<Tree> {
        serde_json::from_value(serde_json::Value::String(slug.to_string())).ok()
    }

    /// Map a mission id (0..=Mission::LAST) to its skill tree.
    /// Derived from `missions()` so the two cannot drift.
    pub fn from_mission(number: u8) -> Tree {
        for &t in Self::ALL {
            if t.missions().contains(&number) {
                return t;
            }
        }
        // Out-of-range numbers fall through to Money as a safe default.
        // The mission_id range check in routes/missions.rs gates this
        // before it would matter at runtime.
        Tree::Money
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mission {
    /// Stable id for this lesson. **0-indexed**. The same id maps to the
    /// same lesson forever; reorderings within a tree do NOT renumber.
    /// See `frontend/src/lib/types.ts` for the matching wire shape.
    pub number: u8,
    pub title: String,
    pub description: String,
    /// Skill tree this lesson belongs to (e.g. "lightning", "self-custody").
    pub tree: Tree,
    pub status: MissionStatus,
    /// True if the underlying service is a simulation (no real network call).
    /// The frontend uses this to render a clear "Simulated — demo mode" badge.
    pub simulated: bool,
}

/// Compact descriptor: (number, title, description, simulated_default).
/// Tree is computed via `Tree::from_mission` so the table stays short and
/// adding/removing a mission is a one-line edit.
struct Row {
    number: u8,
    title: &'static str,
    description: &'static str,
    simulated: bool,
}

const CATALOGUE: &[Row] = &[
    // ── Money 101 ──────────────────────────────────────────────────────
    Row { number: 0,  title: "Welcome aboard",                simulated: false, description: "Five minutes on why this exists. No prior knowledge needed." },
    Row { number: 1,  title: "What is Bitcoin?",              simulated: false, description: "Money that no government, bank, or company controls." },
    Row { number: 77, title: "What money even is",            simulated: false, description: "Medium of exchange, unit of account, store of value." },
    Row { number: 78, title: "Why fiat loses value",          simulated: false, description: "Inflation as policy — the slow tax on savers." },
    Row { number: 2,  title: "Sats, the unit of account",     simulated: false, description: "1 bitcoin = 100,000,000 satoshis. Think in sats." },
    Row { number: 5,  title: "Permissionless money",          simulated: false, description: "Why nobody has to approve your transaction." },
    Row { number: 9,  title: "The halving",                   simulated: false, description: "Why bitcoin gets harder to mine every 4 years." },
    Row { number: 10, title: "Custodial vs self-custodial",   simulated: false, description: "The difference between a bank account and cash." },

    // ── Bitcoin protocol ───────────────────────────────────────────────
    Row { number: 6,  title: "Blocks and confirmations",      simulated: false, description: "Why people say '1 confirmation' or '6'." },
    Row { number: 7,  title: "Fees and the mempool",          simulated: false, description: "Why some payments are free and others cost real money." },
    Row { number: 8,  title: "What miners actually do",       simulated: false, description: "Not 'creating bitcoin from thin air'." },
    Row { number: 87, title: "Difficulty adjustment",         simulated: false, description: "How Bitcoin keeps blocks arriving every ten minutes, forever." },
    Row { number: 88, title: "Script — Bitcoin's tiny language", simulated: false, description: "Every UTXO is locked by a mini-program. On purpose." },
    Row { number: 18, title: "Mainnet vs testnet vs signet",  simulated: false, description: "The Bitcoin networks you can break without losing anything." },
    Row { number: 19, title: "UTXOs — Bitcoin accounting",    simulated: false, description: "Why Bitcoin isn't 'balances', it's 'unspent outputs'." },
    Row { number: 89, title: "Taproot, briefly",              simulated: false, description: "The 2021 upgrade you've been using without noticing." },
    Row { number: 40, title: "L2s, sidechains, and rollups",  simulated: false, description: "Lightning is one of many — there are others." },
    Row { number: 90, title: "Mining pools",                  simulated: false, description: "Why solo mining is basically extinct — and why that matters." },
    Row { number: 48, title: "How rules actually change",     simulated: false, description: "Soft forks, hard forks, and why Bitcoin barely changes." },
    Row { number: 49, title: "Why Bitcoin matters globally",  simulated: false, description: "It's not really about being rich." },

    // ── Lightning ──────────────────────────────────────────────────────
    Row { number: 21, title: "Why Lightning exists",          simulated: false, description: "On-chain is great. Just not for coffee." },
    Row { number: 22, title: "Channels — Lightning's primitive", simulated: false, description: "Two parties, one escrow, infinite payments." },
    Row { number: 79, title: "HTLCs, the atomic-payment trick", simulated: false, description: "How a payment hops through strangers without theft." },
    Row { number: 80, title: "Inbound vs outbound liquidity", simulated: false, description: "Why 'your channel is full' is a real thing." },
    Row { number: 23, title: "Receive sats on Lightning",     simulated: true,  description: "Generate a real (or simulated) invoice." },
    Row { number: 24, title: "Send sats on Lightning",        simulated: true,  description: "Lightning addresses look like emails — and work the same way." },
    Row { number: 25, title: "How a Lightning payment routes",simulated: false, description: "Your sats hop through other people's channels." },
    Row { number: 38, title: "Lightning addresses, deeper",   simulated: false, description: "How alice@example.com resolves to an invoice." },
    Row { number: 81, title: "LSPs — the wallets you actually use", simulated: false, description: "Phoenix, Muun, Wallet of Satoshi — what the LSP does." },
    Row { number: 82, title: "Watchtowers, briefly",          simulated: false, description: "The guard that catches a stale channel close." },
    Row { number: 39, title: "Custodial vs self-hosted LN",   simulated: false, description: "Why your default Lightning wallet is probably custodial." },
    Row { number: 83, title: "Splicing and BOLT-12",          simulated: false, description: "The upgrades that make Lightning stop feeling pointy." },

    // ── Nostr ──────────────────────────────────────────────────────────
    Row { number: 13, title: "Identity without a server",     simulated: false, description: "How Nostr ditches the username system." },
    Row { number: 14, title: "Generate your Nostr identity",  simulated: false, description: "Real cryptographic identity, generated in your browser." },
    Row { number: 15, title: "Public vs private key",         simulated: false, description: "Quiz yourself: which key do you share?" },
    Row { number: 16, title: "Relays — the dumb pipes",       simulated: false, description: "Where Nostr messages actually live." },
    Row { number: 17, title: "Events — everything is one",    simulated: false, description: "Posts, profiles, follows: all the same shape." },
    Row { number: 26, title: "Publish your first Nostr note", simulated: false, description: "A message no company can delete, signed only by you." },
    Row { number: 27, title: "Set up your profile",           simulated: false, description: "Name, bio, picture — all signed, hosted by nobody." },
    Row { number: 28, title: "Reposts, replies, reactions",   simulated: false, description: "How interaction works without a platform." },
    Row { number: 29, title: "Picking relays wisely",         simulated: false, description: "Why your follow list needs relays attached." },
    Row { number: 30, title: "Follow someone on Nostr",       simulated: false, description: "Publish your first contact list to public relays." },
    Row { number: 35, title: "What is a Zap?",                simulated: false, description: "Bitcoin tips threaded through Lightning + Nostr." },
    Row { number: 36, title: "Receive your first zap",        simulated: true,  description: "Generate a zap receipt against your npub." },
    Row { number: 37, title: "NIP-05: human-readable handles",simulated: false, description: "Why some Nostr names look like emails." },
    Row { number: 97, title: "Signers — never paste your nsec", simulated: false, description: "NIP-07 browser extensions, NIP-46 bunkers, hardware signers." },
    Row { number: 98, title: "Private DMs — NIP-04 and gift-wrap", simulated: false, description: "Two DM standards. One leaks metadata; the other doesn't." },
    Row { number: 99, title: "The wider Nostr ecosystem",      simulated: false, description: "Long-form, marketplaces, video, communities — all one npub." },

    // ── eCash ──────────────────────────────────────────────────────────
    Row { number: 31, title: "What eCash is",                 simulated: false, description: "Private bearer money, backed by a mint." },
    Row { number: 32, title: "Mints — small, replaceable",    simulated: false, description: "Why eCash mints are not banks." },
    Row { number: 33, title: "Claim an eCash token",          simulated: true,  description: "Get a token issued, see what one looks like." },
    Row { number: 34, title: "Spend an eCash token",          simulated: true,  description: "Hand the bearer note to the mint to redeem." },
    Row { number: 84, title: "What a token actually looks like", simulated: false, description: "A Cashu token is base64 you can text to a friend." },
    Row { number: 85, title: "Multi-mint wallets",            simulated: false, description: "Spread custody risk across mints, on purpose." },
    Row { number: 86, title: "When mints fail",               simulated: false, description: "The honest history, and how to size balances around it." },

    // ── Self-custody ───────────────────────────────────────────────────
    Row { number: 3,  title: "What a wallet actually is",     simulated: false, description: "It doesn't hold coins. It holds the keys that authorize moving entries." },
    Row { number: 4,  title: "Addresses: your inbox for sats",simulated: false, description: "Long string. Infinite supply. Free to make." },
    Row { number: 11, title: "Generate a seed phrase",        simulated: true,  description: "12 BIP39 words generated in your browser. The backup is the wallet." },
    Row { number: 12, title: "Your seed IS your wallet",      simulated: false, description: "Why losing the seed means losing the bitcoin." },
    Row { number: 91, title: "BIPs 39, 32, 44",               simulated: false, description: "The standards that make your seed portable across wallets." },
    Row { number: 92, title: "The 25th word (passphrase)",    simulated: false, description: "A separate secret that turns one seed into infinite hidden wallets." },
    Row { number: 93, title: "Backing up a seed, seriously",  simulated: false, description: "Paper, steel, splits — pick what outlives your next move." },
    Row { number: 20, title: "Five ways people lose bitcoin", simulated: false, description: "Read before you ever hold real sats." },
    Row { number: 41, title: "Derive your first address",     simulated: true,  description: "From 12 words to an actual address — in your browser." },
    Row { number: 94, title: "PSBTs — signing without touching the internet", simulated: false, description: "The file format behind serious cold storage flows." },
    Row { number: 95, title: "Descriptors — what your wallet really is", simulated: false, description: "One string that fully specifies your address family." },
    Row { number: 43, title: "Hardware wallets",              simulated: false, description: "Why a $50 device is the cheapest peace of mind in crypto." },
    Row { number: 44, title: "Multisig 101",                  simulated: false, description: "2-of-3 keys → you control bitcoin even if one device is lost." },
    Row { number: 45, title: "Cold vs hot storage",           simulated: false, description: "Why your savings shouldn't be on your phone." },
    Row { number: 96, title: "Migrating wallets safely",      simulated: false, description: "Move between apps without losing sats or leaking addresses." },

    // ── Privacy ────────────────────────────────────────────────────────
    Row { number: 46, title: "Privacy basics",                simulated: false, description: "The chain is public — act accordingly." },
    Row { number: 51, title: "Address reuse, in detail",      simulated: false, description: "Why one shared address leaks your whole history." },
    Row { number: 52, title: "How chain analysis works",      simulated: false, description: "Clustering, heuristics, and what blockchain sleuths actually see." },
    Row { number: 58, title: "CoinJoin, plainly",             simulated: false, description: "The trick that breaks the biggest chain-analysis heuristic." },
    Row { number: 59, title: "PayJoin: an invisible mix",     simulated: false, description: "Every payment can quietly be a small CoinJoin." },
    Row { number: 60, title: "Lightning privacy, honestly",   simulated: false, description: "Better than on-chain — but the LSP still learns a lot." },
    Row { number: 61, title: "KYC is the biggest leak",       simulated: false, description: "The privacy break usually happens at the on-ramp, not the chain." },
    Row { number: 62, title: "Your node closes the IP leak",  simulated: false, description: "Third-party wallets tell strangers your balance in real time." },
    Row { number: 63, title: "Wallet fingerprinting",         simulated: false, description: "Your wallet has an accent — analysts can hear it." },
    Row { number: 64, title: "Nostr identities aren't private", simulated: false, description: "An npub is public forever — plan personas accordingly." },
    Row { number: 65, title: "eCash privacy: shine and limits", simulated: false, description: "Bearer tokens the mint never sees — with an asterisk." },
    Row { number: 66, title: "Threat model 101",              simulated: false, description: "Name the adversary before picking privacy tools." },

    // ── Sovereignty ────────────────────────────────────────────────────
    Row { number: 42, title: "Send a signet on-chain tx",     simulated: false, description: "For the first time in this app, you broadcast to a real blockchain." },
    Row { number: 47, title: "Run a node (one day)",          simulated: false, description: "Why running your own Bitcoin node matters." },
    Row { number: 53, title: "Sovereignty vs custody",        simulated: false, description: "Two distinct ideas often blurred together." },
    Row { number: 54, title: "Your first node, practically",  simulated: false, description: "Pi, Umbrel, StartOS — picking a path that fits." },
    Row { number: 67, title: "Be your own bank, literally",   simulated: false, description: "What the slogan actually means, unbundled job by job." },
    Row { number: 68, title: "The exit option",               simulated: false, description: "Sovereignty is optionality, not isolation." },
    Row { number: 69, title: "Circular economy",              simulated: false, description: "Earn sats, spend sats, skip the fiat rail." },
    Row { number: 70, title: "Portable identity",             simulated: false, description: "A Nostr key travels; a Twitter handle does not." },
    Row { number: 71, title: "Bitcoin as savings tech",       simulated: false, description: "Cold savings and hot spending are separate concerns." },
    Row { number: 72, title: "Lowering your time preference", simulated: false, description: "Money that lasts changes how you plan." },
    Row { number: 73, title: "DCA beats timing",              simulated: false, description: "Buy a little often. Consistently. Boring wins." },
    Row { number: 74, title: "Inheritance planning",          simulated: false, description: "A stack your family can inherit vs. one only you can find." },
    Row { number: 75, title: "Sovereignty ≠ isolation",       simulated: false, description: "A community of sovereigns is worth more than a lone one." },
    Row { number: 76, title: "What sovereignty costs",        simulated: false, description: "The honest tradeoffs nobody puts on the poster." },
    Row { number: 50, title: "You made it",                   simulated: false, description: "What to do from here." },

    // ── eCash (extended) ───────────────────────────────────────────────
    Row { number: 55, title: "Blind signatures, plainly",     simulated: false, description: "The math trick that makes eCash private." },
    Row { number: 56, title: "Cashu vs Fedimint",             simulated: false, description: "Two flavors of Bitcoin-backed eCash, compared." },
    Row { number: 57, title: "Mint trust: 1-of-N vs federation", simulated: false, description: "Where the failure modes actually live." },

    // ── Open Source ────────────────────────────────────────────────────
    Row { number: 100, title: "Forks, branches, and pull requests", simulated: false, description: "How strangers on the internet build money together." },
    Row { number: 101, title: "Read a real codebase",         simulated: false, description: "The code that guards billions is public. Go look at it." },
    Row { number: 102, title: "Find a docs fix",              simulated: false, description: "Your first contribution is a sentence, not an algorithm." },
    Row { number: 103, title: "Decode a good first issue",    simulated: false, description: "Maintainers label easy wins for you. Learn to read them." },
    Row { number: 104, title: "Tests are contributions too",  simulated: false, description: "The easiest code PR: prove an existing function works." },
    Row { number: 105, title: "Ship a real PR",               simulated: false, description: "Graduation is a merge commit with your name on it." },
    // ── Practical remittance ───────────────────────────────────────────
    Row { number: 106, title: "Compare the true transfer cost", simulated: false, description: "Fees, exchange-rate spread, and cash-out cost in one comparison." },
    Row { number: 107, title: "Prepare the recipient",          simulated: false, description: "Wallet readiness, a tiny test, and a clear cash-out plan." },
    Row { number: 108, title: "Stop remittance scams",          simulated: false, description: "Verify the person and request before money moves." },
    Row { number: 109, title: "When a payment fails",           simulated: false, description: "Read the status, protect the preimage, retry safely." },
    Row { number: 110, title: "Repeat without BitPilot",        simulated: false, description: "A final checklist you can use for the next real transfer." },
];

impl Mission {
    pub fn all() -> Vec<Mission> {
        CATALOGUE
            .iter()
            .map(|r| {
                let tree = Tree::from_mission(r.number);
                Mission {
                    number: r.number,
                    title: r.title.into(),
                    description: r.description.into(),
                    tree,
                    status: if r.number == 0 {
                        MissionStatus::Active
                    } else {
                        MissionStatus::Locked
                    },
                    simulated: r.simulated,
                }
            })
            .collect()
    }

    /// First valid mission id.
    pub const FIRST: u8 = 0;

    /// Last valid mission id (inclusive).
    pub const LAST: u8 = 110;

    /// Which `DoKind` does this mission use? Used by `verify_proof` to know
    /// which ledger to check. Kept in lock-step with the frontend's
    /// `DoKind` union in `frontend/src/lib/types.ts`.
    pub fn do_kind(number: u8) -> DoKind {
        match number {
            // Knowledge-only missions (the majority by count) — pure quiz.
            // Listed explicitly so adding a mission doesn't silently fall
            // through to a default that bypasses verification.
            0 | 1 | 2 | 3 | 4 | 5 | 7 | 8 | 9 | 10 => DoKind::Knowledge,
            12 | 13 | 15 | 16 | 18 | 19 | 20 => DoKind::Knowledge,
            21 | 22 | 25 | 28 | 29 => DoKind::Knowledge,
            31 | 32 | 35 | 37 | 38 | 39 | 40 => DoKind::Knowledge,
            43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 => DoKind::Knowledge,
            52 | 53 | 54 | 55 | 56 | 57 => DoKind::Knowledge,
            58 | 59 | 60 | 61 | 62 | 63 | 64 | 65 | 66 => DoKind::Knowledge,
            67 | 68 | 69 | 70 | 71 | 72 | 73 | 74 | 75 | 76 => DoKind::Knowledge,
            77 | 78 => DoKind::Knowledge,
            79 | 80 | 81 | 82 | 83 => DoKind::Knowledge,
            84 | 85 | 86 => DoKind::Knowledge,
            87 | 88 | 89 | 90 => DoKind::Knowledge,
            91 | 93 | 94 | 95 | 96 => DoKind::Knowledge,
            97 | 98 | 99 => DoKind::Knowledge,
            100 | 101 => DoKind::Knowledge,
            // 102/103/104 render a paste-value input on the frontend: paste
            // a docs link/sentence (102), restate a "good first issue" in
            // your own words (103), or share a test/file link (104). Split
            // out of the Knowledge run above so verify_proof can require a
            // minimum length instead of letting a one-character reflection
            // clear the mission (issues #81 and #86).
            102 | 103 | 104 => DoKind::PasteValue,
            106 | 107 | 108 | 109 | 110 => DoKind::Knowledge,

            // Action missions:
            // 6 and 51 both ask the learner to read one live number off a
            // public explorer; the verifier re-reads it and compares.
            // 92 derives the same path twice, with and without a BIP39
            // passphrase, and submits the two resulting addresses.
            // 17 signs an event locally so the learner can read its
            // anatomy. It is never broadcast; 26 does that later.
            17 => DoKind::SignEvent,
            92 => DoKind::PassphraseFork,
            6 => DoKind::ChainTip,
            51 => DoKind::AddressReuse,
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
            105 => DoKind::GithubPr,

            _ => DoKind::Knowledge, // safe default for out-of-range numbers
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_mission_belongs_to_exactly_one_tree() {
        let mut seen: HashSet<u8> = HashSet::new();
        for &tree in Tree::ALL {
            for &m in tree.missions() {
                assert!(
                    seen.insert(m),
                    "mission {m} appears in more than one tree"
                );
            }
        }
        for n in Mission::FIRST..=Mission::LAST {
            assert!(seen.contains(&n), "mission {n} is in no tree");
        }
        assert_eq!(seen.len(), (Mission::LAST - Mission::FIRST + 1) as usize);
    }

    #[test]
    fn from_mission_round_trips_through_missions() {
        for &tree in Tree::ALL {
            for &m in tree.missions() {
                assert_eq!(Tree::from_mission(m), tree);
            }
        }
    }

    /// Missions 6 and 51 are the live-explorer lookups that put the Bitcoin
    /// and Privacy flight paths over the "at least one hands-on mission"
    /// bar. Catch-all `Knowledge` arms sit *above* them in `do_kind`'s
    /// match, and Rust takes the first arm that matches, so folding either
    /// number back into one of those runs would silently downgrade the
    /// mission to "any non-empty string passes" with no compile error.
    #[test]
    fn live_lookup_missions_are_not_shadowed_by_knowledge_arms() {
        assert_eq!(Mission::do_kind(6), DoKind::ChainTip);
        assert_eq!(Mission::do_kind(51), DoKind::AddressReuse);
        assert_eq!(Mission::do_kind(92), DoKind::PassphraseFork);
        assert_eq!(Mission::do_kind(17), DoKind::SignEvent);
        // Neighbours in the same knowledge runs must be unaffected.
        for n in [5u8, 7, 52, 91, 93, 16, 18] {
            assert_eq!(Mission::do_kind(n), DoKind::Knowledge, "mission {n}");
        }
    }

    /// Missions 102/103/104 render a paste-value reflection input and must
    /// enforce a minimum length (issue #81) — they can't fall back into the
    /// neighbouring 100/101 `Knowledge` arm, which accepts any
    /// non-empty string.
    #[test]
    fn paste_value_missions_are_not_shadowed_by_knowledge_arms() {
        assert_eq!(Mission::do_kind(102), DoKind::PasteValue);
        assert_eq!(Mission::do_kind(103), DoKind::PasteValue);
        assert_eq!(Mission::do_kind(104), DoKind::PasteValue);
        for n in [100u8, 101] {
            assert_eq!(Mission::do_kind(n), DoKind::Knowledge, "mission {n}");
        }
    }

    /// The bar itself: every flight path carries at least one mission with a
    /// real action, except Money Basics, which is deliberately exempt
    /// because it is the conceptual opening path.
    #[test]
    fn every_tree_has_a_hands_on_mission_except_money() {
        for &tree in Tree::ALL {
            let hands_on = tree
                .missions()
                .iter()
                .filter(|&&m| Mission::do_kind(m) != DoKind::Knowledge)
                .count();
            if tree == Tree::Money {
                continue;
            }
            assert!(
                hands_on >= 1,
                "{tree:?} has no hands-on mission; every path except Money Basics needs one"
            );
        }
    }
}

/// Mission action kinds the verifier knows about. Kept narrow and explicit so
/// missing-arm warnings catch new kinds at compile time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DoKind {
    Knowledge,
    /// A free-text reflection (docs link, restated issue, etc.) that must
    /// clear a minimum length so it isn't the same "any non-empty string
    /// passes" bar as `Knowledge`. See `verify_proof`'s `PasteValue` arm.
    ///
    /// Covers missions 102/103/104 only. Mission 106 also renders a
    /// paste-value input on the frontend, but intentionally stays `Knowledge`
    /// here: it's a numeric naira-quote input, not a reflection, so the
    /// minimum-length floor doesn't apply.
    PasteValue,
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
    ChainTip,
    AddressReuse,
    PassphraseFork,
    SignEvent,
    SeedWords,
    DeriveAddress,
    GithubPr,
}
