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
	r.Get("/invites/{code}", h.previewInvite)
	r.Post("/leagues/join", h.joinByCode)
	r.Post("/leagues/{leagueID}/leave", h.leave)
	r.Post("/cities/{cityID}/join", h.joinCityHub)
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
	var page PullPage
	if league := r.URL.Query().Get("league"); league != "" {
		page, err = h.svc.PullLeague(r.Context(), claims.Subject, league, int64(since), limit)
	} else {
		page, err = h.svc.Pull(r.Context(), claims.Subject, int64(since), limit)
	}
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

func (h *Handler) previewInvite(w http.ResponseWriter, r *http.Request) {
	preview, err := h.svc.PreviewInvite(r.Context(), chi.URLParam(r, "code"))
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, preview)
}

type joinRequest struct {
	Code string `json:"code"`
}

type cityJoinRequest struct {
	CityName string `json:"cityName"`
}

type leagueResponse struct {
	League Doc `json:"league"`
}

func (h *Handler) joinByCode(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	var req joinRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	league, err := h.svc.JoinByCode(r.Context(), claims.Subject, req.Code)
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, leagueResponse{League: league})
}

func (h *Handler) leave(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	league, err := h.svc.Leave(r.Context(), claims.Subject, chi.URLParam(r, "leagueID"))
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, leagueResponse{League: league})
}

func (h *Handler) joinCityHub(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	var req cityJoinRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	league, err := h.svc.JoinCityHub(r.Context(), claims.Subject, chi.URLParam(r, "cityID"), req.CityName)
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, leagueResponse{League: league})
}

// asAPIError maps service errors to client-facing ones; everything else stays internal.
func asAPIError(err error) error {
	switch {
	case errors.Is(err, ErrBadRequest):
		return httpx.BadRequest(err.Error())
	case errors.Is(err, ErrInviteNotFound):
		return &httpx.APIError{Status: http.StatusNotFound, Code: "invite_not_found",
			Message: "That invite code is not valid any more. Ask for a fresh link."}
	case errors.Is(err, ErrNotMember):
		return &httpx.APIError{Status: http.StatusForbidden, Code: "not_member",
			Message: "You are not in this league."}
	case errors.Is(err, ErrOwnerCantLeave):
		return &httpx.APIError{Status: http.StatusConflict, Code: "owner_cant_leave",
			Message: "The owner can't leave their own league. Delete it instead."}
	}
	return err
}
