package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// TokenPair is what the app stores after sign-in or refresh.
type TokenPair struct {
	AccessToken  string    `json:"accessToken"`
	AccessExpiry time.Time `json:"accessExpiresAt"`
	RefreshToken string    `json:"refreshToken"`
}

// Service holds sign-in and session rules.
type Service struct {
	users      UserRepository
	sessions   SessionRepository
	google     GoogleVerifier
	issuer     *TokenIssuer
	refreshTTL time.Duration
	grace      time.Duration
	now        func() time.Time
}

// NewService wires the auth service.
func NewService(users UserRepository, sessions SessionRepository, google GoogleVerifier,
	issuer *TokenIssuer, refreshTTL, grace time.Duration) *Service {
	return &Service{users: users, sessions: sessions, google: google, issuer: issuer,
		refreshTTL: refreshTTL, grace: grace, now: time.Now}
}

// SignInWithGoogle verifies the token, finds or creates the user, and opens a session.
func (s *Service) SignInWithGoogle(ctx context.Context, idToken string) (User, TokenPair, error) {
	ident, err := s.google.Verify(ctx, idToken)
	if err != nil {
		slog.Warn("google sign-in rejected", "error", err)
		return User{}, TokenPair{}, httpx.ErrUnauthorized
	}
	user, err := s.findOrCreateUser(ctx, ident)
	if err != nil {
		return User{}, TokenPair{}, err
	}
	pair, err := s.openSession(ctx, user.ID)
	return user, pair, err
}

func (s *Service) findOrCreateUser(ctx context.Context, ident GoogleIdentity) (User, error) {
	user, err := s.users.FindByGoogleSub(ctx, ident.Sub)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return User{}, fmt.Errorf("find user: %w", err)
	}
	id, err := newRandomID("u_")
	if err != nil {
		return User{}, err
	}
	user = User{ID: id, GoogleSub: ident.Sub, Email: ident.Email, DisplayName: ident.DisplayName,
		PhotoURL: ident.PhotoURL, CreatedAt: s.now().UTC()}
	if err := s.users.Create(ctx, user); err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

func (s *Service) openSession(ctx context.Context, userID string) (TokenPair, error) {
	sid, err := newRandomID("s_")
	if err != nil {
		return TokenPair{}, err
	}
	secret, err := newRefreshSecret()
	if err != nil {
		return TokenPair{}, err
	}
	sess := Session{ID: sid, UserID: userID, CurrentHash: hashSecret(secret),
		RotatedAt: s.now(), ExpiresAt: s.now().Add(s.refreshTTL)}
	if err := s.sessions.Create(ctx, sess); err != nil {
		return TokenPair{}, fmt.Errorf("create session: %w", err)
	}
	return s.pair(userID, sid, secret)
}

func (s *Service) pair(userID, sessionID, secret string) (TokenPair, error) {
	access, exp, err := s.issuer.Issue(userID, sessionID)
	if err != nil {
		return TokenPair{}, err
	}
	return TokenPair{AccessToken: access, AccessExpiry: exp, RefreshToken: formatRefreshToken(sessionID, secret)}, nil
}

// Refresh swaps a refresh token for a new pair and rotates the secret.
//
// The previous secret stays valid for a short grace window: the app can fire two refreshes
// at once (parallel 401s, two tabs), and the second must not look like a stolen token.
// Using a replaced secret OUTSIDE that window is treated as theft and kills the session.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (TokenPair, error) {
	sid, secret, ok := parseRefreshToken(refreshToken)
	if !ok {
		return TokenPair{}, httpx.ErrUnauthorized
	}
	sess, err := s.sessions.Get(ctx, sid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return TokenPair{}, httpx.ErrUnauthorized
		}
		return TokenPair{}, fmt.Errorf("get session: %w", err)
	}
	now := s.now()
	if sess.Revoked || now.After(sess.ExpiresAt) {
		return TokenPair{}, httpx.ErrUnauthorized
	}
	presented := hashSecret(secret)
	switch {
	case hashesEqual(presented, sess.CurrentHash):
	case hashesEqual(presented, sess.PrevHash) && now.Sub(sess.RotatedAt) <= s.grace:
	case hashesEqual(presented, sess.PrevHash):
		slog.Warn("refresh token reuse outside grace window; revoking session", "session", sid)
		if err := s.sessions.Revoke(ctx, sid); err != nil {
			return TokenPair{}, fmt.Errorf("revoke session: %w", err)
		}
		return TokenPair{}, httpx.ErrUnauthorized
	default:
		return TokenPair{}, httpx.ErrUnauthorized
	}
	newSecret, err := newRefreshSecret()
	if err != nil {
		return TokenPair{}, err
	}
	sess.PrevHash = sess.CurrentHash
	sess.CurrentHash = hashSecret(newSecret)
	sess.RotatedAt = now
	if err := s.sessions.Update(ctx, sess); err != nil {
		return TokenPair{}, fmt.Errorf("rotate session: %w", err)
	}
	return s.pair(sess.UserID, sess.ID, newSecret)
}

// Authenticate validates an access token and checks its session is still live, so logout
// and account deletion take effect immediately rather than after 30 minutes.
func (s *Service) Authenticate(ctx context.Context, accessToken string) (Claims, error) {
	claims, err := s.issuer.Parse(accessToken)
	if err != nil {
		return Claims{}, httpx.ErrUnauthorized
	}
	sess, err := s.sessions.Get(ctx, claims.SessionID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Claims{}, httpx.ErrUnauthorized
		}
		return Claims{}, fmt.Errorf("get session: %w", err)
	}
	if sess.Revoked || s.now().After(sess.ExpiresAt) || sess.UserID != claims.Subject {
		return Claims{}, httpx.ErrUnauthorized
	}
	return claims, nil
}

// Logout ends one session.
func (s *Service) Logout(ctx context.Context, sessionID string) error {
	if err := s.sessions.Revoke(ctx, sessionID); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

// Me returns the signed-in user's profile.
func (s *Service) Me(ctx context.Context, userID string) (User, error) {
	user, err := s.users.FindByID(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return User{}, httpx.ErrUnauthorized
	}
	if err != nil {
		return User{}, fmt.Errorf("find user: %w", err)
	}
	return user, nil
}
