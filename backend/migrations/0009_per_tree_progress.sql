-- Per-tree progress pointer.
--
-- Before this migration, a participant had a single `current_mission`
-- integer — a global pointer into a flat 0..58 curriculum. The
-- "open-from-start" redesign (8 skill trees, peers not stages) replaces
-- that with a per-tree pointer: "next incomplete mission within tree X".
--
-- We store one JSON object per participant: `{"money": 5, "bitcoin": 18,
-- "privacy": null, ...}`. `null` means "all missions in this tree are
-- done" (badge earned). Missing keys are derived on read from
-- `mission_completions`, so existing rows (which arrive at this migration
-- with the default '{}') need no backfill.
--
-- We deliberately keep `current_mission` for one release cycle as a
-- backwards-compat fallback for any client that might still be reading
-- it. Routes get rewired in a follow-up migration / patch.

ALTER TABLE participants ADD COLUMN current_per_tree TEXT NOT NULL DEFAULT '{}';
