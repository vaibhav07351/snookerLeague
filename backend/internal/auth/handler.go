package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

type ctxKey struct{}

// Handler exposes the auth endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds the HTTP layer for the auth service.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// PublicRoutes mounts routes that need no token (the caller rate-limits them).
func (h *Handler) PublicRoutes(r chi.Router) {
	r.Post("/auth/google", h.signIn)
	r.Post("/auth/refresh", h.refresh)
}

// ProtectedRoutes mounts routes that need a valid access token.
func (h *Handler) ProtectedRoutes(r chi.Router) {
	r.Post("/auth/logout", h.logout)
	r.Get("/me", h.me)
}

type signInRequest struct {
	IDToken string `json:"idToken"`
}

type signInResponse struct {
	User  User      `json:"user"`
	Token TokenPair `json:"tokens"`
}

func (h *Handler) signIn(w http.ResponseWriter, r *http.Request) {
	var req signInRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if req.IDToken == "" {
		httpx.WriteError(w, r, httpx.BadRequest("idToken is required."))
		return
	}
	user, pair, err := h.svc.SignInWithGoogle(r.Context(), req.IDToken)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, signInResponse{User: user, Token: pair})
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	pair, err := h.svc.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, pair)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	claims, _ := ClaimsFrom(r.Context())
	if err := h.svc.Logout(r.Context(), claims.SessionID); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	claims, _ := ClaimsFrom(r.Context())
	user, err := h.svc.Me(r.Context(), claims.Subject)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, user)
}

// Middleware requires a valid Bearer access token and stores its claims on the context.
func (h *Handler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			httpx.WriteError(w, r, httpx.ErrUnauthorized)
			return
		}
		claims, err := h.svc.Authenticate(r.Context(), token)
		if err != nil {
			httpx.WriteError(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, claims)))
	})
}

// ClaimsFrom returns the authenticated claims set by Middleware.
func ClaimsFrom(ctx context.Context) (Claims, bool) {
	claims, ok := ctx.Value(ctxKey{}).(Claims)
	return claims, ok
}
