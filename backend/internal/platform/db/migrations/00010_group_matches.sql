-- +goose Up
-- Free-for-all matches (3 to 8 players, each for themselves) are synced league documents.
ALTER TABLE docs DROP CONSTRAINT docs_entity_check;
ALTER TABLE docs ADD CONSTRAINT docs_entity_check
    CHECK (entity IN ('league', 'player', 'match', 'race', 'event', 'tournament', 'group_match'));

-- +goose Down
DELETE FROM docs WHERE entity = 'group_match';
ALTER TABLE docs DROP CONSTRAINT docs_entity_check;
ALTER TABLE docs ADD CONSTRAINT docs_entity_check
    CHECK (entity IN ('league', 'player', 'match', 'race', 'event', 'tournament'));
