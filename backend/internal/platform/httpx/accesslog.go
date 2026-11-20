package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// userSlot is filled in by the auth middleware deeper in the chain, so the access log (which
// wraps everything) can name the signed-in user once the request is done.
type userSlot struct{ id string }

const userSlotKey ctxKey = "user_slot"

// SetUserID records the signed-in user for the access log. Safe to call without the
// AccessLog middleware (it then does nothing).
func SetUserID(ctx context.Context, userID string) {
	if slot, ok := ctx.Value(userSlotKey).(*userSlot); ok {
		slot.id = userID
	}
}

// AccessLog writes one log line per request: request id, method, route, status, size, time
// taken and the signed-in user id. It logs the route PATTERN (for example /claim/{token}),
// never the raw path, so tokens and ids in URLs stay out of the logs. Health checks are not
// logged: an uptime monitor calls them every few minutes and they would drown the rest.
func AccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		slot := &userSlot{}
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		r = r.WithContext(context.WithValue(r.Context(), userSlotKey, slot))
		next.ServeHTTP(ww, r)

		status := ww.Status()
		if status == 0 { // nothing written: net/http sends 200
			status = http.StatusOK
		}
		level := slog.LevelInfo
		if status >= http.StatusInternalServerError {
			level = slog.LevelError
		} else if status >= http.StatusBadRequest {
			level = slog.LevelWarn
		}
		slog.Log(r.Context(), level, "request",
			"request_id", RequestID(r.Context()),
			"method", r.Method,
			"route", routePattern(r),
			"status", status,
			"bytes", ww.BytesWritten(),
			"ms", time.Since(start).Milliseconds(),
			"user_id", slot.id,
		)
	})
}

// routePattern is chi's matched pattern, or "unmatched" for a path no route knows.
func routePattern(r *http.Request) string {
	if rc := chi.RouteContext(r.Context()); rc != nil {
		if p := rc.RoutePattern(); p != "" {
			return p
		}
	}
	return "unmatched"
}
