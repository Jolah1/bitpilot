// ─── Backend-shape types ─────────────────────────────────────────────────────
export interface Participant {
    id: string
    name: string
    session_id: string
    current_mission: number
    completed_missions: number[]
    /**
     * Per-tree pointer: for each of the 8 trees, the next-incomplete
     * mission id (or `null` if the tree is fully complete). Hydrated by
     * the backend on every read, so the frontend can render a tree
     * picker without recomputing from `completed_missions`.
     */
    current_per_tree: Record<Tree, number | null>
    nostr_pubkey: string | null
    /**
     * Unix seconds of the participant's last activity (join, or a mission
     * completion). The facilitator dashboard reads this to flag learners who
     * have stalled, so the signal is accurate and survives a reload.
     */
    last_active: number
    /** Consecutive UTC days with at least one mission completion. */
    streak_count: number
    /** UTC day number (unix seconds / 86400) the streak was last credited. */
    streak_day: number
}

export interface Session {
    id: string
    name: string
    participant_ids: string[]
    created_at: number
}

export type Tech = 'bitcoin' | 'lightning' | 'nostr' | 'ecash'

/**
 * Nine skill trees. Each mission belongs to exactly one tree, see
 * `Tree::from_mission` in backend/src/models/mission.rs (the only source
 * of truth). The frontend mirrors that mapping in `TREES` below so the UI
 * can group/colour without a server roundtrip.
 *
 * Trees are peers, not stages, learners can pick any tree to start with,
 * though missions within a tree are taken in order.
 */
export type Tree =
    | 'money'
    | 'bitcoin'
    | 'lightning'
    | 'nostr'
    | 'ecash'
    | 'self-custody'
    | 'privacy'
    | 'sovereignty'
    | 'open-source'

/**
 * Difficulty tier shown on each tree so a newcomer knows where to begin and
 * a power user knows what they can safely skip to. Trees stay independently
 * startable, this is guidance, not a lock.
 */
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'

export interface TreeMeta {
    key: Tree
    label: string
    /** Mission ids in this tree, in pedagogical order. */
    missions: number[]
    tagline: string
    /** Rough difficulty tier, surfaced on the tree card. */
    difficulty: Difficulty
    /**
     * A tree we softly suggest finishing first, because its ideas make this
     * one easier. Rendered as a gentle "Tip: finish X first" nudge, never a
     * hard gate, a technical user can still jump straight in.
     */
    recommendedAfter?: Tree
}

/**
 * Mission membership of each tree. Must agree with `Tree::from_mission`
 * in backend/src/models/mission.rs, backend is source of truth, this
 * mirror is here so the UI can group/render without a network call.
 */
export const TREES: TreeMeta[] = [
    { key: 'money',        label: 'Money Basics', missions: [0, 1, 77, 78, 2, 5, 9, 10],                   tagline: 'What money is, why fiat leaks, why Bitcoin exists.', difficulty: 'Beginner' },
    { key: 'bitcoin',      label: 'Bitcoin',      missions: [6, 7, 8, 87, 88, 18, 19, 89, 40, 90, 48, 49], tagline: 'Blocks, mempool, miners, UTXOs, Script, Taproot, pools.', difficulty: 'Beginner', recommendedAfter: 'money' },
    { key: 'lightning',    label: 'Lightning',    missions: [21, 22, 79, 80, 23, 24, 25, 38, 81, 82, 39, 83], tagline: 'Channels, HTLCs, liquidity, LSPs, watchtowers, splicing.', difficulty: 'Intermediate', recommendedAfter: 'bitcoin' },
    { key: 'nostr',        label: 'Nostr',        missions: [13, 14, 15, 97, 16, 17, 26, 27, 98, 28, 29, 30, 35, 36, 37, 99], tagline: 'Identity without a server. Notes, signers, DMs, the wider ecosystem.', difficulty: 'Intermediate' },
    { key: 'ecash',        label: 'eCash',        missions: [31, 32, 33, 34, 84, 55, 56, 85, 57, 86],      tagline: 'Bearer money backed by a mint. Cashu, Fedimint, honest failure modes.', difficulty: 'Intermediate', recommendedAfter: 'lightning' },
    { key: 'self-custody', label: 'Self-custody', missions: [3, 4, 11, 12, 91, 92, 93, 20, 41, 94, 95, 43, 44, 45, 96], tagline: 'Wallets, seeds, passphrases, PSBTs, descriptors, multisig.', difficulty: 'Advanced', recommendedAfter: 'bitcoin' },
    { key: 'privacy',      label: 'Privacy',      missions: [46, 51, 52, 58, 59, 60, 61, 62, 63, 64, 65, 66], tagline: 'Chain analysis, CoinJoin, KYC leaks, threat models.', difficulty: 'Advanced', recommendedAfter: 'bitcoin' },
    // Mission 50 ("You made it") stays last, it's the graduation lesson.
    { key: 'sovereignty',  label: 'Full Independence', missions: [42, 47, 53, 54, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 50], tagline: 'Signet, nodes, exit optionality, and the long game.', difficulty: 'Advanced', recommendedAfter: 'self-custody' },
    // Mission 105 graduates with a real merged GitHub PR (issue #57).
    { key: 'open-source',  label: 'Open Source',  missions: [100, 101, 102, 103, 104, 105],                tagline: 'Git, real codebases, and your first merged Bitcoin PR.', difficulty: 'Advanced', recommendedAfter: 'bitcoin' },
]

/** Returns the tree a mission id belongs to. */
export function treeFor(missionId: number): TreeMeta {
    return TREES.find((t) => t.missions.includes(missionId)) ?? TREES[0]
}

/**
 * Tree badge as returned by GET /api/participants/me/badges.
 *
 * One per skill tree (9 total). Earned when every mission in the tree
 * has been completed. `earned_at` is unix-seconds of the latest
 * completion in the tree (the moment the badge actually unlocked),
 * `null` while still in progress.
 *
 * Derived server-side from `mission_completions`, so badges always agree
 * with the completion list, no drift, no migration when membership shifts.
 */
export interface Badge {
    tree: Tree
    completed: number
    required: number
    earned: boolean
    earned_at: number | null
}

// ─── Frontend mission catalogue ──────────────────────────────────────────────
// Numbers MUST line up with `Mission::all()` in backend/src/models/mission.rs.
// The backend is source of truth for `id`, `tree`, and `simulated`.
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
    | 'knowledge'         /* no API call, user clicks an affirm button to credit the mission */
    | 'nostr-identity'    /* POST /api/nostr/identity (client-side keygen, then proof to backend) */
    | 'invoice'           /* POST /api/invoice */
    | 'pay'               /* POST /api/pay (needs lightning-address text input) */
    | 'ecash-claim'       /* POST /api/ecash/mint */
    | 'ecash-spend'       /* POST /api/ecash/redeem (user pastes token) */
    | 'nostr-publish'     /* POST /api/nostr/publish */
    | 'nostr-profile'     /* update profile metadata (kind 0) */
    | 'nostr-follow'      /* publish a contact list (kind 3) with a chosen npub */
    | 'nostr-zap'         /* receive (or simulate) a zap receipt */
    | 'onchain-signet'    /* paste a signet txid; verifier asks Mutinynet, then signet */
    | 'seed-words'        /* generate BIP39 mnemonic client-side; quiz on a word */
    | 'derive-address'    /* derive an address from the mnemonic and submit */
    | 'paste-value'       /* generic "type or paste this thing" reflection input */
    | 'github-pr'         /* mission 105: backend asks the GitHub API if the PR is merged and yours */

export interface MissionDef {
    /** Mission number, stable across catalogue reshapes. Tree assignment
     *  lives on the backend in `Tree::from_mission`. */
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
        /**
         * Where the task actually happens. When the Do step sends the
         * learner somewhere external (a faucet, a repo, an issue list),
         * list it here and the DoPanel renders tappable links, so nobody
         * has to retype a URL out of the lesson body.
         */
        links?: { label: string; href: string }[]
    }
}

// ── Quick-build helpers ─────────────────────────────────────────────────────
// Most knowledge missions are 95% the same shape: a heading, body, tip, a
// 3-option multiple-choice, and a "You got it" button. Building each one as a
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
    links?: { label: string; href: string }[]
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
            actionLabel: o.actionLabel ?? 'You got it',
            helper: o.helper ?? "Knowledge mission. Understanding *is* the goal; the button just credits you.",
            links: o.links,
        },
    }
}

/**
 * The full BitPilot curriculum: 106 missions (0..=105) across 9 flight paths.
 *
 * Mission ids are stable across tree reshuffles, they don't renumber when
 * a mission moves to a different tree. The catalogue below is ordered by
 * id for readability; tree grouping happens via `TREES` above.
 *
 * See `Tree::from_mission` in backend/src/models/mission.rs for the
 * authoritative mission→tree mapping.
 */
