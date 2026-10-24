-- +goose Up
-- Every change gets the next number from this sequence, so phones can ask "what changed
-- since version N?". Writes are serialized by an advisory lock (see sync pgrepo), so
-- versions become visible in order and a pull can never skip a slow transaction.
CREATE SEQUENCE change_version_seq;

-- Who belongs to which league, and in what role. This is the permission source of truth.
-- City hubs have no owner (nobody can delete or rename them).
CREATE TABLE league_members (
    league_id TEXT NOT NULL,
    user_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role      TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (league_id, user_id)
);
CREATE INDEX league_members_user_idx ON league_members (user_id);

-- One row per synced document (league, player, match, race, event). The document body is
-- JSONB exactly as the app sends it; typed tables for stats and rankings are derived from it
-- later. Deletes are tombstones (deleted = true, data = NULL) so phones can learn about them.
CREATE TABLE docs (
    entity     TEXT NOT NULL CHECK (entity IN ('league', 'player', 'match', 'race', 'event')),
    id         TEXT NOT NULL,
    league_id  TEXT NOT NULL,
    version    BIGINT NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT false,
    data       JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, id)
);
CREATE INDEX docs_league_version_idx ON docs (league_id, version);
CREATE INDEX docs_version_idx ON docs (version);

-- Remembers every applied push operation so a retry after a timeout is applied only once.
CREATE TABLE applied_ops (
    user_id    TEXT NOT NULL,
    op_id      TEXT NOT NULL,
    result     JSONB NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, op_id)
);
CREATE INDEX applied_ops_applied_at_idx ON applied_ops (applied_at);

-- +goose Down
DROP TABLE applied_ops;
DROP TABLE docs;
DROP TABLE league_members;
DROP SEQUENCE change_version_seq;
