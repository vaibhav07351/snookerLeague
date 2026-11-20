package events

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PGStore keeps events in PostgreSQL.
type PGStore struct{ pool *pgxpool.Pool }

// NewPGStore builds the events store.
func NewPGStore(pool *pgxpool.Pool) *PGStore { return &PGStore{pool: pool} }

// Insert saves one event; an event whose dedupe key is already stored is skipped.
func (s *PGStore) Insert(ctx context.Context, e Event) error {
	props := e.Props
	if props == nil {
		props = map[string]string{}
	}
	body, err := json.Marshal(props)
	if err != nil {
		return fmt.Errorf("encode event props: %w", err)
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO events (name, user_id, league_id, ref, props, dedupe_key)
		 VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), $5, NULLIF($6, ''))
		 ON CONFLICT (dedupe_key) DO NOTHING`,
		e.Name, e.UserID, e.LeagueID, e.Ref, body, e.DedupeKey); err != nil {
		return fmt.Errorf("insert event: %w", err)
	}
	return nil
}

// ForgetUser removes the user id from that user's events.
func (s *PGStore) ForgetUser(ctx context.Context, userID string) error {
	if _, err := s.pool.Exec(ctx, `UPDATE events SET user_id = NULL WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("unlink events: %w", err)
	}
	return nil
}
