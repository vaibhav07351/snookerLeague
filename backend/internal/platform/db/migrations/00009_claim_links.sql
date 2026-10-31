-- +goose Up
-- Claim links: a league member sends a guest a link to take over their guest card (with its
-- match history) and join the league. Only a hash of the token is stored; links are single
-- use and expire after 7 days.
CREATE TABLE claim_links (
    token_hash TEXT PRIMARY KEY,
    player_id  TEXT NOT NULL,
    league_id  TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);
CREATE INDEX claim_links_player_idx ON claim_links (player_id);

-- +goose Down
DROP TABLE claim_links;
