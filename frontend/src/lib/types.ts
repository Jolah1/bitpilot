// ─── Backend-shape types ─────────────────────────────────────────────────────
export interface Participant {
    id: string
    name: string
    session_id: string
    current_mission: number
    completed_missions: number[]
    sats_earned: number
    nostr_pubkey: string | null
}

export interface Session {
    id: string
    name: string
    participant_ids: string[]
    created_at: number
}

export type Tech = 'bitcoin' | 'lightning' | 'nostr' | 'ecash'

/**
 * Five learning tiers. Mission numbers map deterministically into these
 * bands (see `tierFor()`), so they're not stored per-mission — the tier
 * UI derives them from the id. Reward bands rise as the tier rises:
 * novices earn small wins fast, captains earn meaningful sats for harder
 * tasks they actually had to think about.
 */
export type Tier = 'novice' | 'apprentice' | 'pilot' | 'navigator' | 'captain'

export interface TierMeta {
    key: Tier
    label: string
    range: [number, number]
    reward: number
    tagline: string
}

export const TIERS: TierMeta[] = [
    { key: 'novice',     label: 'Novice',     range: [0, 10],  reward: 10,  tagline: 'Bitcoin from zero. No prior knowledge.' },
    { key: 'apprentice', label: 'Apprentice', range: [11, 20], reward: 21,  tagline: 'Keys, addresses, sending and receiving for real.' },
    { key: 'pilot',      label: 'Pilot',      range: [21, 30], reward: 33,  tagline: 'Lightning + Nostr — the everyday tools.' },
    { key: 'navigator',  label: 'Navigator',  range: [31, 40], reward: 50,  tagline: 'eCash, zaps, NIP-05 and the wider ecosystem.' },
    { key: 'captain',    label: 'Captain',    range: [41, 50], reward: 100, tagline: 'Sovereignty: signet on-chain, security, the long game.' },
]

/** Returns the tier a mission id belongs to. */
export function tierFor(missionId: number): TierMeta {
    return TIERS.find((t) => missionId >= t.range[0] && missionId <= t.range[1]) ?? TIERS[0]
}

/**
 * Tier badge as returned by GET /api/participants/me/badges.
 *
 * One per learning tier (Novice → Captain). Earned when every mission in
 * the tier's range has been completed. `earned_at` is unix-seconds of the
 * latest completion in the tier (the moment the badge actually unlocked),
 * `null` while still in progress.
 *
 * Derived server-side from `mission_completions`, so badges always agree
 * with the completion list — no drift, no migration when ranges shift.
 */
export interface Badge {
    tier: Tier
    completed: number
    required: number
    earned: boolean
    earned_at: number | null
    /** Tier-completion bonus in sats. Mirrors `TIERS[].reward`. */
    reward_sats: number
    /** Null until the learner claims via /api/participants/me/tier-rewards/:tier/claim. */
    reward_claim: RewardClaim | null
}

export interface RewardClaim {
    amount_sats: number
    payment_hash: string
    simulated: boolean
    paid_at: number
}

// ─── Frontend mission catalogue ──────────────────────────────────────────────
// Numbers MUST line up with `Mission::all()` in backend/src/models/mission.rs.
// The backend is source of truth for `id`, `tech`, `reward`, and `simulated`.
// The frontend owns the *teaching* copy: learn body, quiz, do-step prompt.

export interface QuizOption {
    text: string
    correct: boolean
    /** Optional one-line nudge shown when the learner picks this answer. */
    why?: string
}

export interface MissionQuiz {
    question: string
    options: QuizOption[]
}

/**
 * What the learner has to *do* to earn the reward. Each kind has a matching
 * verifier in backend/src/routes/missions.rs:verify_proof(). Knowledge-only
 * kinds accept any non-empty string. Anything else requires a real artifact
 * the server issued (npub, invoice, payment_hash, token, event_id, txid…).
 *
 * When adding a new kind:
 *   1. add it here
 *   2. add the handler branch in LearnerView's handleDo()
 *   3. add the verifier branch in routes/missions.rs:verify_proof()
 *   4. add any new ledger table in a migration
 */
export type DoKind =
    | 'knowledge'         /* no API call — user clicks "I get it" to claim reward */
    | 'nostr-identity'    /* POST /api/nostr/identity (client-side keygen, then proof to backend) */
    | 'invoice'           /* POST /api/invoice */
    | 'pay'               /* POST /api/pay (needs lightning-address text input) */
    | 'ecash-claim'       /* POST /api/ecash/mint */
    | 'ecash-spend'       /* POST /api/ecash/redeem (user pastes token) */
    | 'nostr-publish'     /* POST /api/nostr/publish */
    | 'nostr-profile'     /* update profile metadata (kind 0) */
    | 'nostr-follow'      /* publish a contact list (kind 3) with a chosen npub */
    | 'nostr-zap'         /* receive (or simulate) a zap receipt */
    | 'onchain-signet'    /* paste a signet txid; verifier asks mempool.space */
    | 'seed-words'        /* generate BIP39 mnemonic client-side; quiz on a word */
    | 'derive-address'    /* derive an address from the mnemonic and submit */
    | 'paste-value'       /* generic "paste this thing" — used for npub copy, etc. */

export interface MissionDef {
    /** Mission number. Starts at 0 (Novice tier opens here). */
    id: number
    /** One-emoji shorthand. Used in the progress bar and cards. */
    emoji: string
    /** Short topical chip ("Bitcoin", "Lightning", …). */
    topic: string
    tech: Tech
    /** Card-level title. */
    name: string
    /** One-sentence tagline shown under the title. */
    tagline: string
    /**
     * Documentation-only hint: `true` means this mission's `do` step *can* be
     * simulated when the backend lacks credentials for the underlying service.
     * The actual badge in the UI is driven by `useIsTechReal(tech)` (which
     * polls `/api/runtime`), NOT by this field. Don't rely on it for runtime
     * decisions.
     */
    simulated: boolean
    learn: {
        heading: string
        /** Plain text. Newlines render as paragraph breaks. */
        body: string
        tip: string
    }
    quiz: MissionQuiz
    /** What the user must do to earn the reward. */
    do: {
        kind: DoKind
        actionLabel: string
        helper: string
        /** For text inputs: placeholder. */
        placeholder?: string
        /** For text inputs: max length. */
        maxLength?: number
    }
}

// ── Quick-build helpers ─────────────────────────────────────────────────────
// Most knowledge missions are 95% the same shape: a heading, body, tip, a
// 3-option multiple-choice, and a "Got it" button. Building each one as a
// 30-line literal is unreadable; these helpers keep the catalogue scannable.

interface KnowledgeOpts {
    id: number
    emoji: string
    topic: string
    tech: Tech
    name: string
    tagline: string
    learn: { heading: string; body: string; tip: string }
    quiz: MissionQuiz
    actionLabel?: string
    helper?: string
}

function knowledge(o: KnowledgeOpts): MissionDef {
    return {
        id: o.id,
        emoji: o.emoji,
        topic: o.topic,
        tech: o.tech,
        name: o.name,
        tagline: o.tagline,
        simulated: false,
        learn: o.learn,
        quiz: o.quiz,
        do: {
            kind: 'knowledge',
            actionLabel: o.actionLabel ?? 'I get it — claim sats',
            helper: o.helper ?? "Knowledge mission. Understanding *is* the goal; the button just credits you.",
        },
    }
}

/**
 * The full BitPilot curriculum: 51 missions (0..=50) across 5 tiers.
 *
 * Coverage:
 *   Novice (0-10):   what bitcoin is, sats, wallets, addresses, fees, philosophy
 *   Apprentice (11-20): seed phrases, keys, on-chain receive, Nostr identity
 *   Pilot (21-30):   Lightning + Nostr fundamentals, hands-on missions
 *   Navigator (31-40): zaps, NIP-05, lightning addresses, eCash, profile
 *   Captain (41-50): signet on-chain transactions, security, sovereignty
 *
 * Backend rewards are derived from tier — see backend/src/models/mission.rs.
 */
