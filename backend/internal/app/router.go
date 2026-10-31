// Package app composes the platform and the domain modules into one HTTP handler.
// Adding a module means adding a few lines here; main.go never changes.
package app

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vaibhav/snookit-server/internal/account"
	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/community"
	"github.com/vaibhav/snookit-server/internal/live"
	"github.com/vaibhav/snookit-server/internal/platform/config"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
	"github.com/vaibhav/snookit-server/internal/public"
	"github.com/vaibhav/snookit-server/internal/push"
	"github.com/vaibhav/snookit-server/internal/stats"
	"github.com/vaibhav/snookit-server/internal/sync"
	"github.com/vaibhav/snookit-server/internal/tournament"
)

// authRateLimit is the per-IP limit on sign-in and refresh calls. userRateLimit is the
// per-user limit on everything else: an open app polls every 10 s and pushes in batches, so
// 300 a minute is far above normal use and only stops a runaway or abusive client.
const (
	authRateLimit  = 20
	authRateWindow = time.Minute
	userRateLimit  = 300
	userRateWindow = time.Minute
)

// The Android app's package and its Play Store listing (public pages link to it).
const (
	androidPackage = "com.snooker.league"
	playStoreURL   = "https://play.google.com/store/apps/details?id=" + androidPackage
)

// liveOrigins are the web app hosts allowed to open the live socket (phones send no Origin).
var liveOrigins = []string{"snookit.expo.app", "*.snookit.expo.app", "localhost:*", "snookit.duckdns.org"}

// NewRouter wires every module and returns the full HTTP handler.
func NewRouter(cfg config.Config, pool *pgxpool.Pool) http.Handler {
	issuer := auth.NewTokenIssuer(cfg.JWTSigningKey, cfg.AccessTokenTTL)
	authSvc := auth.NewService(
		auth.NewPGUsers(pool), auth.NewPGSessions(pool),
		auth.NewIDTokenVerifier(cfg.GoogleWebClientID, cfg.GoogleAndroidClients),
		issuer, cfg.RefreshTokenTTL, cfg.RefreshGrace,
	)
	authHandler := auth.NewHandler(authSvc)
	syncSvc := sync.NewService(sync.NewPGStore(pool))
	syncSvc.SetClaims(sync.NewPGClaims(pool))
	hub := live.NewHub()
	syncSvc.SetPublisher(hub)
	liveHandler := live.NewHandler(hub, authSvc, syncSvc, liveOrigins)
	statsRepo := stats.NewPGRepository(pool)
	communityRepo := community.NewPGRepository(pool)
	communitySvc := community.NewService(communityRepo, statsRepo)
	communitySvc.SetNotifier(push.NewSender(communityRepo, cfg.ExpoPushAccessToken))
	syncHandler := sync.NewHandler(syncSvc)
	communityHandler := community.NewHandler(communitySvc)
	statsHandler := stats.NewHandler(statsRepo, syncSvc)
	publicHandler := public.NewHandler(public.Config{
		BaseURL:             cfg.PublicBaseURL,
		AppURL:              playStoreURL,
		SupportEmail:        cfg.SupportEmail,
		AndroidPackage:      androidPackage,
		AndroidFingerprints: cfg.AndroidCertSHA256,
	}, syncSvc, communitySvc, tournament.NewPublicPages(syncSvc), public.NewPGRemovals(pool))
	accountHandler := account.NewHandler(account.NewService(authSvc, syncSvc, communitySvc), cfg.SupportEmail)
	authLimiter := httpx.NewRateLimiter(authRateLimit, authRateWindow)
	userLimiter := httpx.NewRateLimiter(userRateLimit, userRateWindow)

	r := chi.NewRouter()
	r.Use(httpx.RequestIDMiddleware, httpx.Recoverer)
	r.Get("/healthz", healthHandler(pool))
	accountHandler.PublicRoutes(r)
	publicHandler.Routes(r)
	r.Route("/v1", func(v1 chi.Router) {
		v1.Get("/config", configHandler(cfg))
		liveHandler.Routes(v1)
		v1.Group(func(public chi.Router) {
			public.Use(authLimiter.Middleware)
			authHandler.PublicRoutes(public)
		})
		v1.Group(func(protected chi.Router) {
			protected.Use(authHandler.Middleware)
			protected.Use(userLimiter.MiddlewareBy(func(r *http.Request) string {
				claims, _ := auth.ClaimsFrom(r.Context())
				return claims.Subject
			}))
			authHandler.ProtectedRoutes(protected)
			syncHandler.ProtectedRoutes(protected)
			communityHandler.ProtectedRoutes(protected)
			accountHandler.ProtectedRoutes(protected)
			statsHandler.ProtectedRoutes(protected)
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

// RunWorkers starts the background jobs and blocks until ctx ends.
func RunWorkers(ctx context.Context, pool *pgxpool.Pool) {
	statsRepo := stats.NewPGRepository(pool)
	profiles := community.NewPGRepository(pool)
	stats.NewWorker(statsRepo, profiles, statsRepo, profiles).Run(ctx)
}
