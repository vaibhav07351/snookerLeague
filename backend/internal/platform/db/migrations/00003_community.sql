-- +goose Up
-- Invite codes live inside the league document. This index makes "which league has code X?"
-- a point lookup instead of a scan.
CREATE INDEX docs_league_invite_idx ON docs ((data ->> 'inviteCode'))
    WHERE entity = 'league' AND NOT deleted;

-- Documents that do not belong to one league: the user's private settings, public player
-- profiles, directory listings, "looking for a game" posts, follows and challenges.
-- They are read by live queries (city boards, inboxes), not synced, so deletes are real.
-- owner_id is who controls the row (author, follower, challenger); subject_id is who it is
-- about (followed player, challenged player). city_id, sub_kind and sort_value are copied
-- out of the JSON so the list queries are plain indexed reads.
CREATE TABLE community_docs (
    kind       TEXT NOT NULL CHECK (kind IN ('user', 'profile', 'directory', 'looking', 'follow', 'challenge')),
    id         TEXT NOT NULL,
    owner_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL DEFAULT '',
    city_id    TEXT NOT NULL DEFAULT '',
    sub_kind   TEXT NOT NULL DEFAULT '',
    sort_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    data       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, id)
);
CREATE INDEX community_city_idx ON community_docs (kind, city_id, sub_kind, sort_value DESC, id DESC);
CREATE INDEX community_owner_idx ON community_docs (kind, owner_id, sort_value DESC, id DESC);
CREATE INDEX community_subject_idx ON community_docs (kind, subject_id, sort_value DESC, id DESC);

-- +goose Down
DROP TABLE community_docs;
DROP INDEX docs_league_invite_idx;
