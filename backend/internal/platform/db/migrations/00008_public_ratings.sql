-- +goose Up
-- The public rating (decision D7): one Elo per account, from confirmed matches between
-- accounts only (guests and unconfirmed results never count). Rebuilt by the stats worker.
CREATE TABLE public_ratings (
    user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    rating     DOUBLE PRECISION NOT NULL,
    games      INTEGER NOT NULL,
    peak       DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE public_ratings;
