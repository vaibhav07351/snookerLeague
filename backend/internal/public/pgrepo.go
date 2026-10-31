package public

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PGRemovals stores removal requests in PostgreSQL.
type PGRemovals struct{ pool *pgxpool.Pool }

// NewPGRemovals builds the removal request store.
func NewPGRemovals(pool *pgxpool.Pool) *PGRemovals { return &PGRemovals{pool: pool} }

// SaveRemovalRequest records one request for the team to review.
func (r *PGRemovals) SaveRemovalRequest(ctx context.Context, target, message string) error {
	if _, err := r.pool.Exec(ctx,
		`INSERT INTO removal_requests (target, message) VALUES ($1, $2)`, target, message); err != nil {
		return fmt.Errorf("save removal request: %w", err)
	}
	return nil
}
