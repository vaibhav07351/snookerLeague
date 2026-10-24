// Package auth signs users in with Google and manages their sessions.
package auth

import (
	"context"
	"errors"
	"time"
)

// User is a signed-in person. IDs are TEXT: migrated users keep their old Firebase uid.
type User struct {
	ID          string    `json:"id"`
	GoogleSub   string    `json:"-"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	PhotoURL    string    `json:"photoUrl"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Session is one signed-in device. Only hashes of its refresh secrets are stored.
type Session struct {
	ID          string
	UserID      string
	CurrentHash string
	// PrevHash is the secret replaced by the last rotation, still accepted for a short
	// grace window so two parallel refreshes don't look like token theft.
	PrevHash  string
	RotatedAt time.Time
	ExpiresAt time.Time
	Revoked   bool
}

// GoogleIdentity is what we trust after verifying a Google ID token.
type GoogleIdentity struct {
	Sub         string
	Email       string
	DisplayName string
	PhotoURL    string
}

// ErrNotFound is returned by repositories when a row does not exist.
var ErrNotFound = errors.New("not found")

// UserRepository stores users.
type UserRepository interface {
	FindByGoogleSub(ctx context.Context, sub string) (User, error)
	FindByID(ctx context.Context, id string) (User, error)
	Create(ctx context.Context, u User) error
	UpdateProfile(ctx context.Context, id, displayName, photoURL string) error
}

// SessionRepository stores sessions.
type SessionRepository interface {
	Create(ctx context.Context, s Session) error
	Get(ctx context.Context, id string) (Session, error)
	Update(ctx context.Context, s Session) error
	Revoke(ctx context.Context, id string) error
	RevokeAllForUser(ctx context.Context, userID string) error
}

// GoogleVerifier checks a Google ID token and returns the identity inside it.
type GoogleVerifier interface {
	Verify(ctx context.Context, idToken string) (GoogleIdentity, error)
}
