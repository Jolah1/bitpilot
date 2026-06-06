use serde::{Deserialize, Serialize};

use crate::models::mission::Tier;

/// One per tier (5 total). Derived from `mission_completions` on demand —
/// there's no badge table, so a learner's badges always match their
/// completions exactly (no drift, no migration when ranges shift).
///
/// `earned_at` is the *latest* completion timestamp in the tier — i.e. the
/// moment the badge unlocked, not the first mission of the tier.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Badge {
    pub tier: Tier,
    pub completed: u8,
    pub required: u8,
    pub earned: bool,
    pub earned_at: Option<i64>,
}

/// The fixed 5-tier band layout. Must match `Tier::from_mission` ranges in
/// `mission.rs`. If you re-band missions, change both places.
const BANDS: &[(Tier, u8, u8)] = &[
    (Tier::Novice, 0, 10),
    (Tier::Apprentice, 11, 20),
    (Tier::Pilot, 21, 30),
    (Tier::Navigator, 31, 40),
    (Tier::Captain, 41, 50),
];

impl Badge {
    /// Build the full 5-badge list from a participant's (mission, completed_at)
    /// rows. Always returns exactly 5 entries in tier order (Novice → Captain).
    pub fn all_for(completions: &[(u8, i64)]) -> Vec<Badge> {
        BANDS
            .iter()
            .map(|(tier, lo, hi)| {
                let in_band: Vec<i64> = completions
                    .iter()
                    .filter(|(m, _)| m >= lo && m <= hi)
                    .map(|(_, t)| *t)
                    .collect();
                let required = hi - lo + 1;
                let completed = in_band.len() as u8;
                let earned = completed >= required;
                Badge {
                    tier: *tier,
                    completed,
                    required,
                    earned,
                    earned_at: if earned { in_band.into_iter().max() } else { None },
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_completions_yields_five_unearned_badges() {
        let badges = Badge::all_for(&[]);
        assert_eq!(badges.len(), 5);
        assert!(badges.iter().all(|b| !b.earned && b.completed == 0));
    }

    #[test]
    fn full_novice_tier_earns_only_novice() {
        let completions: Vec<(u8, i64)> = (0..=10).map(|m| (m, 100 + m as i64)).collect();
        let badges = Badge::all_for(&completions);
        assert!(badges[0].earned);
        assert_eq!(badges[0].earned_at, Some(110));
        for b in &badges[1..] {
            assert!(!b.earned);
        }
    }

    #[test]
    fn partial_tier_reports_progress_but_not_earned() {
        let completions = vec![(0u8, 1_i64), (1, 2), (2, 3)];
        let badges = Badge::all_for(&completions);
        assert_eq!(badges[0].completed, 3);
        assert_eq!(badges[0].required, 11);
        assert!(!badges[0].earned);
        assert!(badges[0].earned_at.is_none());
    }
}
