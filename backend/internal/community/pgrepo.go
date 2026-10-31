package community

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vaibhav/snookit-server/internal/stats"
)

// PGRepository is the PostgreSQL implementation of Repository.
type PGRepository struct{ pool *pgxpool.Pool }

// NewPGRepository builds the Postgres repository.
func NewPGRepository(pool *pgxpool.Pool) *PGRepository { return &PGRepository{pool: pool} }

const docColumns = `kind, id, owner_id, subject_id, city_id, sub_kind, sort_value, data, updated_at`

func scanDoc(row pgx.Row) (Doc, error) {
	var d Doc
	var kind string
	var data []byte
	if err := row.Scan(&kind, &d.ID, &d.OwnerID, &d.SubjectID, &d.CityID, &d.SubKind,
		&d.SortValue, &data, &d.UpdatedAt); err != nil {
		return Doc{}, err
	}
	d.Kind, d.Data = Kind(kind), data
	return d, nil
}

// Get returns one row or ErrNotFound.
func (r *PGRepository) Get(ctx context.Context, kind Kind, id string) (Doc, error) {
	d, err := scanDoc(r.pool.QueryRow(ctx,
		`SELECT `+docColumns+` FROM community_docs WHERE kind = $1 AND id = $2`, string(kind), id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Doc{}, ErrNotFound
	}
	if err != nil {
		return Doc{}, fmt.Errorf("get community doc: %w", err)
	}
	return d, nil
}

// Put inserts or replaces one row.
func (r *PGRepository) Put(ctx context.Context, d Doc) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO community_docs (kind, id, owner_id, subject_id, city_id, sub_kind, sort_value, data, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
		 ON CONFLICT (kind, id) DO UPDATE
		    SET owner_id = EXCLUDED.owner_id, subject_id = EXCLUDED.subject_id,
		        city_id = EXCLUDED.city_id, sub_kind = EXCLUDED.sub_kind,
		        sort_value = EXCLUDED.sort_value, data = EXCLUDED.data, updated_at = now()`,
		string(d.Kind), d.ID, d.OwnerID, d.SubjectID, d.CityID, d.SubKind, d.SortValue, []byte(d.Data))
	if err != nil {
		return fmt.Errorf("put community doc: %w", err)
	}
	return nil
}

// Delete removes one row; a missing row is not an error.
func (r *PGRepository) Delete(ctx context.Context, kind Kind, id string) error {
	if _, err := r.pool.Exec(ctx,
		`DELETE FROM community_docs WHERE kind = $1 AND id = $2`, string(kind), id); err != nil {
		return fmt.Errorf("delete community doc: %w", err)
	}
	return nil
}

// List returns rows matching the query, highest sort value first, starting after q.After.
func (r *PGRepository) List(ctx context.Context, q ListQuery) ([]Doc, error) {
	hasAfter := q.After != nil
	var afterSort float64
	var afterID string
	if hasAfter {
		afterSort, afterID = q.After.Sort, q.After.ID
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+docColumns+` FROM community_docs
		  WHERE kind = $1
		    AND ($2 = '' OR city_id = $2)
		    AND ($3 = '' OR sub_kind = $3)
		    AND ($4 = '' OR owner_id = $4)
		    AND ($5 = '' OR subject_id = $5)
		    AND (NOT $6 OR (sort_value, id) < ($7, $8))
		  ORDER BY sort_value DESC, id DESC
		  LIMIT $9`,
		string(q.Kind), q.CityID, q.SubKind, q.OwnerID, q.SubjectID, hasAfter, afterSort, afterID, q.Limit)
	if err != nil {
		return nil, fmt.Errorf("list community docs: %w", err)
	}
	defer rows.Close()
	docs := []Doc{}
	for rows.Next() {
		d, err := scanDoc(rows)
		if err != nil {
			return nil, fmt.Errorf("scan community doc: %w", err)
		}
		docs = append(docs, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read community docs: %w", err)
	}
	return docs, nil
}

// DeleteForUser removes every row the user owns or that is about them (follows of them,
// challenges sent to them).
func (r *PGRepository) DeleteForUser(ctx context.Context, userID string) error {
	if _, err := r.pool.Exec(ctx,
		`DELETE FROM community_docs WHERE owner_id = $1 OR subject_id = $1`, userID); err != nil {
		return fmt.Errorf("delete community docs for user: %w", err)
	}
	return nil
}

// SetCityRank writes the server's ranking numbers onto a profile, only while the profile is
// still in that city (stats.CityRankWriter).
func (r *PGRepository) SetCityRank(ctx context.Context, uid, cityID string, rank stats.CityRank) error {
	fields, err := json.Marshal(rankFields(rank))
	if err != nil {
		return fmt.Errorf("encode rank: %w", err)
	}
	if _, err := r.pool.Exec(ctx,
		`UPDATE community_docs SET data = data || $3::jsonb, sort_value = $4, updated_at = now()
		  WHERE kind = 'profile' AND id = $1 AND city_id = $2`,
		uid, cityID, fields, rank.RankScore); err != nil {
		return fmt.Errorf("set city rank: %w", err)
	}
	return nil
}

// SetPublicRating copies the public rating onto the person's profile (stats.PublicRatingWriter).
func (r *PGRepository) SetPublicRating(ctx context.Context, uid string, rating stats.PublicRating) error {
	fields, err := json.Marshal(map[string]any{"publicRating": rating.Rating, "publicGames": rating.Games})
	if err != nil {
		return fmt.Errorf("encode public rating: %w", err)
	}
	if _, err := r.pool.Exec(ctx,
		`UPDATE community_docs SET data = data || $2::jsonb, updated_at = now()
		  WHERE kind = 'profile' AND id = $1`, uid, fields); err != nil {
		return fmt.Errorf("set public rating: %w", err)
	}
	return nil
}

// DeviceTokens returns a person's newest push tokens (push.Devices).
func (r *PGRepository) DeviceTokens(ctx context.Context, userID string, limit int) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT data ->> 'pushToken' FROM community_docs
		  WHERE kind = 'device' AND owner_id = $1 ORDER BY sort_value DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("query push tokens: %w", err)
	}
	defer rows.Close()
	var tokens []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, fmt.Errorf("scan push token: %w", err)
		}
		tokens = append(tokens, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read push tokens: %w", err)
	}
	return tokens, nil
}

// RemoveDeviceToken forgets a push token the push service no longer accepts.
func (r *PGRepository) RemoveDeviceToken(ctx context.Context, token string) error {
	if _, err := r.pool.Exec(ctx,
		`DELETE FROM community_docs WHERE kind = 'device' AND data ->> 'pushToken' = $1`, token); err != nil {
		return fmt.Errorf("remove push token: %w", err)
	}
	return nil
}
