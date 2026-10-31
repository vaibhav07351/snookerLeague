package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// writeLockKey is an arbitrary constant naming the advisory lock that serializes writers.
const writeLockKey int64 = 7_411_000_001

// PGStore is the PostgreSQL implementation of Store.
type PGStore struct{ pool *pgxpool.Pool }

// NewPGStore builds the Postgres store.
func NewPGStore(pool *pgxpool.Pool) *PGStore { return &PGStore{pool: pool} }

// InTx runs fn in a transaction and commits only if it returns nil.
func (s *PGStore) InTx(ctx context.Context, fn func(Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful commit
	if err := fn(&pgTx{tx: tx}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// Pull returns changed documents for the user's leagues, oldest version first.
func (s *PGStore) Pull(ctx context.Context, userID string, since int64, limit int) ([]Doc, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT d.entity, d.id, d.league_id, d.version, d.deleted, d.data, d.updated_at
		   FROM docs d
		   JOIN league_members m ON m.league_id = d.league_id AND m.user_id = $1
		  WHERE d.version > $2
		  ORDER BY d.version
		  LIMIT $3`, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("query docs: %w", err)
	}
	return scanDocs(rows)
}

// PullLeague returns one league's changed documents, oldest version first, for a member.
func (s *PGStore) PullLeague(ctx context.Context, userID, leagueID string, since int64, limit int) ([]Doc, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT d.entity, d.id, d.league_id, d.version, d.deleted, d.data, d.updated_at
		   FROM docs d
		   JOIN league_members m ON m.league_id = d.league_id AND m.user_id = $1
		  WHERE d.league_id = $2 AND d.version > $3
		  ORDER BY d.version
		  LIMIT $4`, userID, leagueID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("query league docs: %w", err)
	}
	return scanDocs(rows)
}

func scanDocs(rows pgx.Rows) ([]Doc, error) {
	defer rows.Close()
	docs := []Doc{}
	for rows.Next() {
		var d Doc
		var data []byte
		if err := rows.Scan(&d.Entity, &d.ID, &d.LeagueID, &d.Version, &d.Deleted, &data, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan doc: %w", err)
		}
		d.Data = data
		docs = append(docs, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read docs: %w", err)
	}
	return docs, nil
}

type pgTx struct{ tx pgx.Tx }

func (t *pgTx) LockWrites(ctx context.Context) error {
	if _, err := t.tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", writeLockKey); err != nil {
		return fmt.Errorf("lock writes: %w", err)
	}
	return nil
}

func (t *pgTx) Get(ctx context.Context, entity Entity, id string) (Doc, error) {
	var d Doc
	var data []byte
	err := t.tx.QueryRow(ctx,
		`SELECT entity, id, league_id, version, deleted, data, updated_at
		   FROM docs WHERE entity = $1 AND id = $2`, string(entity), id).
		Scan(&d.Entity, &d.ID, &d.LeagueID, &d.Version, &d.Deleted, &data, &d.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Doc{}, ErrNotFound
	}
	if err != nil {
		return Doc{}, fmt.Errorf("get doc: %w", err)
	}
	d.Data = data
	return d, nil
}

func (t *pgTx) Put(ctx context.Context, d Doc) (Doc, error) {
	var data any
	if !d.Deleted {
		data = []byte(d.Data)
	}
	err := t.tx.QueryRow(ctx,
		`INSERT INTO docs (entity, id, league_id, version, deleted, data, updated_at)
		 VALUES ($1, $2, $3, nextval('change_version_seq'), $4, $5, now())
		 ON CONFLICT (entity, id) DO UPDATE
		    SET version = EXCLUDED.version, deleted = EXCLUDED.deleted,
		        data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
		 RETURNING version, updated_at`,
		string(d.Entity), d.ID, d.LeagueID, d.Deleted, data).
		Scan(&d.Version, &d.UpdatedAt)
	if err != nil {
		return Doc{}, fmt.Errorf("put doc: %w", err)
	}
	return d, nil
}

func (t *pgTx) Role(ctx context.Context, leagueID, userID string) (Role, error) {
	var role string
	err := t.tx.QueryRow(ctx,
		"SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2", leagueID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return RoleNone, nil
	}
	if err != nil {
		return RoleNone, fmt.Errorf("get role: %w", err)
	}
	return Role(role), nil
}

func (t *pgTx) AddMember(ctx context.Context, leagueID, userID string, role Role) error {
	_, err := t.tx.Exec(ctx,
		`INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (league_id, user_id) DO NOTHING`, leagueID, userID, string(role))
	if err != nil {
		return fmt.Errorf("add member: %w", err)
	}
	return nil
}

func (t *pgTx) AppliedResult(ctx context.Context, userID, opID string) (OpResult, error) {
	var raw []byte
	err := t.tx.QueryRow(ctx,
		"SELECT result FROM applied_ops WHERE user_id = $1 AND op_id = $2", userID, opID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return OpResult{}, ErrNotFound
	}
	if err != nil {
		return OpResult{}, fmt.Errorf("get applied op: %w", err)
	}
	var r OpResult
	if err := json.Unmarshal(raw, &r); err != nil {
		return OpResult{}, fmt.Errorf("decode applied op: %w", err)
	}
	return r, nil
}

func (t *pgTx) SaveResult(ctx context.Context, opID, userID string, r OpResult) error {
	raw, err := json.Marshal(r)
	if err != nil {
		return fmt.Errorf("encode result: %w", err)
	}
	if _, err := t.tx.Exec(ctx,
		"INSERT INTO applied_ops (user_id, op_id, result) VALUES ($1, $2, $3) ON CONFLICT (user_id, op_id) DO NOTHING",
		userID, opID, raw); err != nil {
		return fmt.Errorf("save applied op: %w", err)
	}
	return nil
}

func (t *pgTx) RemoveMember(ctx context.Context, leagueID, userID string) error {
	if _, err := t.tx.Exec(ctx,
		"DELETE FROM league_members WHERE league_id = $1 AND user_id = $2", leagueID, userID); err != nil {
		return fmt.Errorf("remove member: %w", err)
	}
	return nil
}

func (t *pgTx) Members(ctx context.Context, leagueID string) ([]string, error) {
	rows, err := t.tx.Query(ctx,
		"SELECT user_id FROM league_members WHERE league_id = $1 ORDER BY joined_at, user_id", leagueID)
	if err != nil {
		return nil, fmt.Errorf("query members: %w", err)
	}
	defer rows.Close()
	members := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read members: %w", err)
	}
	return members, nil
}

func (t *pgTx) FindLeagueByInviteCode(ctx context.Context, code string) (Doc, error) {
	var d Doc
	var data []byte
	err := t.tx.QueryRow(ctx,
		`SELECT entity, id, league_id, version, deleted, data, updated_at
		   FROM docs
		  WHERE entity = 'league' AND NOT deleted AND data ->> 'inviteCode' = $1
		  LIMIT 1`, code).
		Scan(&d.Entity, &d.ID, &d.LeagueID, &d.Version, &d.Deleted, &data, &d.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Doc{}, ErrNotFound
	}
	if err != nil {
		return Doc{}, fmt.Errorf("find league by invite: %w", err)
	}
	d.Data = data
	return d, nil
}
