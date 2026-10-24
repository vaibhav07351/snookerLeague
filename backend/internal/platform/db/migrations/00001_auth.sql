-- +goose Up
-- Ids are TEXT: migrated users keep their old Firebase uid, new ones get "u_<hex>".
CREATE TABLE users (
    id           TEXT PRIMARY KEY,
    google_sub   TEXT NOT NULL UNIQUE,
    email        TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    photo_url    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per signed-in device. Only hashes of refresh secrets are stored.
CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    current_hash TEXT NOT NULL,
    prev_hash    TEXT NOT NULL DEFAULT '',
    rotated_at   TIMESTAMPTZ NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked      BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- +goose Down
DROP TABLE sessions;
DROP TABLE users;
