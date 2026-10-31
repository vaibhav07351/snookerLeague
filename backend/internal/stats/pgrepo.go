package stats

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGRepository is the PostgreSQL implementation of Repository.
type PGRepository struct{ pool *pgxpool.Pool }

// NewPGRepository builds the Postgres repository.
func NewPGRepository(pool *pgxpool.Pool) *PGRepository { return &PGRepository{pool: pool} }

// ClaimDirty takes up to limit leagues off the queue. SKIP LOCKED keeps two workers from
// taking the same league.
func (r *PGRepository) ClaimDirty(ctx context.Context, limit int) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`DELETE FROM stats_dirty WHERE league_id IN (
		     SELECT league_id FROM stats_dirty ORDER BY marked_at LIMIT $1 FOR UPDATE SKIP LOCKED)
		 RETURNING league_id`, limit)
	if err != nil {
		return nil, fmt.Errorf("claim dirty: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// MarkDirty puts a league (back) on the queue.
func (r *PGRepository) MarkDirty(ctx context.Context, leagueID string) error {
	if _, err := r.pool.Exec(ctx,
		`INSERT INTO stats_dirty (league_id) VALUES ($1) ON CONFLICT (league_id) DO NOTHING`, leagueID); err != nil {
		return fmt.Errorf("mark dirty: %w", err)
	}
	return nil
}

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
				AuthUID *string `json:"authUid"`
			}
			if err := json.Unmarshal(raw, &p); err != nil {
				return LeagueData{}, false, fmt.Errorf("decode player %s: %w", id, err)
			}
			c := Card{ID: id}
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
