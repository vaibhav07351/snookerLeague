// Package app composes the platform and the domain modules into one HTTP handler.
// Adding a module means adding a few lines here; main.go never changes.
package app

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/community"
	"github.com/vaibhav/snookit-server/internal/platform/config"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
	"github.com/vaibhav/snookit-server/internal/sync"
)

// authRateLimit is the per-IP limit on sign-in and refresh calls.
const (
	authRateLimit  = 20
	authRateWindow = time.Minute
)

// NewRouter wires every module and returns the full HTTP handler.
func NewRouter(cfg config.Config, pool *pgxpool.Pool) http.Handler {
	issuer := auth.NewTokenIssuer(cfg.JWTSigningKey, cfg.AccessTokenTTL)
	authSvc := auth.NewService(
		auth.NewPGUsers(pool), auth.NewPGSessions(pool),
		auth.NewIDTokenVerifier(cfg.GoogleWebClientID, cfg.GoogleAndroidClients),
		issuer, cfg.RefreshTokenTTL, cfg.RefreshGrace,
	)
	authHandler := auth.NewHandler(authSvc)
	syncHandler := sync.NewHandler(sync.NewService(sync.NewPGStore(pool)))
	communityHandler := community.NewHandler(community.NewService(community.NewPGRepository(pool)))
	authLimiter := httpx.NewRateLimiter(authRateLimit, authRateWindow)

	r := chi.NewRouter()
	r.Use(httpx.RequestIDMiddleware, httpx.Recoverer)
	r.Get("/healthz", healthHandler(pool))
	r.Route("/v1", func(v1 chi.Router) {
		v1.Get("/config", configHandler(cfg))
		v1.Group(func(public chi.Router) {
			public.Use(authLimiter.Middleware)
			authHandler.PublicRoutes(public)
		})
		v1.Group(func(protected chi.Router) {
			protected.Use(authHandler.Middleware)
			authHandler.ProtectedRoutes(protected)
			syncHandler.ProtectedRoutes(protected)
			communityHandler.ProtectedRoutes(protected)
		})
	})
	return r
}

func healthHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db_down"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func configHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"minVersion": cfg.MinAppVersion})
	}
}
