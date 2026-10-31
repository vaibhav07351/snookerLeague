-- +goose Up
-- "This is me, remove it" requests from public pages. Anyone can send one without an account
-- (guests have none); the team reviews them (see docs/RUNBOOK.md).
CREATE TABLE removal_requests (
    id         BIGSERIAL PRIMARY KEY,
    target     TEXT NOT NULL,
    message    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at TIMESTAMPTZ
);
CREATE INDEX removal_requests_open_idx ON removal_requests (created_at) WHERE handled_at IS NULL;

-- +goose Down
DROP TABLE removal_requests;
