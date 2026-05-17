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
    pub tech: String,
    pub reward_sats: u64,
    pub status: MissionStatus,
}

impl Mission {
    pub fn all() -> Vec<Mission> {
        vec![
            Mission {
                number: 1,
                title: "Who are you?".into(),
                description: "Generate your Nostr keypair — your identity on the decentralized web. No phone number, no email, no government ID.".into(),
                tech: "nostr".into(),
                reward_sats: 100,
                status: MissionStatus::Active,
            },
            Mission {
                number: 2,
                title: "Get your first sats".into(),
                description: "Create a Lightning invoice and receive 100 sats. Instant, permissionless money.".into(),
                tech: "lightning".into(),
                reward_sats: 100,
                status: MissionStatus::Locked,
            },
            Mission {
                number: 3,
                title: "Send it forward".into(),
                description: "Send 50 sats to a peer. Feel what borderless money means.".into(),
                tech: "lightning".into(),
                reward_sats: 75,
                status: MissionStatus::Locked,
            },
            Mission {
                number: 4,
                title: "Go private with eCash".into(),
                description: "Receive a Cashu token — private, bearer money. No trace on-chain.".into(),
                tech: "ecash".into(),
                reward_sats: 75,
                status: MissionStatus::Locked,
            },
            Mission {
                number: 5,
                title: "Tell the world".into(),
                description: "Post your first Nostr note. Decentralized, censorship-resistant, forever.".into(),
                tech: "nostr".into(),
                reward_sats: 50,
                status: MissionStatus::Locked,
            },
        ]
    }

    pub fn reward(number: u8) -> u64 {
        Self::all()
            .into_iter()
            .find(|m| m.number == number)
            .map(|m| m.reward_sats)
            .unwrap_or(0)
    }
}