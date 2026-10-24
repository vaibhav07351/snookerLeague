package sync

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// Handler exposes the sync endpoints. All routes need a signed-in user.
type Handler struct {
	svc *Service
}

// NewHandler builds the HTTP layer for the sync service.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ProtectedRoutes mounts the sync routes (the caller wraps them in auth middleware).
func (h *Handler) ProtectedRoutes(r chi.Router) {
	r.Post("/sync/push", h.push)
	r.Get("/sync/pull", h.pull)
}

type pushRequest struct {
	Ops []Op `json:"ops"`
}

type pushResponse struct {
	Results []OpResult `json:"results"`
}

func (h *Handler) push(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	var req pushRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	results, err := h.svc.Push(r.Context(), claims.Subject, req.Ops)
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, pushResponse{Results: results})
}

func (h *Handler) pull(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	since, err := intParam(r, "since", 0)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	limit, err := intParam(r, "limit", 0)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	page, err := h.svc.Pull(r.Context(), claims.Subject, int64(since), limit)
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, page)
}

func intParam(r *http.Request, name string, fallback int) (int, error) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, httpx.BadRequest(name + " must be a number.")
	}
	return n, nil
}

// asAPIError maps service errors to client-facing ones; everything else stays internal.
func asAPIError(err error) error {
	if errors.Is(err, ErrBadRequest) {
		return httpx.BadRequest(err.Error())
	}
	return err
}
