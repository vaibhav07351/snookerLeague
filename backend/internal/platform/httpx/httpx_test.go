package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterBlocksOverLimitAndResetsAfterWindow(t *testing.T) {
	now := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	l := NewRateLimiter(2, time.Minute)
	l.now = func() time.Time { return now }

	if !l.Allow("a") || !l.Allow("a") {
		t.Fatal("first two requests must pass")
	}
	if l.Allow("a") {
		t.Fatal("third request in the window must be blocked")
	}
	if !l.Allow("b") {
		t.Fatal("limits are per key")
	}
	now = now.Add(61 * time.Second)
	if !l.Allow("a") {
		t.Fatal("window must reset")
	}
}

func TestClientIPUsesLastForwardedEntryOnly(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "172.18.0.2:5555"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 203.0.113.7")
	if got := ClientIP(r); got != "203.0.113.7" {
		t.Fatalf("client-supplied entries must be ignored, got %s", got)
	}
	r.Header.Del("X-Forwarded-For")
	if got := ClientIP(r); got != "172.18.0.2" {
		t.Fatalf("falls back to the socket address, got %s", got)
	}
}

func TestWriteErrorHidesInternalDetails(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, httptest.NewRequest(http.MethodGet, "/", nil), http.ErrAbortHandler)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
	if body := rec.Body.String(); len(body) == 0 || contains(body, "abort") {
		t.Fatalf("internal error text must not leak: %s", body)
	}
}

func TestRecovererTurnsPanicInto500(t *testing.T) {
	h := Recoverer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func TestMiddlewareByCountsPerKey(t *testing.T) {
	l := NewRateLimiter(1, time.Minute)
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := l.MiddlewareBy(func(r *http.Request) string { return r.Header.Get("X-User") })(ok)
	call := func(user string) int {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-User", user)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if call("a") != http.StatusOK || call("b") != http.StatusOK {
		t.Fatal("each user gets their own allowance")
	}
	if call("a") != http.StatusTooManyRequests {
		t.Fatal("a second request from the same user must be limited")
	}
}
