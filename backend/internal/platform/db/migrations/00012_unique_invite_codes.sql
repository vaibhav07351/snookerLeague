-- +goose Up
-- One invite code leads to one live league. The sync service already refuses a code another
-- league uses; this index makes the database guarantee it too. If two live leagues already
-- share a code, the index is skipped with a notice instead of failing the migration (which
-- would stop the API from starting): the service check still protects every new code.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT data ->> 'inviteCode' FROM docs
         WHERE entity = 'league' AND NOT deleted AND coalesce(data ->> 'inviteCode', '') <> ''
         GROUP BY 1 HAVING count(*) > 1
    ) THEN
        RAISE NOTICE 'duplicate invite codes exist; unique index docs_league_invite_unique not created';
    ELSE
        CREATE UNIQUE INDEX docs_league_invite_unique ON docs ((data ->> 'inviteCode'))
            WHERE entity = 'league' AND NOT deleted AND coalesce(data ->> 'inviteCode', '') <> '';
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP INDEX IF EXISTS docs_league_invite_unique;