export const MISSIONS: MissionDef[] = [
    // ═════════════════════════════════════════════════════════════════════
    // Missions 0-10, Money 101 + Bitcoin protocol + Self-custody intro
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
                "Most people learn about Bitcoin by reading. You'll learn by using. Over more than 100 missions you'll generate real cryptographic keys, send (testnet) payments, publish a message to a network nobody owns, and end up understanding more than 99% of people who 'know about crypto'.\n\nNo wallet to install. No money at risk. Every action that touches a real network is clearly labeled, and everything that's just a demonstration is too.\n\nMissions are grouped into nine flight paths: Money, Bitcoin, Lightning, Nostr, eCash, Self-custody, Privacy, Sovereignty, Open Source. Start anywhere, finish a flight path, earn its compass badge.",
            tip: 'You\'ll learn to think in sats, the unit real Bitcoiners use. No money changes hands inside BitPilot.',
        },
        quiz: {
            question: 'What does BitPilot mainly want you to do?',
            options: [
                { text: 'Read articles about Bitcoin', correct: false, why: 'Reading is fine, but this is built around *doing*.' },
                { text: 'Actually use Bitcoin, Lightning, Nostr, and eCash', correct: true },
                { text: 'Buy bitcoin with my credit card', correct: false, why: "Nope, nothing here touches your bank or real money." },
            ],
        },
        actionLabel: "I'm in, let's go",
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
                "Bitcoin is digital money you can send to anyone, anywhere, without asking a bank for permission. Nobody owns the network, it runs on thousands of computers around the world that all keep the same shared ledger.\n\nIt was invented in 2009 by someone using the name Satoshi Nakamoto. Nobody knows who they really are, and that's part of the point: no single person or company can shut it down.\n\nThe rules are fixed in code: there will only ever be 21 million bitcoins. No CEO can print more.",
            tip: "Bitcoin isn't owned by a company. It's a protocol, like email, that anyone can use.",
        },
        quiz: {
            question: 'Who decides how much Bitcoin gets created?',
            options: [
                { text: 'The Bitcoin Foundation board', correct: false, why: 'There is no central foundation that controls supply.' },
                { text: 'Fixed rules in the code, 21 million total, forever', correct: true },
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
                "Most people who use Bitcoin every day don't say '0.00021 BTC', they say '21,000 sats'. It's cleaner and it doesn't feel weird when the price moves.\n\nA satoshi (sat) is the smallest unit of bitcoin. There are 100 million sats in 1 BTC.\n\nA cup of coffee in a Bitcoin economy might cost 2,000-5,000 sats. A song on a Bitcoin-native streaming app might be 1 sat per second. Tiny amounts work because Bitcoin is divisible to 8 decimal places.",
            tip: 'When you see "1 BTC", picture "100,000,000 sats". That mental switch unlocks everything else.',
        },
        quiz: {
            question: 'How many satoshis are in 1 bitcoin?',
            options: [
                { text: '1,000', correct: false },
                { text: '1,000,000', correct: false, why: 'Close, but off by a factor of 100.' },
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
                "A Bitcoin address is a string like `bc1q...` (or `1...`, `3...` for older formats). It tells the network where to send sats.\n\nYou can generate a new address every time you receive, for free, in milliseconds. There is no 'account number' that gets reused forever. Privacy-aware wallets do generate a fresh one for every incoming payment.\n\nThe address is derived from your public key, which is derived from your private key. The chain goes private key → public key → address. Money flows the other way: someone with your address can pay you; only someone with your private key can spend the result.",
            tip: 'Sharing an address is safe. Sharing a private key (or seed phrase) is catastrophic.',
        },
        quiz: {
            question: 'Can someone steal your bitcoin if they know your address?',
            options: [
                { text: 'Yes, the address is the secret', correct: false, why: "Backwards. The address is the public bit; sharing it is fine." },
                { text: "No, the address is meant to be shared. Only the private key spends.", correct: true },
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
        tagline: 'Alice pays her cousin abroad at 2am. Nobody had to say yes.',
        learn: {
            heading: 'No KYC at the protocol layer',
            body:
                "When you swipe a Visa card, at least four companies have to say yes: your bank, the merchant's bank, Visa, and the merchant's payment processor. Any one of them can decline you. That's the design.\n\nBitcoin doesn't have those gates. The protocol doesn't know who you are, doesn't care, can't tell. A transaction is valid if the math checks out, signature matches the key, inputs aren't already spent, and that's the only test.\n\nThat property is called 'permissionless'. It's what lets a journalist in Belarus, a refugee in Sudan, or a farmer in Bukombe receive payments without anyone holding a veto.",
            tip: 'Exchanges KYC you because they\'re companies regulated by a government. Bitcoin itself does not.',
        },
        quiz: {
            question: 'Who has to approve a Bitcoin transaction at the protocol level?',
            options: [
                { text: 'Your government', correct: false },
                { text: "The recipient's bank", correct: false },
                { text: 'Nobody, math validates, miners include it in a block', correct: true },
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
                "Every ~10 minutes a miner wins the right to publish the next block, which bundles up recently broadcast transactions. Once your transaction is in a block, it has '1 confirmation'.\n\nFor small amounts, 1 confirmation is enough. For large amounts (think: buying a house), people wait for 6 confirmations, about an hour, because reorganising the chain that far back is astronomically expensive.\n\nThis is why on-chain Bitcoin is bad for buying coffee: 10-60 minutes is silly for $3. It's great for settlement of larger value, where waiting an hour buys you decades of mathematical certainty.",
            tip: 'For day-to-day spending, use Lightning. The Lightning flight path covers that.',
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
                "Every Bitcoin transaction has to be picked up by a miner and put into a block. Blocks are limited in size, so when lots of people want to transact at once, you have to bid for space by paying a higher fee.\n\nThat bidding queue is called the mempool. Pay more, get in sooner. Pay less, wait longer, sometimes hours, sometimes days.\n\nLightning has almost no fees per payment because routing a payment through existing channels is cheap. The fees only kick in when channels open or close (which is an on-chain transaction).",
            tip: 'Buying coffee? Use Lightning. Moving life savings? Use on-chain, pay the fee, sleep well.',
        },
        quiz: {
            question: 'Why are on-chain Bitcoin fees sometimes high?',
            options: [
                { text: 'Bitcoin charges a percentage like Visa', correct: false, why: "Bitcoin doesn't charge a percentage, fees are an open market." },
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
                "A miner is a computer running specialized hardware that competes to find a specific number, one that, when combined with a candidate block, produces a hash starting with enough zeros. It's basically guessing trillions of times a second.\n\nWhen a miner finds the number first, they get to publish the next block and collect two things: the fees from every transaction inside it, and a 'block subsidy' of newly issued bitcoin. That subsidy halves every four years (the 'halving') and will eventually reach zero around the year 2140.\n\nMining is what secures the network: rewriting history would require redoing all that work, which costs more energy than any attacker can afford.",
            tip: "Mining isn't 'wasted' energy, it's the cost of having a global ledger nobody can rewrite.",
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
                "When Bitcoin started in 2009, miners got 50 BTC for each block. In 2012 that dropped to 25. In 2016, 12.5. In 2020, 6.25. In 2024, 3.125. Sometime in 2028, 1.5625. And so on, until the subsidy rounds to zero.\n\nThis schedule is hard-coded. Nobody can change it without convincing the entire network to upgrade their software in unison, which has never happened for monetary policy and probably never will.\n\nThe halving is why Bitcoin's supply is capped at 21M: it's a geometric series that converges. Beautiful, brutal, predictable.",
            tip: 'The next halving determines the supply schedule for the next 4 years, set your calendar.',
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
        tagline: 'Alice keeps sats on an exchange. Ben holds his own keys. Only one of them owns bitcoin.',
        learn: {
            heading: 'Who holds the keys?',
            body:
                "If a company (an exchange, a 'cloud wallet', a payment app) holds your private keys, that's custodial. You have an account; they have the bitcoin. They can freeze you, lose the bitcoin in a hack, get subpoenaed, or go bankrupt with your money inside.\n\nIf you hold the keys yourself, that's self-custodial. Nobody can freeze you, but if you lose your backup, nobody can recover the funds either. The trade-off is total.\n\nMost people start custodial (easier, less scary) and move to self-custody as they hold more. There's no shame in either, but if you don't know which one your wallet is, assume custodial and treat it as 'an account with a company that happens to denominate balances in sats'.",
            tip: "Rule of thumb: if there's a password reset, you're custodial.",
        },
        quiz: {
            question: "You can't remember your wallet password. The app emails you a reset link. Are you custodial or self-custodial?",
            options: [
                { text: 'Custodial, only a company can reset your access', correct: true },
                { text: 'Self-custodial, your seed phrase reset the password', correct: false, why: "Self-custody has no reset. A 12-word seed phrase isn't a password; it's the keys themselves." },
                { text: 'Depends on the country', correct: false },
            ],
        },
    }),

    // ═════════════════════════════════════════════════════════════════════
    // Missions 11-20, Seed phrases, Nostr identity, UTXOs, security basics
    // Seed phrases, keys, addresses, Nostr identity
    // ═════════════════════════════════════════════════════════════════════
    {
        id: 11,
        emoji: '🌱',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Generate a seed phrase',
        tagline: '12 words that ARE your wallet, generated right here in your browser',
        simulated: true, // BIP39 generated client-side; the words are real BIP39
        learn: {
            heading: 'BIP39: turning randomness into a backup',
            body:
                "A seed phrase (or 'mnemonic') is 12 or 24 English words that encode the secret behind every key in your wallet. Restore the words on any compatible wallet, anywhere in the world, and you have your bitcoin again.\n\nThe magic word for this standard is BIP39, the spec that defines a list of 2048 words and how to convert random bytes into them and back.\n\nClick generate and we'll create a real BIP39 seed phrase in your browser. It's not connected to any real money, but it IS real cryptographic randomness. Treat it the way you'd treat a real one: don't share it, don't paste it into random websites, don't take a screenshot.",
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
        tagline: 'Alice loses her phone on the bus, and her bitcoin is fine. Her 12 words are why.',
        learn: {
            heading: 'The seed is everything',
            body:
                "From the 12 words, your wallet derives a master private key. From the master key, it derives every individual key, every address, every signature you'll ever produce.\n\nWhich means: those 12 words ARE the wallet. The app on your phone is just a UI on top of them. Lose the phone, the app's gone, but you can restore your wallet on any other app that supports BIP39 by typing the words back in.\n\nThe inverse is also true: anyone who gets the 12 words has the wallet too. There's no password on top, no 2FA, no recovery email. Just words.",
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
                "Every other social platform has a database table of usernames, and a company that decides which row is yours. Block you, ban you, lose the database, you're gone.\n\nNostr replaces that with public-key cryptography. Your 'username' is just your public key (the npub). You prove you're you by signing with the private half (the nsec). No server in between.\n\nThat means your identity is portable across every Nostr app, forever, with nobody's permission. It also means you carry the responsibility for the keys yourself.",
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
                "Click the button and we'll generate a real secp256k1 keypair right here in your browser. The public half (npub) is your handle on every Nostr client in existence. The private half (nsec) is your password, except it can never be reset.\n\nThis is important: from this mission onward, we use the same keypair for everything Nostr-related. Save your nsec to a password manager before you continue. If you lose it, you lose this identity.\n\nThe keys are generated client-side and the nsec never leaves your device. Only the npub is sent to the backend, so we can verify later that you actually published as you.",
            tip: "If you don't have a password manager, get one. Bitwarden and 1Password are good. Save the nsec there.",
        },
        quiz: {
            question: 'Your nsec (private key) is leaked. What can the attacker do?',
            options: [
                { text: 'Nothing, it expires automatically', correct: false, why: 'Nostr keys never expire. There is no reset.' },
                { text: 'Post as you, sign things as you, they ARE you on Nostr', correct: true },
                { text: 'Steal your bitcoin from your bank', correct: false, why: "Nostr keys aren't connected to your bank, but losing them is still very serious." },
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
                "Your npub (public key) is meant to be shared. Put it on your business card. Tell your friends. People use it to find you and follow you.\n\nYour nsec (private key) is the opposite. It signs every message you post. If someone has it, they can post as you forever and there's no 'forgot password' button.\n\nRule of thumb: if a website or app asks you to paste your nsec, leave. Real Nostr apps let you sign locally, they never need to see your private key.",
            tip: 'npub starts with "npub1…", nsec starts with "nsec1…". One letter, world of difference.',
        },
        quiz: {
            question: 'Which key should you paste into a random website that asks for it?',
            options: [
                { text: 'Your npub (the public one)', correct: true, why: 'npub is meant to be public. Sharing it is fine.' },
                { text: 'Your nsec (the private one)', correct: false, why: 'Never. A site asking for your nsec is either incompetent or malicious.' },
                { text: 'Both, they need to verify you', correct: false, why: 'Anyone asking for both is a scam.' },
            ],
        },
    }),
    knowledge({
        id: 16,
        emoji: '📡',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Relays, the dumb pipes',
        tagline: 'Where your messages actually live',
        learn: {
            heading: 'Relays are simple websocket servers',
            body:
                "A Nostr relay is just a server that accepts signed events and re-broadcasts them to anyone listening. There's no algorithm, no recommendation engine, no moderation team. The relay's only job is to be a pipe.\n\nIf one relay rate-limits you or goes offline, you connect to another. Most clients connect to a handful at once and de-duplicate. There are hundreds of public relays.\n\nThat's the whole 'censorship resistance' story: you're not posting to a platform, you're shouting into a pool of pipes, and any pipe that won't carry your message is replaceable.",
            tip: "Popular public relays: relay.damus.io, nos.lol, relay.nostr.band, you'll see these everywhere.",
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
        name: 'Events, everything is one',
        tagline: 'Posts, profiles, follows: all the same shape',
        learn: {
            heading: 'A Nostr event has 5 fields',
            body:
                "Everything on Nostr is an 'event': a JSON object with five fields, id, pubkey, kind, content, signature. The 'kind' number says what type of thing it is.\n\nKind 1: a short text note (a tweet, basically).\nKind 0: profile metadata (name, about, picture).\nKind 3: contact list (your follows).\nKind 7: a reaction (like/dislike).\nKind 9735: a zap receipt (zaps come later on this flight path).\n\nThat's the whole protocol. Add new kinds, build new apps, same plumbing.",
            tip: "Every post, follow, reaction, and zap is a JSON object you cryptographically signed.",
        },
        quiz: {
            question: 'Which Nostr event kind is a text note (a "tweet")?',
            options: [
                { text: 'Kind 0', correct: false, why: 'Kind 0 is profile metadata.' },
                { text: 'Kind 1', correct: true },
                { text: 'Kind 9735', correct: false, why: 'Kind 9735 is a zap receipt, coming soon.' },
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
                "Mainnet is real Bitcoin: real coins, real economic activity, real risk. The 21 million cap lives here.\n\nTestnet is a parallel network using the same software but worthless coins (testnet sats). Anyone can mine. It's been around forever, sometimes broken, sometimes flooded. Useful for testing, not reliable.\n\nSignet is a newer testnet with one big improvement: there's a known set of signers controlling block production, so you can rely on it for tests. BitPilot's Lightning missions (when enabled) run on signet, real Bitcoin software, fake-but-stable sats.",
            tip: 'Mainnet coins have a market price. Testnet/signet coins are free, used for development and learning.',
        },
        quiz: {
            question: 'Which network does BitPilot use for the optional Lightning missions?',
            options: [
                { text: 'Mainnet, real money on the line', correct: false, why: "No way. Demos don't risk learner funds." },
                { text: 'Signet, testnet with reliable block production', correct: true },
                { text: 'A bespoke private chain', correct: false },
            ],
        },
    }),
    knowledge({
        id: 19,
        emoji: '🗂️',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'UTXOs, the bitcoin accounting model',
        tagline: 'Why Bitcoin isn\'t "balances", it\'s "unspent outputs"',
        learn: {
            heading: 'Bitcoin uses UTXOs, not accounts',
            body:
                "When somebody pays you 10,000 sats, the ledger doesn't add 10,000 to your 'balance'. It creates a brand-new Unspent Transaction Output (UTXO) tagged with your address. Your 'balance' is just the sum of all the UTXOs you can spend.\n\nWhen you pay someone, you spend whole UTXOs as inputs. If you owe 7,000 sats and you have a 10,000-sat UTXO, you split it: 7,000 to the recipient, 3,000 to yourself as 'change'. Both are brand-new UTXOs.\n\nThis is why your wallet shows 'change addresses', they're not magic, they're just the UTXOs you sent back to yourself.",
            tip: 'A Bitcoin "balance" is a derived number. The ground truth is the set of UTXOs you control.',
        },
        quiz: {
            question: 'You have one 10,000-sat UTXO and pay someone 3,000. What happens?',
            options: [
                { text: 'Your balance just decreases by 3,000', correct: false, why: 'Accounting model, that\'s how banks work, not Bitcoin.' },
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
        tagline: 'Five short stories of lost bitcoin. Every single one was preventable.',
        learn: {
            heading: 'How beginners lose money',
            body:
                "1. Exchange goes bust (Mt. Gox, FTX, Celsius…). Custodial money is loanable money.\n\n2. Phishing, fake support, fake login pages, fake browser extensions. They want your seed phrase.\n\n3. Lost seed phrase, paper destroyed, drive wiped, never wrote it down. No recovery.\n\n4. SIM swap, attacker takes over your phone number, resets accounts, drains the exchange.\n\n5. Sending to the wrong address, one typo, money gone forever.\n\nDoing self-custody well solves 1, 4, partly 2. Doing backups well solves 3. Double-checking addresses solves 5. There are no shortcuts.",
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
    // Missions 21-30, Lightning fundamentals + Nostr publishing
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
                "Bitcoin's design, 10-minute blocks, ~7 transactions per second globally, makes it incredibly secure but terrible at retail volume. If everyone on earth used on-chain Bitcoin for daily payments, fees would be 10s of dollars and confirmations would be days.\n\nThe Lightning Network is a second layer that sits on top. Two parties open a 'channel' on-chain, then exchange payments off-chain inside that channel as many times as they want. When they're done, they close the channel and only the final state hits the blockchain.\n\nResult: instant payments, fractions of a sat in fees, and Bitcoin can scale to billions of users without changing the base layer.",
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
        name: 'Channels, Lightning\'s primitive',
        tagline: 'Two parties, one shared escrow, infinite payments',
        learn: {
            heading: 'A channel is a 2-of-2 multisig',
            body:
                "To open a Lightning channel, you and a peer lock some bitcoin into a 2-of-2 multisig address on-chain. From that point on, you exchange signed updates of who owns how much, without broadcasting them.\n\nAt any time, either of you can close the channel by publishing the latest signed state, and only that final state hits the chain. Up until then, you can do millions of payments through that channel, each one instant and basically free.\n\nIn practice you don't open a channel to every person you want to pay. You open a channel to a well-connected node, and Lightning routes your payments through the network of channels like packet-switching on the internet.",
            tip: 'Most users never run their own node. They use a wallet that opens channels for them automatically.',
        },
        quiz: {
            question: 'How many on-chain transactions does opening + using + closing a channel cost?',
            options: [
                { text: 'One per payment', correct: false, why: 'No, that defeats the point.' },
                { text: 'Two total: one to open, one to close', correct: true },
                { text: 'Zero, Lightning is fully off-chain', correct: false, why: 'Open and close are anchored on-chain.' },
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
                "Receiving on Lightning starts with generating an invoice, a string that encodes how much you want, your node's identity, and a routing hint.\n\nThe invoice can only be paid once. If you want to receive again, you generate a new one. (This is different from a Bitcoin address, which can be reused, though for privacy you shouldn't.)\n\nWe'll create a 100-sat invoice for you. If LNbits is wired up on the backend, this hits a real signet Lightning node; otherwise it returns a plausible-looking string and the header chip will say 'Simulated'.",
            tip: "Invoices have an expiry, usually an hour. After that they're dead and you regenerate.",
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
        tagline: 'Lightning addresses look like emails, and work the same way',
        simulated: true,
        learn: {
            heading: 'A Lightning address: alice@getalby.com',
            body:
                "Memorising a fresh invoice every time is annoying. Lightning Address solves that: it's an email-shaped string like 'alice@getalby.com'. Behind the scenes, your wallet asks Alice's server for a fresh invoice and pays it. You never see the invoice.\n\n50 sats is roughly $0.03 at most prices. Tiny enough that you can practice without worrying, but it's how real Lightning payments feel.",
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
                "When you pay alice@example.com, your node looks at the public graph of channels and finds a path of nodes that connects you to her. Each node along the path forwards the payment, taking a tiny fee.\n\nThe payment uses 'onion routing', each hop only knows the previous and next node, not the full path. Privacy is decent, though not perfect.\n\nIf the payment can't find a route (no liquidity, peers offline), it fails atomically: nothing moves, you try again later.",
            tip: 'Lightning fees are typically <1 sat per payment, much cheaper than card processing.',
        },
        quiz: {
            question: 'A node forwarding your Lightning payment, what does it know?',
            options: [
                { text: 'The full path and the original sender', correct: false, why: 'Onion routing prevents this.' },
                { text: 'Only the previous and next hop', correct: true },
                { text: 'Nothing, Lightning is fully anonymous', correct: false, why: 'There is some metadata; it\'s private but not perfectly so.' },
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
            heading: "This one's real, your note will hit public Nostr relays",
            body:
                "When you click publish, your note is signed in your browser with the nsec from mission 14 and broadcast to public Nostr relays (relay.damus.io, nos.lol, relay.nostr.band).\n\nOnce a relay accepts it, your note is permanently part of Nostr. Anyone with a Nostr client (Damus, Amethyst, Snort, Primal…) can search your npub and see it.\n\nMake it something you're happy to have out there.",
            tip: "Want to find your note later? Open any Nostr client and paste your npub.",
        },
        quiz: {
            question: 'Where will your note actually live after you publish it?',
            options: [
                { text: 'On bitpilot.app servers only', correct: false, why: "BitPilot doesn't store your notes, it relays them to public Nostr." },
                { text: 'On every Nostr relay we successfully publish to', correct: true },
                { text: 'In a private database only you can see', correct: false },
            ],
        },
        do: {
            kind: 'nostr-publish',
            actionLabel: 'Sign and publish my note',
            helper: "Write your first Nostr note. It'll be signed with your nsec and broadcast to public relays, for real.",
            placeholder: "GM Nostr, I just finished BitPilot ⚡",
            maxLength: 280,
        },
    },
    {
        id: 27,
        emoji: '🧑',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Set up your profile',
        tagline: 'Name, bio, picture, all signed by you, hosted by nobody',
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
                "A reply on Nostr is a kind-1 event that references the event it's replying to (via an 'e' tag). A repost is typically a kind-6. A reaction (heart, fire emoji, etc.) is a kind-7.\n\nClients add UI on top: threads, like-counts, etc., but the underlying primitive is always 'signed events that reference other signed events'.\n\nThis means anyone can write a new client that does threading or reactions differently. The protocol doesn't enforce a UX.",
            tip: "If you've ever wished a social app worked differently, on Nostr, you can just write that client.",
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
                "When you follow someone on Nostr, you publish a kind-3 event listing their npub. But knowing who to follow isn't enough, you also need to know which relays carry their posts.\n\nIf your followee mostly publishes to relay.damus.io and your client only connects to nos.lol, you'll see nothing. That's not a bug; it's the protocol working as designed.\n\nMost good clients deal with this by querying many relays and de-duplicating. NIP-65 standardizes a way to declare which relays you read and write from, so other clients can find you.",
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
        tagline: 'Publish your first contact list, it lives on the relays',
        simulated: false,
        learn: {
            heading: 'A "follow" is a kind-3 event',
            body:
                "Following someone on Nostr means publishing a kind-3 event listing the npubs you follow. Each time you follow/unfollow, you publish a fresh kind-3 that replaces the old one.\n\nIn this mission, we'll publish a kind-3 that follows one well-known Nostr user (jack@cash.app or fiatjaf, the inventor of Nostr, your pick). On any real Nostr client, log in with your npub and you'll see your follow list.\n\nNo platform's 'social graph' to lock you in: your follows are your kind-3 event, portable across every client.",
            tip: "Replacing a kind-3 = publishing a new one. Clients keep only the most recent per pubkey.",
        },
        quiz: {
            question: 'How is your follow list stored on Nostr?',
            options: [
                { text: 'In a central Nostr database', correct: false },
                { text: 'As a kind-3 event you publish, listing the npubs you follow', correct: true },
                { text: 'Per-relay, with each relay having its own copy', correct: false, why: 'Relays may store it, but you OWN the event, only your nsec can publish it.' },
            ],
        },
        do: {
            kind: 'nostr-follow',
            actionLabel: 'Publish my follow list',
            helper: "We'll publish a kind-3 event following a hand-picked Nostr OG. Real relay broadcast.",
        },
    },

    // ═════════════════════════════════════════════════════════════════════
    // Missions 31-40, eCash, zaps, NIP-05, L2 landscape
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
                "When you pay with a card, your bank sees every purchase. Even on-chain Bitcoin is public, anyone can see your transaction history if they know your address.\n\neCash (Cashu is the most common Bitcoin-backed protocol) is different. A 'mint' issues tokens backed by real sats. Once you hold a token, whoever holds the token holds the value, like a banknote. The mint can't trace what you do with it. That property is called 'bearer'.\n\nThe trick behind the privacy is a 'blind signature', the mint certifies each token without being able to recognise it later. A later lesson on this flight path unpacks how that works.\n\nA Cashu token is a long string. Possessing it = owning the sats inside.",
            tip: "Bearer money cuts both ways: lose the token string, the sats are gone. Treat tokens like cash.",
        },
        quiz: {
            question: 'What makes eCash private?',
            options: [
                { text: 'It uses a longer password than Bitcoin', correct: false },
                { text: "Blind signatures, the mint can't link tokens to who holds them", correct: true },
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
                "A Cashu mint holds the actual sats (in Lightning, usually) and in return issues tokens. So technically it's custodial, the mint runs off with your money and the tokens become worthless.\n\nThis is acceptable because mints are *small*: you only ever hold what you've recently received, you can redeem to your own Lightning wallet anytime, and there are many mints to choose from. eCash is for short-term, private spending, not for storing your savings.\n\nThink of it like cash in your pocket: useful, anonymous, but you wouldn't keep your life savings there.",
            tip: 'Rule of thumb: never hold more in a mint than you\'re willing to lose.',
        },
        quiz: {
            question: "What's the right amount to hold in any single eCash mint?",
            options: [
                { text: 'As much as possible, private wealth', correct: false, why: 'Mints are custodial; treat them like a pocket of cash.' },
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
                "Minting works like this: you pay a Lightning invoice to the mint; the mint issues you a blind-signed token; you keep the token string.\n\nIn BitPilot's current build, this is simulated, the backend issues a Cashu-shaped string but isn't redeemable in a real wallet. The header chip in this mission will say 'Simulated'. (Re-enabling the real Cashu CDK is blocked on a Rust dependency conflict; it'll come back as soon as the upstream crate updates.)\n\nThe shape of the experience is identical to real mints: you get a string, you can pass it to someone, they redeem it.",
            tip: 'A token claim is just "trade some Lightning sats for a bearer note from a mint".',
        },
        quiz: {
            question: "Why is this mission's token labeled 'Simulated'?",
            options: [
                { text: 'eCash is fake everywhere', correct: false, why: 'eCash is real; this build\'s integration is on pause.' },
                { text: "The Cashu Rust crate has a dependency conflict, we're waiting for an upstream fix", correct: true },
                { text: 'Mint is offline', correct: false },
            ],
        },
        do: {
            kind: 'ecash-claim',
            actionLabel: 'Mint me a token',
            helper: "Mints a Cashu-shaped token (currently simulated, see the header chip).",
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
                { text: 'The mint only accepts each token once, first redemption wins', correct: true },
                { text: 'Nothing, Cashu allows double-spending', correct: false, why: "Real Cashu mints reject already-redeemed tokens." },
            ],
        },
        do: {
            kind: 'ecash-spend',
            actionLabel: 'Redeem this token',
            helper: "Paste any string. Currently simulated, see the header chip.",
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
                "A 'zap' is the social way to send sats: you pay someone a few sats over Lightning, and a 'zap receipt' (kind-9735 event) gets published to Nostr so everyone can see it.\n\nIt's how Nostr does likes, but the like has real value attached. Suddenly comment quality goes up. Suddenly creators get paid in real money for posts. Suddenly tipping a stranger across the world is a single tap.\n\nThe receipt event is what makes zaps social: clients show 'this post earned 1,250 sats from 18 zaps' in real-time.",
            tip: "Zaps are how Bitcoin and Nostr connect into one practical system.",
        },
        quiz: {
            question: 'What two things happen during a zap?',
            options: [
                { text: 'A Lightning payment + a Nostr "zap receipt" event published to relays', correct: true },
                { text: 'Just a Lightning payment', correct: false, why: 'Then nobody else could see it, the receipt is what makes zaps social.' },
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
            heading: 'amaka@nostrplebs.com, what is that?',
            body:
                "Your npub1xyz... is ugly. NIP-05 lets you tie your npub to a friendly identifier like amaka@nostrplebs.com or you@yourdomain.com.\n\nIt works via a tiny JSON file at /.well-known/nostr.json on the domain, listing names → pubkeys. Any client can fetch that file and verify the mapping.\n\nThe domain owns the namespace ('amaka' is unique within nostrplebs.com), but your npub remains yours forever, NIP-05 is just an alias, not the identity itself. Lose access to your domain, you lose the alias; you don't lose your account.",
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
                "When you pay alice@getalby.com, your wallet does:\n\n  1. Fetch https://getalby.com/.well-known/lnurlp/alice\n  2. Get a callback URL + min/max amounts\n  3. POST the amount to the callback URL\n  4. Receive a fresh Lightning invoice\n  5. Pay the invoice over Lightning\n\nThat's the whole 'magic'. The Lightning Address ↔ LNURL ↔ invoice chain is just a HTTP convention, not part of the Lightning protocol proper.\n\nIt means anyone hosting a /.well-known/lnurlp/ endpoint can have Lightning addresses, no special crypto, no special protocol.",
            tip: "A Lightning Address is just an HTTP endpoint that returns Lightning invoices.",
        },
        quiz: {
            question: 'What does your wallet actually fetch when you pay a Lightning Address?',
            options: [
                { text: 'Nothing, the address is itself an invoice', correct: false, why: "The address is shorthand; the invoice is fetched on demand." },
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
                { text: 'Self-custodial', correct: false, why: 'Custodial, they hold all funds for users.' },
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
                "Lightning is the most-used Bitcoin Layer 2, but it's not the only design.\n\n• Liquid: a federated sidechain run by Blockstream, fast, confidential, custodial-ish.\n\n• Ark: emerging design for non-custodial, no-channels payments.\n\n• Statechains, channel factories, BitVM: research directions that may or may not pan out.\n\n• Drivechains (BIP-300): proposed soft fork to enable miner-secured sidechains. Politically contested.\n\nThe point: Bitcoin is base-layer. Anything built on top is an L2 with its own trade-offs (trust assumptions, custody model, speed, privacy). 'Lightning' isn't the end of the story, it is just the most mature design so far.",
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
    // Missions 41-50, Hardware wallets, signet on-chain, privacy, finale
    // ═════════════════════════════════════════════════════════════════════
    {
        id: 41,
        emoji: '🗺️',
        topic: 'Security',
        tech: 'bitcoin',
        name: 'Derive your first address',
        tagline: 'From 12 words to an actual address, by hand (sort of)',
        simulated: true,
        learn: {
            heading: 'Seed → master key → child key → address',
            body:
                "The 12 words from mission 11 turn into a seed (BIP39), then a master extended key (BIP32), then derived child keys at standardized paths (BIP44/49/84). Each child key gets a public key, and each public key hashes to an address.\n\nThe standard path for native-segwit (modern) bitcoin is m/84'/0'/0'/0/0 for your very first receive address. Wallets use this so any compatible wallet can restore the same addresses from the same seed.\n\nIn this mission, we'll derive that first address from your seed phrase right in your browser. You'll see how a private key, a public key, and an address are mathematically linked, and how losing the seed means losing access to all of them.",
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
                "Time to actually use a Bitcoin network. We'll point you at a faucet (free, anyone can use it) where you can claim test sats. Send a tiny amount to any address on the same network. Then paste the transaction id (txid) here, and the backend will verify it exists by asking a public block explorer.\n\nStart with Mutinynet, a signet with 30-second blocks, so you watch your transaction confirm in under a minute instead of ten:\n• Faucet: https://faucet.mutinynet.com\n• Explorer: https://mutinynet.com\n\nClassic signet works too if you already use it (https://signet.bc-2.jp/), and we check both. Just don't mix them: Mutinynet and default signet are separate chains, so sats from one faucet cannot be sent to an address on the other.\n\nYou'll need a wallet pointed at your chosen network. Sparrow and Electrum both let you set a custom Esplora/signet server. Spending 5 minutes on this teaches you more than 5 hours of reading.",
            tip: "Save the txid before pasting, and click through to the explorer to watch it confirm.",
        },
        quiz: {
            question: 'What proves to BitPilot that your signet transaction is real?',
            options: [
                { text: 'You scout\'s honour', correct: false },
                { text: 'A public block explorer confirms the txid exists', correct: true },
                { text: 'Your wallet sends a screenshot', correct: false },
            ],
        },
        do: {
            kind: 'onchain-signet',
            actionLabel: 'Verify my signet txid',
            helper: "Paste your 64-character hex txid. We'll ask Mutinynet and signet explorers whether it's real.",
            links: [
                { label: 'Mutinynet faucet', href: 'https://faucet.mutinynet.com' },
                { label: 'Mutinynet explorer', href: 'https://mutinynet.com' },
                { label: 'Signet faucet (bc-2.jp)', href: 'https://signet.bc-2.jp/' },
            ],
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
        tagline: 'Ben typed his seed into a phishing site. A $50 device makes that mistake impossible.',
        learn: {
            heading: 'Keep the keys off the internet',
            body:
                "A hardware wallet is a small device whose only job is to hold private keys and sign transactions, never exposing the keys to your computer. Your laptop builds the transaction; the device signs it; the laptop broadcasts it.\n\nThis means malware on your laptop can\'t steal your keys. The worst it can do is trick you into approving the wrong transaction, which is why hardware wallets show the amount and address on their own screen for you to verify.\n\nWell-known options: Coldcard, Trezor, BitBox02, Ledger (with caveats). For balances over a few hundred dollars, get one.",
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
        tagline: "A fire destroys one of Alice's three keys. She loses nothing. That is multisig.",
        learn: {
            heading: 'M-of-N signatures',
            body:
                "A multisig address requires M out of N keys to spend. Most common: 2-of-3. You have three keys (say, two hardware wallets and one backup). Any two of them can sign together to spend. One can be lost or compromised, and you're fine.\n\nThis is how serious holders structure cold storage. Yes, it's more complex than a single-key wallet. Yes, the complexity is worth it past a certain balance.\n\nNot for everyone, you need to be comfortable with backups, descriptors, and PSBT files. But the resilience is dramatic.",
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
        tagline: 'Pocket money lives on your phone. Savings live in a vault. Bitcoin works the same way.',
        learn: {
            heading: 'Two tiers of storage',
            body:
                "Hot wallet: keys on an internet-connected device (phone, browser, exchange). Convenient for daily spending. If your phone gets compromised, the balance is gone.\n\nCold storage: keys generated and held offline (hardware wallet, paper, steel plate). Inconvenient, you have to plug something in to spend. But malware never sees the keys.\n\nThe usual structure: a small hot wallet on your phone for daily spending (≤ what you'd carry in cash), the rest in cold storage. Some people use multisig for cold storage to get redundancy on top of offline-ness.",
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
        tagline: 'The chain is public, act accordingly',
        learn: {
            heading: 'Bitcoin is pseudonymous, not anonymous',
            body:
                "Every Bitcoin transaction is permanently public. If anyone learns which address is yours, they can see every other address connected to it, every payment in and out, every balance.\n\nGood habits:\n\n• Don't reuse addresses (your wallet helps, it generates fresh ones)\n• Don't post your address publicly tied to your real name\n• Watch out for 'address clustering', exchanges and analytics firms link addresses by behaviour\n• Lightning is better for privacy than on-chain (less data on the chain), but not perfect\n• For serious privacy: CoinJoin, JoinMarket, Wabisabi protocols\n\nFor most people, just not-reusing-addresses + not-doxxing-your-stack covers the basics.",
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
            heading: '"Verify, don\'t trust", literally',
            body:
                "A Bitcoin node downloads every block since 2009 and verifies every transaction itself. When you run a node, you stop relying on anyone else's claim about what bitcoin is or what the rules are.\n\nA full node takes ~700 GB of disk, a few days to initial-sync, and a few watts of power. You can run one on a Raspberry Pi (Umbrel, MyNode, Start9 OS) for under $200.\n\nWhy bother? Because if every wallet you use just trusts random servers, you're back to trusting middlemen. A node makes you the authority on your own money. It's the actual point of Bitcoin.",
            tip: "You don't need to mine to run a node. They're separate jobs.",
        },
        quiz: {
            question: 'What does a Bitcoin full node do?',
            options: [
                { text: 'Mine new blocks', correct: false, why: 'Different job, that\'s a miner.' },
                { text: 'Download and verify every transaction since 2009 itself', correct: true },
                { text: 'Issue new bitcoin', correct: false, why: 'Only mining the next block issues new bitcoin, and only the protocol decides how much.' },
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
            heading: 'Consensus is stubborn, on purpose',
            body:
                "Bitcoin's monetary rules (21M cap, 10-minute blocks, halving schedule) haven't changed since 2009. Other rules occasionally do, via soft forks, backwards-compatible upgrades where old nodes still see new transactions as valid (just less restrictive).\n\nTaproot (2021) is the most recent major soft fork. It took years of debate and broad miner+economic-node signalling.\n\nHard forks (incompatible changes) are how chains split. Bitcoin Cash, Bitcoin SV, these are not 'Bitcoin' anymore; they forked off because some users wanted bigger blocks. The original chain followed the conservative path.\n\nThe lesson: Bitcoin is hard to change. That's a feature.",
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
                "In countries with stable currencies and functioning banks, Bitcoin can feel optional, a speculative asset.\n\nIn countries where the local currency loses 30%+ a year to inflation (Argentina, Turkey, Lebanon, Nigeria, Venezuela), or where banks freeze accounts (everywhere occasionally), Bitcoin is a parallel financial system that just works. You can save in something not controlled by your central bank. You can receive remittances without paying 9% to Western Union. You can move savings across a border without asking permission.\n\nThe people who need Bitcoin most rarely speak loudest about it. But the global usage data is unambiguous: adoption is highest where local money is weakest.",
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
                "You generated a real Nostr identity, learned Lightning, sent a signet on-chain transaction, and walked a curriculum of more than 100 missions. You're past the hard part: understanding.\n\nWhat to do from here:\n\n• Pick a wallet. Phoenix (Lightning, semi-self-custodial) is a great starter. Sparrow + a hardware wallet for cold storage.\n• Buy a small amount of bitcoin, not as investment advice, but as 'now I have skin in the game'. Even 5,000 sats teaches more than 5,000 articles.\n• Follow a few people on Nostr who explain things calmly: fiatjaf, jb55, Lyn Alden, Knut Svanholm, Marty Bent.\n• Read 'The Bitcoin Standard' or 'Inventing Bitcoin' if you want depth.\n• Keep using sats. Lightning addresses are everywhere now. Tip your favourite podcaster, your friend, a random stranger on Nostr.\n\nWelcome to Bitcoin. Don't stop.",
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
    knowledge({
        id: 51,
        emoji: '🔁',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'Address reuse, in detail',
        tagline: 'One reused address can unravel your whole wallet',
        learn: {
            heading: 'Why "fresh address every time" matters',
            body:
                "When you receive a payment to address A and later spend from A, the chain shows the world: \"these coins belong to the same wallet.\" If you then receive to address B and combine A+B in a transaction, B is now publicly linked to A. Repeat this a few times and a chain-analysis firm can cluster every address you've ever used into a single ball of yarn.\n\nModern wallets give you a fresh address for every receive, use it. The cost is zero, the benefit is real. Your xpub still tracks them all internally; only the outside world is forced to guess.\n\nWhere reuse is unavoidable (donation pages, exchange deposits), accept that the address is a public identity tied to you.",
            tip: 'Treat addresses like single-use envelopes. Cheap to print, hard to take back.',
        },
        quiz: {
            question: 'Why does reusing an address weaken privacy more than you might think?',
            options: [
                { text: 'It slows down confirmations', correct: false },
                { text: 'Spending from a reused address links every receive to that address into one cluster', correct: true },
                { text: 'It triggers higher fees', correct: false },
            ],
        },
    }),
    knowledge({
        id: 52,
        emoji: '🔎',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'How chain analysis works',
        tagline: 'The heuristics that turn a public chain into a surveillance feed',
        learn: {
            heading: 'Chainalysis is mostly clever guessing',
            body:
                "Chain-analysis firms (Chainalysis, Elliptic, CipherTrace) sell databases that cluster addresses to real-world entities. They don't have magical insight into the chain, they apply heuristics:\n\n• Common-input ownership: if multiple addresses are spent in the same transaction, the same wallet probably controls all of them.\n• Change detection: in a 2-output transaction, the one that looks like change (round-numbered, fresh script type matching the input) often belongs to the sender.\n• Address-format clustering: a wallet usually uses one script type (P2WPKH, P2TR…) consistently.\n• Off-chain leaks: exchange KYC, mempool relay timing, IP addresses watching your node.\n\nDefences exist, CoinJoin breaks common-input heuristics, PayJoin breaks change detection, running your own node closes the IP leak. None are silver bullets; layered habits are what work.",
            tip: 'Most de-anonymisation comes from off-chain leaks (KYC, IPs), not the chain itself.',
        },
        quiz: {
            question: 'Which of these is a chain-analysis heuristic, not a chain feature?',
            options: [
                { text: 'The 21 million supply cap', correct: false },
                { text: '"All inputs to a transaction belong to the same wallet"', correct: true, why: 'It is usually true, but it is a guess, CoinJoin deliberately breaks it.' },
                { text: 'The 10-minute block target', correct: false },
            ],
        },
    }),
    knowledge({
        id: 53,
        emoji: '🗝️',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Sovereignty vs custody',
        tagline: 'What you actually own when "you own bitcoin"',
        learn: {
            heading: 'Not your keys, not your coins',
            body:
                "If your bitcoin lives on an exchange, you do not own bitcoin. You own a *claim* on the exchange's balance sheet. That claim is excellent until the day it isn't, Mt. Gox, QuadrigaCX, FTX, Celsius. Every collapse follows the same shape: customers thought they had assets; really they had IOUs.\n\nSelf-custody means *you* hold the keys. The trade-off is responsibility: there is no support line, no password reset, no chargeback. If you lose your seed, the coins are gone. If someone steals your seed, the coins are gone.\n\nThe honest answer for most people is: keep small spending funds on a Lightning wallet you control, keep savings in a hardware wallet whose seed only you have seen, and never use an exchange as a savings account.",
            tip: '"Self-custody" is not just a button in an app, it\'s the discipline of holding a 12-word phrase that nobody else has ever seen.',
        },
        quiz: {
            question: 'Why do bitcoiners say "not your keys, not your coins"?',
            options: [
                { text: 'It rhymes', correct: false },
                { text: 'Coins held by someone else are a credit risk, not real ownership', correct: true },
                { text: 'The protocol literally refuses transactions from custodians', correct: false, why: 'The protocol does not care; the warning is about counterparty risk.' },
            ],
        },
    }),
    knowledge({
        id: 54,
        emoji: '🖥️',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Your first node, practically',
        tagline: 'What it actually takes to run one at home',
        learn: {
            heading: 'A weekend, a Pi, and some patience',
            body:
                "Running your own Bitcoin node sounds heavy. The reality in 2026:\n\n• Hardware: a Raspberry Pi 5 with an external SSD, total ~$200. Or a refurb mini-PC for $150. Or just bitcoind on your existing laptop if you leave it on.\n• Software: a packaged distro does all the wiring, Umbrel, Start9, MyNode. Flash an SD card, plug in the SSD, point a browser at the device.\n• Sync: the first download is ~700 GB and takes 1-7 days depending on your link. Set it up before bed for a week; it'll finish.\n• Wiring your wallet: in Sparrow or BlueWallet, point the wallet at your own node. From then on, every query about your balance is answered by your machine, not someone else's.\n\nOnce it's running, the node mostly takes care of itself, block downloads happen in the background. The single biggest payoff is psychological: you stop trusting strangers about your money.",
            tip: 'Don\'t buy a "Bitcoin appliance" with a logo on it for $700. The same software runs on a $200 Pi.',
        },
        quiz: {
            question: 'What is the main practical benefit of pointing your wallet at your own node?',
            options: [
                { text: 'Faster Lightning payments', correct: false, why: 'A node speeds up *your* lookups, not the Lightning network.' },
                { text: 'Your wallet no longer leaks your addresses and balances to a stranger\'s server', correct: true },
                { text: 'Lower on-chain fees', correct: false, why: 'Fees are set by the mempool; nodes do not change them.' },
            ],
        },
    }),
    knowledge({
        id: 55,
        emoji: '✍️',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Blind signatures, plainly',
        tagline: 'How a mint can sign a token without seeing it',
        learn: {
            heading: 'The trick that makes eCash private',
            body:
                "Blind signatures sound like cryptography theatre but the idea is simple. Imagine you want a notary to stamp a sealed envelope, but you don\'t want the notary to read what is inside.\n\nYou put your document into a carbon-copy envelope, then ask the notary to stamp the envelope. The stamp soaks through onto the document. You walk away with a stamped document the notary never read.\n\neCash mints do the same with maths. You pay 1,000 sats and send the mint a \"blinded\" token. The mint signs the blinded form, returns it, you \"unblind\" it locally. The resulting token is provably issued by the mint, worth 1,000 sats, and the mint cannot recognise it later when you spend it.\n\nThat\'s the entire reason eCash is private: redemptions cannot be linked to the original mint.",
            tip: 'A blind signature is a stamp on something the signer never sees. That is the whole magic.',
        },
        quiz: {
            question: 'What does a blind signature give an eCash mint?',
            options: [
                { text: 'The ability to refuse redemptions', correct: false },
                { text: 'A way to certify a token without learning which token it is later', correct: true },
                { text: 'A backup of every token issued', correct: false, why: 'The mint deliberately does not hold this, that is the point.' },
            ],
        },
    }),
    knowledge({
        id: 56,
        emoji: '🏛️',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Cashu vs Fedimint',
        tagline: 'Two flavours of Bitcoin-backed eCash',
        learn: {
            heading: 'Same idea, different trust model',
            body:
                "Cashu and Fedimint both issue blind-signed tokens backed by Bitcoin. The difference is who holds the sats:\n\n• Cashu: one mint operator. Small, swappable, easy to spin up. You trust *that one operator* not to disappear. The defence is to hold tiny balances and move funds out quickly.\n\n• Fedimint: a federation of guardians (typically 4-of-7 or similar). The sats live in a multisig wallet that a majority must sign to move. Hardier against a single operator going rogue or offline, at the cost of being much harder to set up.\n\nRule of thumb: Cashu is pocket cash; Fedimint is a community bank. Both let you spend privately, neither is for long-term savings.",
            tip: 'Picking between them is mostly about how much you trust the operator and how much money is at stake.',
        },
        quiz: {
            question: 'How does Fedimint reduce the single-operator risk that Cashu has?',
            options: [
                { text: 'It uses zero-knowledge proofs instead of blind signatures', correct: false },
                { text: 'Funds live in a multisig held by a federation of guardians; a majority must sign', correct: true },
                { text: 'It is on a separate blockchain', correct: false, why: 'Fedimint settles on Bitcoin like Cashu.' },
            ],
        },
    }),
    knowledge({
        id: 57,
        emoji: '🤝',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Mint trust: 1-of-N vs federation',
        tagline: 'How to think about who is holding your sats',
        learn: {
            heading: 'Custody is a spectrum, not a switch',
            body:
                "Every eCash mint is custodial, that is the deal in exchange for privacy. The interesting question is: custodial by *how many*, and how easy is it to walk away?\n\n• Single-operator mint (Cashu): 1-of-1 trust. One person can rug. Mitigation: hold little, redeem often, use mints run by people in your community whose reputation is the actual collateral.\n\n• Federated mint (Fedimint): m-of-n trust. To steal funds, a majority of guardians must collude. Mitigation against the operator collapsing into a single point of failure, at the cost of complexity and coordination.\n\n• Your own mint: 1-of-1, but the 1 is you. Honest with yourself: are you really willing to run mint infrastructure 24/7?\n\nNone of these are wrong choices. The wrong choice is treating any mint like a savings account. eCash is for spending privately right now, not for storing wealth across years.",
            tip: 'Match the mint\'s trust model to the size of the balance you are willing to lose.',
        },
        quiz: {
            question: 'Which framing is the most honest about eCash mints?',
            options: [
                { text: 'They\'re trustless like Bitcoin', correct: false, why: 'They are explicitly custodial; that is the trade for privacy.' },
                { text: 'They\'re custodial, the choice is how many people you trust, and for how much', correct: true },
                { text: 'They\'re only useful on Lightning', correct: false },
            ],
        },
    }),
    knowledge({
        id: 58,
        emoji: '🌀',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'CoinJoin, plainly',
        tagline: 'The one trick that breaks the biggest chain-analysis heuristic',
        learn: {
            heading: 'A shared transaction with equal outputs',
            body:
                "Chain analysis leans on \"all inputs to a transaction come from one wallet.\" CoinJoin exists to break exactly that.\n\nTen users each put 0.01 BTC into one transaction. The transaction pays out ten 0.01 BTC outputs to fresh addresses controlled by each user. From the outside, nobody can tell which input paid which output, the common-input heuristic just points at ten unrelated wallets that never met.\n\nModern implementations (JoinMarket, WabiSabi-based coordinators) mix without a central operator learning who owns what. The trade-offs are real: coordinator fees, a slower confirmation, and post-CoinJoin coins are sometimes flagged by exchanges. It is the strongest on-chain privacy tool available, not a free lunch.",
            tip: 'CoinJoin does not "hide" your bitcoin, it deliberately makes chain analysts guess wrong about who owns what.',
        },
        quiz: {
            question: 'Which heuristic is CoinJoin specifically designed to defeat?',
            options: [
                { text: 'The 10-minute block target', correct: false },
                { text: '"All inputs to a transaction belong to the same wallet"', correct: true },
                { text: 'The 21 million supply cap', correct: false },
            ],
        },
    }),
    knowledge({
        id: 59,
        emoji: '🎭',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'PayJoin: an invisible mix',
        tagline: 'Every payment can be a small CoinJoin, no one has to know',
        learn: {
            heading: 'Sender and receiver both contribute inputs',
            body:
                "In a normal payment, the receiver just watches an output land. In a PayJoin, the receiver *also* adds an input from their own wallet to the transaction. To the chain, the result looks like an ordinary send, just with an extra input.\n\nThat single extra input breaks the common-input heuristic: analysts now cannot assume every input came from the sender. It also breaks the change-detection heuristic: neither output is obviously \"the change,\" because the receiver contributed too.\n\nBest of all, PayJoin transactions look identical to normal ones on the chain. Every merchant that supports PayJoin makes the entire ecosystem's chain-analysis job harder, not just for their own customers.",
            tip: 'PayJoin is the rare privacy tool where doing it makes everyone else more private too.',
        },
        quiz: {
            question: 'What makes a PayJoin different from a normal Bitcoin payment on the chain?',
            options: [
                { text: 'It uses a special script type visible to analysts', correct: false, why: 'PayJoins deliberately look like ordinary payments.' },
                { text: 'The receiver adds an input, breaking the "all inputs from one wallet" assumption', correct: true },
                { text: 'It happens off-chain', correct: false },
            ],
        },
    }),
    knowledge({
        id: 60,
        emoji: '⚡',
        topic: 'Privacy',
        tech: 'lightning',
        name: 'Lightning privacy, honestly',
        tagline: 'Better than on-chain, but the LSP still learns a lot',
        learn: {
            heading: 'Onion routing helps, until an endpoint sees the plaintext',
            body:
                "Lightning payments hop through channels wrapped in onion encryption: each hop only sees the previous and next hop, not the whole route. That is genuinely private *for intermediate hops*.\n\nThe endpoints are a different story. The sender's node knows the whole path they chose. The recipient's node sees the incoming payment. And if you use a custodial or LSP-backed wallet (Phoenix, Wallet of Satoshi) that node sees *both* endpoints because it *is* one of the endpoints, plus your invoices, plus your balances.\n\nTrampoline routing and BOLT-12 offers improve this. Self-hosted nodes with private channels improve it further. The point: Lightning privacy is real, but \"my LSP knows nothing\" is not accurate.",
            tip: 'The intermediate hops on Lightning are blind. The wallet you use is not.',
        },
        quiz: {
            question: 'Who on the Lightning network learns the least about a payment in transit?',
            options: [
                { text: 'The intermediate routing nodes', correct: true, why: 'They see the previous and next hop only, that is the point of onion routing.' },
                { text: 'The sender', correct: false, why: 'The sender chose the whole route.' },
                { text: 'The recipient\'s LSP', correct: false, why: 'The LSP is an endpoint and sees the incoming payment.' },
            ],
        },
    }),
    knowledge({
        id: 61,
        emoji: '📇',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'KYC is the biggest leak',
        tagline: 'Where your privacy usually breaks first: at the on-ramp',
        learn: {
            heading: 'The chain is not what deanonymises you, the exchange is',
            body:
                "You can run your own node, use CoinJoin, route Lightning through Tor, and still be fully identified, because you bought your first sats on an exchange that photographed your face, scanned your ID, and recorded the address you withdrew to.\n\nOnce that address exists in the exchange's database tied to your legal identity, every downstream transaction is a candidate for reidentification the moment it touches an address they can cluster back.\n\nMitigations, in rough order of accessibility:\n\n• Buy small amounts peer-to-peer (Robosats, HodlHodl, LN-based exchanges, meetups)\n• Use different addresses/wallets for KYC-sourced sats vs. non-KYC sats, don't cross the streams\n• Earn sats directly for work, a Lightning address from a client bypasses the KYC ramp entirely\n\nNone of this is illegal in most places. It is just refusing to pre-attach an ID to every future satoshi.",
            tip: 'KYC sats and non-KYC sats should never share a wallet.',
        },
        quiz: {
            question: 'Where does most real-world Bitcoin deanonymisation come from?',
            options: [
                { text: 'Weaknesses in the chain itself', correct: false },
                { text: 'The KYC data exchanges collect at the on-ramp, plus off-chain leaks', correct: true },
                { text: 'Miners looking at transactions before they confirm', correct: false, why: 'Miners see transactions but do not know who broadcast them.' },
            ],
        },
    }),
    knowledge({
        id: 62,
        emoji: '📡',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'Your node closes the IP leak',
        tagline: 'Third-party wallets tell strangers your balance in real time',
        learn: {
            heading: 'Every balance check is a data point',
            body:
                "When your wallet asks a server \"what is the balance of these 400 addresses?\", that server learns two things: your entire address set, and the IP address doing the asking. Correlated over months, that IP becomes as identifying as a legal name.\n\nRun your own node, point your wallet at it, and both leaks close. Your machine knows your addresses (it always did), and it queries the network for blocks in a way that reveals nothing about which addresses you care about.\n\nBonus round: run your node behind Tor. Now the network sees a node syncing the chain; nobody sees which IP it came from.\n\nThe payoff is asymmetric, cheap upgrade, permanent gain, no ongoing effort after the initial sync.",
            tip: 'A wallet that talks to your own node cannot leak your addresses to a stranger, because you *are* the stranger.',
        },
        quiz: {
            question: 'What does running your own node primarily do for your privacy?',
            options: [
                { text: 'Speeds up Lightning payments', correct: false },
                { text: 'Stops your wallet from telling third-party servers your address set + IP', correct: true },
                { text: 'Reduces on-chain fees', correct: false },
            ],
        },
    }),
    knowledge({
        id: 63,
        emoji: '🖨️',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'Wallet fingerprinting',
        tagline: 'Your wallet has an accent, analysts can hear it',
        learn: {
            heading: 'Small habits leak which software you use',
            body:
                "Two payments can be identical in amount and time, but if one comes from Sparrow and the other from Blue Wallet, subtle differences give it away:\n\n• Script type consistency, a wallet usually uses P2WPKH *or* P2TR, not both\n• Input/output ordering, some wallets sort BIP69, some randomise, some don't\n• RBF signalling, most enable it by default, some don't\n• Fee estimation quirks, round-number fee rates vs. odd ones\n• nLockTime, some wallets set it to the current block height, most leave it at 0\n\nOn its own, fingerprinting doesn't reveal *who* you are, but it groups your transactions together (\"all Sparrow, all sent Tuesday afternoons\"), which gives clustering algorithms a head start.\n\nDefence is boring: use popular wallets with sensible defaults, don't hand-tune fees to unusual values, and don't mix outputs from very different software in the same wallet.",
            tip: 'Being fingerprintable does not identify you. It groups your transactions, which makes identifying you easier later.',
        },
        quiz: {
            question: 'Why is wallet fingerprinting a privacy concern even without KYC data?',
            options: [
                { text: 'It reveals your seed phrase to the network', correct: false, why: 'Absolutely not, the seed never touches the network.' },
                { text: 'It groups your transactions together, giving clustering a head start', correct: true },
                { text: 'It slows down confirmations', correct: false },
            ],
        },
    }),
    knowledge({
        id: 64,
        emoji: '🎭',
        topic: 'Privacy',
        tech: 'nostr',
        name: 'Nostr identities aren\'t private',
        tagline: 'An npub is public forever, plan accordingly',
        learn: {
            heading: 'Nostr gives you pseudonymity, not anonymity',
            body:
                "Your npub is a public key. Every note, follow, reaction, and zap you sign with it is visible to every relay you touch, permanently.\n\nThat means:\n\n• If you connect your Nostr identity to your legal name once (a selfie, a bio, a linked LinkedIn), it is now permanently connected. There is no delete.\n• Multiple npubs are a feature, not paranoia: a \"main\" npub for public stuff, a work npub, a private-thoughts npub. Different keys, different personas.\n• Zaps leak your Lightning address, which usually leaks who runs your node (Wallet of Satoshi, your own domain, etc.). Zap thoughtfully.\n• Relay choice matters: if you only post to one boutique relay, your posts have a metadata signature (\"probably reads Nostr in Europe\") that a bigger fan-out would hide.\n\nNostr's public-by-default design is the source of its resilience and censorship-resistance. It is also the reason it will not deanonymise itself for you.",
            tip: 'One npub per persona. Never mix a doxxed key with a private one, the follow graph will out you.',
        },
        quiz: {
            question: 'What is the safest way to keep parts of your Nostr life separate?',
            options: [
                { text: 'Delete old notes regularly', correct: false, why: 'Relays cache and rebroadcast, deletion is at best a request.' },
                { text: 'Use different npubs for different personas; never cross-link them', correct: true },
                { text: 'Post only from Tor', correct: false, why: 'Helps hide your IP, but does nothing about the public content you signed.' },
            ],
        },
    }),
    knowledge({
        id: 65,
        emoji: '💵',
        topic: 'Privacy',
        tech: 'ecash',
        name: 'eCash privacy: where it shines, where it doesn\'t',
        tagline: 'Bearer tokens the mint never sees, with an asterisk',
        learn: {
            heading: 'The mint is blind; the ramps aren\'t',
            body:
                "eCash mints issue blind-signed tokens: when you spend one, the mint verifies it is valid without recognising which token it originally issued. That is the strongest privacy in the Bitcoin stack, full stop.\n\nBut the privacy has boundaries you should not fool yourself about:\n\n• The Lightning invoice that *funded* the mint is visible to the payer's LSP. Coming in privately requires care.\n• The Lightning invoice that *withdraws* from the mint is visible to whoever pays it. Cashing out identifies who received.\n• The mint operator sees deposits, withdrawals, and the total float. They cannot link a specific token to a specific user, but they see the aggregate.\n• Metadata around usage (times, amounts, patterns) still leaks whether you use eCash a little or a lot.\n\nUsed for *spending*, eCash is the closest thing to digital cash we have. Used as savings, you have simply given a stranger your bitcoin.",
            tip: 'eCash is optimal when the sats come in privately, spend quickly, and leave without a trace.',
        },
        quiz: {
            question: 'What is the honest privacy claim for eCash?',
            options: [
                { text: 'The mint cannot link a spent token to who it was originally issued to', correct: true },
                { text: 'No one can ever see any transaction related to your eCash', correct: false, why: 'The Lightning invoices that fund and drain the mint are visible.' },
                { text: 'It runs on a hidden blockchain', correct: false },
            ],
        },
    }),
    knowledge({
        id: 66,
        emoji: '🎯',
        topic: 'Privacy',
        tech: 'bitcoin',
        name: 'Threat model 101',
        tagline: 'Who are you actually hiding from? Answer first, then choose tools',
        learn: {
            heading: 'Nation-state, corporation, or nosy neighbour?',
            body:
                "Bitcoin privacy is not a single dial. It is a set of trade-offs, and the right settings depend on *whom* you are trying not to be transparent to.\n\n• **Nosy family, employer, roommate:** default wallet with non-reused addresses, avoid posting your address on social media. Done. Overkill anything more.\n\n• **Data-mining corporations, chain analysts, KYC exchange snooping:** run your own node, avoid address reuse religiously, use PayJoin/CoinJoin when moving meaningful amounts, keep KYC and non-KYC sats in separate wallets.\n\n• **A state actor with subpoena power:** you cannot fully defend against this alone. Non-KYC sourcing, Tor, mixing, careful operational security, and even then, one metadata slip can unravel it.\n\nThe common mistake is to pick tools without answering the who-question first. Running an air-gapped signer to protect against a jealous partner is theatre. Buying on a KYC exchange when trying to evade a state is a rounding-error defence.\n\nWrite down your threat model. Actually. Then choose tools proportional to it.",
            tip: 'Privacy without a threat model is cargo-culting. Name the adversary first.',
        },
        quiz: {
            question: 'What should come *before* picking Bitcoin privacy tools?',
            options: [
                { text: 'Buying the fanciest hardware wallet', correct: false },
                { text: 'Naming the specific adversary you are trying to hide from', correct: true },
                { text: 'Running a full node', correct: false, why: 'It is a good move, but useless if your threat model doesn\'t require it and you haven\'t addressed bigger leaks.' },
            ],
        },
    }),
    knowledge({
        id: 67,
        emoji: '🏦',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Be your own bank, literally',
        tagline: 'What "own bank" means before it becomes a slogan',
        learn: {
            heading: 'Every bank service, unbundled',
            body:
                "A bank quietly does six or seven jobs at once: it stores your money, moves it, checks your identity, gives you credit, keeps records, resolves disputes, and takes the phone call when something breaks. \"Be your own bank\" isn't a slogan, it's the offer to take those jobs on yourself.\n\nStore: a wallet you control (single-sig hardware, or multisig, or Lightning for spending).\nMove: broadcast a transaction or open a channel yourself.\nIdentity: no KYC, but you also can't reset a password.\nCredit: no overdraft; if you want borrowing, you build it from your own reserves or use a collateralised protocol.\nRecords: your own node keeps them; nobody can revise them.\nDisputes: none, every send is final. Learn to double-check.\nSupport: forums, docs, and community. You are the phone line.\n\nSelf-custody done well is the same job description a small-town bank had in 1900, minus the counter. That's the whole model.",
            tip: 'The romance of "be your own bank" fades fast. What is left is the job of running a very small, very careful bank. That job is real.',
        },
        quiz: {
            question: 'Which "bank job" cannot be replaced when you go fully self-custodial?',
            options: [
                { text: 'Storing value', correct: false },
                { text: 'Reversing a transaction after you sent it to the wrong address', correct: true },
                { text: 'Keeping a ledger', correct: false, why: 'Your node keeps a cryptographic ledger better than any bank could.' },
            ],
        },
    }),
    knowledge({
        id: 68,
        emoji: '🚪',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'The exit option',
        tagline: 'You do not have to leave. You have to be *able* to.',
        learn: {
            heading: 'Sovereignty is optionality, not isolation',
            body:
                "Self-custody, running a node, holding your own keys, the payoff isn't that you use these things every day. The payoff is that you *could* leave any custodian, any exchange, any government-approved rail, at any time, with no permission.\n\nMost of the time, most people happily use custodial tools. That's fine. But the option to exit, to move your sats to a wallet nobody can freeze, to a country you weren't born in, across a border without asking, is what makes you not-captured.\n\nIt's the same principle as freedom of the press: not that you personally publish, but that the door is open. A regime that closes the door doesn't need to arrest you; the closed door is the coercion.\n\nBitcoin's whole political weight rests on this: it is the first form of money where the exit door cannot be closed by the party you're exiting.",
            tip: 'The exit option matters even for people who never use it. It changes what everyone else has to negotiate with you about.',
        },
        quiz: {
            question: 'What is the political point of self-custody, according to this framing?',
            options: [
                { text: 'To avoid taxes', correct: false, why: 'That is a different discussion, and legally fraught.' },
                { text: 'To preserve the *option* to exit any custodian or rail, at any time', correct: true },
                { text: 'To technologically outsmart banks', correct: false },
            ],
        },
    }),
    knowledge({
        id: 69,
        emoji: '🔄',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Circular economy',
        tagline: 'Sats never touching fiat is the point',
        learn: {
            heading: 'Earn sats, spend sats, skip the FX',
            body:
                "Every time you sell sats for dollars, you pay a spread, generate a tax event, and put yourself back on a fiat rail. The most sovereign use of Bitcoin is the one where fiat never touches the transaction at all.\n\nHow it looks in practice:\n\n• A freelance client pays you 200,000 sats to a Lightning address. Not \"$100 converted to sats\", actually sats.\n• You pay a Nostr contributor 5,000 sats for their guide.\n• You buy a coffee from a shop that accepts Lightning (increasingly real in Bitcoin Beach, Prague, Nairobi).\n• You tip a podcaster 500 sats a week on Fountain.\n\nEach hop that stays inside Bitcoin skips the tax + FX + custody drag. Individually tiny; compounded over a life, it's the difference between owning bitcoin and using it.\n\nThe short handle for this is \"circular economy\", a community large enough that people earn, save, spend, and pay each other without ever needing the fiat rail. It exists in patches today. It is what maturity looks like.",
            tip: "'HODL' is passive. 'Earn and spend in sats' is what sovereignty looks like in motion.",
        },
        quiz: {
            question: 'Why does keeping sats *inside* the Bitcoin economy matter?',
            options: [
                { text: 'It saves on wallet fees', correct: false, why: 'Fees exist in both worlds; the point is different.' },
                { text: 'Each fiat-touching hop adds tax, FX, and custody drag you don\'t need to pay', correct: true },
                { text: 'Only Bitcoin transactions are legal', correct: false },
            ],
        },
    }),
    knowledge({
        id: 70,
        emoji: '🪪',
        topic: 'Sovereignty',
        tech: 'nostr',
        name: 'Portable identity',
        tagline: 'Your Nostr key travels; your Twitter handle does not',
        learn: {
            heading: 'Own the identity, not just the account',
            body:
                "The gap between an X handle and a Nostr npub is the gap between renting your identity and owning it.\n\nAn X handle is a database row in a company you don't control. Delete-able by them, sellable by them, hostage to whichever CEO buys the platform next. Every follower you gained lives on their servers; take away the servers and the graph is gone.\n\nAn npub is a public key you generated. Your follower list is signed by *your* key and stored on relays, plural. You can pack up and leave for a different Nostr client tomorrow, same identity, same followers, same history, because the identity isn't hosted anywhere in particular. It's mathematical.\n\nThis is the sovereignty layer for how you show up online. Your handle can't be seized, deplatformed, or renamed at someone else's convenience. That is not a small feature.",
            tip: "The test for identity sovereignty: if the platform disappears tomorrow, do you still have your followers? On Nostr: yes. On X: no.",
        },
        quiz: {
            question: 'What makes a Nostr identity more sovereign than a platform handle?',
            options: [
                { text: 'It has a longer name', correct: false },
                { text: 'The keypair, and therefore the follower graph, is yours, not the platform\'s', correct: true },
                { text: 'It runs on a blockchain', correct: false, why: 'Nostr specifically does not, that is why it is fast and cheap.' },
            ],
        },
    }),
    knowledge({
        id: 71,
        emoji: '🧊',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Bitcoin as savings tech',
        tagline: 'Two different jobs: store value, move value',
        learn: {
            heading: 'Cold savings and hot spending are separate concerns',
            body:
                "The mistake is treating your Bitcoin stack like a single wallet. It isn't; it's a two-layer setup.\n\n**Cold savings**: sats you don't intend to touch this year. Live on a hardware wallet, ideally single-sig or 2-of-3 multisig, seed backed up on steel, never plugged into the internet-facing side of your life. Boring. Reliable. Grows.\n\n**Hot spending**: sats you use in the next few weeks. Live in a Lightning wallet on your phone. Small balance, think a couple weeks of coffee money. Refill periodically from the cold side. If the phone is lost or stolen, the loss is a bad afternoon, not a life event.\n\nThe two get confused because both are \"Bitcoin\". They shouldn't be. Design them for the job each is doing: cold for permanence, hot for velocity.",
            tip: "Ask yourself: what fraction of my stack is on a phone right now? If the answer is >5%, redistribute.",
        },
        quiz: {
            question: 'Why keep long-term Bitcoin savings separate from a phone Lightning wallet?',
            options: [
                { text: 'The phone wallet moves faster', correct: false, why: 'True but not the point.' },
                { text: 'A phone is small, exposed, and lose-able, savings should tolerate the phone being gone', correct: true },
                { text: 'Lightning cannot store large amounts', correct: false, why: 'It can, but a phone wallet still shouldn\'t.' },
            ],
        },
    }),
    knowledge({
        id: 72,
        emoji: '⏳',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Lowering your time preference',
        tagline: 'Money that lasts changes how you plan',
        learn: {
            heading: 'The half-life of your salary shapes your decisions',
            body:
                "Economists call it \"time preference\": how much you value now versus later. A high time preference means you consume soon; a low time preference means you save and plan.\n\nMost people's time preference isn't a personality trait. It's a response to the money they hold. When your salary loses value in the drawer, spending now is the rational move, the money is going to be worth less tomorrow. When your salary holds its value across decades, planting slow-growing things starts to make sense: education, a business, a home you actually intend to live in.\n\nBitcoin's hard supply cap doesn't lower your time preference by itself. But it removes the pressure to \"use it or lose it,\" which was the pressure holding your time preference up. Over years, that changes what feels like a sensible decision. People who save in bitcoin talk about this shift as almost the biggest thing about it, bigger than the price.",
            tip: 'A currency that decays makes people consume. A currency that lasts makes people build.',
        },
        quiz: {
            question: 'How does holding sats over years tend to change financial behaviour?',
            options: [
                { text: 'It makes people spend more, faster', correct: false, why: 'The reverse, the pressure to spend before value evaporates goes down.' },
                { text: 'It lowers time preference: longer-horizon planning starts to feel rational', correct: true },
                { text: 'It has no effect', correct: false },
            ],
        },
    }),
    knowledge({
        id: 73,
        emoji: '📊',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'DCA beats timing',
        tagline: 'Buy a little often. Not much often. Consistently.',
        learn: {
            heading: 'Dollar-cost averaging is boring, that is why it works',
            body:
                "The trap for newcomers is trying to time the bottom. It rarely works, even for professionals with better data than you.\n\nDollar-cost averaging (DCA) is the mechanical alternative: buy a fixed amount every week or every month, regardless of price. In a rising asset over long horizons, DCA usually beats a random-timing strategy and comes very close to a perfect-timing strategy, while being emotionally sustainable, which perfect-timing isn't.\n\nSetup: pick an amount you don't mind losing. Set a weekly buy on an exchange or through a Bitcoin-only DCA service (Swan, Bitcoin Well, River). Withdraw to your own wallet on a schedule so sats don't pile up on someone else's balance sheet.\n\nThe hardest part is doing this for years while the price goes sideways or crashes. That's it. That's the whole strategy.",
            tip: 'If you can\'t emotionally survive the buy going -60% next month, your DCA amount is too big.',
        },
        quiz: {
            question: 'Why does DCA usually beat trying to time the bottom for a long-horizon buyer?',
            options: [
                { text: 'Because the price only goes up', correct: false, why: 'It does not. That is the reason DCA is the honest choice.' },
                { text: 'It removes the requirement to be right about timing, which nobody consistently is', correct: true },
                { text: 'It avoids taxes', correct: false, why: 'It does not.' },
            ],
        },
    }),
    knowledge({
        id: 74,
        emoji: '📜',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Inheritance planning',
        tagline: 'A stack your family can inherit is different from a stack only you can find',
        learn: {
            heading: 'What happens to your sats when you don\'t come home?',
            body:
                "Every self-custodial Bitcoiner faces this quietly: what happens if I die? If the seed lives only in your head, the sats die with you. If it lives in one hidden place, only the person who finds that place inherits.\n\nA reasonable plan looks like:\n\n• A 2-of-3 multisig where you hold one key, a trusted family member holds one, and a lawyer or bank vault holds a third. Losing any one key doesn't lose the coins; needing any two to move them prevents any single party going rogue.\n• A short, plain-language letter with your executor: \"there is bitcoin, here is roughly how much, here is the wallet type, here is the person who has the recovery guidance.\" No seed words in the letter itself.\n• A trial run, actually walk one heir through recovering a small amount so the process is real, not theoretical.\n\nThe worst version is the seed on a note in a shoebox. The next worst is nobody knowing the sats even exist. Both are avoidable in an afternoon.",
            tip: 'Untested inheritance plans usually don\'t work. Rehearse yours on a small amount before you need it.',
        },
        quiz: {
            question: 'Which inheritance setup avoids "the coins die with the holder" without giving any single heir full control?',
            options: [
                { text: 'A single seed hidden in one location', correct: false, why: 'Fine until the location is unknown or lost.' },
                { text: 'A multisig with keys split across you, family, and a neutral party', correct: true },
                { text: 'Telling one family member the whole seed', correct: false, why: 'One-of-one trust with none of the benefits of self-custody.' },
            ],
        },
    }),
    knowledge({
        id: 75,
        emoji: '🤝',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'Sovereignty ≠ isolation',
        tagline: 'A community that runs its own money is stronger than a lone survivor',
        learn: {
            heading: 'You do not have to do this alone',
            body:
                "There is a corner of Bitcoin culture that reads sovereignty as \"me, alone, in a bunker, with a seed phrase.\" That is not what the technology is optimised for.\n\nBitcoin is optimised for *networks of self-custodial peers* trading with each other. The sovereignty is real, but the value only shows up when other people around you are also sovereign. A single self-custodial person surrounded by fiat rails is just a slightly-inconvenienced fiat user. A neighbourhood of people who accept sats, run nodes, and use Nostr becomes an actual parallel economy.\n\nThe practical version: teach one person. Set up someone's first non-custodial wallet with them. Buy something from a friend in sats. Join a local Bitcoin meetup. Every additional sovereign person around you increases the value of your own sovereignty. It's not a paradox; it's a network effect.\n\nThe bunker is a symbol. The neighbourhood is the actual product.",
            tip: 'Self-custody is a personal skill. A local economy is a group skill. Both are needed.',
        },
        quiz: {
            question: 'What multiplies the practical value of your own self-custody?',
            options: [
                { text: 'A bigger hardware wallet', correct: false },
                { text: 'Other self-custodial people nearby you can transact with', correct: true },
                { text: 'A more remote geographic location', correct: false, why: 'Isolation makes sovereignty theoretical, not more useful.' },
            ],
        },
    }),
    knowledge({
        id: 76,
        emoji: '⚖️',
        topic: 'Sovereignty',
        tech: 'bitcoin',
        name: 'What sovereignty costs',
        tagline: 'The honest tradeoffs nobody puts on the poster',
        learn: {
            heading: 'Every switch you flip has a cost',
            body:
                "Sovereignty isn't free. Being honest about the price is what separates people who last from people who quietly go back to custodial three months later.\n\nWhat it costs:\n\n• **Time**: initial setup, ongoing node maintenance, wallet updates, backup checks, a few hours a quarter, minimum.\n• **Cognitive load**: every send is final. Every seed is critical. \"Move fast\" is not an option; slow, deliberate transactions are the required posture.\n• **Convenience**: no password reset, no chargebacks, no support agent. A mistake at 2 AM is on you.\n• **Money**: hardware wallets, a node, backup materials, a few hundred dollars up front, tens per year after.\n• **Social friction**: your bank has no idea what you're doing with your money and would prefer you didn't.\n\nAgainst all of that, the payoff is the exit option, censorship-resistance, and durable savings. For some people the trade is obviously worth it; for others it isn't. Both answers are legitimate. What isn't legitimate is claiming the trade is free.",
            tip: "If a Bitcoiner tells you sovereignty has no cost, they are selling you something. It has costs. They are usually worth it. Being honest about them is the point.",
        },
        quiz: {
            question: 'What is the single biggest ongoing cost of full self-custody for most people?',
            options: [
                { text: 'Money', correct: false, why: 'Hardware and infra is a few hundred dollars, a small factor.' },
                { text: 'The cognitive load of every transaction being final and irreversible', correct: true },
                { text: 'Legal risk', correct: false, why: 'In most jurisdictions holding your own bitcoin is fully legal.' },
            ],
        },
    }),
    knowledge({
        id: 77,
        emoji: '💭',
        topic: 'Money',
        tech: 'bitcoin',
        name: 'What money even is',
        tagline: 'Three jobs. Every money either does them or fails at them.',
        learn: {
            heading: 'Medium of exchange, unit of account, store of value',
            body:
                "Economists have argued about money for two hundred years, but they mostly agree on the shape: any decent money does three jobs.\n\n**Medium of exchange**: people accept it in trade. Nobody wants your goat if they wanted a chicken; money solves the double-coincidence-of-wants problem.\n\n**Unit of account**: prices get quoted in it. A latte is \"$5\", not \"three eggs or half a haircut\". This is what makes comparison possible at all.\n\n**Store of value**: you can hold it for a while and it still buys roughly what it did last year. Without this, everyone rushes to spend the instant they earn.\n\nSeashells, gold, cigarettes, paper dollars, and bitcoin have all played this role in different places and times. Whichever one is best-at-doing-all-three tends to win, for that context. Bitcoin's entire pitch is: \"I do the third job (store of value) better than fiat, and Lightning brings me back for the first two.\"",
            tip: "When someone asks 'is X real money?', they usually mean: does it do all three jobs well enough for the people around me?",
        },
        quiz: {
            question: 'Which of the three classic jobs of money is bitcoin most obviously good at, from day one?',
            options: [
                { text: 'Medium of exchange', correct: false, why: 'On-chain is slow for coffee, Lightning is fixing this.' },
                { text: 'Unit of account', correct: false, why: 'Almost nobody prices things in sats yet.' },
                { text: 'Store of value, durable, capped, hard to seize', correct: true },
            ],
        },
    }),
    knowledge({
        id: 78,
        emoji: '📉',
        topic: 'Money',
        tech: 'bitcoin',
        name: 'Why fiat loses value',
        tagline: 'Grandma saved cash under the mattress for twenty years. It kept buying less.',
        learn: {
            heading: 'Inflation is not weather, it is a policy',
            body:
                "Fiat money loses value because central banks print more of it. That is not a conspiracy claim; it is the openly-stated policy. The US Federal Reserve targets 2% annual inflation; the ECB targets a similar number. Over 30 years, 2% a year compounds to about 45% purchasing-power loss. Salaries that were fine in the 1990s do not clear the same lifestyle now.\n\nWhy print? Governments spend more than they tax. To close the gap they either borrow (which markets eventually push back on) or dilute the currency (which markets do not notice as fast). Printing has been the winning political move basically everywhere, basically always. It's a slow tax you can't opt out of, paid mostly by savers and salaried workers.\n\nBitcoin exists as a bet that the option to opt out of that tax is worth building. A supply that literally cannot be inflated is the entire pitch. \"Number go up\" is really \"number stays put while the ruler shrinks\".",
            tip: "Inflation isn't the price of things going up, it's the value of the money going down. Same shirt, worse dollar.",
        },
        quiz: {
            question: 'The main reason fiat money loses value over time is:',
            options: [
                { text: 'Random economic shocks', correct: false, why: 'They exist, but the long trend is deliberate.' },
                { text: 'Central bank policy expands the money supply by design', correct: true },
                { text: 'People spending too much', correct: false, why: 'Consumer behaviour is a downstream symptom, not the cause.' },
            ],
        },
    }),
    knowledge({
        id: 79,
        emoji: '🔒',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'HTLCs, the atomic-payment trick',
        tagline: 'How a payment hops through strangers without any of them being able to steal it',
        learn: {
            heading: 'Hash Time-Locked Contracts, plainly',
            body:
                "A Lightning payment can hop through five random nodes and none of them can grab the sats. The trick is a Hash Time-Locked Contract, HTLC.\n\nThe recipient picks a secret number and hashes it. That hash is the \"puzzle\". Every hop along the route is told: \"here are sats, but you only get them if you show me the pre-image (the secret) within 30 blocks, otherwise the sats go back.\"\n\nThe recipient reveals the pre-image to their last hop to claim their sats. That hop can now show it to the previous hop and claim from them, and so on backwards. Either the whole chain settles or (if someone drops out) all the locked sats time out and return home.\n\nNo hop can steal because they don't know the pre-image until the recipient shares it. No hop can double-cross because their inbound and outbound are locked to the same puzzle. That is Lightning routing in one sentence.",
            tip: "The recipient chooses the secret. Everyone else is just moving locked promises around.",
        },
        quiz: {
            question: 'What stops an intermediate Lightning hop from stealing the sats mid-route?',
            options: [
                { text: 'A trusted routing coordinator watches for cheating', correct: false, why: 'There is no coordinator. That is the point.' },
                { text: 'The hop cannot claim without revealing a secret only the recipient generated', correct: true },
                { text: 'The payment is encrypted so the hop can\'t see the amount', correct: false, why: 'It is encrypted, but the theft prevention is the HTLC, not the encryption.' },
            ],
        },
    }),
    knowledge({
        id: 80,
        emoji: '⚗️',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Inbound vs outbound liquidity',
        tagline: 'Why "your channel is full" is a real thing',
        learn: {
            heading: 'A channel has two sides. You use both.',
            body:
                "Every Lightning channel is a shared escrow between two nodes. When the channel is opened, one side puts up the sats, the *outbound* liquidity, and the other side starts with zero. That is fine when you are the sender, but the moment you want to *receive*, you have a problem: nothing's on the other side to move to yours.\n\nInbound liquidity is capacity to receive. It exists only where sats have already flowed away from you at some point. Fresh nodes have plenty of outbound (they funded it) and zero inbound (nothing has flowed the other way yet).\n\nOptions for a receiver:\n\n• Spend some sats first, every payment out builds inbound on that channel.\n• Buy a channel-open from an LSP that pre-loads their side (Voltage, LNBig).\n• Use a service that offers inbound liquidity as a fee.\n• Splice funds in from an already-flowing channel (BOLT-2 splicing, newer).\n\nOnce you understand the two-sided nature, \"invoice failed to route\" stops feeling like a bug and starts looking like an accounting problem.",
            tip: "Outbound = you can send. Inbound = you can receive. They are separate, and both matter.",
        },
        quiz: {
            question: 'You just opened a brand-new Lightning channel and funded 100k sats on your side. You try to receive a 5k-sat payment. What likely happens?',
            options: [
                { text: 'It works fine, you have plenty of liquidity', correct: false, why: 'You have outbound. Receiving needs inbound.' },
                { text: 'The invoice cannot be paid because you have no inbound liquidity yet', correct: true },
                { text: 'You get charged a routing fee', correct: false },
            ],
        },
    }),
    knowledge({
        id: 81,
        emoji: '🏗️',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'LSPs, the wallets you actually use',
        tagline: 'Almost every Lightning wallet has one behind it. Know what they do.',
        learn: {
            heading: 'A Lightning Service Provider is a partner node',
            body:
                "Running a Lightning node 24/7 with good uptime and enough liquidity is not for phones. So most consumer Lightning wallets (Phoenix, Wallet of Satoshi, Alby, Zeus, Breez, Blitz) pair the user with an LSP, a Lightning Service Provider, that runs the always-on side of things.\n\nWhat the LSP does:\n\n• Opens a channel to your wallet on demand (usually for a small fee taken from the first payment).\n• Provides inbound liquidity so you can receive.\n• Stays online, so your wallet can be offline sometimes without missing payments.\n• Routes your payments to the rest of the network.\n\nWhat it means practically:\n\n• The LSP is a business dependency. Phoenix goes down → Phoenix wallets briefly cannot send.\n• The LSP sees your payments (endpoints, amounts, timing). Not a stranger, a specific known company.\n• Fees are usually small but not zero. \"Free\" is often \"free-until-the-first-inbound-channel-open\".\n\nSelf-hosted alternatives exist (Umbrel, Start9, RaspiBlitz + your own channels) but require a home node running 24/7. For most people the LSP model is the right trade.",
            tip: "\"My Lightning wallet\" almost always means \"my wallet plus its LSP\". Know which LSP you are on.",
        },
        quiz: {
            question: 'Which of these is the LSP\'s job in a Phoenix-style Lightning wallet?',
            options: [
                { text: 'Custody the sats on your behalf', correct: false, why: 'Well-designed LSPs are non-custodial, you hold the keys to the channel.' },
                { text: 'Run the always-on Lightning node your phone talks to', correct: true },
                { text: 'Confirm on-chain transactions', correct: false },
            ],
        },
    }),
    knowledge({
        id: 82,
        emoji: '🗼',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Watchtowers, briefly',
        tagline: 'The guard that catches a partner trying to close with a stale balance',
        learn: {
            heading: 'What happens if your channel partner cheats?',
            body:
                "Every Lightning channel has a rule: if either side broadcasts an old channel state to try to steal, the other side has a window (usually ~144 blocks / ~24 hours) to publish a \"justice transaction\" that takes *everything* in the channel as punishment.\n\nThe catch: you have to be online to notice and act within the window. If your node is offline for a week and your partner cheats, you miss the window and lose the funds.\n\nA watchtower is a service you register with. You give it a small \"encoded punishment package\" for every channel state; if your partner ever broadcasts an old state, the tower publishes the justice transaction on your behalf, without ever knowing your channel balance in cleartext.\n\nFor consumer wallets on an LSP, the LSP typically watches for you, one more reason the LSP knows what you're doing. For self-hosted nodes, either run your own watchtower on a separate machine or subscribe to a third-party one.\n\nWatchtowers are the \"you can safely go on holiday\" layer of Lightning.",
            tip: "If your node is offline and unwatched, and your partner is willing to try, you can lose your channel balance. Watchtowers close that hole.",
        },
        quiz: {
            question: 'Why does a Lightning node need a watchtower if it goes offline for long stretches?',
            options: [
                { text: 'To route payments while it is off', correct: false, why: 'Nothing routes payments for an offline node.' },
                { text: 'To publish the punishment transaction if a channel partner tries to close with an old, stale state', correct: true },
                { text: 'To store the seed backup', correct: false },
            ],
        },
    }),
    knowledge({
        id: 83,
        emoji: '🔧',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Splicing and BOLT-12',
        tagline: 'The upgrades that make Lightning stop feeling pointy',
        learn: {
            heading: 'Two protocol upgrades worth knowing',
            body:
                "**Splicing**: for years, changing a channel's size meant closing the old channel and opening a fresh one, two on-chain transactions, downtime for the channel, sats stuck while it happens. Splicing lets you add or remove funds *without closing*: one on-chain transaction that quietly resizes the escrow. Phoenix rolled it out in production in 2023; more wallets are following.\n\n**BOLT-12 offers**: the old Lightning invoice was one-shot, generate an invoice, someone pays it, done. A BOLT-12 \"offer\" is a durable, reusable payment code. You post it on your website; anyone can pay it, and each payment gets its own private invoice negotiated on the fly. This is what makes recurring donations, subscriptions, and merchant flows work sensibly on Lightning.\n\nBoth land quietly. Neither will show up as a headline. But they close two of the biggest \"why is Lightning like this\" complaints, and mostly-invisibly. Watch for wallets that announce them; those are the ones investing in the future of the protocol rather than the current-year status quo.",
            tip: "Splicing kills channel-close-and-reopen. BOLT-12 kills one-shot invoices. Both were Lightning's biggest ergonomic problems for years.",
        },
        quiz: {
            question: 'What does splicing let a Lightning channel avoid?',
            options: [
                { text: 'Paying routing fees', correct: false },
                { text: 'The close-and-reopen dance every time you want to change channel size', correct: true },
                { text: 'The 6-block confirmation wait', correct: false, why: 'Splicing still uses the chain, it just avoids doing two transactions.' },
            ],
        },
    }),
    knowledge({
        id: 84,
        emoji: '🎟️',
        topic: 'eCash',
        tech: 'ecash',
        name: 'What a token actually looks like',
        tagline: 'A Cashu token is a base64 string. Anyone holding it is the owner.',
        learn: {
            heading: 'Bearer notes as text',
            body:
                "A Cashu eCash token is a compact base64-URL string, prefixed with `cashuA` (or the newer versioned prefix). Decode it and you get JSON: which mint issued it, a list of proofs (id, amount, unblinded signature), and optionally a memo.\n\nWhoever holds the token *is* the owner. Give it to your friend by any channel, email, SMS, a QR code, a scribbled note, and it is theirs. They redeem it against the mint; you can't spend it after that because the mint will refuse the second redemption.\n\nThis is what people mean when they call eCash \"digital cash\". It's a bearer instrument in the strictest sense: possession = ownership. No account, no signature required to send, no reversal. Which is exactly the good and the bad of physical cash, transplanted into a text string.",
            tip: 'A Cashu token is a slip of paper. Whoever holds the slip has the sats. Do not share by group text.',
        },
        quiz: {
            question: 'What does "bearer instrument" mean for a Cashu token?',
            options: [
                { text: 'Only the original recipient can spend it', correct: false, why: 'Anyone who has the string can spend it. That is the whole point.' },
                { text: 'Whoever currently holds the token controls the sats it represents', correct: true },
                { text: 'It requires a signature to transfer', correct: false, why: 'Nope, hand over the text and the transfer is done.' },
            ],
        },
    }),
    knowledge({
        id: 85,
        emoji: '🗂️',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Multi-mint wallets',
        tagline: 'One wallet, several mints, because no single mint deserves your whole balance',
        learn: {
            heading: 'Diversify your custodial risk on purpose',
            body:
                "Every eCash mint is custodial. If your balance sits on one mint and that mint disappears, all of it is gone. Multi-mint wallets (Minibits, Cashu.me, Nutstash, Boardwalk) let you hold tokens from several mints in the same app, and pick which to spend from.\n\nThe practical strategy:\n\n• Small balance per mint, enough to spend, not enough to hurt if lost.\n• Spread across mints run by different operators. Community mint, another community mint, one large operator, one experimental one.\n• When one mint starts feeling flaky (slow redemptions, silent maintenance windows), sweep the balance out before it degrades further.\n• Match the mint to the use case, a mint your local coffee shop's owner runs is fine for coffee-shop sats, not for your emergency fund.\n\nThis is the eCash version of \"don't keep your savings on one exchange\". Same logic, ten times faster to execute because moving eCash is a text-message-sized transfer.",
            tip: 'A multi-mint wallet turns eCash from "trust one stranger" into "trust several strangers a little each". That is a real improvement.',
        },
        quiz: {
            question: 'What is the point of a multi-mint eCash wallet?',
            options: [
                { text: 'Faster payments', correct: false },
                { text: 'Spread custody risk so no single mint failure wipes you out', correct: true },
                { text: 'Cheaper fees', correct: false, why: 'Fees are set per mint. Multi-mint does not change them.' },
            ],
        },
    }),
    knowledge({
        id: 86,
        emoji: '⚰️',
        topic: 'eCash',
        tech: 'ecash',
        name: 'When mints fail',
        tagline: 'The honest history. Then how to plan for it.',
        learn: {
            heading: 'Mints have gone dark before, and will again',
            body:
                "eCash mints have failed in every way an operator can fail: quiet disappearance, seized servers, operator burned out and shut down, operator lost their Lightning node keys, insolvency from botched liquidity management. When it happens, holders of tokens from that mint lose everything.\n\nHow to plan:\n\n• Assume every mint you use will eventually fail. Design your balance to make that survivable.\n• Read the mint operator's public activity. If they are quiet for a month, sweep out.\n• Prefer mints where the operator has skin in the game and posts real updates.\n• Never hold more on a single mint than you would carry in cash. Ever.\n• Practise sweeping, actually move tokens off a mint and redeem elsewhere, so the mechanics are muscle memory when you need it.\n\neCash is a great tool that quietly assumes failure and is designed around surviving it. Live inside that design.",
            tip: 'The mint will fail. Plan your balance so that is annoying, not devastating.',
        },
        quiz: {
            question: 'What is the honest, long-term expectation for any given eCash mint?',
            options: [
                { text: 'Cashu mints are audited and cannot fail', correct: false, why: 'They can fail and have. There are no audits.' },
                { text: 'Assume it will fail at some point, and size your balance accordingly', correct: true },
                { text: 'Fedimint federations cannot fail', correct: false, why: 'A majority of guardians can still collude, disappear, or mismanage funds, federation spreads the risk, it does not remove it.' },
            ],
        },
    }),
    knowledge({
        id: 87,
        emoji: '📏',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Difficulty adjustment',
        tagline: 'How Bitcoin keeps blocks arriving every ten minutes, forever',
        learn: {
            heading: 'The network retunes itself every 2016 blocks',
            body:
                "Bitcoin's block time target is 10 minutes. But mining power fluctuates, new machines come online, old ones drop off, whole countries occasionally ban mining. If nothing corrected for that, blocks would drift.\n\nEvery 2016 blocks (about two weeks), each node independently recomputes the mining difficulty. If the previous 2016 blocks took less than two weeks, difficulty goes up; if they took longer, it goes down. The formula clamps changes to ±4× per adjustment so a single wild swing can't destabilise everything.\n\nThis is unusual as engineering: no committee, no vote, no scheduled meeting. Every node runs the same math on the same data and reaches the same answer. The network self-regulates.\n\nBiggest observable effect: when the price rises sharply and miners rush to buy machines, difficulty follows a few months later. When a big mining region shuts down (China, 2021), difficulty drops. Then it recovers.",
            tip: "10-minute blocks are a target, not a guarantee. The 2-week retune is what keeps it on track long-term.",
        },
        quiz: {
            question: 'How does Bitcoin keep block times close to 10 minutes even as global mining power changes?',
            options: [
                { text: 'A committee vote', correct: false, why: 'No committee. Nodes compute it independently.' },
                { text: 'Every 2016 blocks, each node retunes difficulty using the same formula', correct: true },
                { text: 'Miners agree on a target off-chain', correct: false },
            ],
        },
    }),
    knowledge({
        id: 88,
        emoji: '📜',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Script, Bitcoin\'s tiny language',
        tagline: 'Every UTXO is locked by a mini-program. You unlock it to spend it.',
        learn: {
            heading: 'Not Turing-complete, on purpose',
            body:
                "When you send bitcoin, you're not just sending a number to an address. You're creating a UTXO with a tiny program attached: \"the spender must show a signature from the private key matching this public key\". That's what an address really is, a compact way to express a locking script.\n\nBitcoin's scripting language (called Script) is stack-based, deliberately limited, no loops. That's a feature: it makes transactions cheap to verify and their behaviour predictable. You cannot write an infinite loop that clogs the network. You cannot write a script that a node can't quickly evaluate.\n\nWhat you *can* express: multisig (n-of-m signatures required), time-locked payments (\"spendable after block X\"), hash-locked payments (\"spendable if you show pre-image of hash Y\", this is what HTLCs use on Lightning), and combinations. Enough for real financial contracts. Not enough for anything to run wild.\n\nEthereum and its Turing-complete cousins chose the opposite path, more expressive, more attack surface. Bitcoin's team looked at that and shipped a smaller, safer instrument.",
            tip: "Every UTXO is a puzzle. Spending it means solving the puzzle. The puzzle is written in Script.",
        },
        quiz: {
            question: 'Why is Bitcoin\'s Script deliberately not Turing-complete?',
            options: [
                { text: 'They ran out of time to build loops', correct: false },
                { text: 'Predictable, cheap-to-verify transactions matter more than expressiveness for a monetary system', correct: true },
                { text: 'Ethereum has a patent', correct: false, why: 'It does not.' },
            ],
        },
    }),
    knowledge({
        id: 89,
        emoji: '🌱',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Taproot, briefly',
        tagline: 'The 2021 upgrade you\'ve been using without noticing',
        learn: {
            heading: 'Schnorr signatures, tapscript, and privacy-by-default',
            body:
                "Taproot (BIP341/342, activated November 2021) was Bitcoin's biggest soft fork since SegWit. Three practical effects:\n\n**Schnorr signatures**: replace ECDSA. Same math family, simpler algebra. The important trick: multiple signatures over the same message can be *aggregated* into one signature. Multisig spends look identical on the chain to single-sig spends, smaller, cheaper, more private.\n\n**Tapscript**: a cleaner, more extensible way to write locking scripts. Removes some quirky opcode restrictions, makes future upgrades easier.\n\n**Merklised script paths**: a complex script (say a 3-of-5 with an escape hatch) can be committed to as a single Merkle root. Only the spending path you actually use gets revealed. The other unused branches stay hidden forever. So a multisig wallet's on-chain footprint is indistinguishable from a plain single-sig, a real privacy win.\n\nMost Bitcoin users don't know Taproot activated, and that's the mark of a good upgrade: the wallets that adopted it got smaller fees, better privacy, and better multisig ergonomics without asking users to do anything.",
            tip: "Taproot's win is: multisig, timelocks, and complex conditions all look like plain sends. Privacy without effort.",
        },
        quiz: {
            question: 'What is one privacy win Taproot delivered?',
            options: [
                { text: 'Every transaction is now confidential', correct: false, why: 'Amounts and addresses are still public.' },
                { text: 'Multisig and complex-script spends look identical on-chain to plain sends', correct: true },
                { text: 'It hid the mempool', correct: false },
            ],
        },
    }),
    knowledge({
        id: 90,
        emoji: '⛏️',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Mining pools',
        tagline: 'Why solo mining is basically extinct, and why that\'s a concern',
        learn: {
            heading: 'Pooling variance out, at a cost to decentralisation',
            body:
                "Finding a Bitcoin block is a lottery: even a warehouse full of the latest ASICs might go months without winning. To smooth income, miners join *pools*, groups that combine their hash power, share the block subsidy proportionally, and get steady payouts instead of a jackpot every few years.\n\nThe pain: a handful of pools (Foundry, AntPool, F2Pool, Binance Pool) now coordinate the majority of mining hash power. The miners themselves are widely distributed and can leave a pool freely, but the pool operator decides *which transactions get included in blocks* while its miners are pointed at it. That is a real censorship surface, even if temporary.\n\nMitigations in flight:\n\n• **Stratum V2**: a new mining protocol that lets individual miners choose their own transaction sets, rather than delegating to the pool.\n• **Home mining resurgence**: small solo/lottery miners (Bitaxe, NerdMiner) that occasionally win a block and remind everyone the lottery is real.\n• **P2Pool-style decentralised pools**: no central operator.\n\nBitcoin's security assumes hashrate is distributed. Pools concentrate the *decision-making*, not the hashrate itself, but the two can look uncomfortably similar for stretches at a time.",
            tip: "A pool controls which transactions get in a block. The miner controls where their hashrate goes. Both matter for the censorship story.",
        },
        quiz: {
            question: 'What is the actual centralisation risk from large mining pools?',
            options: [
                { text: 'They own most of the hashrate directly', correct: false, why: 'Miners are widely distributed and can point their machines elsewhere.' },
                { text: 'They pick which transactions their miners include in blocks, a censorship surface', correct: true },
                { text: 'They set the difficulty', correct: false, why: 'Difficulty is set by every node running the formula.' },
            ],
        },
    }),
    knowledge({
        id: 91,
        emoji: '🔢',
        topic: 'Self-custody',
        tech: 'bitcoin',
        name: 'BIPs 39, 32, 44, the numbers on your wallet',
        tagline: 'Why every wallet uses the same 12 words. Why they all agree on the derivation path.',
        learn: {
            heading: 'Three standards that let wallets talk to each other',
            body:
                "Open any Bitcoin wallet's advanced settings and you'll see numbers: BIP39, BIP32, BIP44 (or BIP84, BIP86 depending on script type). They're the standards that make your seed portable across apps.\n\n**BIP39** is the seed phrase. 128 bits of entropy → 12 words picked from a fixed 2048-word list, with a checksum baked in. Any BIP39-compatible wallet, anywhere, can turn those 12 words back into the same set of keys. \"12 words\" is what makes recovery possible.\n\n**BIP32** is hierarchical deterministic wallets. Instead of storing a random set of keypairs, your wallet grows a whole tree of them from a single master key. Every child key is deterministically derived. That's how a wallet can hand out fresh addresses forever without asking you to back anything up beyond the seed.\n\n**BIP44 / 49 / 84 / 86** are the standard *paths* through that tree. Different paths for different script types (legacy, wrapped segwit, native segwit, taproot). Every wallet uses the same paths so you can restore a seed in a different wallet and see the same addresses.\n\nIf those three didn't line up, exporting a seed would give you your money back only if you imported it into the exact same software. BIPs made portability the default.",
            tip: 'Twelve words is a seed. What "twelve words" turns into depends on BIP39, BIP32, and the derivation path.',
        },
        quiz: {
            question: 'What lets you restore the same seed phrase in a *different* wallet app and still see the same addresses?',
            options: [
                { text: 'The developers all know each other', correct: false },
                { text: 'BIP39 (words → entropy) + BIP32 (deterministic key tree) + standard derivation paths', correct: true },
                { text: 'A central Bitcoin registry', correct: false, why: 'There is no such thing.' },
            ],
        },
    }),
    knowledge({
        id: 92,
        emoji: '🎭',
        topic: 'Self-custody',
        tech: 'bitcoin',
        name: 'The 25th word (passphrase)',
        tagline: 'Under pressure, Alice opens a decoy wallet. The real one needs a word only she knows.',
        learn: {
            heading: 'A passphrase is not a password on your seed, it is another seed',
            body:
                "BIP39 lets you extend a 12-word seed with an optional passphrase, an extra string only you know. The critical property: a different passphrase produces a *completely different set of addresses*, all derived from the same 12 words.\n\nThis is powerful and dangerous.\n\n**Powerful**: an attacker who finds your paper backup gets nothing valuable, because the 12 words on paper unlock only an empty (or decoy) wallet. Your real balance lives under a passphrase they don't have. This is real, working plausible deniability.\n\n**Dangerous**: passphrases are usually only in your head. Forget the exact spelling, capitalisation, or spacing → your bitcoin is gone. There is no recovery. It is the single biggest reason people lose passphrase-protected funds.\n\nIf you use one:\n\n• Test recovery on a small amount first, actually going through the flow.\n• Write it down and put it somewhere completely separate from the seed words. Never together.\n• Simpler is usually better than clever. \"my-first-house-street\" is fine; \"@k9!*Xz\" gets forgotten.\n• If nobody else in your life knows how to type it, plan for that, your family cannot recover funds nobody can spell.",
            tip: "A passphrase is a decoy layer on top of your seed. Powerful, and the most common way people permanently lock themselves out.",
        },
        quiz: {
            question: 'What is the practical effect of adding a BIP39 passphrase to your seed?',
            options: [
                { text: 'It encrypts the seed words on disk', correct: false, why: 'It generates a different wallet, not encryption.' },
                { text: 'The same 12 words with a different passphrase produce a completely different set of addresses', correct: true },
                { text: 'It replaces the need for a hardware wallet', correct: false, why: 'It complements it.' },
            ],
        },
    }),
    knowledge({
        id: 93,
        emoji: '📄',
        topic: 'Self-custody',
        tech: 'bitcoin',
        name: 'Backing up a seed, seriously',
        tagline: 'Paper burns, ink fades, houses flood. Design a backup that survives your life.',
        learn: {
            heading: 'The seed backup is the wallet. Design it like it matters.',
            body:
                "A seed written on receipt paper in a drawer will be ruined by a flood, a fire, or a house move. Backups get taken seriously when you internalise: the piece of paper *is* the money.\n\n**Paper**: fine for testing. Use archival paper, laminate it, keep it in two locations. Assume any single location will eventually fail (fire, roof leak, snoopy relative).\n\n**Metal**: engraved or stamped into stainless steel plates (Keystone, Blockmit, ColdCard, DIY punch-set). Survives fires, floods, and being buried. This is the standard for a real backup. Under $100 for a lifetime.\n\n**SLIP-39 / Shamir shares**: split the seed into (say) 5 shares, any 3 of which can reconstruct it. Great for distributing across a few trusted locations without any single one being fatal. Fewer wallets support it, Trezor is the main one.\n\n**BIP85 children**: one master seed can deterministically derive many child seeds. Useful for organising multiple wallets from one backup, but the master is still the single point of failure.\n\nThe test: draw a line on your calendar 10 years out. Is your backup still going to be readable then, in whichever building you happen to live in? If not, upgrade now.",
            tip: 'Steel outlives paper. Two locations outlive one. Neither outlives your ability to actually find the seed again in twenty years.',
        },
        quiz: {
            question: 'Which backup approach best survives a house fire?',
            options: [
                { text: 'A photo of the seed on your phone', correct: false, why: 'Cloud sync is the opposite of secure.' },
                { text: 'Words punched into stainless steel plates', correct: true },
                { text: 'Paper in a safe deposit box', correct: false, why: 'Better than nothing, but a single location and paper still fails.' },
            ],
        },
    }),
    knowledge({
        id: 94,
        emoji: '📦',
        topic: 'Self-custody',
        tech: 'bitcoin',
        name: 'PSBTs, signing without touching the internet',
        tagline: 'The file format that lets a cold wallet sign a hot wallet\'s transaction',
        learn: {
            heading: 'Partially Signed Bitcoin Transactions, explained',
            body:
                "A PSBT (BIP174) is a file that contains an unsigned or partially-signed Bitcoin transaction, plus all the context a signer needs to check what it's about to authorize (which inputs, what amounts, what outputs, what change).\n\nWhy this matters:\n\n• You watch balances on a hot wallet (Sparrow on your laptop) that only has *public* keys.\n• You draft a send in the hot wallet. It produces a PSBT, an unsigned transaction.\n• You transfer the PSBT to a cold wallet (a hardware wallet, an air-gapped machine, a phone in flight mode) via SD card, USB, or QR.\n• The cold wallet displays what's actually being signed (\"send 100k sats to bc1q... plus 5k change back\"). You confirm. It signs.\n• The signed PSBT comes back. The hot wallet broadcasts.\n\nAt no point does the cold wallet touch a network. At no point do the private keys leave the cold environment. It is the standard way real cold-storage flows work, Sparrow ↔ ColdCard, Nunchuk ↔ multiple signers, etc.",
            tip: "PSBT is the boring plumbing that makes serious cold storage practical. If your wallet supports PSBT import/export, it's grown up.",
        },
        quiz: {
            question: 'What does a PSBT let you do that a regular transaction file does not?',
            options: [
                { text: 'Move the whole transaction between an online device and an offline signer without exposing keys', correct: true },
                { text: 'Skip paying fees', correct: false },
                { text: 'Send bitcoin without a signature', correct: false, why: 'Every valid Bitcoin transaction needs signatures.' },
            ],
        },
    }),
    knowledge({
        id: 95,
        emoji: '🧬',
        topic: 'Self-custody',
        tech: 'bitcoin',
        name: 'Descriptors, what your wallet really is',
        tagline: 'A one-line recipe that tells any wallet exactly which addresses to watch',
        learn: {
            heading: 'One string that describes a whole address family',
            body:
                "An output descriptor is a compact text expression like `wpkh([abcd1234/84h/0h/0h]xpub.../<0;1>/*)` that fully specifies how a wallet generates addresses: script type, master fingerprint, derivation path, extended public key, receive/change branches, and the address range.\n\nWhy this exists: exporting just an xpub used to be ambiguous. Different wallets guessed different script types (legacy? segwit? taproot?), different derivation paths, and produced different addresses from the same xpub. Descriptors kill the guessing, they say exactly what to do.\n\nWhat it means practically:\n\n• A watch-only wallet on your laptop can be set up from a single descriptor string, no fumbling with settings.\n• A multisig setup is described by a *combined descriptor* that names every signer and the threshold. One string, unambiguous.\n• Migrating between wallets is: export descriptor from A, import descriptor into B, done. As long as both support descriptors (Bitcoin Core, Sparrow, Nunchuk, BlueWallet, Electrum).\n\nDescriptors are boring. That is the highest praise for wallet infrastructure.",
            tip: 'If a wallet asks for "xpub", give it a descriptor if you can. Fewer things guess. Fewer things go wrong.',
        },
        quiz: {
            question: 'What problem do output descriptors solve for wallet imports?',
            options: [
                { text: 'They encrypt the seed', correct: false },
                { text: 'They fully specify script type + derivation path so different wallets do not guess and diverge', correct: true },
                { text: 'They let you send bitcoin without a private key', correct: false },
            ],
        },
    }),
    knowledge({
        id: 96,
        emoji: '🔄',
        topic: 'Self-custody',
        tech: 'bitcoin',
        name: 'Migrating wallets safely',
        tagline: "Alice's wallet app shuts down for good. Twelve words later she is back in business.",
        learn: {
            heading: 'The five-step wallet migration playbook',
            body:
                "Wallets die. Companies pivot. New tools ship. Eventually you will need to move a working wallet from one app to another. Do it in this order:\n\n1. **Get your seed and passphrase out first.** Confirm you have them written down (or on steel). If you can't reconstruct the wallet from words alone in a hostile environment, you don't own it yet.\n\n2. **Import into the new wallet on a test amount.** Move 10,000 sats first. Confirm it arrives. Send it back. Confirm the round trip works before you touch the real balance.\n\n3. **Use the same derivation path.** If the new wallet asks, check the export from the old one. Native segwit uses BIP84 (m/84'/0'/0'), taproot uses BIP86, legacy uses BIP44. Mismatched paths = wrong addresses = looks empty even though your money is there.\n\n4. **For real migrations (change of security posture): sweep, don't just import.** Generate a fresh seed on the new wallet, send everything to the new wallet's addresses. This gives you a clean cryptographic identity if you suspect the old wallet was ever exposed.\n\n5. **Destroy the old backup** only after the new wallet has confirmed the funds for weeks. Not days. Weeks. Reversing this is the mistake nobody talks about.",
            tip: 'The dangerous moment is between "old wallet forgotten" and "new wallet actually verified holding the funds." Move slowly.',
        },
        quiz: {
            question: 'What is the first thing to do before migrating from one wallet app to another?',
            options: [
                { text: 'Delete the old wallet to force yourself to commit', correct: false, why: 'Never delete before verifying the new setup works.' },
                { text: 'Confirm you have the seed (and passphrase, if any) and can reconstruct the wallet from words alone', correct: true },
                { text: 'Buy new hardware', correct: false },
            ],
        },
    }),
    knowledge({
        id: 97,
        emoji: '✍️',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Signers, never paste your nsec',
        tagline: 'The pattern that keeps your private key out of every app you use',
        learn: {
            heading: 'Nsecs go in one place. Everything else asks that place to sign.',
            body:
                "Your nsec is a private key, the whole reason your Nostr identity is yours. Paste it into a web app and you're trusting that page, its JavaScript, its analytics, its cache, and every browser extension listening in. One leak, and someone else is you on Nostr forever.\n\nThe better pattern: put your nsec in a *signer*, and never let anything else see it.\n\n• **NIP-07 browser extensions** (nos2x, Alby, Nostore, Flamingo). Your key lives inside the extension. Nostr web apps ask the extension \"please sign this event\" and get back a signed event, never the key. The web app never sees plaintext.\n• **Bunker signers (NIP-46)** run a separate process (on your phone, or a home server) that holds the key. Clients connect via a signed URI and ask the bunker to sign things. Same trust boundary, works cross-device.\n• **Hardware signers** (some Nostr wallets are experimenting) push the key into a chip that never exposes it.\n\nThe usability trade-off is small; the security payoff is enormous. Web apps you use for a week come and go. Your identity doesn't.",
            tip: "If a Nostr web app asks for your nsec directly, close the tab. That is 2019 pattern. Use a NIP-07 signer.",
        },
        quiz: {
            question: 'Why should you never paste your nsec directly into a web app?',
            options: [
                { text: 'The nsec is limited-use', correct: false, why: 'It is not, it is the key forever.' },
                { text: 'The web app, its scripts, extensions, and cache all get to see your identity\'s master key', correct: true },
                { text: 'Web apps cannot generate signatures', correct: false, why: 'They can, with a signer, they get signatures without seeing the key.' },
            ],
        },
    }),
    knowledge({
        id: 98,
        emoji: '🎁',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Private DMs, NIP-04 and gift-wrap',
        tagline: 'Two DM standards. One leaks metadata; the other doesn\'t.',
        learn: {
            heading: 'A brief history of \"private\" on Nostr',
            body:
                "For years, Nostr had exactly one DM standard: **NIP-04**. It encrypted message *contents* between sender and recipient, but every relay could see WHO was talking to WHOM, WHEN, and how OFTEN. Recipient's npub was in plaintext. Sender's npub was in plaintext. Perfect metadata for anyone building a social graph, terrible for anything actually sensitive.\n\n**NIP-17** (2024, gift-wrap DMs) fixed this by borrowing an idea from Signal: wrap the message in layers of encryption, each addressed to what looks like a randomly-generated key, so that from the outside a DM looks like an anonymous kind-1059 event. The recipient's real client peels the layers to find the actual message inside.\n\nWhat leaks now:\n\n• That *some* private message happened, roughly when.\n• Nothing about who sent to whom, or their social relationship.\n\nWhat still leaks: the timing (a relay-side observer can correlate posts if they know both endpoints).\n\nWallet/client support is mixed. Amethyst, Damus (recent), and 0xchat implement NIP-17. Older clients still use NIP-04. If your DMs matter, check which your client uses, and treat NIP-04 as postcards, not envelopes.",
            tip: 'NIP-04 encrypts message content and leaks everything else. NIP-17 fixes it. Check which one your client uses before sending anything sensitive.',
        },
        quiz: {
            question: 'What is the main upgrade NIP-17 gives over NIP-04 for Nostr DMs?',
            options: [
                { text: 'Faster delivery', correct: false },
                { text: 'The sender/recipient metadata is no longer visible to relays', correct: true },
                { text: 'Longer message length', correct: false },
            ],
        },
    }),
    knowledge({
        id: 99,
        emoji: '🌐',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'The wider Nostr ecosystem',
        tagline: 'Long-form, marketplaces, video, communities, the whole thing keeps growing',
        learn: {
            heading: 'Nostr is bigger than short notes',
            body:
                "The first Nostr client you saw was probably a Twitter-clone (Damus, Amethyst, Snort). That's the loudest use case, but the protocol keeps growing sideways.\n\n**Long-form** (NIP-23): Habla.news, Yakihonne. Signed articles that live on relays, not on Substack. The same npub, same follows, different content type.\n\n**Marketplaces** (NIP-99, NIP-15): Plebeian Market, Shopstr, Nostrocket. Bitcoin-native listings with Lightning payment and Nostr reviews. Small but real trade happening.\n\n**Video** (NIP-71): Flare, Amethyst's video tab. Signed videos that don't live on any single platform. Nascent, worth watching.\n\n**Communities** (NIP-72): Reddit-shaped groups on Nostr, modded, threaded, portable. 0xchat and Amethyst show them.\n\n**Custom event kinds**: anyone can define a new event kind. Music kinds, RSS mirroring kinds, calendar events, workout logs. Not all of them stick; the ones that do become de-facto standards.\n\nThe design that makes all of this work: your npub is one identity that carries you across all of these. Same follows, same identity, different apps. That's the actual product Nostr is shipping, not the Twitter clone, the *portability* underneath.",
            tip: 'Nostr is not a Twitter clone with extra steps. It is an identity layer that a hundred small apps are quietly building on top of.',
        },
        quiz: {
            question: 'What is the single feature that ties all these different Nostr apps together?',
            options: [
                { text: 'They share a database', correct: false, why: 'They use different relays and event kinds.' },
                { text: 'They all use the same npub identity, so your follow graph and reputation move with you', correct: true },
                { text: 'They share a company', correct: false, why: 'Different teams, different apps.' },
            ],
        },
    }),

    // ═════════════════════════════════════════════════════════════════════
    // Missions 100-105, Open Source: zero to your first merged Bitcoin PR
    // ═════════════════════════════════════════════════════════════════════
    knowledge({
        id: 100,
        emoji: '🍴',
        topic: 'Open Source',
        tech: 'bitcoin',
        name: 'Forks, branches, and pull requests',
        tagline: 'Every wallet you trust was built by volunteers. Here is how they do it.',
        learn: {
            heading: 'The contribution loop',
            body:
                "Bitcoin is not a company. Every node, wallet, and library is open source code that someone, somewhere, chose to improve. The tool they all use is git, and the loop is always the same.\n\nFork: make your own copy of a project on GitHub. It costs nothing and breaks nothing.\nBranch: open a workspace inside your copy for one specific change.\nCommit: save a step of work with a short message saying what and why.\nPull request (PR): show the maintainers your change and ask them to review and merge it.\n\nThat last word matters: it is a *request*. Maintainers review, ask questions, suggest edits. When they merge, your code ships to everyone who uses the project. Nobody needs permission to start, and nobody gets to skip review, not even the founders.",
            tip: 'You can fork any public repository right now. Forking is reversible, free, and invisible to everyone else.',
        },
        quiz: {
            question: 'What is a pull request?',
            options: [
                { text: 'A demand that maintainers accept my code', correct: false, why: 'It is a request. Review decides what gets merged.' },
                { text: "A proposal: 'here is my change, please review and merge it'", correct: true },
                { text: 'A way to download code to my computer', correct: false, why: "That's cloning (or pulling). A PR pushes a proposal the other way." },
            ],
        },
    }),
    knowledge({
        id: 101,
        emoji: '🔍',
        topic: 'Open Source',
        tech: 'bitcoin',
        name: 'Read a real codebase',
        tagline: 'The code guarding billions of dollars is public. Most people never look.',
        learn: {
            heading: 'Reading comes before writing',
            body:
                "Every contribution starts with reading someone else's code, so practice on a real project: rust-bitcoin (the Rust building blocks), BDK (wallet kits), LDK (Lightning), or Core Lightning.\n\nYou are not trying to understand everything. You are building a map. Good first stops, in order:\n\n1. README: what the project is and who it is for.\n2. CONTRIBUTING.md: how the maintainers want help delivered.\n3. The examples folder: small, complete programs that actually run.\n4. The tests: real inputs and expected outputs for every important function.\n\nThen try one search: open the repository, press the dot key (or use GitHub's search box), and look up a word you know from this course, like 'mnemonic' or 'invoice'. Follow it to the function that implements it. That moment, 'oh, THIS is where seed phrases come from', is the whole skill.",
            tip: 'Tests are the best documentation. They cannot go stale, because CI runs them on every change.',
        },
        quiz: {
            question: 'Where do you most reliably see how a function is meant to be used?',
            options: [
                { text: "The project's marketing site", correct: false, why: 'Marketing describes outcomes, not usage.' },
                { text: 'Its tests and examples', correct: true },
                { text: 'The LICENSE file', correct: false, why: 'That covers your rights, not the API.' },
            ],
        },
        helper: 'Open one of these real codebases, find its README and tests, and try one search. The button credits you when you have looked around.',
        links: [
            { label: 'rust-bitcoin', href: 'https://github.com/rust-bitcoin/rust-bitcoin' },
            { label: 'BDK', href: 'https://github.com/bitcoindevkit/bdk' },
            { label: 'LDK', href: 'https://github.com/lightningdevkit/rust-lightning' },
            { label: 'Core Lightning', href: 'https://github.com/ElementsProject/lightning' },
        ],
    }),
    {
        id: 102,
        emoji: '✏️',
        topic: 'Open Source',
        tech: 'bitcoin',
        name: 'Find a docs fix',
        tagline: 'Your first contribution is a sentence, not an algorithm.',
        simulated: false,
        learn: {
            heading: 'Documentation is the front door',
            body:
                "Ask around: a huge share of Bitcoin developers merged their first PR into documentation. A typo, a broken link, a sentence that made them read it twice. These are real contributions, they get reviewed fast, and maintainers love them because docs rot quietly while everyone stares at the code.\n\nSo hunt for one. Open the documentation of any Bitcoin project you have met in this course: the BDK book, the LDK docs, rust-bitcoin's API docs, a wallet's user guide. Read like a newcomer, because you are one. The moment something makes you stumble, stop. You just found your contribution.\n\nThe rule of thumb: if you had to read a sentence twice, that is a bug in the sentence, not in you.",
            tip: 'Fixing a typo teaches you the entire fork, branch, commit, PR loop with zero risk of breaking software.',
        },
        quiz: {
            question: 'Why are documentation fixes such a good first PR?',
            options: [
                { text: "They skip review, so they merge instantly", correct: false, why: 'Everything gets reviewed. Docs are just fast to verify.' },
                { text: 'They are real, useful, and quick for a maintainer to check and merge', correct: true },
                { text: 'They pay better than code', correct: false, why: 'Open source contributions are usually unpaid either way.' },
            ],
        },
        do: {
            kind: 'paste-value',
            actionLabel: 'Log my find',
            helper: 'Paste a link to the docs page (or the sentence itself) you would improve. This becomes your target for the final mission.',
            placeholder: 'https://... or the sentence that made you stumble',
            maxLength: 300,
            links: [
                { label: 'BDK docs', href: 'https://bitcoindevkit.org' },
                { label: 'LDK docs', href: 'https://lightningdevkit.org' },
                { label: 'rust-bitcoin API docs', href: 'https://docs.rs/bitcoin' },
            ],
        },
    },
    {
        id: 103,
        emoji: '🐣',
        topic: 'Open Source',
        tech: 'bitcoin',
        name: 'Decode a good first issue',
        tagline: 'Maintainers label easy wins for newcomers. Learn to read the label.',
        simulated: false,
        learn: {
            heading: "'good first issue' is a real label",
            body:
                "Most projects tag beginner-friendly work with the literal label 'good first issue'. Open the Issues tab of rust-bitcoin, BDK, LDK, or any Nostr client, filter by that label, and pick one that interests you.\n\nThen do the step most people skip: restate the issue in your own words. Three questions:\n\n1. What is being asked for?\n2. Why does the project want it?\n3. How would you know it is done?\n\nIf you can answer all three, you understand the issue well enough to try it. If you cannot, that is normal too, and there is a professional move for it: ask a clarifying question in a comment on the issue. Maintainers vastly prefer a good question over a confused PR.",
            tip: "On any GitHub repo: Issues tab, then filter by label 'good first issue'. Some projects also use 'help wanted'.",
        },
        quiz: {
            question: "You found an issue but don't fully understand it. What is the best move?",
            options: [
                { text: 'Start coding and hope it becomes clear', correct: false, why: 'A confused PR costs the maintainer more time than a question.' },
                { text: 'Ask a clarifying question in a comment on the issue', correct: true },
                { text: 'Give up on the project entirely', correct: false, why: 'Not understanding one issue says nothing about the next one.' },
            ],
        },
        do: {
            kind: 'paste-value',
            actionLabel: "That's my issue",
            helper: 'Restate your chosen issue in your own words: what is wanted, and how would you know it is done?',
            placeholder: 'The issue asks for... it is done when...',
            maxLength: 500,
            links: [
                { label: 'rust-bitcoin good first issues', href: 'https://github.com/rust-bitcoin/rust-bitcoin/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22' },
                { label: 'BDK good first issues', href: 'https://github.com/bitcoindevkit/bdk/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22' },
                { label: 'LDK good first issues', href: 'https://github.com/lightningdevkit/rust-lightning/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22' },
            ],
        },
    },
    knowledge({
        id: 104,
        emoji: '🧪',
        topic: 'Open Source',
        tech: 'bitcoin',
        name: 'Tests are contributions too',
        tagline: 'The easiest code PR in existence: prove an existing function works.',
        learn: {
            heading: 'Why maintainers love test-only PRs',
            body:
                "If a docs fix feels too small and a feature feels too big, there is a perfect middle: write a test for code that already exists.\n\nA test-only PR cannot break production, it documents how the code actually behaves, and reviewing it takes minutes. Find a function with thin coverage, write a test that pins down its current behavior, and you have made the project safer without touching its logic.\n\nAlmost every test has the same three-beat shape:\nArrange: set up the inputs.\nAct: call the function.\nAssert: check the result is what you expected.\n\nOne craft note that is half of code review: copy the style of the neighboring tests. Same naming, same helpers, same layout. A test that looks native merges much faster than a clever one.",
            tip: 'Before writing, run the existing test suite. If you cannot run the tests, that is your real first task.',
        },
        quiz: {
            question: 'What makes a test-only PR easy for maintainers to merge?',
            options: [
                { text: 'Nobody actually reads test code', correct: false, why: 'They read it. It is just fast to evaluate.' },
                { text: 'It cannot change runtime behavior, and it documents what the code really does', correct: true },
                { text: 'CI pipelines skip test files', correct: false, why: 'CI exists precisely to run them.' },
            ],
        },
    }),
    {
        id: 105,
        emoji: '🏁',
        topic: 'Open Source',
        tech: 'bitcoin',
        name: 'Ship a real PR',
        tagline: 'Graduation is not a certificate. It is a merge commit with your name on it.',
        simulated: false,
        learn: {
            heading: 'The last mission is real',
            body:
                "Everything before this was practice. Now pick your target: the docs fix you found, the good first issue you decoded, or a test like the one you studied. Fork the repository, make the change on a branch, open a pull request, and work with the maintainers until it merges.\n\nThat can take a day or a month. This mission waits. Review rounds are not rejection, they are the maintainers investing time in your change, so answer them and iterate.\n\nWhat wins review: one small, focused change. A clear description of what and why. Patience.\n\nWhen your PR merges, come back and paste its URL along with your GitHub username. BitPilot asks GitHub's public API two questions: is this PR really merged, and was it really authored by that account? If both are yes, you graduate this flight path with something no certificate can match: code strangers now run.",
            tip: 'Small and polite wins. Maintainers remember contributors who make review easy.',
        },
        quiz: {
            question: 'What counts as graduating this flight path?',
            options: [
                { text: 'Opening a pull request', correct: false, why: 'Opening is the start. The merge is the graduation.' },
                { text: 'A maintainer merges your PR into a real project', correct: true },
                { text: 'Getting 100 stars on your fork', correct: false, why: 'Stars are nice. Merged code is the credential.' },
            ],
        },
        do: {
            kind: 'github-pr',
            actionLabel: 'Verify my merged PR',
            helper: "Paste your merged pull request's URL and your GitHub username. BitPilot checks GitHub that it is merged and that you authored it.",
            links: [
                { label: 'How to open a pull request (GitHub docs)', href: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request' },
            ],
        },
    },
]

/** Total mission count. The frontend never hardcodes 58, it reads this. */
export const MISSION_COUNT = MISSIONS.length

/** Lookup a mission def by id (= mission number). Returns undefined if out of range. */
export function missionById(id: number): MissionDef | undefined {
    return MISSIONS.find((m) => m.id === id)
}
