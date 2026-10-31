-- +goose Up
-- Leagues whose numbers need recomputing. A write to a match, race or player card adds the
-- league here in the same transaction; the stats worker takes rows off and recomputes.
CREATE TABLE stats_dirty (
    league_id TEXT PRIMARY KEY,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The server's own numbers per league player, rebuilt from the match and race documents.
-- These are what public pages and the city ranking trust; phones compute the same numbers
-- locally for display.
CREATE TABLE league_standings (
    league_id  TEXT NOT NULL,
    player_id  TEXT NOT NULL,
    standard   JSONB NOT NULL,
    race       JSONB NOT NULL,
    rating     JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (league_id, player_id)
);

-- +goose Down
DROP TABLE league_standings;
DROP TABLE stats_dirty;
