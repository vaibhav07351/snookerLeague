package stats

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// RatedGames reduces every finished singles match between two accounts, agreed by both
// sides, to a winner and a loser (see the rules in public_rating.go).
func (r *PGRepository) RatedGames(ctx context.Context) ([]RatedGame, map[string]time.Time, error) {
	owners, err := r.cardOwners(ctx)
	if err != nil {
		return nil, nil, err
	}
	created, err := r.accountAges(ctx)
	if err != nil {
		return nil, nil, err
	}
	rows, err := r.pool.Query(ctx,
		`SELECT data FROM docs
		  WHERE entity = 'match' AND NOT deleted AND data -> 'outcome' ->> 'status' = 'completed'`)
	if err != nil {
		return nil, nil, fmt.Errorf("query matches: %w", err)
	}
	defer rows.Close()
	var games []RatedGame
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, nil, fmt.Errorf("scan match: %w", err)
		}
		if g, ok := ratedGame(raw, owners); ok {
			games = append(games, g)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("read matches: %w", err)
	}
	return games, created, nil
}

// cardOwners maps player card ids to the accounts that own them.
func (r *PGRepository) cardOwners(ctx context.Context) (map[string]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, data ->> 'authUid' FROM docs
		  WHERE entity = 'player' AND NOT deleted AND coalesce(data ->> 'authUid', '') <> ''`)
	if err != nil {
		return nil, fmt.Errorf("query card owners: %w", err)
	}
	defer rows.Close()
	owners := map[string]string{}
	for rows.Next() {
		var id, uid string
		if err := rows.Scan(&id, &uid); err != nil {
			return nil, fmt.Errorf("scan card owner: %w", err)
		}
		owners[id] = uid
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read card owners: %w", err)
	}
	return owners, nil
}

// accountAges returns when each account was created.
func (r *PGRepository) accountAges(ctx context.Context) (map[string]time.Time, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, created_at FROM users`)
	if err != nil {
		return nil, fmt.Errorf("query accounts: %w", err)
	}
	defer rows.Close()
	created := map[string]time.Time{}
	for rows.Next() {
		var id string
		var at time.Time
		if err := rows.Scan(&id, &at); err != nil {
			return nil, fmt.Errorf("scan account: %w", err)
		}
		created[id] = at
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read accounts: %w", err)
	}
	return created, nil
}

// ratedGame turns one match document into a rated game, if it qualifies.
func ratedGame(raw []byte, owners map[string]string) (RatedGame, bool) {
	var m struct {
		UpdatedAt       string   `json:"updatedAt"`
		CreatedByUID    string   `json:"createdByUid"`
		ScorerUID       string   `json:"scorerUid"`
		TeamA           []string `json:"teamA"`
		TeamB           []string `json:"teamB"`
		ConfirmedByUIDs []string `json:"confirmedByUids"`
		Outcome         struct {
			Winner string `json:"winner"`
		} `json:"outcome"`
	}
	if json.Unmarshal(raw, &m) != nil || len(m.TeamA) != 1 || len(m.TeamB) != 1 {
		return RatedGame{}, false
	}
	ua, ub := owners[m.TeamA[0]], owners[m.TeamB[0]]
	if ua == "" || ub == "" || ua == ub {
		return RatedGame{}, false
	}
	agreed := func(uid string) bool {
		if uid == m.CreatedByUID || uid == m.ScorerUID {
			return true
		}
		for _, c := range m.ConfirmedByUIDs {
			if c == uid {
				return true
			}
		}
		return false
	}
	if !agreed(ua) || !agreed(ub) {
		return RatedGame{}, false
	}
	at, err := time.Parse(time.RFC3339Nano, m.UpdatedAt)
	if err != nil {
		return RatedGame{}, false
	}
	switch m.Outcome.Winner {
	case "a":
		return RatedGame{At: at, WinnerID: ua, LoserID: ub}, true
	case "b":
		return RatedGame{At: at, WinnerID: ub, LoserID: ua}, true
	}
	return RatedGame{}, false
}

// ReplacePublicRatings swaps the whole table in one transaction.
func (r *PGRepository) ReplacePublicRatings(ctx context.Context, rows []PublicRating) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after commit
	if _, err := tx.Exec(ctx, `DELETE FROM public_ratings`); err != nil {
		return fmt.Errorf("clear public ratings: %w", err)
	}
	for _, p := range rows {
		if _, err := tx.Exec(ctx,
			`INSERT INTO public_ratings (user_id, rating, games, peak)
			 SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)`,
			p.UserID, p.Rating, p.Games, p.Peak); err != nil {
			return fmt.Errorf("insert public rating: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit public ratings: %w", err)
	}
	return nil
}
