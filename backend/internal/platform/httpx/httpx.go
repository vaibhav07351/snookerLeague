// Package httpx holds small HTTP helpers shared by every handler: typed errors,
// JSON responses, request ids, panic recovery and rate limiting.
package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// maxBodyBytes caps every request body.
const maxBodyBytes = 1 << 20

// APIError is the structured failure shape returned to clients: { code, message }.
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string { return e.Code + ": " + e.Message }

// Common errors, shared so handlers and tests compare against one definition.
var (
	ErrUnauthorized = &APIError{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "Sign in again."}
	ErrForbidden    = &APIError{Status: http.StatusForbidden, Code: "forbidden", Message: "You can't do that."}
	ErrNotFound     = &APIError{Status: http.StatusNotFound, Code: "not_found", Message: "Not found."}
	ErrRateLimited  = &APIError{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: "Too many requests. Try again shortly."}
)

// BadRequest builds a 400 with a caller-supplied message.
func BadRequest(message string) *APIError {
	return &APIError{Status: http.StatusBadRequest, Code: "bad_request", Message: message}
}

// WriteJSON writes a JSON body with a status code.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("write response", "error", err)
	}
}

// WriteError maps any error to a response. Unknown errors become a generic 500 and are logged.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		WriteJSON(w, apiErr.Status, apiErr)
		return
	}
	slog.Error("unhandled error", "error", err, "request_id", RequestID(r.Context()))
	WriteJSON(w, http.StatusInternalServerError, &APIError{Code: "internal", Message: "Something went wrong."})
}

// DecodeJSON reads a size-limited JSON body and rejects unknown fields.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return BadRequest("Invalid request body.")
	}
	return nil
}

type ctxKey string

const requestIDKey ctxKey = "request_id"

// RequestID returns the id attached by the RequestIDMiddleware.
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

// RequestIDMiddleware tags each request with an id for logs and the X-Request-Id header.
func RequestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 8)
		_, _ = rand.Read(buf)
		id := hex.EncodeToString(buf)
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, id)))
	})
}

// Recoverer turns a panic into a logged 500 instead of dropping the connection.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic", "value", rec, "request_id", RequestID(r.Context()))
				WriteError(w, r, errors.New("panic"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// RateLimiter is a fixed-window limiter keyed by client IP.
type RateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	buckets map[string]*bucket
	now     func() time.Time
}

type bucket struct {
	count   int
	resetAt time.Time
}

// NewRateLimiter allows `limit` requests per `window` for each key.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{limit: limit, window: window, buckets: map[string]*bucket{}, now: time.Now}
}

// Allow reports whether the key may make another request now.
func (l *RateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.buckets) > 10000 { // bound memory: drop expired windows
		for k, b := range l.buckets {
			if now.After(b.resetAt) {
				delete(l.buckets, k)
			}
		}
	}
	b, ok := l.buckets[key]
	if !ok || now.After(b.resetAt) {
		l.buckets[key] = &bucket{count: 1, resetAt: now.Add(l.window)}
		return true
	}
	if b.count >= l.limit {
		return false
	}
	b.count++
	return true
}

// Middleware rejects requests over the limit with 429.
func (l *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.Allow(ClientIP(r)) {
			WriteError(w, r, ErrRateLimited)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ClientIP is the caller's address. The API is only reachable through Caddy (no published
// port), which appends the real peer address as the LAST X-Forwarded-For entry. Earlier
// entries are client-supplied and ignored. Without the header (direct access in tests or
// local runs) the socket address is used.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if last := strings.TrimSpace(parts[len(parts)-1]); last != "" {
			return last
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
