package stats

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGRepository is the PostgreSQL implementation of Repository.
type PGRepository struct{ pool *pgxpool.Pool }

// NewPGRepository builds the Postgres repository.
func NewPGRepository(pool *pgxpool.Pool) *PGRepository { return &PGRepository{pool: pool} }

// ClaimDirty returns up to limit queued leagues that are due, the longest-waiting first. Rows
// stay on the queue until ClearDirty, so nothing is lost if the worker stops mid-pass.
func (r *PGRepository) ClaimDirty(ctx context.Context, limit int) ([]DirtyLeague, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT league_id, marked_at, attempts FROM stats_dirty
		  WHERE retry_at IS NULL OR retry_at <= now()
		  ORDER BY marked_at LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("claim dirty: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (DirtyLeague, error) {
		var d DirtyLeague
		err := row.Scan(&d.ID, &d.MarkedAt, &d.Attempts)
		return d, err
	})
	if err != nil {
		return nil, fmt.Errorf("read dirty leagues: %w", err)
	}
	return out, nil
}

// ClearDirty takes a recomputed league off the queue. A league marked again since markedAt
// (a write landed during the recompute) stays queued, with its failure count reset.
func (r *PGRepository) ClearDirty(ctx context.Context, leagueID string, markedAt time.Time) error {
	if _, err := r.pool.Exec(ctx,
		`DELETE FROM stats_dirty WHERE league_id = $1 AND marked_at = $2`, leagueID, markedAt); err != nil {
		return fmt.Errorf("clear dirty: %w", err)
	}
	if _, err := r.pool.Exec(ctx,
		`UPDATE stats_dirty SET attempts = 0, retry_at = NULL WHERE league_id = $1`, leagueID); err != nil {
		return fmt.Errorf("reset dirty attempts: %w", err)
	}
	return nil
}

// DeferDirty keeps a league that failed on the queue and makes it wait until retryAt.
func (r *PGRepository) DeferDirty(ctx context.Context, leagueID string, attempts int, retryAt time.Time) error {
	if _, err := r.pool.Exec(ctx,
		`UPDATE stats_dirty SET attempts = $2, retry_at = $3 WHERE league_id = $1`,
		leagueID, attempts, retryAt); err != nil {
		return fmt.Errorf("defer dirty: %w", err)
	}
	return nil
}

// MarkDirty puts a league on the queue, or refreshes its mark when it is already there so a
// recompute that is running now knows to run again.
func (r *PGRepository) MarkDirty(ctx context.Context, leagueID string) error {
	if _, err := r.pool.Exec(ctx, markDirtySQL, leagueID); err != nil {
		return fmt.Errorf("mark dirty: %w", err)
	}
	return nil
}

// markDirtySQL refreshes marked_at on conflict, like the sync module's MarkDirty (which runs
// inside a sync transaction). clock_timestamp, not now(): now() is the transaction's start.
const markDirtySQL = `INSERT INTO stats_dirty (league_id) VALUES ($1)
	ON CONFLICT (league_id) DO UPDATE SET marked_at = clock_timestamp()`

// Load reads the league's live documents.
func (r *PGRepository) Load(ctx context.Context, leagueID string) (LeagueData, bool, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT entity, id, data FROM docs
		  WHERE league_id = $1 AND NOT deleted AND entity IN ('league', 'player', 'match', 'race')`, leagueID)
	if err != nil {
		return LeagueData{}, false, fmt.Errorf("query league docs: %w", err)
	}
	defer rows.Close()
	var d LeagueData
	found := false
	for rows.Next() {
		var entity, id string
		var raw []byte
		if err := rows.Scan(&entity, &id, &raw); err != nil {
			return LeagueData{}, false, fmt.Errorf("scan doc: %w", err)
		}
		switch entity {
		case "league":
			var l struct {
				Kind   string `json:"kind"`
				CityID string `json:"cityId"`
			}
			if err := json.Unmarshal(raw, &l); err != nil {
				return LeagueData{}, false, fmt.Errorf("decode league %s: %w", id, err)
			}
			d.Kind, d.CityID, found = l.Kind, l.CityID, true
		case "player":
			var p struct {
				AuthUID   *string `json:"authUid"`
				UpdatedAt string  `json:"updatedAt"`
			}
			if err := json.Unmarshal(raw, &p); err != nil {
				return LeagueData{}, false, fmt.Errorf("decode player %s: %w", id, err)
			}
			c := Card{ID: id, UpdatedAt: p.UpdatedAt}
			if p.AuthUID != nil {
				c.AuthUID = *p.AuthUID
			}
			d.Cards = append(d.Cards, c)
		case "match":
			var m Match
			if err := json.Unmarshal(raw, &m); err != nil {
				return LeagueData{}, false, fmt.Errorf("decode match %s: %w", id, err)
			}
			d.Matches = append(d.Matches, m)
		case "race":
			var rc Race
			if err := json.Unmarshal(raw, &rc); err != nil {
				return LeagueData{}, false, fmt.Errorf("decode race %s: %w", id, err)
			}
			d.Races = append(d.Races, rc)
		}
	}
	if err := rows.Err(); err != nil {
		return LeagueData{}, false, fmt.Errorf("read league docs: %w", err)
	}
	return d, found, nil
}

// Replace swaps the league's standings for rows in one transaction.
func (r *PGRepository) Replace(ctx context.Context, leagueID string, rows []Standing) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after commit
	if _, err := tx.Exec(ctx, `DELETE FROM league_standings WHERE league_id = $1`, leagueID); err != nil {
		return fmt.Errorf("clear standings: %w", err)
	}
	for _, s := range rows {
		std, err := json.Marshal(s.Standard)
		if err != nil {
			return fmt.Errorf("encode standard: %w", err)
		}
		race, err := json.Marshal(s.Race)
		if err != nil {
			return fmt.Errorf("encode race: %w", err)
		}
		rating, err := json.Marshal(s.Rating)
		if err != nil {
			return fmt.Errorf("encode rating: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO league_standings (league_id, player_id, standard, race, rating)
			 VALUES ($1, $2, $3, $4, $5)`, leagueID, s.PlayerID, std, race, rating); err != nil {
			return fmt.Errorf("insert standing: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit standings: %w", err)
	}
	return nil
}

// Standings returns one page of the league's rows, best rating first.
func (r *PGRepository) Standings(ctx context.Context, leagueID string, limit, offset int) ([]Standing, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT player_id, standard, race, rating FROM league_standings
		  WHERE league_id = $1 ORDER BY (rating ->> 'rating')::float DESC, player_id
		  LIMIT $2 OFFSET $3`, leagueID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("query standings: %w", err)
	}
	defer rows.Close()
	out := []Standing{}
	for rows.Next() {
		var s Standing
		var std, race, rating []byte
		if err := rows.Scan(&s.PlayerID, &std, &race, &rating); err != nil {
			return nil, fmt.Errorf("scan standing: %w", err)
		}
		if err := json.Unmarshal(std, &s.Standard); err != nil {
			return nil, fmt.Errorf("decode standard: %w", err)
		}
		if err := json.Unmarshal(race, &s.Race); err != nil {
			return nil, fmt.Errorf("decode race: %w", err)
		}
		if err := json.Unmarshal(rating, &s.Rating); err != nil {
			return nil, fmt.Errorf("decode rating: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
