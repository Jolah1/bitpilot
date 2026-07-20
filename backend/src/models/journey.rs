use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum JourneyId {
    ReceivePayment,
    SendRemittance,
    SecureSavings,
    PublishIndependently,
    ContributeCode,
}

impl JourneyId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReceivePayment => "receive-payment",
            Self::SendRemittance => "send-remittance",
            Self::SecureSavings => "secure-savings",
            Self::PublishIndependently => "publish-independently",
            Self::ContributeCode => "contribute-code",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "receive-payment" => Some(Self::ReceivePayment),
            "send-remittance" => Some(Self::SendRemittance),
            "secure-savings" => Some(Self::SecureSavings),
            "publish-independently" => Some(Self::PublishIndependently),
            "contribute-code" => Some(Self::ContributeCode),
            _ => None,
        }
    }
    /// Ordered capability route. It may cross topic boundaries and omit
    /// lessons that are unrelated to the learner's practical job.
    pub fn missions(self) -> &'static [u8] {
        match self {
            Self::ReceivePayment => &[21, 22, 80, 23],
            // Custody is taught just before the practical Lightning flow:
            // a cross-tree safety concept that matters to remittance users.
            Self::SendRemittance => &[10, 21, 22, 80, 23, 24],
            Self::SecureSavings => &[3, 4, 11, 12, 93, 20],
            Self::PublishIndependently => &[13, 14, 15, 97, 16, 26],
            Self::ContributeCode => &[100, 101, 102, 103, 104, 105],
        }
    }

    pub fn next_incomplete(self, completed: &[u8]) -> Option<u8> {
        self.missions()
            .iter()
            .find(|mission| !completed.contains(mission))
            .copied()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Guidance {
    Guided,
    SelfDirected,
}

impl Guidance {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Guided => "guided",
            Self::SelfDirected => "self-directed",
        }
    }

    pub fn parse(value: &str) -> Self {
        if value == "self-directed" {
            Self::SelfDirected
        } else {
            Self::Guided
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PracticeMode {
    Simulation,
    TestNetwork,
}

impl PracticeMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Simulation => "simulation",
            Self::TestNetwork => "test-network",
        }
    }

    pub fn parse(value: &str) -> Self {
        if value == "test-network" {
            Self::TestNetwork
        } else {
            Self::Simulation
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn journey_pointer_ignores_unrelated_tree_lessons() {
        let journey = JourneyId::ReceivePayment;
        assert_eq!(journey.next_incomplete(&[21, 22]), Some(80));
        assert_eq!(journey.next_incomplete(&[21, 22, 80, 23]), None);
    }
}
