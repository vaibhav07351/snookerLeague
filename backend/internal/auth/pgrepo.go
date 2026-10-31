package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGUsers stores users in PostgreSQL.
type PGUsers struct{ pool *pgxpool.Pool }

// NewPGUsers builds the Postgres user repository.
func NewPGUsers(pool *pgxpool.Pool) *PGUsers { return &PGUsers{pool: pool} }

const userColumns = "id, google_sub, email, display_name, photo_url, created_at"

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.GoogleSub, &u.Email, &u.DisplayName, &u.PhotoURL, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("scan user: %w", err)
	}
	return u, nil
}

// FindByGoogleSub looks a user up by Google's stable account id.
func (r *PGUsers) FindByGoogleSub(ctx context.Context, sub string) (User, error) {
	return scanUser(r.pool.QueryRow(ctx, "SELECT "+userColumns+" FROM users WHERE google_sub = $1", sub))
}

// FindByID looks a user up by our id.
func (r *PGUsers) FindByID(ctx context.Context, id string) (User, error) {
	return scanUser(r.pool.QueryRow(ctx, "SELECT "+userColumns+" FROM users WHERE id = $1", id))
}

// Create inserts a user.
func (r *PGUsers) Create(ctx context.Context, u User) error {
	_, err := r.pool.Exec(ctx,
		"INSERT INTO users (id, google_sub, email, display_name, photo_url, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
		u.ID, u.GoogleSub, u.Email, u.DisplayName, u.PhotoURL, u.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert user: %w", err)
	}
	return nil
}

// UpdateProfile changes the display fields.
func (r *PGUsers) UpdateProfile(ctx context.Context, id, displayName, photoURL string) error {
	_, err := r.pool.Exec(ctx, "UPDATE users SET display_name = $2, photo_url = $3 WHERE id = $1", id, displayName, photoURL)
	if err != nil {
		return fmt.Errorf("update user: %w", err)
	}
	return nil
}

// Delete removes the user row; foreign keys cascade to sessions, memberships and community rows.
func (r *PGUsers) Delete(ctx context.Context, id string) error {
	if _, err := r.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", id); err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	return nil
}

// PGSessions stores sessions in PostgreSQL.
type PGSessions struct{ pool *pgxpool.Pool }

// NewPGSessions builds the Postgres session repository.
func NewPGSessions(pool *pgxpool.Pool) *PGSessions { return &PGSessions{pool: pool} }

// Create inserts a session.
func (r *PGSessions) Create(ctx context.Context, s Session) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO sessions (id, user_id, current_hash, prev_hash, rotated_at, expires_at, revoked)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		s.ID, s.UserID, s.CurrentHash, s.PrevHash, s.RotatedAt, s.ExpiresAt, s.Revoked)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// Get loads a session by id.
func (r *PGSessions) Get(ctx context.Context, id string) (Session, error) {
	var s Session
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, current_hash, prev_hash, rotated_at, expires_at, revoked
		 FROM sessions WHERE id = $1`, id).
		Scan(&s.ID, &s.UserID, &s.CurrentHash, &s.PrevHash, &s.RotatedAt, &s.ExpiresAt, &s.Revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("get session: %w", err)
	}
	return s, nil
}

// Update saves a rotated session. The WHERE clause matches the secret that was current
// before this rotation (now stored as prev_hash), so a lost race fails loudly instead of
// silently overwriting a newer rotation.
func (r *PGSessions) Update(ctx context.Context, s Session) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE sessions SET current_hash = $2, prev_hash = $3, rotated_at = $4
		 WHERE id = $1 AND current_hash = $3`,
		s.ID, s.CurrentHash, s.PrevHash, s.RotatedAt)
	if err != nil {
		return fmt.Errorf("update session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("session changed concurrently")
	}
	return nil
}

// Revoke ends one session.
func (r *PGSessions) Revoke(ctx context.Context, id string) error {
	if _, err := r.pool.Exec(ctx, "UPDATE sessions SET revoked = true WHERE id = $1", id); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

// RevokeAllForUser ends every session of a user (account deletion, "sign out everywhere").
func (r *PGSessions) RevokeAllForUser(ctx context.Context, userID string) error {
	if _, err := r.pool.Exec(ctx, "UPDATE sessions SET revoked = true WHERE user_id = $1", userID); err != nil {
		return fmt.Errorf("revoke sessions: %w", err)
	}
	return nil
}
