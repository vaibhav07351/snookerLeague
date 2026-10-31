-- +goose Up
-- New community kinds: block (hide someone and stop their follows and challenges), report
-- (flag content for review) and device (a phone's push notification token).
ALTER TABLE community_docs DROP CONSTRAINT community_docs_kind_check;
ALTER TABLE community_docs ADD CONSTRAINT community_docs_kind_check CHECK (kind IN (
    'user', 'profile', 'directory', 'looking', 'follow', 'challenge', 'block', 'report', 'device'));

-- +goose Down
DELETE FROM community_docs WHERE kind IN ('block', 'report', 'device');
ALTER TABLE community_docs DROP CONSTRAINT community_docs_kind_check;
ALTER TABLE community_docs ADD CONSTRAINT community_docs_kind_check CHECK (kind IN (
    'user', 'profile', 'directory', 'looking', 'follow', 'challenge'));
