package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims are the only facts in an access token. League roles are deliberately NOT here:
// they are looked up per request so they can never be stale.
type Claims struct {
	SessionID string `json:"sid"`
	jwt.RegisteredClaims
}

// TokenIssuer signs and parses access tokens.
type TokenIssuer struct {
	key []byte
	ttl time.Duration
	now func() time.Time
}

// NewTokenIssuer builds an issuer using HS256.
func NewTokenIssuer(key []byte, ttl time.Duration) *TokenIssuer {
	return &TokenIssuer{key: key, ttl: ttl, now: time.Now}
}

// Issue signs a short-lived access token for a user's session.
func (t *TokenIssuer) Issue(userID, sessionID string) (string, time.Time, error) {
	exp := t.now().Add(t.ttl)
	claims := Claims{
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(t.now()),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(t.key)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign access token: %w", err)
	}
	return signed, exp, nil
}

// Parse validates signature and expiry and returns the claims.
func (t *TokenIssuer) Parse(token string) (Claims, error) {
	var claims Claims
	_, err := jwt.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) { return t.key, nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithTimeFunc(t.now),
		jwt.WithExpirationRequired(),
	)
	if err != nil || claims.Subject == "" || claims.SessionID == "" {
		return Claims{}, errors.New("invalid access token")
	}
	return claims, nil
}

// newRandomID returns a URL-safe random id with a readable prefix, e.g. "u_3f9a...".
func newRandomID(prefix string) (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("random id: %w", err)
	}
	return prefix + hex.EncodeToString(buf), nil
}

// newRefreshSecret returns a random 256-bit secret, base64url encoded.
func newRefreshSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("refresh secret: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func hashesEqual(a, b string) bool {
	return a != "" && b != "" && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// formatRefreshToken joins a session id and its secret: "<sessionID>.<secret>".
func formatRefreshToken(sessionID, secret string) string { return sessionID + "." + secret }

func parseRefreshToken(token string) (sessionID, secret string, ok bool) {
	sessionID, secret, ok = strings.Cut(token, ".")
	return sessionID, secret, ok && sessionID != "" && secret != ""
}
