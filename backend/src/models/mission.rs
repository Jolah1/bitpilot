use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MissionStatus {
    Locked,
    Active,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mission {
    pub number: u8,
    pub title: String,
    pub description: String,
    /// One of: "bitcoin" | "lightning" | "nostr" | "ecash"
    pub tech: String,
    pub reward_sats: u64,
    pub status: MissionStatus,
    /// True if the underlying service is a simulation (no real network call).
    /// The frontend uses this to render a clear "Simulated — demo mode" badge.
    pub simulated: bool,
}

impl Mission {
    pub fn all() -> Vec<Mission> {
        vec![
            Mission {
                number: 1,
                title: "What is Bitcoin?".into(),
                description: "Learn what Bitcoin actually is — digital money no government, bank, or company controls. Then claim your first sats.".into(),
                tech: "bitcoin".into(),
                reward_sats: 21,
                status: MissionStatus::Active,
                simulated: false, // pure-knowledge mission, no network call
            },
            Mission {
                number: 2,
                title: "Sats, the unit of account".into(),
                description: "1 bitcoin = 100,000,000 satoshis. Learn to think in sats and you'll never worry about Bitcoin's price again.".into(),
                tech: "bitcoin".into(),
                reward_sats: 21,
                status: MissionStatus::Locked,
                simulated: false,
            },
            Mission {
                number: 3,
                title: "Your Nostr identity".into(),
                description: "Generate a real Nostr keypair. No email, no phone — just math you own. This identity works on every Nostr app in the world.".into(),
                tech: "nostr".into(),
                reward_sats: 50,
                status: MissionStatus::Locked,
                simulated: false, // real keypair, real bech32
            },
            Mission {
                number: 4,
                title: "Public vs private key".into(),
                description: "Quiz yourself: which key do you share, which key do you guard with your life? Get it right or your identity is gone.".into(),
                tech: "nostr".into(),
                reward_sats: 21,
                status: MissionStatus::Locked,
                simulated: false,
            },
            Mission {
                number: 5,
                title: "Lightning: receive sats".into(),
                description: "Create a Lightning invoice. Lightning is Bitcoin's fast lane: payments settle in under a second, anywhere on earth.".into(),
                tech: "lightning".into(),
                reward_sats: 50,
                status: MissionStatus::Locked,
                simulated: true,
            },
            Mission {
                number: 6,
                title: "Lightning: send sats".into(),
                description: "Send 50 sats to a Lightning address. As easy as sending an email — and the recipient gets it in milliseconds.".into(),
                tech: "lightning".into(),
                reward_sats: 50,
                status: MissionStatus::Locked,
                simulated: true,
            },
            Mission {
                number: 7,
                title: "Fees and the mempool".into(),
                description: "Why are some payments free on Lightning but cost a fee on-chain? Understand the trade-off between speed, cost, and final settlement.".into(),
                tech: "bitcoin".into(),
                reward_sats: 21,
                status: MissionStatus::Locked,
                simulated: false,
            },
            Mission {
                number: 8,
                title: "eCash: claim a private token".into(),
                description: "Receive a Cashu token — bearer money that even the issuer can't trace. The mint sees the deposit but not what you spend.".into(),
                tech: "ecash".into(),
                reward_sats: 50,
                status: MissionStatus::Locked,
                simulated: true,
            },
            Mission {
                number: 9,
                title: "eCash: spend a token".into(),
                description: "Hand off your token to someone else. Whoever holds the string holds the value — like passing a banknote, but digital.".into(),
                tech: "ecash".into(),
                reward_sats: 50,
                status: MissionStatus::Locked,
                simulated: true,
            },
            Mission {
                number: 10,
                title: "Tell the world on Nostr".into(),
                description: "Sign and publish a real Nostr note to public relays. Censorship-resistant, permanent, and signed only by you.".into(),
                tech: "nostr".into(),
                reward_sats: 66,
                status: MissionStatus::Locked,
                simulated: false, // real signed event to real relays
            },
        ]
    }

    pub fn count() -> u8 {
        Self::all().len() as u8
    }

    pub fn reward(number: u8) -> u64 {
        Self::all()
            .into_iter()
            .find(|m| m.number == number)
            .map(|m| m.reward_sats)
            .unwrap_or(0)
    }
}
