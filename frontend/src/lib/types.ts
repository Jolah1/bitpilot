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

export type MissionPhase = 'learn' | 'quiz' | 'do'

export type Tech = 'nostr' | 'lightning' | 'ecash' | 'bitcoin'

export interface LearnBlock {
    label: string
    text: string
}

export interface Quiz {
    q: string
    opts: string[]
    correct: number
    explain: string
}

export interface Mission {
    id: number
    tag: string
    title: string
    tech: Tech
    reward: number
    desc: string
    learn: LearnBlock[]
    quiz: Quiz
    doSteps: string[]
    actionLabel: string
}

export const MISSIONS: Mission[] = [
    {
        id: 1,
        tag: 'NOSTR IDENTITY',
        title: 'Who are you?',
        tech: 'nostr',
        reward: 100,
        desc: "In Bitcoin's world, you own your identity. No username, no email — just a cryptographic keypair that proves who you are.",
        learn: [
            {
                label: 'What is a keypair?',
                text: 'A keypair is two mathematically linked keys: a <strong>public key (npub)</strong> you share with everyone — like your username — and a <strong>secret key (nsec)</strong> you NEVER share. Anyone can verify your identity with your npub. Only you can prove you own it with your nsec.',
            },
            {
                label: 'Why Nostr?',
                text: "Nostr is a decentralized protocol where your identity lives on math, not on a company's server. Twitter can ban you. Nostr cannot. Your identity is permanent and portable — it works on every Nostr app.",
            },
        ],
        quiz: {
            q: 'What happens if someone gets your nsec (secret key)?',
            opts: [
                "Nothing, it's just for decoration",
                'They can impersonate you and control your identity completely',
                'You can reset it in settings',
                'It becomes a public key',
            ],
            correct: 1,
            explain: 'Your nsec IS you. Anyone with it can post as you, sign transactions, and take over your identity. Guard it like your house keys.',
        },
        doSteps: [
            'Click "Generate my identity" below',
            'Your npub (public key) will appear — this is your Nostr username',
            'Your nsec (secret key) will appear — write it down somewhere safe',
            'Never paste your nsec into any website or app you do not trust',
        ],
        actionLabel: 'Generate my identity',
    },
    {
        id: 2,
        tag: 'LIGHTNING NETWORK',
        title: 'Get your first sats',
        tech: 'lightning',
        reward: 100,
        desc: 'The Lightning Network lets you send Bitcoin instantly, anywhere in the world, for fractions of a cent. No bank, no waiting, no permission needed.',
        learn: [
            {
                label: 'What are sats?',
                text: '1 Bitcoin = 100,000,000 satoshis (sats). A sat is the smallest unit of Bitcoin. When you buy a coffee in a Bitcoin-native economy, you pay in sats — not full Bitcoins. <strong>100 sats ≈ $0.10</strong> at current prices.',
            },
            {
                label: 'What is a Lightning invoice?',
                text: 'A Lightning invoice is a payment request — like a QR code that says "send me exactly X sats." It expires after a set time. When paid, the money arrives in <strong>under 1 second</strong>, anywhere on earth.',
            },
        ],
        quiz: {
            q: 'What is the relationship between Bitcoin and satoshis?',
            opts: [
                '1 sat = 1 Bitcoin',
                '1 Bitcoin = 1,000 sats',
                '1 Bitcoin = 100,000,000 sats',
                'They are different currencies',
            ],
            correct: 2,
            explain: 'There are 100 million satoshis in one Bitcoin. This is why Lightning is great for small payments — you send 500 sats (a tiny fraction of 1 BTC) instantly.',
        },
        doSteps: [
            'Click "Generate invoice" to create a Lightning payment request',
            'A BOLT11 invoice string will be generated',
            'Share it with your facilitator or scan with a Lightning wallet',
            'The payment arrives instantly — no confirmation waiting',
        ],
        actionLabel: 'Generate invoice',
    },
    {
        id: 3,
        tag: 'LIGHTNING PAYMENT',
        title: 'Send it forward',
        tech: 'lightning',
        reward: 75,
        desc: 'Sending Bitcoin over Lightning is as easy as a text message. No bank account needed. No ID required. Just a Lightning address.',
        learn: [
            {
                label: 'Lightning addresses',
                text: 'A Lightning address looks like an email: <strong>name@domain.com</strong>. Behind the scenes it generates a fresh invoice automatically. You can get one from apps like Wallet of Satoshi, Alby, or Zeus.',
            },
            {
                label: 'Self-custody vs custodial',
                text: 'A <strong>custodial wallet</strong> is like a bank — someone else holds your sats. A <strong>self-custody wallet</strong> means only YOU hold the keys. "Not your keys, not your coins" is the Bitcoin mantra.',
            },
        ],
        quiz: {
            q: 'What does "not your keys, not your coins" mean?',
            opts: [
                'You need physical keys to access Bitcoin',
                'If someone else controls your private keys, they control your Bitcoin',
                'Bitcoin comes with a physical key',
                'Keys are optional for Bitcoin',
            ],
            correct: 1,
            explain: 'If a company like an exchange holds your Bitcoin and shuts down or gets hacked, you lose everything. Self-custody means no one can take your coins — ever.',
        },
        doSteps: [
            'Enter a Lightning address (ask your facilitator for one)',
            'Enter the amount: 50 sats',
            'Confirm and send',
            'Watch how fast it arrives — this is the future of money',
        ],
        actionLabel: 'Send 50 sats',
    },
    {
        id: 4,
        tag: 'ECASH · CASHU',
        title: 'Go private',
        tech: 'ecash',
        reward: 75,
        desc: 'eCash combines Bitcoin value with cash-like privacy. No one can trace who sent what — not even the mint.',
        learn: [
            {
                label: 'What is Cashu eCash?',
                text: 'Cashu is a protocol that lets a mint issue <strong>bearer tokens</strong> backed by Bitcoin. Like physical cash — whoever holds the token owns the value. The mint uses blind signatures so it cannot link tokens to users.',
            },
            {
                label: 'Why does privacy matter?',
                text: 'When you pay with a credit card, your bank knows every purchase. On-chain Bitcoin is public — anyone can see your transaction history. eCash is <strong>private by default</strong>. The mint knows you deposited sats, but not what you spent them on.',
            },
        ],
        quiz: {
            q: 'What makes eCash private?',
            opts: [
                'It uses a secret password',
                'Blind signatures mean the mint cannot link tokens to users',
                'Transactions are deleted after 24 hours',
                'Only the government can see transactions',
            ],
            correct: 1,
            explain: "Blind signatures are a cryptographic technique where you ask the mint to sign something without it seeing what it's signing. This breaks the link between you and the token.",
        },
        doSteps: [
            'Your facilitator will send you a Cashu token (a long string starting with "cashu")',
            'Paste the token in the field below',
            'The backend will verify and redeem it',
            'Your sats balance updates — privately',
        ],
        actionLabel: 'Receive eCash token',
    },
    {
        id: 5,
        tag: 'NOSTR SOCIAL',
        title: 'Tell the world',
        tech: 'nostr',
        reward: 50,
        desc: 'Your first post on the censorship-resistant internet. No algorithm, no moderation, no takedowns. Just your words on a global protocol.',
        learn: [
            {
                label: 'How Nostr posts work',
                text: 'A Nostr note is a JSON object signed with your <strong>private key (nsec)</strong>. It gets broadcast to multiple relays — servers that store and forward notes. Even if one relay removes it, others keep it alive.',
            },
            {
                label: 'Your digital sovereignty',
                text: 'Every note you post is cryptographically signed by YOU. No company can delete your post and claim they did not. No algorithm decides who sees your words. Nostr gives you back your digital voice.',
            },
        ],
        quiz: {
            q: "Why can't Nostr posts be censored?",
            opts: [
                'They use military encryption',
                'Notes are stored on many relays worldwide — removing one does not delete others',
                'Nostr is owned by a powerful company',
                'Posts automatically delete after 30 days',
            ],
            correct: 1,
            explain: "Nostr's decentralization is its censorship-resistance. Your note lives on dozens of relays. Removing it from one changes nothing — it's still everywhere else.",
        },
        doSteps: [
            'Write your first Nostr note in the field below',
            'Something like: "Just completed SatQuest! Learning Bitcoin in Lagos ⚡"',
            'Click "Publish" to broadcast it to Nostr relays',
            'Your note will be live on every Nostr client instantly',
        ],
        actionLabel: 'Publish to Nostr',
    },
]
