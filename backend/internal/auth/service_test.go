package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

type memUsers struct{ byID map[string]User }

func (m *memUsers) FindByGoogleSub(_ context.Context, sub string) (User, error) {
	for _, u := range m.byID {
		if u.GoogleSub == sub {
			return u, nil
		}
	}
	return User{}, ErrNotFound
}

func (m *memUsers) FindByID(_ context.Context, id string) (User, error) {
	if u, ok := m.byID[id]; ok {
		return u, nil
	}
	return User{}, ErrNotFound
}

func (m *memUsers) Create(_ context.Context, u User) error { m.byID[u.ID] = u; return nil }

func (m *memUsers) UpdateProfile(context.Context, string, string, string) error { return nil }

func (m *memUsers) Delete(context.Context, string) error { return nil }

type memSessions struct{ byID map[string]Session }

func (m *memSessions) Create(_ context.Context, s Session) error { m.byID[s.ID] = s; return nil }

func (m *memSessions) Get(_ context.Context, id string) (Session, error) {
	if s, ok := m.byID[id]; ok {
		return s, nil
	}
	return Session{}, ErrNotFound
}

func (m *memSessions) Update(_ context.Context, s Session) error { m.byID[s.ID] = s; return nil }

func (m *memSessions) Revoke(_ context.Context, id string) error {
	s := m.byID[id]
	s.Revoked = true
	m.byID[id] = s
	return nil
}

func (m *memSessions) RevokeAllForUser(_ context.Context, userID string) error {
	for id, s := range m.byID {
		if s.UserID == userID {
			s.Revoked = true
			m.byID[id] = s
		}
	}
	return nil
}

type fakeGoogle struct {
	ident GoogleIdentity
	err   error
}

func (f fakeGoogle) Verify(context.Context, string) (GoogleIdentity, error) { return f.ident, f.err }

type fixture struct {
	svc      *Service
	users    *memUsers
	sessions *memSessions
	clock    *time.Time
}

func newFixture(g GoogleVerifier) fixture {
	now := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	f := fixture{
		users:    &memUsers{byID: map[string]User{}},
		sessions: &memSessions{byID: map[string]Session{}},
		clock:    &now,
	}
	issuer := NewTokenIssuer([]byte("0123456789abcdef0123456789abcdef"), 30*time.Minute)
	svc := NewService(f.users, f.sessions, g, issuer, 60*24*time.Hour, 60*time.Second)
	clock := func() time.Time { return *f.clock }
	issuer.now = clock
	svc.now = clock
	f.svc = svc
	return f
}

var goodIdentity = GoogleIdentity{Sub: "g-123", Email: "a@example.com", DisplayName: "Asha"}

func signedIn(t *testing.T) (fixture, User, TokenPair) {
	t.Helper()
	f := newFixture(fakeGoogle{ident: goodIdentity})
	user, pair, err := f.svc.SignInWithGoogle(context.Background(), "token")
	if err != nil {
		t.Fatalf("sign in: %v", err)
	}
	return f, user, pair
}

func TestSignInCreatesUserOnceAndReusesIt(t *testing.T) {
	f, first, _ := signedIn(t)
	second, _, err := f.svc.SignInWithGoogle(context.Background(), "token")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID || len(f.users.byID) != 1 {
		t.Fatalf("expected one user reused, got %d users", len(f.users.byID))
	}
}

func TestSignInRejectsBadGoogleToken(t *testing.T) {
	f := newFixture(fakeGoogle{err: ErrInvalidGoogleToken})
	_, _, err := f.svc.SignInWithGoogle(context.Background(), "bad")
	if !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatalf("want unauthorized, got %v", err)
	}
	if len(f.users.byID) != 0 {
		t.Fatal("no user must be created for a rejected token")
	}
}

