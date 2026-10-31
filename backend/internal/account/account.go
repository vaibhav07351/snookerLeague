// Package account deletes a user's account and data on request (a Google Play requirement):
// DELETE /v1/me from the app, and a public /delete-account page explaining how.
package account

import (
	"context"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// Eraser removes one module's data for a user. Each step must be safe to repeat, so a
// deletion that fails half-way completes when the user tries again.
type Eraser interface {
	ForgetUser(ctx context.Context, userID string) error
}

// UserDeleter removes the account itself (sessions, memberships cascade with it).
type UserDeleter interface {
	DeleteAccount(ctx context.Context, userID string) error
}

// Service runs the deletion steps in order: league data, community data, then the account.
// The account goes last, so a failure part-way leaves the user signed in and able to retry.
type Service struct {
	erasers []Eraser
	users   UserDeleter
}

// NewService builds the account service.
func NewService(users UserDeleter, erasers ...Eraser) *Service {
	return &Service{erasers: erasers, users: users}
}

// Delete erases everything the user has and removes their account.
func (s *Service) Delete(ctx context.Context, userID string) error {
	for _, e := range s.erasers {
		if err := e.ForgetUser(ctx, userID); err != nil {
			return fmt.Errorf("erase user data: %w", err)
		}
	}
	if err := s.users.DeleteAccount(ctx, userID); err != nil {
		return fmt.Errorf("delete account: %w", err)
	}
	slog.Info("account deleted", "user", userID)
	return nil
}

// Handler exposes account deletion.
type Handler struct {
	svc          *Service
	supportEmail string
}

// NewHandler builds the HTTP layer. supportEmail is shown on the public page ("" hides it).
func NewHandler(svc *Service, supportEmail string) *Handler {
	return &Handler{svc: svc, supportEmail: supportEmail}
}

// ProtectedRoutes mounts DELETE /me (the caller wraps it in auth middleware).
func (h *Handler) ProtectedRoutes(r chi.Router) {
	r.Delete("/me", h.deleteMe)
}

// PublicRoutes mounts the public explanation page at /delete-account.
func (h *Handler) PublicRoutes(r chi.Router) {
	r.Get("/delete-account", h.page)
}

func (h *Handler) deleteMe(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	if err := h.svc.Delete(r.Context(), claims.Subject); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var pageTemplate = template.Must(template.New("delete").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delete your Snookit account</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#e8efe9;background:#071A10}a{color:#f2c14e}</style>
</head><body>
<h1>Delete your Snookit account</h1>
<p>You can delete your account and data at any time, from inside the app:</p>
<ol><li>Open Snookit and go to <b>Settings</b>.</li><li>Tap <b>Delete account</b> and confirm.</li></ol>
<p>What is deleted straight away: your account and sign-in, your profile, city, posts, directory
listings, follows and challenges, and every league you own (with all its matches and races).</p>
<p>What stays: matches you played in other people's leagues stay in their history, so their scores
remain correct, but your player card there is renamed "Deleted player" and is no longer linked to
you. Backups that contain your data are removed within 7 days.</p>
{{if .}}<p>Can't open the app? Email <a href="mailto:{{.}}">{{.}}</a> from the Google account you
signed in with, and we will delete it for you.</p>{{end}}
</body></html>`))

func (h *Handler) page(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := pageTemplate.Execute(w, h.supportEmail); err != nil {
		slog.Error("render delete-account page", "error", err)
	}
}
