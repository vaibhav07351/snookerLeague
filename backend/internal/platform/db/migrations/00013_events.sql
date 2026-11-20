-- +goose Up
-- Product events (match_scored, share_tapped, claim_opened, claim_done) for counting how the
-- app is used. Ids and small labels only, never names or messages. A row with a dedupe_key is
-- recorded once (for example one match_scored per game, however often it is edited later).
CREATE TABLE events (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    user_id    TEXT,
    league_id  TEXT,
    ref        TEXT,
    props      JSONB NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_name_created ON events (name, created_at);
CREATE INDEX events_user ON events (user_id) WHERE user_id IS NOT NULL;

-- +goose Down
DROP TABLE events;
