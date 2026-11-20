package events

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// Handler exposes POST /v1/events for the events the app records itself.
type Handler struct{ svc *Service }

// NewHandler builds the HTTP layer for events.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ProtectedRoutes mounts the route (the caller wraps it in auth middleware).
func (h *Handler) ProtectedRoutes(r chi.Router) {
	r.Post("/events", h.record)
}

func (h *Handler) record(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.ClaimsFrom(r.Context())
	var in ClientEvent
	if err := httpx.DecodeJSON(w, r, &in); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.svc.RecordFromClient(r.Context(), claims.Subject, in); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
