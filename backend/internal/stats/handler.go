package stats

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// MembershipChecker tells whether a user may see a league's numbers.
type MembershipChecker interface {
	IsMember(ctx context.Context, leagueID, userID string) (bool, error)
}

// Handler exposes the server's standings.
type Handler struct {
	repo    Repository
	members MembershipChecker
}

// NewHandler builds the HTTP layer for standings.
func NewHandler(repo Repository, members MembershipChecker) *Handler {
	return &Handler{repo: repo, members: members}
}

// ProtectedRoutes mounts the standings route (the caller wraps it in auth middleware).
func (h *Handler) ProtectedRoutes(r chi.Router) {
	r.Get("/leagues/{leagueID}/standings", h.standings)
}

func (h *Handler) standings(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	leagueID := chi.URLParam(r, "leagueID")
	ok, err := h.members.IsMember(r.Context(), leagueID, claims.Subject)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if !ok {
		httpx.WriteError(w, r, httpx.ErrForbidden)
		return
	}
	limit, offset, err := pageParams(r)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	rows, err := h.repo.Standings(r.Context(), leagueID, limit+1, offset)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"standings": rows, "hasMore": hasMore})
}

const (
	defaultPage = 100
	maxPage     = 500
)

// pageParams reads ?limit= and ?offset= (standings are small, so plain offsets are fine).
func pageParams(r *http.Request) (limit, offset int, err error) {
	limit, offset = defaultPage, 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if limit, err = strconv.Atoi(raw); err != nil || limit < 1 {
			return 0, 0, httpx.BadRequest("limit must be a positive number.")
		}
	}
	if raw := r.URL.Query().Get("offset"); raw != "" {
		if offset, err = strconv.Atoi(raw); err != nil || offset < 0 {
			return 0, 0, httpx.BadRequest("offset must be zero or more.")
		}
	}
	return min(limit, maxPage), offset, nil
}