export const MISSIONS: MissionDef[] = [
    // ═════════════════════════════════════════════════════════════════════
    // TIER 1 — NOVICE (0-10) — 10 sats each
    // ═════════════════════════════════════════════════════════════════════
    knowledge({
        id: 0,
        emoji: '👋',
        topic: 'Welcome',
        tech: 'bitcoin',
        name: 'Welcome aboard',
        tagline: 'Five minutes to understand why this matters',
        learn: {
            heading: 'Why this exists',
            body:
                "Most people learn about Bitcoin by reading. You'll learn by using. Over the next 51 missions you'll generate real cryptographic keys, send (testnet) payments, publish a message to a network nobody owns, and end up understanding more than 99% of people who 'know about crypto'.\n\nNo wallet to install. No money at risk. Every action that touches a real network is clearly labeled — and everything that's just a demonstration is too.\n\nMissions are split into five tiers: Novice, Apprentice, Pilot, Navigator, Captain. Each tier pays more sats because each tier asks more of you.",
            tip: 'You earn sats inside the app as a progress signal. They don\'t leave BitPilot.',
        },
        quiz: {
            question: 'What does BitPilot mainly want you to do?',
            options: [
                { text: 'Read articles about Bitcoin', correct: false, why: 'Reading is fine, but this is built around *doing*.' },
                { text: 'Actually use Bitcoin, Lightning, Nostr, and eCash', correct: true },
                { text: 'Buy bitcoin with my credit card', correct: false, why: "Nope — nothing here touches your bank or real money." },
            ],
        },
        actionLabel: "I'm in — let's go",
    }),
    knowledge({
        id: 1,
        emoji: '₿',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'What is Bitcoin, really?',
        tagline: 'Money that no government, bank, or company can control',
        learn: {
            heading: 'Bitcoin in one paragraph',
            body:
                "Bitcoin is digital money you can send to anyone, anywhere, without asking a bank for permission. Nobody owns the network — it runs on thousands of computers around the world that all keep the same shared ledger.\n\nIt was invented in 2009 by someone using the name Satoshi Nakamoto. Nobody knows who they really are, and that's part of the point: no single person or company can shut it down.\n\nThe rules are fixed in code: there will only ever be 21 million bitcoins. No CEO can print more.",
            tip: "Bitcoin isn't owned by a company. It's a protocol — like email — that anyone can use.",
        },
        quiz: {
            question: 'Who decides how much Bitcoin gets created?',
            options: [
                { text: 'The Bitcoin Foundation board', correct: false, why: 'There is no central foundation that controls supply.' },
                { text: 'Fixed rules in the code — 21 million total, forever', correct: true },
                { text: "Whichever country's central bank prints the most", correct: false, why: 'Bitcoin is not issued by any central bank.' },
            ],
        },
    }),
    knowledge({
        id: 2,
        emoji: '🔢',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Think in sats, not bitcoin',
        tagline: '1 bitcoin = 100,000,000 satoshis. Sats are the real unit.',
        learn: {
            heading: 'The sat is to bitcoin what the cent is to the dollar',
            body:
                "Most people who use Bitcoin every day don't say '0.00021 BTC' — they say '21,000 sats'. It's cleaner and it doesn't feel weird when the price moves.\n\nA satoshi (sat) is the smallest unit of bitcoin. There are 100 million sats in 1 BTC.\n\nA cup of coffee in a Bitcoin economy might cost 2,000-5,000 sats. A song on a Bitcoin-native streaming app might be 1 sat per second. Tiny amounts work because Bitcoin is divisible to 8 decimal places.",
            tip: 'When you see "1 BTC", picture "100,000,000 sats". That mental switch unlocks everything else.',
        },
        quiz: {
            question: 'How many satoshis are in 1 bitcoin?',
            options: [
                { text: '1,000', correct: false },
                { text: '1,000,000', correct: false, why: 'Close — but off by a factor of 100.' },
                { text: '100,000,000', correct: true },
            ],
        },
    }),
    knowledge({
        id: 3,
        emoji: '👛',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'What a wallet actually is',
        tagline: 'Surprise: it does not hold any coins',
        learn: {
            heading: 'A "wallet" is just a key manager',
            body:
                "Your Bitcoin wallet doesn't store any bitcoins. There are no coins to store. What it stores is the cryptographic keys that prove you have the right to spend specific entries in the shared ledger.\n\nLose the keys → lose the ability to move those entries. The bitcoin still exists on the network, but it's stuck. No customer-support hotline can recover it.\n\nThis is why Bitcoiners obsess about backups. 'Your keys, your coins. Not your keys, not your coins.' If a company holds the keys for you, you have an IOU, not bitcoin.",
            tip: "Custodial wallet = a company holds your keys (easy, risky). Self-custodial = you hold your keys (harder, safer).",
        },
        quiz: {
            question: 'What does a Bitcoin wallet store?',
            options: [
                { text: 'Actual bitcoins as files on disk', correct: false, why: "There are no 'bitcoin files'. Coins live as ledger entries on the network." },
                { text: 'The private keys that authorize moving entries in the ledger', correct: true },
                { text: 'Your government-issued ID and bank link', correct: false, why: 'A real self-custody wallet asks for neither.' },
            ],
        },
    }),
    knowledge({
        id: 4,
        emoji: '📬',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Addresses: your inbox for sats',
        tagline: 'Long string of characters, infinite supply, free to make',
        learn: {
            heading: 'An address is a destination',
            body:
                "A Bitcoin address is a string like `bc1q...` (or `1...`, `3...` for older formats). It tells the network where to send sats.\n\nYou can generate a new address every time you receive — for free, in milliseconds. There is no 'account number' that gets reused forever. Privacy-aware wallets do generate a fresh one for every incoming payment.\n\nThe address is derived from your public key, which is derived from your private key. The chain goes private key → public key → address. Money flows the other way: someone with your address can pay you; only someone with your private key can spend the result.",
            tip: 'Sharing an address is safe. Sharing a private key (or seed phrase) is catastrophic.',
        },
        quiz: {
            question: 'Can someone steal your bitcoin if they know your address?',
            options: [
                { text: 'Yes — the address is the secret', correct: false, why: "Backwards. The address is the public bit; sharing it is fine." },
                { text: "No — the address is meant to be shared. Only the private key spends.", correct: true },
                { text: "Only if it's a brand-new address", correct: false, why: "Address age doesn't change who can spend." },
            ],
        },
    }),
    knowledge({
        id: 5,
        emoji: '🌍',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Permissionless money',
        tagline: 'Why nobody needs to approve your transaction',
        learn: {
            heading: 'No KYC at the protocol layer',
            body:
                "When you swipe a Visa card, at least four companies have to say yes: your bank, the merchant's bank, Visa, and the merchant's payment processor. Any one of them can decline you. That's the design.\n\nBitcoin doesn't have those gates. The protocol doesn't know who you are, doesn't care, can't tell. A transaction is valid if the math checks out — signature matches the key, inputs aren't already spent — and that's the only test.\n\nThat property is called 'permissionless'. It's what lets a journalist in Belarus, a refugee in Sudan, or a farmer in Bukombe receive payments without anyone holding a veto.",
            tip: 'Exchanges KYC you because they\'re companies regulated by a government. Bitcoin itself does not.',
        },
        quiz: {
            question: 'Who has to approve a Bitcoin transaction at the protocol level?',
            options: [
                { text: 'Your government', correct: false },
                { text: "The recipient's bank", correct: false },
                { text: 'Nobody — math validates, miners include it in a block', correct: true },
            ],
        },
    }),
    knowledge({
        id: 6,
        emoji: '🧱',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Blocks and confirmations',
        tagline: 'Why people say "1 confirmation" or "6 confirmations"',
        learn: {
            heading: 'A block is a batch of transactions',
            body:
                "Every ~10 minutes a miner wins the right to publish the next block, which bundles up recently broadcast transactions. Once your transaction is in a block, it has '1 confirmation'.\n\nFor small amounts, 1 confirmation is enough. For large amounts (think: buying a house), people wait for 6 confirmations — about an hour — because reorganising the chain that far back is astronomically expensive.\n\nThis is why on-chain Bitcoin is bad for buying coffee: 10-60 minutes is silly for $3. It's great for settlement of larger value, where waiting an hour buys you decades of mathematical certainty.",
            tip: 'For day-to-day spending, use Lightning. We get to that tier soon.',
        },
        quiz: {
            question: 'Why wait for 6 confirmations on a large payment?',
            options: [
                { text: "Because Bitcoin's slow on purpose", correct: false },
                { text: 'Because reversing 6 blocks deep is essentially impossible', correct: true },
                { text: 'Because the bank requires it', correct: false, why: 'No bank involved.' },
            ],
        },
    }),
    knowledge({
        id: 7,
        emoji: '🧾',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Fees and the mempool',
        tagline: 'Why some payments are nearly free and others cost real money',
        learn: {
            heading: 'On-chain Bitcoin has a queue called the mempool',
            body:
                "Every Bitcoin transaction has to be picked up by a miner and put into a block. Blocks are limited in size, so when lots of people want to transact at once, you have to bid for space by paying a higher fee.\n\nThat bidding queue is called the mempool. Pay more, get in sooner. Pay less, wait longer — sometimes hours, sometimes days.\n\nLightning has almost no fees per payment because routing a payment through existing channels is cheap. The fees only kick in when channels open or close (which is an on-chain transaction).",
            tip: 'Buying coffee? Use Lightning. Moving life savings? Use on-chain, pay the fee, sleep well.',
        },
        quiz: {
            question: 'Why are on-chain Bitcoin fees sometimes high?',
            options: [
                { text: 'Bitcoin charges a percentage like Visa', correct: false, why: "Bitcoin doesn't charge a percentage — fees are an open market." },
                { text: "Block space is limited, so people bid for it", correct: true },
                { text: 'Miners decide based on your wallet balance', correct: false },
            ],
        },
    }),
    knowledge({
        id: 8,
        emoji: '⛏️',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'What miners actually do',
        tagline: 'Spoiler: not "creating bitcoin from thin air"',
        learn: {
            heading: 'Miners are bookkeepers paid in lottery tickets',
            body:
                "A miner is a computer running specialized hardware that competes to find a specific number — one that, when combined with a candidate block, produces a hash starting with enough zeros. It's basically guessing trillions of times a second.\n\nWhen a miner finds the number first, they get to publish the next block and collect two things: the fees from every transaction inside it, and a 'block subsidy' of newly issued bitcoin. That subsidy halves every four years (the 'halving') and will eventually reach zero around the year 2140.\n\nMining is what secures the network: rewriting history would require redoing all that work, which costs more energy than any attacker can afford.",
            tip: "Mining isn't 'wasted' energy — it's the cost of having a global ledger nobody can rewrite.",
        },
        quiz: {
            question: 'Where does a miner\'s reward come from?',
            options: [
                { text: 'A central bank prints it for them', correct: false },
                { text: 'Transaction fees + new bitcoin issued by the protocol (the subsidy)', correct: true },
                { text: 'Other miners pay them', correct: false },
            ],
        },
    }),
    knowledge({
        id: 9,
        emoji: '🪓',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'The halving',
        tagline: 'Why bitcoin gets harder to mine every 4 years',
        learn: {
            heading: 'Every 210,000 blocks, the subsidy halves',
            body:
                "When Bitcoin started in 2009, miners got 50 BTC for each block. In 2012 that dropped to 25. In 2016, 12.5. In 2020, 6.25. In 2024, 3.125. Sometime in 2028, 1.5625. And so on, until the subsidy rounds to zero.\n\nThis schedule is hard-coded. Nobody can change it without convincing the entire network to upgrade their software in unison — which has never happened for monetary policy and probably never will.\n\nThe halving is why Bitcoin's supply is capped at 21M: it's a geometric series that converges. Beautiful, brutal, predictable.",
            tip: 'The next halving determines the supply schedule for the next 4 years — set your calendar.',
        },
        quiz: {
            question: 'What happens at every halving?',
            options: [
                { text: 'The price doubles', correct: false, why: 'Market reaction is unpredictable. Only the issuance rate is guaranteed to change.' },
                { text: 'Miners receive half as much new bitcoin per block', correct: true },
                { text: 'All wallets reset', correct: false },
            ],
        },
    }),
    knowledge({
        id: 10,
        emoji: '🛂',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Custodial vs self-custodial',
        tagline: 'The difference between a bank account and cash',
        learn: {
            heading: 'Who holds the keys?',
            body:
                "If a company (an exchange, a 'cloud wallet', a payment app) holds your private keys, that's custodial. You have an account; they have the bitcoin. They can freeze you, lose the bitcoin in a hack, get subpoenaed, or go bankrupt with your money inside.\n\nIf you hold the keys yourself, that's self-custodial. Nobody can freeze you, but if you lose your backup, nobody can recover the funds either. The trade-off is total.\n\nMost people start custodial (easier, less scary) and move to self-custody as they hold more. There's no shame in either, but if you don't know which one your wallet is, assume custodial and treat it as 'an account with a company that happens to denominate balances in sats'.",
            tip: "Rule of thumb: if there's a password reset, you're custodial.",
        },
        quiz: {
            question: "You can't remember your wallet password. The app emails you a reset link. Are you custodial or self-custodial?",
            options: [
                { text: 'Custodial — only a company can reset your access', correct: true },
                { text: 'Self-custodial — your seed phrase reset the password', correct: false, why: "Self-custody has no reset. A 12-word seed phrase isn't a password; it's the keys themselves." },
                { text: 'Depends on the country', correct: false },
            ],
        },
    }),

    // ═════════════════════════════════════════════════════════════════════
    // TIER 2 — APPRENTICE (11-20) — 21 sats each
    // Seed phrases, keys, addresses, Nostr identity
    // ═════════════════════════════════════════════════════════════════════
    {
        id: 11,
        emoji: '🌱',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Generate a seed phrase',
        tagline: '12 words that ARE your wallet — generated right here in your browser',
        simulated: true, // BIP39 generated client-side; the words are real BIP39
        learn: {
            heading: 'BIP39: turning randomness into a backup',
            body:
                "A seed phrase (or 'mnemonic') is 12 or 24 English words that encode the secret behind every key in your wallet. Restore the words on any compatible wallet, anywhere in the world, and you have your bitcoin again.\n\nThe magic word for this standard is BIP39 — the spec that defines a list of 2048 words and how to convert random bytes into them and back.\n\nClick generate and we'll create a real BIP39 seed phrase in your browser. It's not connected to any real money, but it IS real cryptographic randomness. Treat it the way you'd treat a real one: don't share it, don't paste it into random websites, don't take a screenshot.",
            tip: 'In real life: write the 12 words on paper. Two copies. Different physical locations. No phone photos.',
        },
        quiz: {
            question: 'Where should you store the seed phrase for a real wallet?',
            options: [
                { text: 'A screenshot in your phone\'s Photos app', correct: false, why: 'Anything in cloud-synced photos is one breach away from public.' },
                { text: 'Written on paper, two copies, physically separated', correct: true },
                { text: 'Email it to yourself', correct: false, why: 'Email accounts get compromised constantly. Never.' },
            ],
        },
        do: {
            kind: 'seed-words',
            actionLabel: 'Generate my 12 words',
            helper: "We'll generate real BIP39 words in your browser. They never leave the page.",
        },
    },
    knowledge({
        id: 12,
        emoji: '📜',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Your seed IS your wallet',
        tagline: 'Read this and you understand 80% of self-custody',
        learn: {
            heading: 'The seed is everything',
            body:
                "From the 12 words, your wallet derives a master private key. From the master key, it derives every individual key, every address, every signature you'll ever produce.\n\nWhich means: those 12 words ARE the wallet. The app on your phone is just a UI on top of them. Lose the phone, the app's gone — but you can restore your wallet on any other app that supports BIP39 by typing the words back in.\n\nThe inverse is also true: anyone who gets the 12 words has the wallet too. There's no password on top, no 2FA, no recovery email. Just words.",
            tip: 'If a "support agent" asks for your seed phrase, they are stealing from you. Real support never asks.',
        },
        quiz: {
            question: "Your phone breaks. Your seed phrase is written on paper at home. What do you do?",
            options: [
                { text: 'Contact customer support to recover', correct: false, why: 'Self-custodial wallets have no customer support. There is no central party.' },
                { text: 'Install any BIP39-compatible wallet, type the 12 words, restore', correct: true },
                { text: 'The bitcoin is permanently gone', correct: false, why: 'Only if you lost the paper too.' },
            ],
        },
    }),
    knowledge({
        id: 13,
        emoji: '🪪',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Identity without a server',
        tagline: 'How Nostr ditches the username system',
        learn: {
            heading: 'No username because no server owns you',
            body:
                "Every other social platform has a database table of usernames, and a company that decides which row is yours. Block you, ban you, lose the database — you're gone.\n\nNostr replaces that with public-key cryptography. Your 'username' is just your public key (the npub). You prove you're you by signing with the private half (the nsec). No server in between.\n\nThat means your identity is portable across every Nostr app, forever, with nobody's permission. It also means you carry the responsibility for the keys yourself.",
            tip: 'Think of npub like an email address that nobody can take from you.',
        },
        quiz: {
            question: 'What replaces the "username + password" system on Nostr?',
            options: [
                { text: 'A public/private keypair you generate yourself', correct: true },
                { text: "A phone number Nostr sends a code to", correct: false },
                { text: 'A central Nostr Inc. account', correct: false, why: 'There is no Nostr Inc. It\'s a protocol, not a company.' },
            ],
        },
    }),
    {
        id: 14,
        emoji: '🔑',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Generate your Nostr identity',
        tagline: 'A real cryptographic identity, generated in your browser',
        simulated: false,
        learn: {
            heading: 'Your identity, generated locally',
            body:
                "Click the button and we'll generate a real secp256k1 keypair right here in your browser. The public half (npub) is your handle on every Nostr client in existence. The private half (nsec) is your password — except it can never be reset.\n\nThis is important: from this mission onward, we use the same keypair for everything Nostr-related. Save your nsec to a password manager before you continue. If you lose it, you lose this identity.\n\nThe keys are generated client-side and the nsec never leaves your device. Only the npub is sent to the backend, so we can verify later that you actually published as you.",
            tip: "If you don't have a password manager, get one. Bitwarden and 1Password are good. Save the nsec there.",
        },
        quiz: {
            question: 'Your nsec (private key) is leaked. What can the attacker do?',
            options: [
                { text: 'Nothing — it expires automatically', correct: false, why: 'Nostr keys never expire. There is no reset.' },
                { text: 'Post as you, sign things as you — they ARE you on Nostr', correct: true },
                { text: 'Steal your bitcoin from your bank', correct: false, why: "Nostr keys aren't connected to your bank — but losing them is still very serious." },
            ],
        },
        do: {
            kind: 'nostr-identity',
            actionLabel: 'Generate my Nostr identity',
            helper: 'Keys generated in your browser. We send only your npub to the server.',
        },
    },
    knowledge({
        id: 15,
        emoji: '🔐',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Public vs private key',
        tagline: 'Get this wrong in real life and you lose everything',
        learn: {
            heading: 'Two keys. One is a billboard, one is a vault.',
            body:
                "Your npub (public key) is meant to be shared. Put it on your business card. Tell your friends. People use it to find you and follow you.\n\nYour nsec (private key) is the opposite. It signs every message you post. If someone has it, they can post as you forever and there's no 'forgot password' button.\n\nRule of thumb: if a website or app asks you to paste your nsec, leave. Real Nostr apps let you sign locally — they never need to see your private key.",
            tip: 'npub starts with "npub1…", nsec starts with "nsec1…". One letter, world of difference.',
        },
        quiz: {
            question: 'Which key should you paste into a random website that asks for it?',
            options: [
                { text: 'Your npub (the public one)', correct: true, why: 'npub is meant to be public. Sharing it is fine.' },
                { text: 'Your nsec (the private one)', correct: false, why: 'Never. A site asking for your nsec is either incompetent or malicious.' },
                { text: 'Both — they need to verify you', correct: false, why: 'Anyone asking for both is a scam.' },
            ],
        },
    }),
    knowledge({
        id: 16,
        emoji: '📡',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Relays — the dumb pipes',
        tagline: 'Where your messages actually live',
        learn: {
            heading: 'Relays are simple websocket servers',
            body:
                "A Nostr relay is just a server that accepts signed events and re-broadcasts them to anyone listening. There's no algorithm, no recommendation engine, no moderation team. The relay's only job is to be a pipe.\n\nIf one relay rate-limits you or goes offline, you connect to another. Most clients connect to a handful at once and de-duplicate. There are hundreds of public relays.\n\nThat's the whole 'censorship resistance' story: you're not posting to a platform, you're shouting into a pool of pipes, and any pipe that won't carry your message is replaceable.",
            tip: "Popular public relays: relay.damus.io, nos.lol, relay.nostr.band — you'll see these everywhere.",
        },
        quiz: {
            question: 'What is a Nostr relay?',
            options: [
                { text: 'A central server like twitter.com', correct: false, why: "Wrong shape. Many relays exist; none of them is 'the' relay." },
                { text: 'A simple server that re-broadcasts signed events', correct: true },
                { text: 'A bitcoin mining pool', correct: false },
            ],
        },
    }),
    knowledge({
        id: 17,
        emoji: '🧬',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Events — everything is one',
        tagline: 'Posts, profiles, follows: all the same shape',
        learn: {
            heading: 'A Nostr event has 5 fields',
            body:
                "Everything on Nostr is an 'event': a JSON object with five fields — id, pubkey, kind, content, signature. The 'kind' number says what type of thing it is.\n\nKind 1: a short text note (a tweet, basically).\nKind 0: profile metadata (name, about, picture).\nKind 3: contact list (your follows).\nKind 7: a reaction (like/dislike).\nKind 9735: a zap receipt (we'll see this in tier 4).\n\nThat's the whole protocol. Add new kinds, build new apps — same plumbing.",
            tip: "Every post, follow, reaction, and zap is a JSON object you cryptographically signed.",
        },
        quiz: {
            question: 'Which Nostr event kind is a text note (a "tweet")?',
            options: [
                { text: 'Kind 0', correct: false, why: 'Kind 0 is profile metadata.' },
                { text: 'Kind 1', correct: true },
                { text: 'Kind 9735', correct: false, why: 'Kind 9735 is a zap receipt — coming soon.' },
            ],
        },
    }),
    knowledge({
        id: 18,
        emoji: '🌐',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Mainnet vs testnet vs signet',
        tagline: 'The Bitcoin networks you can break without losing anything',
        learn: {
            heading: 'Three networks, one codebase',
            body:
                "Mainnet is real Bitcoin: real coins, real economic activity, real risk. The 21 million cap lives here.\n\nTestnet is a parallel network using the same software but worthless coins (testnet sats). Anyone can mine. It's been around forever, sometimes broken, sometimes flooded. Useful for testing, not reliable.\n\nSignet is a newer testnet with one big improvement: there's a known set of signers controlling block production, so you can rely on it for tests. BitPilot's Lightning missions (when enabled) run on signet — real Bitcoin software, fake-but-stable sats.",
            tip: 'Mainnet coins have a market price. Testnet/signet coins are free, used for development and learning.',
        },
        quiz: {
            question: 'Which network does BitPilot use for the optional Lightning missions?',
            options: [
                { text: 'Mainnet — real money on the line', correct: false, why: "No way. Demos don't risk learner funds." },
                { text: 'Signet — testnet with reliable block production', correct: true },
                { text: 'A bespoke private chain', correct: false },
            ],
        },
    }),
    knowledge({
        id: 19,
        emoji: '🗂️',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'UTXOs — the bitcoin accounting model',
        tagline: 'Why Bitcoin isn\'t "balances", it\'s "unspent outputs"',
        learn: {
            heading: 'Bitcoin uses UTXOs, not accounts',
            body:
                "When somebody pays you 10,000 sats, the ledger doesn't add 10,000 to your 'balance'. It creates a brand-new Unspent Transaction Output (UTXO) tagged with your address. Your 'balance' is just the sum of all the UTXOs you can spend.\n\nWhen you pay someone, you spend whole UTXOs as inputs. If you owe 7,000 sats and you have a 10,000-sat UTXO, you split it: 7,000 to the recipient, 3,000 to yourself as 'change'. Both are brand-new UTXOs.\n\nThis is why your wallet shows 'change addresses' — they're not magic, they're just the UTXOs you sent back to yourself.",
            tip: 'A Bitcoin "balance" is a derived number. The ground truth is the set of UTXOs you control.',
        },
        quiz: {
            question: 'You have one 10,000-sat UTXO and pay someone 3,000. What happens?',
            options: [
                { text: 'Your balance just decreases by 3,000', correct: false, why: 'Accounting model — that\'s how banks work, not Bitcoin.' },
                { text: 'The 10,000 UTXO is spent; two new UTXOs appear: 3,000 for them, ~7,000 (minus fee) for you', correct: true },
                { text: 'The miner takes 3,000 and you keep 7,000', correct: false },
            ],
        },
    }),
    knowledge({
        id: 20,
        emoji: '🛡️',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'The 5 ways people lose bitcoin',
        tagline: 'Read this before you ever hold real sats',
        learn: {
            heading: 'How beginners lose money',
            body:
                "1. Exchange goes bust (Mt. Gox, FTX, Celsius…). Custodial money is loanable money.\n\n2. Phishing — fake support, fake login pages, fake browser extensions. They want your seed phrase.\n\n3. Lost seed phrase — paper destroyed, drive wiped, never wrote it down. No recovery.\n\n4. SIM swap — attacker takes over your phone number, resets accounts, drains the exchange.\n\n5. Sending to the wrong address — one typo, money gone forever.\n\nDoing self-custody well solves 1, 4, partly 2. Doing backups well solves 3. Double-checking addresses solves 5. There are no shortcuts.",
            tip: "Slow down. The only urgency in crypto is the scammer's, not yours.",
        },
        quiz: {
            question: 'Which of these is NOT a common way people lose bitcoin?',
            options: [
                { text: 'Sending to the wrong address', correct: false, why: 'Very common, sadly.' },
                { text: 'The Bitcoin protocol changes the supply cap', correct: true, why: 'Has never happened, would require near-impossible consensus.' },
                { text: 'Exchange goes bankrupt with their funds', correct: false, why: 'Very common.' },
            ],
        },
    }),

    // ═════════════════════════════════════════════════════════════════════
    // TIER 3 — PILOT (21-30) — 33 sats each
    // Lightning + Nostr fundamentals, hands-on
    // ═════════════════════════════════════════════════════════════════════
    knowledge({
        id: 21,
        emoji: '⚡',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Why Lightning exists',
        tagline: 'On-chain Bitcoin is great. Just not for coffee.',
        learn: {
            heading: 'The scaling problem',
            body:
                "Bitcoin's design — 10-minute blocks, ~7 transactions per second globally — makes it incredibly secure but terrible at retail volume. If everyone on earth used on-chain Bitcoin for daily payments, fees would be 10s of dollars and confirmations would be days.\n\nThe Lightning Network is a second layer that sits on top. Two parties open a 'channel' on-chain, then exchange payments off-chain inside that channel as many times as they want. When they're done, they close the channel and only the final state hits the blockchain.\n\nResult: instant payments, fractions of a sat in fees, and Bitcoin can scale to billions of users without changing the base layer.",
            tip: 'Lightning is to Bitcoin what email is to SMTP: a usable layer on top of the slow protocol.',
        },
        quiz: {
            question: 'What problem does Lightning solve?',
            options: [
                { text: 'Bitcoin had no encryption', correct: false, why: "Bitcoin has cryptographic security; that's not the problem." },
                { text: 'On-chain Bitcoin is too slow and expensive for small frequent payments', correct: true },
                { text: 'Bitcoin needed a CEO', correct: false },
            ],
        },
    }),
    knowledge({
        id: 22,
        emoji: '🔌',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Channels — Lightning\'s primitive',
        tagline: 'Two parties, one shared escrow, infinite payments',
        learn: {
            heading: 'A channel is a 2-of-2 multisig',
            body:
                "To open a Lightning channel, you and a peer lock some bitcoin into a 2-of-2 multisig address on-chain. From that point on, you exchange signed updates of who owns how much, without broadcasting them.\n\nAt any time, either of you can close the channel by publishing the latest signed state — and only that final state hits the chain. Up until then, you can do millions of payments through that channel, each one instant and basically free.\n\nIn practice you don't open a channel to every person you want to pay. You open a channel to a well-connected node, and Lightning routes your payments through the network of channels like packet-switching on the internet.",
            tip: 'Most users never run their own node. They use a wallet that opens channels for them automatically.',
        },
        quiz: {
            question: 'How many on-chain transactions does opening + using + closing a channel cost?',
            options: [
                { text: 'One per payment', correct: false, why: 'No — that defeats the point.' },
                { text: 'Two total: one to open, one to close', correct: true },
                { text: 'Zero — Lightning is fully off-chain', correct: false, why: 'Open and close are anchored on-chain.' },
            ],
        },
    }),
    {
        id: 23,
        emoji: '📥',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Receive sats on Lightning',
        tagline: "Generate a real invoice, see what one looks like",
        simulated: true,
        learn: {
            heading: 'Lightning invoices: lnbc...',
            body:
                "Receiving on Lightning starts with generating an invoice — a string that encodes how much you want, your node's identity, and a routing hint.\n\nThe invoice can only be paid once. If you want to receive again, you generate a new one. (This is different from a Bitcoin address, which can be reused — though for privacy you shouldn't.)\n\nWe'll create a 100-sat invoice for you. If LNbits is wired up on the backend, this hits a real signet Lightning node; otherwise it returns a plausible-looking string and the header chip will say 'Simulated'.",
            tip: "Invoices have an expiry — usually an hour. After that they're dead and you regenerate.",
        },
        quiz: {
            question: 'How many times can a single Lightning invoice be paid?',
            options: [
                { text: 'As many times as you like', correct: false, why: 'Each invoice is single-use.' },
                { text: 'Exactly once', correct: true },
                { text: 'Up to the expiry time', correct: false, why: 'It can be paid once or not at all before the expiry.' },
            ],
        },
        do: {
            kind: 'invoice',
            actionLabel: 'Create my Lightning invoice',
            helper: "We'll generate a 100-sat invoice. The header chip tells you whether this is real signet or simulated.",
        },
    },
    {
        id: 24,
        emoji: '📤',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Send sats on Lightning',
        tagline: 'Lightning addresses look like emails — and work the same way',
        simulated: true,
        learn: {
            heading: 'A Lightning address: alice@getalby.com',
            body:
                "Memorising a fresh invoice every time is annoying. Lightning Address solves that: it's an email-shaped string like 'alice@getalby.com'. Behind the scenes, your wallet asks Alice's server for a fresh invoice and pays it. You never see the invoice.\n\n50 sats is roughly $0.03 at most prices. Tiny enough that you can practice without worrying — but it's how real Lightning payments feel.",
            tip: "You don't need an account anywhere to receive. You need a balance somewhere to send.",
        },
        quiz: {
            question: 'A Lightning address looks like which of these?',
            options: [
                { text: 'A long string of random letters and digits', correct: false, why: "That's a raw invoice. Lightning addresses are friendlier." },
                { text: 'alice@somewallet.com', correct: true },
                { text: 'A QR code only', correct: false },
            ],
        },
        do: {
            kind: 'pay',
            actionLabel: 'Send 50 sats',
            helper: 'Type any Lightning address (e.g. demo@ln.tips). Check the header chip for testnet vs simulated.',
            placeholder: 'demo@ln.tips',
            maxLength: 80,
        },
    },
    knowledge({
        id: 25,
        emoji: '🛣️',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'How a Lightning payment routes',
        tagline: 'Your sats hop through other people\'s channels',
        learn: {
            heading: 'Pathfinding in the Lightning network',
            body:
                "When you pay alice@example.com, your node looks at the public graph of channels and finds a path of nodes that connects you to her. Each node along the path forwards the payment, taking a tiny fee.\n\nThe payment uses 'onion routing' — each hop only knows the previous and next node, not the full path. Privacy is decent, though not perfect.\n\nIf the payment can't find a route (no liquidity, peers offline), it fails atomically: nothing moves, you try again later.",
            tip: 'Lightning fees are typically <1 sat per payment, much cheaper than card processing.',
        },
        quiz: {
            question: 'A node forwarding your Lightning payment — what does it know?',
            options: [
                { text: 'The full path and the original sender', correct: false, why: 'Onion routing prevents this.' },
                { text: 'Only the previous and next hop', correct: true },
                { text: 'Nothing — Lightning is fully anonymous', correct: false, why: 'There is some metadata; it\'s private but not perfectly so.' },
            ],
        },
    }),
    {
        id: 26,
        emoji: '📢',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Publish your first Nostr note',
        tagline: 'A message no company can delete, signed only by you',
        simulated: false,
        learn: {
            heading: "This one's real — your note will hit public Nostr relays",
            body:
                "When you click publish, your note is signed in your browser with the nsec from mission 14 and broadcast to public Nostr relays (relay.damus.io, nos.lol, relay.nostr.band).\n\nOnce a relay accepts it, your note is permanently part of Nostr. Anyone with a Nostr client (Damus, Amethyst, Snort, Primal…) can search your npub and see it.\n\nMake it something you're happy to have out there.",
            tip: "Want to find your note later? Open any Nostr client and paste your npub.",
        },
        quiz: {
            question: 'Where will your note actually live after you publish it?',
            options: [
                { text: 'On bitpilot.app servers only', correct: false, why: "BitPilot doesn't store your notes — it relays them to public Nostr." },
                { text: 'On every Nostr relay we successfully publish to', correct: true },
                { text: 'In a private database only you can see', correct: false },
            ],
        },
        do: {
            kind: 'nostr-publish',
            actionLabel: 'Sign and publish my note',
            helper: "Write your first Nostr note. It'll be signed with your nsec and broadcast to public relays — for real.",
            placeholder: "GM Nostr — I just finished BitPilot ⚡",
            maxLength: 280,
        },
    },
    {
        id: 27,
        emoji: '🧑',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Set up your profile',
        tagline: 'Name, bio, picture — all signed by you, hosted by nobody',
        simulated: false,
        learn: {
            heading: 'Profile = a kind-0 event',
            body:
                "Setting a name and a bio on Nostr means publishing a kind-0 event with a JSON content payload like:\n\n  {\"name\":\"Amaka\",\"about\":\"learning bitcoin\",\"picture\":\"https://...\"}\n\nRelays store the latest kind-0 from each pubkey. Clients fetch it when they want to display you. There's no 'username table'; your handle is whatever your latest kind-0 says it is.\n\nThis is also why Nostr has no name conflicts: two people can have name 'Alice' and clients just show both, distinguished by npub.",
            tip: "Updating your profile = publishing a new kind-0. The old one is overwritten (relay-side).",
        },
        quiz: {
            question: 'Two people on Nostr both set their name to "Alice". What happens?',
            options: [
                { text: 'The second one is rejected', correct: false },
                { text: "Both exist; clients show both, distinguished by npub", correct: true },
                { text: "They share the account", correct: false },
            ],
        },
        do: {
            kind: 'nostr-profile',
            actionLabel: 'Publish my profile',
            helper: "We'll sign + publish a kind-0 event with the name you choose. Real Nostr identity, real relays.",
            placeholder: 'Your display name',
            maxLength: 40,
        },
    },
    knowledge({
        id: 28,
        emoji: '🔁',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Reposts, replies, reactions',
        tagline: 'How interaction works without a platform',
        learn: {
            heading: 'Everything is just more events',
            body:
                "A reply on Nostr is a kind-1 event that references the event it's replying to (via an 'e' tag). A repost is typically a kind-6. A reaction (heart, fire emoji, etc.) is a kind-7.\n\nClients add UI on top: threads, like-counts, etc. — but the underlying primitive is always 'signed events that reference other signed events'.\n\nThis means anyone can write a new client that does threading or reactions differently. The protocol doesn't enforce a UX.",
            tip: "If you've ever wished a social app worked differently — on Nostr, you can just write that client.",
        },
        quiz: {
            question: 'How is a "like" implemented on Nostr?',
            options: [
                { text: 'A counter in a central database', correct: false, why: 'No central database.' },
                { text: 'A kind-7 event referencing the liked event', correct: true },
                { text: "It isn't possible", correct: false },
            ],
        },
    }),
    knowledge({
        id: 29,
        emoji: '🛰️',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Picking relays wisely',
        tagline: 'Why your "follow list" needs relays attached',
        learn: {
            heading: "Followers + relays = reach",
            body:
                "When you follow someone on Nostr, you publish a kind-3 event listing their npub. But knowing who to follow isn't enough — you also need to know which relays carry their posts.\n\nIf your followee mostly publishes to relay.damus.io and your client only connects to nos.lol, you'll see nothing. That's not a bug; it's the protocol working as designed.\n\nMost good clients deal with this by querying many relays and de-duplicating. NIP-65 standardizes a way to declare which relays you read and write from, so other clients can find you.",
            tip: "Connect to 4-8 relays. More = more reach but slower client; fewer = miss things.",
        },
        quiz: {
            question: "You follow someone but never see their posts. What's the most likely cause?",
            options: [
                { text: "They blocked you", correct: false, why: 'Nostr has no global block mechanism.' },
                { text: "Your client isn't connected to a relay that carries their posts", correct: true },
                { text: 'Their account was suspended', correct: false, why: 'There is no central authority to suspend accounts.' },
            ],
        },
    }),
    {
        id: 30,
        emoji: '➕',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Follow someone on Nostr',
        tagline: 'Publish your first contact list — it lives on the relays',
        simulated: false,
        learn: {
            heading: 'A "follow" is a kind-3 event',
            body:
                "Following someone on Nostr means publishing a kind-3 event listing the npubs you follow. Each time you follow/unfollow, you publish a fresh kind-3 that replaces the old one.\n\nIn this mission, we'll publish a kind-3 that follows one well-known Nostr user (jack@cash.app or fiatjaf, the inventor of Nostr — your pick). On any real Nostr client, log in with your npub and you'll see your follow list.\n\nNo platform's 'social graph' to lock you in: your follows are your kind-3 event, portable across every client.",
            tip: "Replacing a kind-3 = publishing a new one. Clients keep only the most recent per pubkey.",
        },
        quiz: {
            question: 'How is your follow list stored on Nostr?',
            options: [
                { text: 'In a central Nostr database', correct: false },
                { text: 'As a kind-3 event you publish, listing the npubs you follow', correct: true },
                { text: 'Per-relay, with each relay having its own copy', correct: false, why: 'Relays may store it, but you OWN the event — only your nsec can publish it.' },
            ],
        },
        do: {
            kind: 'nostr-follow',
            actionLabel: 'Publish my follow list',
            helper: "We'll publish a kind-3 event following a hand-picked Nostr OG. Real relay broadcast.",
        },
    },

    // ═════════════════════════════════════════════════════════════════════
    // TIER 4 — NAVIGATOR (31-40) — 50 sats each
    // eCash, zaps, NIP-05, profiles, the wider ecosystem
    // ═════════════════════════════════════════════════════════════════════
    knowledge({
        id: 31,
        emoji: '🎟️',
        topic: 'eCash',
        tech: 'ecash',
        name: 'What eCash is',
        tagline: 'Private bearer money, backed by a mint',
        learn: {
            heading: 'Digital banknotes, sort of',
            body:
                "When you pay with a card, your bank sees every purchase. Even on-chain Bitcoin is public — anyone can see your transaction history if they know your address.\n\neCash (Cashu is the most common Bitcoin-backed protocol) is different. A 'mint' issues tokens backed by real sats. Once you hold a token, whoever holds the token holds the value — like a banknote. The mint can't trace what you do with it. That property is called 'bearer'.\n\nA Cashu token is a long string. Possessing it = owning the sats inside.",
            tip: "Bearer money cuts both ways: lose the token string, the sats are gone. Treat tokens like cash.",
        },
        quiz: {
            question: 'What makes eCash private?',
            options: [
                { text: 'It uses a longer password than Bitcoin', correct: false },
                { text: "Blind signatures — the mint can't link tokens to who holds them", correct: true },
                { text: 'Tokens auto-delete after 24h', correct: false },
            ],
        },
    }),
    knowledge({
        id: 32,
        emoji: '🏦',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Mints: small, replaceable, audit-it-yourself',
        tagline: 'Why eCash mints are not banks',
        learn: {
            heading: 'A mint is a tiny custodian',
            body:
                "A Cashu mint holds the actual sats (in Lightning, usually) and in return issues tokens. So technically it's custodial — the mint runs off with your money and the tokens become worthless.\n\nThis is acceptable because mints are *small*: you only ever hold what you've recently received, you can redeem to your own Lightning wallet anytime, and there are many mints to choose from. eCash is for short-term, private spending, not for storing your savings.\n\nThink of it like cash in your pocket: useful, anonymous, but you wouldn't keep your life savings there.",
            tip: 'Rule of thumb: never hold more in a mint than you\'re willing to lose.',
        },
        quiz: {
            question: "What's the right amount to hold in any single eCash mint?",
            options: [
                { text: 'As much as possible — private wealth', correct: false, why: 'Mints are custodial; treat them like a pocket of cash.' },
                { text: 'Small amounts you intend to spend soon', correct: true },
                { text: 'Whatever the mint allows', correct: false },
            ],
        },
    }),
    {
        id: 33,
        emoji: '💱',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Claim an eCash token',
        tagline: 'Get a token issued and see what one looks like',
        simulated: true,
        learn: {
            heading: 'Minting tokens (the easy half)',
            body:
                "Minting works like this: you pay a Lightning invoice to the mint; the mint issues you a blind-signed token; you keep the token string.\n\nIn BitPilot's current build, this is simulated — the backend issues a Cashu-shaped string but isn't redeemable in a real wallet. The header chip in this mission will say 'Simulated'. (Re-enabling the real Cashu CDK is blocked on a Rust dependency conflict; it'll come back as soon as the upstream crate updates.)\n\nThe shape of the experience is identical to real mints: you get a string, you can pass it to someone, they redeem it.",
            tip: 'A token claim is just "trade some Lightning sats for a bearer note from a mint".',
        },
        quiz: {
            question: "Why is this mission's token labeled 'Simulated'?",
            options: [
                { text: 'eCash is fake everywhere', correct: false, why: 'eCash is real; this build\'s integration is on pause.' },
                { text: "The Cashu Rust crate has a dependency conflict — we're waiting for an upstream fix", correct: true },
                { text: 'Mint is offline', correct: false },
            ],
        },
        do: {
            kind: 'ecash-claim',
            actionLabel: 'Mint me a token',
            helper: "Mints a Cashu-shaped token (currently simulated — see the header chip).",
        },
    },
    {
        id: 34,
        emoji: '🤝',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Spend an eCash token',
        tagline: 'Hand the bearer note to the mint to redeem',
        simulated: true,
        learn: {
            heading: 'Redeeming = telling the mint to retire the token',
            body:
                "Spending a Cashu token means giving the string to the recipient. They redeem it at the mint, the mint cancels the old token, and issues a new one to them.\n\nThe person you paid never finds out it came from you. The mint sees a redemption but can't tie it back to your original purchase. That's the magic of blind signatures.\n\nPaste any non-empty string below to simulate redemption.",
            tip: "In real eCash, if you give someone the token AND keep a copy yourself, only the first redemption wins.",
        },
        quiz: {
            question: 'You handed your Cashu token to a friend. What stops you from spending it again later?',
            options: [
                { text: 'A timer locks the token after 1 hour', correct: false },
                { text: 'The mint only accepts each token once — first redemption wins', correct: true },
                { text: 'Nothing — Cashu allows double-spending', correct: false, why: "Real Cashu mints reject already-redeemed tokens." },
            ],
        },
        do: {
            kind: 'ecash-spend',
            actionLabel: 'Redeem this token',
            helper: "Paste any string. Currently simulated — see the header chip.",
            placeholder: 'cashuB…',
            maxLength: 200,
        },
    },
    knowledge({
        id: 35,
        emoji: '⚡⚡',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'What is a Zap?',
        tagline: 'Bitcoin tips, threaded through Lightning + Nostr',
        learn: {
            heading: 'A Zap is a Lightning payment with a Nostr receipt',
            body:
                "A 'zap' is the social way to send sats: you pay someone a few sats over Lightning, and a 'zap receipt' (kind-9735 event) gets published to Nostr so everyone can see it.\n\nIt's how Nostr does likes — but the like has real value attached. Suddenly comment quality goes up. Suddenly creators get paid in real money for posts. Suddenly tipping a stranger across the world is a single tap.\n\nThe receipt event is what makes zaps social: clients show 'this post earned 1,250 sats from 18 zaps' in real-time.",
            tip: "Zaps are how Bitcoin and Nostr connect into one practical system.",
        },
        quiz: {
            question: 'What two things happen during a zap?',
            options: [
                { text: 'A Lightning payment + a Nostr "zap receipt" event published to relays', correct: true },
                { text: 'Just a Lightning payment', correct: false, why: 'Then nobody else could see it — the receipt is what makes zaps social.' },
                { text: 'Just a Nostr event', correct: false, why: 'No money would actually move.' },
            ],
        },
    }),
    {
        id: 36,
        emoji: '⚡',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Receive your first zap',
        tagline: "We'll generate a zap receipt against your npub",
        simulated: true,
        learn: {
            heading: 'Zap receipts in 60 seconds',
            body:
                "We'll have the backend simulate someone zapping you 21 sats. A kind-9735 event will be created (in simulation mode, locally; in real mode, against your configured LNbits) and you'll see the receipt.\n\nIn real life this happens when someone clicks the lightning bolt under your post. Their Lightning wallet pays the sats, an LNURL-zap-aware service publishes the receipt event.",
            tip: 'To receive real zaps, you need a Lightning address tied to your Nostr npub (NIP-57).',
        },
        quiz: {
            question: 'Where does the "zap receipt" get published?',
            options: [
                { text: 'To the Bitcoin blockchain', correct: false, why: 'Way too expensive. It goes to Nostr relays.' },
                { text: 'To Nostr relays as a kind-9735 event', correct: true },
                { text: 'Nowhere, just in your wallet', correct: false },
            ],
        },
        do: {
            kind: 'nostr-zap',
            actionLabel: 'Simulate a 21-sat zap',
            helper: "We'll generate a zap receipt referencing your npub. Currently simulated.",
        },
    },
    knowledge({
        id: 37,
        emoji: '🆔',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'NIP-05: human-readable handles',
        tagline: 'Why some Nostr names look like emails',
        learn: {
            heading: 'amaka@nostrplebs.com — what is that?',
            body:
                "Your npub1xyz... is ugly. NIP-05 lets you tie your npub to a friendly identifier like amaka@nostrplebs.com or you@yourdomain.com.\n\nIt works via a tiny JSON file at /.well-known/nostr.json on the domain, listing names → pubkeys. Any client can fetch that file and verify the mapping.\n\nThe domain owns the namespace ('amaka' is unique within nostrplebs.com), but your npub remains yours forever — NIP-05 is just an alias, not the identity itself. Lose access to your domain, you lose the alias; you don't lose your account.",
            tip: 'NIP-05 verification = a tiny JSON file on a webserver. No company gatekeeper.',
        },
        quiz: {
            question: 'You lose your NIP-05 domain. What happens to your Nostr identity?',
            options: [
                { text: "It's gone forever", correct: false, why: 'The npub is the real identity; NIP-05 is just an alias.' },
                { text: "You keep your npub and all posts; only the friendly handle is gone", correct: true },
                { text: 'A central registry transfers it', correct: false },
            ],
        },
    }),
    knowledge({
        id: 38,
        emoji: '⚡@',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Lightning addresses, deeper',
        tagline: "How alice@example.com resolves to an invoice",
        learn: {
            heading: 'LNURL behind the curtain',
            body:
                "When you pay alice@getalby.com, your wallet does:\n\n  1. Fetch https://getalby.com/.well-known/lnurlp/alice\n  2. Get a callback URL + min/max amounts\n  3. POST the amount to the callback URL\n  4. Receive a fresh Lightning invoice\n  5. Pay the invoice over Lightning\n\nThat's the whole 'magic'. The Lightning Address ↔ LNURL ↔ invoice chain is just a HTTP convention, not part of the Lightning protocol proper.\n\nIt means anyone hosting a /.well-known/lnurlp/ endpoint can have Lightning addresses — no special crypto, no special protocol.",
            tip: "A Lightning Address is just an HTTP endpoint that returns Lightning invoices.",
        },
        quiz: {
            question: 'What does your wallet actually fetch when you pay a Lightning Address?',
            options: [
                { text: 'Nothing — the address is itself an invoice', correct: false, why: "The address is shorthand; the invoice is fetched on demand." },
                { text: 'An LNURL endpoint at /.well-known/lnurlp/<name>, which returns a callback to get an invoice', correct: true },
                { text: 'The recipient\'s seed phrase', correct: false, why: "Absolutely not, ever." },
            ],
        },
    }),
    knowledge({
        id: 39,
        emoji: '📡',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Custodial vs self-hosted Lightning',
        tagline: "Why your default Lightning wallet is probably custodial",
        learn: {
            heading: 'Running a node is hard. Phoenix/Wallet of Satoshi solve that.',
            body:
                "A full self-hosted Lightning node needs always-on hardware, on-chain liquidity, channel management, backups. It's a hobby, not a casual choice.\n\nMost users use either:\n\n• Custodial: Wallet of Satoshi, Cash App. The company holds the funds. Easiest UX, you accept counterparty risk.\n\n• Semi-self-custodial: Phoenix, Breez SDK. They run nodes on your behalf but you hold the keys; channels open automatically.\n\n• Fully self-custodial: Zeus, LND-on-your-own-node. Hardest, most sovereign.\n\nThere's no shame in custodial for small balances. Move up the stack as you hold more.",
            tip: "Wallet of Satoshi is custodial. Phoenix is mostly not. Use the right tool for the balance.",
        },
        quiz: {
            question: 'Wallet of Satoshi: custodial or self-custodial?',
            options: [
                { text: 'Self-custodial', correct: false, why: 'Custodial — they hold all funds for users.' },
                { text: 'Custodial', correct: true },
                { text: 'Depends on the country', correct: false },
            ],
        },
    }),
    knowledge({
        id: 40,
        emoji: '🌉',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'L2s, sidechains, and rollups',
        tagline: 'Lightning is one of many. There are others.',
        learn: {
            heading: 'The scaling landscape',
            body:
                "Lightning is the most-used Bitcoin Layer 2, but it's not the only design.\n\n• Liquid: a federated sidechain run by Blockstream — fast, confidential, custodial-ish.\n\n• Ark: emerging design for non-custodial, no-channels payments.\n\n• Statechains, channel factories, BitVM: research directions that may or may not pan out.\n\n• Drivechains (BIP-300): proposed soft fork to enable miner-secured sidechains. Politically contested.\n\nThe point: Bitcoin is base-layer. Anything built on top is an L2 with its own trade-offs (trust assumptions, custody model, speed, privacy). 'Lightning' isn't the end of the story — it's the most mature chapter.",
            tip: "Treat 'L2' as a category, not a product. Each L2 has different trust assumptions.",
        },
        quiz: {
            question: 'Which of these is NOT a Bitcoin L2 / sidechain proposal?',
            options: [
                { text: 'Liquid', correct: false, why: 'Real federated sidechain by Blockstream.' },
                { text: 'Lightning', correct: false, why: 'The most-used L2.' },
                { text: 'Ethereum mainnet', correct: true, why: 'Separate blockchain, not a Bitcoin layer.' },
            ],
        },
    }),

    // ═════════════════════════════════════════════════════════════════════
    // TIER 5 — CAPTAIN (41-50) — 100 sats each
    // Sovereignty, signet on-chain, security, the long game
    // ═════════════════════════════════════════════════════════════════════
    {
        id: 41,
        emoji: '🗺️',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Derive your first address',
        tagline: 'From 12 words to an actual address — by hand (sort of)',
        simulated: true,
        learn: {
            heading: 'Seed → master key → child key → address',
            body:
                "The 12 words from mission 11 turn into a seed (BIP39), then a master extended key (BIP32), then derived child keys at standardized paths (BIP44/49/84). Each child key gets a public key, and each public key hashes to an address.\n\nThe standard path for native-segwit (modern) bitcoin is m/84'/0'/0'/0/0 for your very first receive address. Wallets use this so any compatible wallet can restore the same addresses from the same seed.\n\nIn this mission, we'll derive that first address from your seed phrase right in your browser. You'll see how a private key, a public key, and an address are mathematically linked — and how losing the seed means losing access to all of them.",
            tip: 'The path m/84\'/0\'/0\'/0/0 is the convention for "first native-segwit receive address". Memorize it.',
        },
        quiz: {
            question: 'What standard defines the derivation paths for native-segwit addresses?',
            options: [
                { text: 'BIP39', correct: false, why: 'BIP39 is the word list / mnemonic format.' },
                { text: 'BIP84', correct: true },
                { text: 'BIP21', correct: false, why: 'BIP21 is for "bitcoin:" URIs.' },
            ],
        },
        do: {
            kind: 'derive-address',
            actionLabel: 'Derive my first address',
            helper: "We'll derive m/84'/0'/0'/0/0 from your generated seed phrase, in-browser.",
        },
    },
    {
        id: 42,
        emoji: '🪙',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Send a real on-chain transaction (signet)',
        tagline: 'For the first time in this app, you broadcast to a blockchain',
        simulated: false,
        learn: {
            heading: 'Get signet sats, send some, paste the txid',
            body:
                "Time to actually use a Bitcoin network. We'll point you at a signet faucet (free, anyone can use it) where you can claim test sats. Send a tiny amount to any signet address. Then paste the transaction id (txid) here, and the backend will verify it exists on signet by asking mempool.space.\n\nSignet faucets to try:\n• https://signet.bc-2.jp/\n• https://signetfaucet.com\n\nYou'll need a signet-capable wallet. Sparrow, Electrum, or Mutiny work. Spending 5 minutes on this teaches you more than 5 hours of reading.",
            tip: "Save the txid before pasting — and click through to mempool.space/signet/tx/<id> to see it confirm.",
        },
        quiz: {
            question: 'What proves to BitPilot that your signet transaction is real?',
            options: [
                { text: 'You scout\'s honour', correct: false },
                { text: 'mempool.space/signet/api confirms the txid exists', correct: true },
                { text: 'Your wallet sends a screenshot', correct: false },
            ],
        },
        do: {
            kind: 'onchain-signet',
            actionLabel: 'Verify my signet txid',
            helper: "Paste your 64-character hex txid. We'll ask mempool.space/signet whether it's real.",
            placeholder: '64-character hex transaction id',
            maxLength: 64,
        },
    },
    knowledge({
        id: 43,
        emoji: '🔏',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Hardware wallets',
        tagline: 'Why a $50 device is the cheapest peace of mind in crypto',
        learn: {
            heading: 'Keep the keys off the internet',
            body:
                "A hardware wallet is a small device whose only job is to hold private keys and sign transactions, never exposing the keys to your computer. Your laptop builds the transaction; the device signs it; the laptop broadcasts it.\n\nThis means malware on your laptop can\'t steal your keys. The worst it can do is trick you into approving the wrong transaction — which is why hardware wallets show the amount and address on their own screen for you to verify.\n\nWell-known options: Coldcard, Trezor, BitBox02, Ledger (with caveats). For balances over a few hundred dollars, get one.",
            tip: "Verify the receive address ON the hardware wallet screen, not the laptop screen. Malware fakes laptop UIs all day.",
        },
        quiz: {
            question: 'Why is verifying addresses on the hardware wallet\'s own screen important?',
            options: [
                { text: 'It looks cooler', correct: false },
                { text: 'Malware can fake addresses shown on your computer', correct: true },
                { text: 'The hardware wallet runs faster', correct: false },
            ],
        },
    }),
    knowledge({
        id: 44,
        emoji: '🕸️',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Multisig 101',
        tagline: '2-of-3 keys → you control your bitcoin even if one device is lost',
        learn: {
            heading: 'M-of-N signatures',
            body:
                "A multisig address requires M out of N keys to spend. Most common: 2-of-3. You have three keys (say, two hardware wallets and one backup). Any two of them can sign together to spend. One can be lost or compromised, and you're fine.\n\nThis is how serious holders structure cold storage. Yes, it's more complex than a single-key wallet. Yes, the complexity is worth it past a certain balance.\n\nNot for everyone — you need to be comfortable with backups, descriptors, and PSBT files. But the resilience is dramatic.",
            tip: "Single-sig: simple, one-key risk. Multisig: complex, dramatically harder to lose access.",
        },
        quiz: {
            question: 'In a 2-of-3 multisig, how many keys must be present to spend?',
            options: [
                { text: 'All 3', correct: false, why: 'That would be 3-of-3.' },
                { text: '2', correct: true },
                { text: '1', correct: false, why: 'That would be 1-of-3, i.e., any one key.' },
            ],
        },
    }),
    knowledge({
        id: 45,
        emoji: '🌑',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Cold vs hot storage',
        tagline: 'Why your savings shouldn\'t be on your phone',
        learn: {
            heading: 'Two tiers of storage',
            body:
                "Hot wallet: keys on an internet-connected device (phone, browser, exchange). Convenient for daily spending. If your phone gets compromised, the balance is gone.\n\nCold storage: keys generated and held offline (hardware wallet, paper, steel plate). Inconvenient — you have to plug something in to spend. But malware never sees the keys.\n\nThe usual structure: a small hot wallet on your phone for daily spending (≤ what you'd carry in cash), the rest in cold storage. Some people use multisig for cold storage to get redundancy on top of offline-ness.",
            tip: 'Treat hot wallet balances like walking-around cash, cold storage like a safe deposit box.',
        },
        quiz: {
            question: "Which is more secure for large balances?",
            options: [
                { text: 'A hot wallet on your phone', correct: false, why: 'Convenient, but online = attackable.' },
                { text: 'Cold storage on a hardware wallet kept offline', correct: true },
                { text: 'An exchange', correct: false, why: 'Counterparty risk on top of everything else.' },
            ],
        },
    }),
    knowledge({
        id: 46,
        emoji: '🕵️',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Privacy basics',
        tagline: 'The chain is public — act accordingly',
        learn: {
            heading: 'Bitcoin is pseudonymous, not anonymous',
            body:
                "Every Bitcoin transaction is permanently public. If anyone learns which address is yours, they can see every other address connected to it, every payment in and out, every balance.\n\nGood habits:\n\n• Don't reuse addresses (your wallet helps — it generates fresh ones)\n• Don't post your address publicly tied to your real name\n• Watch out for 'address clustering' — exchanges and analytics firms link addresses by behaviour\n• Lightning is better for privacy than on-chain (less data on the chain), but not perfect\n• For serious privacy: CoinJoin, JoinMarket, Wabisabi protocols\n\nFor most people, just not-reusing-addresses + not-doxxing-your-stack covers the basics.",
            tip: 'Anyone with one of your addresses can browse your entire history. Behave accordingly.',
        },
        quiz: {
            question: 'Why is reusing the same Bitcoin address a privacy mistake?',
            options: [
                { text: 'It makes transactions slower', correct: false },
                { text: 'Everyone who learns the address can then see all your activity', correct: true },
                { text: "It's deprecated", correct: false, why: "Address reuse is allowed; just bad practice." },
            ],
        },
    }),
    knowledge({
        id: 47,
        emoji: '⚓',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Run a node (one day)',
        tagline: 'Why running your own Bitcoin node matters',
        learn: {
            heading: '"Verify, don\'t trust" — literally',
            body:
                "A Bitcoin node downloads every block since 2009 and verifies every transaction itself. When you run a node, you stop relying on anyone else's claim about what bitcoin is or what the rules are.\n\nA full node takes ~600 GB of disk, a few days to initial-sync, and a few watts of power. You can run one on a Raspberry Pi (Umbrel, MyNode, Start9 OS) for under $200.\n\nWhy bother? Because if every wallet you use just trusts random servers, you're back to trusting middlemen. A node makes you the authority on your own money. It's the actual point of Bitcoin.",
            tip: "You don't need to mine to run a node. They're separate jobs.",
        },
        quiz: {
            question: 'What does a Bitcoin full node do?',
            options: [
                { text: 'Mine new blocks', correct: false, why: 'Different job — that\'s a miner.' },
                { text: 'Download and verify every transaction since 2009 itself', correct: true },
                { text: 'Issue new bitcoin', correct: false, why: 'Only mining the next block issues new bitcoin — and only the protocol decides how much.' },
            ],
        },
    }),
    knowledge({
        id: 48,
        emoji: '⚖️',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'How rules actually change',
        tagline: 'Soft forks, hard forks, and why Bitcoin barely changes',
        learn: {
            heading: 'Consensus is stubborn — on purpose',
            body:
                "Bitcoin's monetary rules (21M cap, 10-minute blocks, halving schedule) haven't changed since 2009. Other rules occasionally do, via soft forks — backwards-compatible upgrades where old nodes still see new transactions as valid (just less restrictive).\n\nTaproot (2021) is the most recent major soft fork. It took years of debate and broad miner+economic-node signalling.\n\nHard forks (incompatible changes) are how chains split. Bitcoin Cash, Bitcoin SV — these are not 'Bitcoin' anymore; they forked off because some users wanted bigger blocks. The original chain followed the conservative path.\n\nThe lesson: Bitcoin is hard to change. That's a feature.",
            tip: "If a 'Bitcoin' chain has features mainnet doesn't have, you're looking at a fork, not Bitcoin.",
        },
        quiz: {
            question: 'Why is "Bitcoin barely changes" considered a feature?',
            options: [
                { text: 'Developers are lazy', correct: false },
                { text: "Predictability matters more than features for a monetary system", correct: true },
                { text: 'It\'s technically impossible to change Bitcoin', correct: false, why: "It is possible (soft forks happen). It's just deliberately slow." },
            ],
        },
    }),
    knowledge({
        id: 49,
        emoji: '🌍',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Why Bitcoin matters globally',
        tagline: 'It\'s not really about being rich',
        learn: {
            heading: "Bitcoin in places where money is broken",
            body:
                "In countries with stable currencies and functioning banks, Bitcoin can feel optional — a speculative asset.\n\nIn countries where the local currency loses 30%+ a year to inflation (Argentina, Turkey, Lebanon, Nigeria, Venezuela), or where banks freeze accounts (everywhere occasionally), Bitcoin is a parallel financial system that just works. You can save in something not controlled by your central bank. You can receive remittances without paying 9% to Western Union. You can move savings across a border without asking permission.\n\nThe people who need Bitcoin most rarely speak loudest about it. But the global usage data is unambiguous: adoption is highest where local money is weakest.",
            tip: "If you've never lived through hyperinflation or had your bank account frozen, you might not feel Bitcoin's pull. That's OK. Just know it exists for others.",
        },
        quiz: {
            question: 'Where is Bitcoin adoption per-capita typically highest?',
            options: [
                { text: 'Countries with stable, predictable currencies', correct: false },
                { text: 'Countries with high inflation or capital controls', correct: true },
                { text: 'Only the US', correct: false },
            ],
        },
    }),
    knowledge({
        id: 50,
        emoji: '🎓',
        topic: 'Captain',
        tech: 'bitcoin',
        name: 'You made it',
        tagline: 'What to do from here',
        learn: {
            heading: 'Curriculum complete. Now build the habit.',
            body:
                "You generated a real Nostr identity, learned Lightning, sent a signet on-chain transaction, and survived 51 missions of varying difficulty. You're past the hard part: understanding.\n\nWhat to do from here:\n\n• Pick a wallet. Phoenix (Lightning, semi-self-custodial) is a great starter. Sparrow + a hardware wallet for cold storage.\n• Buy a small amount of bitcoin — not as investment advice, but as 'now I have skin in the game'. Even 5,000 sats teaches more than 5,000 articles.\n• Follow a few people on Nostr who explain things calmly: fiatjaf, jb55, Lyn Alden, Knut Svanholm, Marty Bent.\n• Read 'The Bitcoin Standard' or 'Inventing Bitcoin' if you want depth.\n• Keep using sats. Lightning addresses are everywhere now. Tip your favourite podcaster, your friend, a random stranger on Nostr.\n\nWelcome to Bitcoin. Don't stop.",
            tip: "The best Bitcoin education is using it. Earnestly, in tiny amounts, until it's boring.",
        },
        quiz: {
            question: 'What\'s the best next step now that you\'ve finished BitPilot?',
            options: [
                { text: 'Move all my savings into bitcoin tomorrow', correct: false, why: "Definitely not. Start with an amount you genuinely don't mind losing." },
                { text: 'Pick a real wallet, get a small amount, start using sats for tiny things', correct: true },
                { text: 'Quit my job and start mining', correct: false, why: 'Modern mining is industrial. Not a beginner move.' },
            ],
        },
        actionLabel: 'Finish BitPilot 🎉',
        helper: 'You finished. We hope this was worth the time.',
    }),
]

/** Total mission count. The frontend never hardcodes 51 — it reads this. */
export const MISSION_COUNT = MISSIONS.length

/** Lookup a mission def by id (= mission number). Returns undefined if out of range. */
export function missionById(id: number): MissionDef | undefined {
    return MISSIONS.find((m) => m.id === id)
}
