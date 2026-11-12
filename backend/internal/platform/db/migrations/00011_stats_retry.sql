-- +goose Up
-- The stats worker no longer removes a league from the queue before recomputing it: the row
-- stays until the recompute succeeds, so a crash or deploy mid-pass loses nothing. A league
-- that fails waits before its next try (retry_at) instead of being retried in a tight loop.
ALTER TABLE stats_dirty
    ADD COLUMN attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN retry_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE stats_dirty
    DROP COLUMN retry_at,
    DROP COLUMN attempts;
