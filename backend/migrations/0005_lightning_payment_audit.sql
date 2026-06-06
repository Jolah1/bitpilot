-- Audit trail for /api/pay.
--
-- Every attempt to pay a Lightning invoice writes a row here BEFORE the
-- request leaves the backend for LNbits. The row's `decision` records
-- whether caps allowed it. `bolt11_hash` is SHA-256 of the invoice
-- string (not the bolt11 itself), to keep the table compact and avoid
-- doubling the size of every invoice we touch.
--
-- The per-participant payout cap (MAX_PARTICIPANT_PAYOUT_SATS) is
-- enforced by summing this table's `amount_sats` for the participant
-- where `decision = 'allowed'`. Rejected attempts don't count against
-- the cap but still leave a row so abuse is visible.
--
-- Why a separate table and not lightning_log? lightning_log only records
-- artifacts the backend successfully created/paid; audit needs the
-- pre-decision view including rejected attempts.

CREATE TABLE IF NOT EXISTS lightning_payment_audit (
    id              TEXT    PRIMARY KEY,
    participant_id  TEXT    NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    bolt11_hash     TEXT    NOT NULL,
    amount_sats     INTEGER NOT NULL,
    -- 'allowed'   — passed caps, request was forwarded to LNbits
    -- 'rejected'  — failed a cap; LNbits was not called
    -- 'simulated' — running in simulated mode, no real sats moved
    decision        TEXT    NOT NULL CHECK (decision IN ('allowed', 'rejected', 'simulated')),
    reason          TEXT,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_participant
    ON lightning_payment_audit(participant_id);

CREATE INDEX IF NOT EXISTS idx_payment_audit_decision_participant
    ON lightning_payment_audit(decision, participant_id);
