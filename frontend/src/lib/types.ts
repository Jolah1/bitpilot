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

export type DoKind =
    | 'knowledge' /* no API call — user clicks "I get it" to claim reward */
    | 'nostr-identity' /* POST /api/nostr/identity */
    | 'invoice' /* POST /api/invoice */
    | 'pay' /* POST /api/pay (needs lightning-address text input) */
    | 'ecash-claim' /* POST /api/ecash/mint (we generate a token to receive) */
    | 'ecash-spend' /* POST /api/ecash/redeem (user pastes token) */
    | 'nostr-publish' /* POST /api/nostr/publish (needs note text + nsec) */

export interface MissionDef {
    /** Mission number, 1-indexed. Matches backend `Mission.number`. */
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

/**
 * The ten BitPilot missions. Single source of truth on the frontend.
 *
 * Coverage:
 *   Bitcoin   — missions 1, 2, 7  (what is it, sats, fees/mempool)
 *   Nostr     — missions 3, 4, 10 (identity, keys quiz, real publish)
 *   Lightning — missions 5, 6     (receive, send)
 *   eCash     — missions 8, 9     (claim, spend)
 */
export const MISSIONS: MissionDef[] = [
    {
        id: 1,
        emoji: '₿',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'What is Bitcoin, really?',
        tagline: 'Money that no government, bank, or company can control',
        simulated: false,
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
        do: {
            kind: 'knowledge',
            actionLabel: 'I get it — claim my sats',
            helper: "No button to press here besides this one. Knowledge missions are about *understanding*, not *doing*.",
        },
    },
    {
        id: 2,
        emoji: '🔢',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Think in sats, not bitcoin',
        tagline: '1 bitcoin = 100,000,000 satoshis. Sats are the real unit.',
        simulated: false,
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
        do: {
            kind: 'knowledge',
            actionLabel: 'Got it — claim sats',
            helper: 'Same as before: this is a knowledge mission. Tap to claim and move on.',
        },
    },
    {
        id: 3,
        emoji: '🪪',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Generate your Nostr identity',
        tagline: 'A username nobody can take away — it lives in math, not on a server',
        simulated: false, // real bech32 keys
        learn: {
            heading: 'You are about to generate a real cryptographic identity',
            body:
                "Nostr is a protocol — like email or the web — for sending messages no platform can delete. To use it, you need an identity. That identity is a pair of keys generated by your device.\n\nWhen you click the button below, the backend will generate a real Nostr keypair just for you. The public half (npub) is your username. The private half (nsec) is your password — except it can never be reset.\n\nIf you lose your nsec, the identity is gone. If someone else gets it, they ARE you. Treat it like a house key.",
            tip: 'After you generate keys, copy your nsec somewhere safe — a password manager, or pen and paper.',
        },
        quiz: {
            question: 'Your nsec (private key) is leaked. What can the attacker do?',
            options: [
                { text: 'Nothing — it expires automatically', correct: false, why: 'Nostr keys never expire. There is no reset.' },
                { text: 'Post as you, sign things as you — they ARE you on Nostr', correct: true },
                { text: 'Steal your bitcoin from your bank', correct: false, why: "Nostr keys aren't connected to your bank. They're an identity, not money — but losing them is still serious." },
            ],
        },
        do: {
            kind: 'nostr-identity',
            actionLabel: 'Generate my Nostr identity',
            helper: 'One tap. Your real keypair will appear below — copy your nsec before continuing.',
        },
    },
    {
        id: 4,
        emoji: '🔐',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Public vs private key',
        tagline: 'Get this wrong in real life and you lose everything',
        simulated: false,
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
        do: {
            kind: 'knowledge',
            actionLabel: 'Locked in — claim sats',
            helper: 'Knowledge mission. You only really learn this one by burning yourself once — try not to.',
        },
    },
    {
        id: 5,
        emoji: '⚡',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Receive sats on Lightning',
        tagline: "Bitcoin's fast lane: payments settle in under a second",
        simulated: true,
        learn: {
            heading: 'Lightning is a layer on top of Bitcoin',
            body:
                "Bitcoin on its own confirms transactions every ~10 minutes. Great for big settlements, terrible for buying coffee.\n\nThe Lightning Network sits on top of Bitcoin: people open payment channels with each other, then route tiny payments back and forth instantly. Settlement to the underlying Bitcoin chain happens later, in bulk.\n\nTo receive on Lightning you create an 'invoice' — a string that starts with 'lnbc…' and encodes how much you want and where to send it.",
            tip: "An invoice can only be paid once. Generate a new one each time you want to be paid.",
        },
        quiz: {
            question: 'How fast does a Lightning payment settle?',
            options: [
                { text: '~10 minutes', correct: false, why: "That's on-chain Bitcoin. Lightning is much faster." },
                { text: 'Instantly — under a second, usually', correct: true },
                { text: '1-2 business days', correct: false },
            ],
        },
        do: {
            kind: 'invoice',
            actionLabel: 'Create my Lightning invoice',
            helper:
                "We'll generate a 100-sat invoice. If LNbits is wired up on the backend, this hits a real testnet node; otherwise it's a placeholder string. Check the badge in the header to see which.",
        },
    },
    {
        id: 6,
        emoji: '📤',
        topic: 'Lightning',
        tech: 'lightning',
        name: 'Send 50 sats',
        tagline: 'Lightning addresses look like emails — and work the same way',
        simulated: true,
        learn: {
            heading: 'A Lightning address: alice@getalby.com',
            body:
                "Memorising a fresh invoice every time is annoying. Lightning Address solves that: it's an email-shaped string like 'alice@getalby.com'. Behind the scenes, your wallet asks Alice's server for a fresh invoice and pays it. You never see the invoice.\n\n50 sats is roughly $0.03 at most prices. Tiny enough that you can practice without worrying — but it's how real Lightning payments feel.",
            tip: "You don't need an account anywhere to receive. You need an account to send (so the wallet has a balance to spend).",
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
            helper:
                'Type any Lightning address (e.g. demo@ln.tips). On a configured backend this sends real testnet sats; otherwise it returns a placeholder. Check the badge in the header.',
            placeholder: 'demo@ln.tips',
            maxLength: 80,
        },
    },
    {
        id: 7,
        emoji: '🧾',
        topic: 'Bitcoin',
        tech: 'bitcoin',
        name: 'Fees and the mempool',
        tagline: 'Why some payments are free and others cost real money',
        simulated: false,
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
        do: {
            kind: 'knowledge',
            actionLabel: 'Makes sense — claim sats',
            helper: 'Knowledge mission. Knowing when to use Lightning vs on-chain saves real money.',
        },
    },
    {
        id: 8,
        emoji: '🎟️',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Claim a Cashu eCash token',
        tagline: 'Private digital cash — even the mint can\'t see what you spend',
        simulated: false,
        learn: {
            heading: 'eCash is like a banknote, but digital',
            body:
                "When you pay with a card, your bank sees every purchase. Even on-chain Bitcoin is public — anyone can see your transaction history if they know your address.\n\neCash (Cashu is the most common protocol) is different. A 'mint' issues tokens backed by real sats. Once you hold a token, whoever holds the token holds the value — like a banknote. The mint can't trace what you do with it. That property is called 'bearer'.\n\nYou can think of a Cashu token as a long string of letters. Possessing it means owning the sats inside.",
            tip: "Bearer money cuts both ways: if you lose the token string, the sats are gone. Treat tokens like cash.",
        },
        quiz: {
            question: 'What makes eCash private?',
            options: [
                { text: 'It uses a longer password than Bitcoin', correct: false },
                { text: "Blind signatures — the mint can't link tokens to who holds them", correct: true },
                { text: 'The transactions auto-delete after 24h', correct: false },
            ],
        },
        do: {
            kind: 'ecash-claim',
            actionLabel: 'Mint me a token',
            helper:
                "We'll mint a real Cashu V4 token (50 sats worth) at a public testmint. The token is real protocol; the sats are testmint-fake. Any Cashu wallet can read it.",
        },
    },
    {
        id: 9,
        emoji: '🤝',
        topic: 'eCash',
        tech: 'ecash',
        name: 'Spend (redeem) a token',
        tagline: 'Whoever holds the string holds the sats',
        simulated: false,
        learn: {
            heading: 'Redeeming a token = handing the bearer note to the mint',
            body:
                "Spending a Cashu token means giving the string to the recipient. They redeem it at the mint, the mint cancels the old token, and issues a new one to them.\n\nThe person you paid never finds out it came from you. The mint sees a redemption but can't tie it back to your original purchase. That's the magic of blind signatures.\n\nYou'll paste a token below — either one you saved from the last mission, or any string that starts with 'cashuA' will work (in this simulation).",
            tip: "In real eCash, if you give someone the token AND keep a copy yourself, only the first redemption wins. So don't double-spend.",
        },
        quiz: {
            question: 'You handed your Cashu token to a friend. What stops you from spending it again later?',
            options: [
                { text: 'A timer locks the token after 1 hour', correct: false },
                { text: 'The mint only accepts each token once — first redemption wins', correct: true },
                { text: 'Nothing — Cashu allows double-spending', correct: false, why: "Definitely not. Cashu mints reject already-redeemed tokens." },
            ],
        },
        do: {
            kind: 'ecash-spend',
            actionLabel: 'Redeem this token',
            helper: "Paste a real Cashu token (starts with 'cashuA' or 'cashuB'). The mint will verify it and tell you how many sats it carried.",
            placeholder: 'cashuB…',
            maxLength: 200,
        },
    },
    {
        id: 10,
        emoji: '📢',
        topic: 'Nostr',
        tech: 'nostr',
        name: 'Publish a real Nostr note',
        tagline: 'A message no company can delete, signed only by you',
        simulated: false, // REAL relay publish
        learn: {
            heading: "This one's real — your note will hit public Nostr relays",
            body:
                "When you click publish, the backend signs a note with the nsec from mission 3 and broadcasts it to public Nostr relays (relay.damus.io, nos.lol, relay.nostr.band).\n\nOnce a relay accepts it, your note is permanently part of Nostr. Anyone with a Nostr client (Damus, Amethyst, Snort, Primal…) can search your npub and see it.\n\nThis is the only mission where something *really* happens on a public network. Make it something you're happy to have out there.",
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
]

export const MISSION_COUNT = MISSIONS.length
