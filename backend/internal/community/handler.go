package community

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// Handler exposes the community endpoints. All routes need a signed-in user.
type Handler struct {
	svc *Service
}

// NewHandler builds the HTTP layer for the community service.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ProtectedRoutes mounts the community routes (the caller wraps them in auth middleware).
func (h *Handler) ProtectedRoutes(r chi.Router) {
	r.Get("/community/{kind}", h.list)
	r.Get("/community/{kind}/{id}", h.get)
	r.Put("/community/{kind}/{id}", h.put)
	r.Delete("/community/{kind}/{id}", h.del)
}

func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	kind, err := ParseKind(chi.URLParam(r, "kind"))
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	var body json.RawMessage
	if err := httpx.DecodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.svc.Put(r.Context(), claims.Subject, kind, chi.URLParam(r, "id"), body); err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	kind, err := ParseKind(chi.URLParam(r, "kind"))
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	data, err := h.svc.Get(r.Context(), claims.Subject, kind, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, data)
}

func (h *Handler) del(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	kind, err := ParseKind(chi.URLParam(r, "kind"))
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	if err := h.svc.Delete(r.Context(), claims.Subject, kind, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	kind, err := ParseKind(chi.URLParam(r, "kind"))
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	q := r.URL.Query()
	limit := 0
	if raw := q.Get("limit"); raw != "" {
		if limit, err = strconv.Atoi(raw); err != nil {
			httpx.WriteError(w, r, httpx.BadRequest("limit must be a number."))
			return
		}
	}
	page, err := h.svc.List(r.Context(), claims.Subject, kind, ListParams{
		City: q.Get("city"), SubKind: q.Get("subKind"), Owner: q.Get("owner"),
		Subject: q.Get("subject"), Box: q.Get("box"), Cursor: q.Get("cursor"), Limit: limit,
	})
	if err != nil {
		httpx.WriteError(w, r, asAPIError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, page)
}

// asAPIError maps service errors to client-facing ones; everything else stays internal.
func asAPIError(err error) error {
	switch {
	case errors.Is(err, ErrBadRequest):
		return httpx.BadRequest(err.Error())
	case errors.Is(err, ErrNotFound):
		return httpx.ErrNotFound
	case errors.Is(err, ErrForbidden):
		return httpx.ErrForbidden
	case errors.Is(err, ErrTermsRequired):
		return &httpx.APIError{Status: http.StatusForbidden, Code: "terms_required",
			Message: "Accept the community rules before posting."}
	case errors.Is(err, ErrTooManyPosts):
		return &httpx.APIError{Status: http.StatusTooManyRequests, Code: "too_many_posts",
			Message: "You have reached today's limit. Try again tomorrow."}
	}
	return err
}