func TestRefreshRotatesSecret(t *testing.T) {
	f, _, pair := signedIn(t)
	next, err := f.svc.Refresh(context.Background(), pair.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if next.RefreshToken == pair.RefreshToken {
		t.Fatal("refresh token must change on every refresh")
	}
}

func TestRefreshGraceAcceptsParallelCall(t *testing.T) {
	f, _, pair := signedIn(t)
	if _, err := f.svc.Refresh(context.Background(), pair.RefreshToken); err != nil {
		t.Fatal(err)
	}
	*f.clock = f.clock.Add(10 * time.Second)
	if _, err := f.svc.Refresh(context.Background(), pair.RefreshToken); err != nil {
		t.Fatalf("old secret inside grace window must work: %v", err)
	}
}

func TestRefreshReuseAfterGraceRevokesSession(t *testing.T) {
	f, _, pair := signedIn(t)
	latest, err := f.svc.Refresh(context.Background(), pair.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	*f.clock = f.clock.Add(5 * time.Minute)
	if _, err := f.svc.Refresh(context.Background(), pair.RefreshToken); !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatalf("stolen old secret must be rejected, got %v", err)
	}
	if _, err := f.svc.Refresh(context.Background(), latest.RefreshToken); !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatal("the whole session must be revoked after reuse")
	}
}

func TestRefreshRejectsMalformedAndExpired(t *testing.T) {
	f, _, pair := signedIn(t)
	for _, bad := range []string{"", "nodot", ".x", "x.", "s_unknown.secret"} {
		if _, err := f.svc.Refresh(context.Background(), bad); !errors.Is(err, httpx.ErrUnauthorized) {
			t.Fatalf("%q must be unauthorized, got %v", bad, err)
		}
	}
	*f.clock = f.clock.Add(61 * 24 * time.Hour)
	if _, err := f.svc.Refresh(context.Background(), pair.RefreshToken); !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatalf("expired session must be unauthorized, got %v", err)
	}
}

func TestAuthenticateChecksSessionAndExpiry(t *testing.T) {
	f, user, pair := signedIn(t)
	claims, err := f.svc.Authenticate(context.Background(), pair.AccessToken)
	if err != nil || claims.Subject != user.ID {
		t.Fatalf("valid token must authenticate: %v", err)
	}
	if err := f.svc.Logout(context.Background(), claims.SessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Authenticate(context.Background(), pair.AccessToken); !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatal("logout must take effect immediately, not after the token expires")
	}
}

func TestAuthenticateRejectsExpiredAndForgedTokens(t *testing.T) {
	f, _, pair := signedIn(t)
	*f.clock = f.clock.Add(31 * time.Minute)
	if _, err := f.svc.Authenticate(context.Background(), pair.AccessToken); !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatal("expired access token must be rejected")
	}
	if _, err := f.svc.Authenticate(context.Background(), pair.AccessToken+"x"); !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatal("tampered token must be rejected")
	}
}

func TestIdentityPolicy(t *testing.T) {
	const web = "web.apps.googleusercontent.com"
	android := []string{"android.apps.googleusercontent.com"}
	ok := map[string]any{"email_verified": true, "azp": android[0], "email": "a@b.c", "name": "A"}

	if _, err := identityFromClaims(ok, "sub1", web, android); err != nil {
		t.Fatalf("valid claims rejected: %v", err)
	}
	cases := map[string]map[string]any{
		"unverified email": {"email_verified": false, "azp": android[0], "email": "a@b.c"},
		"foreign azp":      {"email_verified": true, "azp": "evil.apps.googleusercontent.com", "email": "a@b.c"},
		"missing email":    {"email_verified": true, "azp": android[0]},
	}
	for name, claims := range cases {
		if _, err := identityFromClaims(claims, "sub1", web, android); !errors.Is(err, ErrInvalidGoogleToken) {
			t.Errorf("%s must be rejected, got %v", name, err)
		}
	}
	if _, err := identityFromClaims(ok, "", web, android); !errors.Is(err, ErrInvalidGoogleToken) {
		t.Error("missing subject must be rejected")
	}
}
