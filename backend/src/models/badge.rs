use serde::{Deserialize, Serialize};

use crate::models::mission::{Mission, Tree};

/// One per skill tree (8 total). Derived from `mission_completions` on
/// demand — there's no badge table, so a learner's badges always match
/// their completions exactly (no drift, no migration when tree membership
/// shifts).
///
/// `earned_at` is the *latest* completion timestamp in the tree — i.e. the
/// moment the badge unlocked, not the first mission of the tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Badge {
    pub tree: Tree,
    pub completed: u8,
    pub required: u8,
    pub earned: bool,
    pub earned_at: Option<i64>,
}

/// Display order for the 8 tree badges. The mission membership of each
/// tree lives in `Tree::from_mission` (single source of truth) — we just
/// iterate `0..=Mission::LAST` and group by that.
const TREE_ORDER: &[Tree] = &[
    Tree::Money,
    Tree::Bitcoin,
    Tree::Lightning,
    Tree::Nostr,
    Tree::Ecash,
    Tree::SelfCustody,
    Tree::Privacy,
    Tree::Sovereignty,
];

impl Badge {
    /// Build the full 8-badge list from a participant's (mission, completed_at)
    /// rows. Always returns exactly 8 entries in tree order.
    pub fn all_for(completions: &[(u8, i64)]) -> Vec<Badge> {
        TREE_ORDER
            .iter()
            .map(|&tree| {
                let mission_ids: Vec<u8> = (Mission::FIRST..=Mission::LAST)
                    .filter(|n| Tree::from_mission(*n) == tree)
                    .collect();
                let required = mission_ids.len() as u8;
                let in_tree: Vec<i64> = completions
                    .iter()
                    .filter(|(m, _)| mission_ids.contains(m))
                    .map(|(_, t)| *t)
                    .collect();
                let completed = in_tree.len() as u8;
                let earned = required > 0 && completed >= required;
                Badge {
                    tree,
                    completed,
                    required,
                    earned,
                    earned_at: if earned { in_tree.into_iter().max() } else { None },
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_completions_yields_eight_unearned_badges() {
        let badges = Badge::all_for(&[]);
        assert_eq!(badges.len(), 8);
        assert!(badges.iter().all(|b| !b.earned && b.completed == 0));
    }

    #[test]
    fn full_money_tree_earns_only_money() {
        // Derive from Tree::Money.missions() so this test survives tree growth.
        let completions: Vec<(u8, i64)> = Tree::Money
            .missions()
            .iter()
            .enumerate()
            .map(|(i, &m)| (m, 100 + i as i64))
            .collect();
        let expected_last = completions.last().unwrap().1;
        let badges = Badge::all_for(&completions);
        let money = badges.iter().find(|b| b.tree == Tree::Money).unwrap();
        assert!(money.earned);
        assert_eq!(money.earned_at, Some(expected_last));
        for b in badges.iter().filter(|b| b.tree != Tree::Money) {
            assert!(!b.earned, "expected {:?} not earned", b.tree);
        }
    }

    #[test]
    fn partial_tree_reports_progress_but_not_earned() {
        let completions = vec![(0u8, 1_i64), (1, 2), (2, 3)];
        let badges = Badge::all_for(&completions);
        let money = badges.iter().find(|b| b.tree == Tree::Money).unwrap();
        assert_eq!(money.completed, 3);
        assert!(money.required >= 3);
        assert!(!money.earned);
        assert!(money.earned_at.is_none());
    }

    #[test]
    fn privacy_tree_unlocks_after_all_missions_completed() {
        // Privacy is earned only once every mission in the tree is done.
        let mut badges = Badge::all_for(&[(46u8, 42)]);
        let privacy = badges.iter().find(|b| b.tree == Tree::Privacy).unwrap();
        assert!(!privacy.earned, "1 mission is not enough");
        assert_eq!(privacy.completed, 1);

        let all: Vec<(u8, i64)> = Tree::Privacy
            .missions()
            .iter()
            .enumerate()
            .map(|(i, &m)| (m, 100 + i as i64))
            .collect();
        let expected_last = all.last().unwrap().1;
        badges = Badge::all_for(&all);
        let privacy = badges.iter().find(|b| b.tree == Tree::Privacy).unwrap();
        assert!(privacy.earned);
        assert_eq!(privacy.completed as usize, Tree::Privacy.missions().len());
        assert_eq!(privacy.earned_at, Some(expected_last));
    }
}
