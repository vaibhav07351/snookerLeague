package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vaibhav/snookit-server/internal/platform/config"
)

// A browser preflight from the web app must get a 204 with CORS headers, not chi's 405.
// The pool is created lazily and never used, so no database is needed.
func TestRouterAnswersWebPreflightOnAuthRoute(t *testing.T) {
	pool, err := pgxpool.New(context.Background(), "postgres://unused@127.0.0.1:1/unused")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()
	router := NewRouter(config.Config{JWTSigningKey: make([]byte, 32)}, pool)

	req := httptest.NewRequest(http.MethodOptions, "/v1/auth/google", nil)
	req.Header.Set("Origin", "https://snookit.expo.app")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://snookit.expo.app" {
		t.Fatalf("allow origin = %q", got)
	}
}
