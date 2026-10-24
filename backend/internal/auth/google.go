package auth

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"google.golang.org/api/idtoken"
)

// ErrInvalidGoogleToken means the token failed verification for any reason.
var ErrInvalidGoogleToken = errors.New("invalid google token")

// IDTokenVerifier verifies tokens locally against Google's cached public keys.
// (Google's tokeninfo endpoint is for debugging only: it can throttle in production.)
type IDTokenVerifier struct {
	webClientID    string
	androidClients []string
}

// NewIDTokenVerifier builds the production verifier.
func NewIDTokenVerifier(webClientID string, androidClients []string) *IDTokenVerifier {
	return &IDTokenVerifier{webClientID: webClientID, androidClients: androidClients}
}

// Verify checks signature, expiry and issuer; the audience must be our web client id, and when
// the token was issued to a native app its authorized party (azp) must be one of our clients.
func (v *IDTokenVerifier) Verify(ctx context.Context, token string) (GoogleIdentity, error) {
	payload, err := idtoken.Validate(ctx, token, v.webClientID)
	if err != nil {
		return GoogleIdentity{}, fmt.Errorf("%w: %v", ErrInvalidGoogleToken, err)
	}
	return identityFromClaims(payload.Claims, payload.Subject, v.webClientID, v.androidClients)
}

// identityFromClaims applies our policy to already-signature-checked claims.
func identityFromClaims(claims map[string]any, sub, webClientID string, androidClients []string) (GoogleIdentity, error) {
	if verified, _ := claims["email_verified"].(bool); !verified {
		return GoogleIdentity{}, fmt.Errorf("%w: email not verified", ErrInvalidGoogleToken)
	}
	azp, _ := claims["azp"].(string)
	if azp != webClientID && !slices.Contains(androidClients, azp) {
		return GoogleIdentity{}, fmt.Errorf("%w: unexpected authorized party", ErrInvalidGoogleToken)
	}
	email, _ := claims["email"].(string)
	if sub == "" || email == "" {
		return GoogleIdentity{}, fmt.Errorf("%w: missing subject or email", ErrInvalidGoogleToken)
	}
	name, _ := claims["name"].(string)
	picture, _ := claims["picture"].(string)
	return GoogleIdentity{Sub: sub, Email: email, DisplayName: name, PhotoURL: picture}, nil
}
