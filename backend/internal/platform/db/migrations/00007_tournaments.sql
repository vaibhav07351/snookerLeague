-- +goose Up
-- Tournaments are synced league documents like matches and races.
ALTER TABLE docs DROP CONSTRAINT docs_entity_check;
ALTER TABLE docs ADD CONSTRAINT docs_entity_check
    CHECK (entity IN ('league', 'player', 'match', 'race', 'event', 'tournament'));
-- Tournament fixtures are matches tagged with the tournament id.
CREATE INDEX docs_match_tournament_idx ON docs ((data ->> 'tournamentId'))
    WHERE entity = 'match' AND NOT deleted AND data ? 'tournamentId';

-- +goose Down
DROP INDEX docs_match_tournament_idx;
DELETE FROM docs WHERE entity = 'tournament';
ALTER TABLE docs DROP CONSTRAINT docs_entity_check;
ALTER TABLE docs ADD CONSTRAINT docs_entity_check
    CHECK (entity IN ('league', 'player', 'match', 'race', 'event'));
