package sync

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGClaims stores claim links in PostgreSQL. Reads and the "used" mark run inside the
// redeem transaction (through the Tx), so a link can never be used twice.
type PGClaims struct{ pool *pgxpool.Pool }

// NewPGClaims builds the claim link store.
func NewPGClaims(pool *pgxpool.Pool) *PGClaims { return &PGClaims{pool: pool} }

// SaveClaimLink stores a new link.
func (c *PGClaims) SaveClaimLink(ctx context.Context, l ClaimLink) error {
	if _, err := c.pool.Exec(ctx,
		`INSERT INTO claim_links (token_hash, player_id, league_id, created_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`, l.TokenHash, l.PlayerID, l.LeagueID, l.CreatedBy, l.ExpiresAt); err != nil {
		return fmt.Errorf("insert claim link: %w", err)
	}
	return nil
}

// ClaimLinkForUpdate loads and locks a link inside the redeem transaction.
func (c *PGClaims) ClaimLinkForUpdate(ctx context.Context, tx Tx, tokenHash string) (ClaimLink, error) {
	pt, ok := tx.(*pgTx)
	if !ok {
		return ClaimLink{}, errors.New("claim links need the Postgres store")
	}
	var l ClaimLink
	err := pt.tx.QueryRow(ctx,
		`SELECT token_hash, player_id, league_id, created_by, expires_at, used_at
		   FROM claim_links WHERE token_hash = $1 FOR UPDATE`, tokenHash).
		Scan(&l.TokenHash, &l.PlayerID, &l.LeagueID, &l.CreatedBy, &l.ExpiresAt, &l.UsedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ClaimLink{}, ErrNotFound
	}
	if err != nil {
		return ClaimLink{}, fmt.Errorf("load claim link: %w", err)
	}
	return l, nil
}

// MarkClaimUsed records that the link was used.
func (c *PGClaims) MarkClaimUsed(ctx context.Context, tx Tx, tokenHash string, at time.Time) error {
	pt, ok := tx.(*pgTx)
	if !ok {
		return errors.New("claim links need the Postgres store")
	}
	if _, err := pt.tx.Exec(ctx, `UPDATE claim_links SET used_at = $2 WHERE token_hash = $1`, tokenHash, at); err != nil {
		return fmt.Errorf("mark claim used: %w", err)
	}
	return nil
}
