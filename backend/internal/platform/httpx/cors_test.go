package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

var testCORSHosts = []string{"snookit.expo.app", "*.snookit.expo.app", "localhost:*"}

func serveCORS(t *testing.T, method, origin string, preflight bool) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	reached := false
	h := CORS(testCORSHosts)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(method, "/v1/auth/google", nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if preflight {
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		req.Header.Set("Access-Control-Request-Headers", "content-type")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, reached
}

func TestCORSAllowsKnownOrigins(t *testing.T) {
	for _, origin := range []string{
		"https://snookit.expo.app",
		"https://SNOOKIT.expo.app",
		"https://beta.snookit.expo.app",
		"http://localhost:8082",
	} {
		rec, reached := serveCORS(t, http.MethodPost, origin, false)
		if !reached {
			t.Fatalf("%s: request must reach the handler", origin)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Fatalf("%s: allow origin = %q", origin, got)
		}
	}
}

func TestCORSAnswersPreflightWithoutCallingHandler(t *testing.T) {
	rec, reached := serveCORS(t, http.MethodOptions, "https://snookit.expo.app", true)
	if reached {
		t.Fatal("preflight must not reach the handler")
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Methods") == "" || rec.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatal("preflight must list allowed methods and headers")
	}
}

func TestCORSIgnoresUnknownOrMissingOrigin(t *testing.T) {
	for _, origin := range []string{
		"https://evil.example",
		"https://snookit.expo.app.evil.example",
		"https://snookit--abc123.expo.app",
		"null",
		"ftp://snookit.expo.app",
	} {
		rec, reached := serveCORS(t, http.MethodOptions, origin, true)
		if !reached {
			t.Fatalf("%s: unknown origin must fall through to the router", origin)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("%s: must not get an allow header, got %q", origin, got)
		}
	}
	rec, reached := serveCORS(t, http.MethodPost, "", false)
	if !reached || rec.Header().Get("Access-Control-Allow-Origin") != "" || rec.Header().Get("Vary") != "" {
		t.Fatal("requests without Origin (the phone app) must pass through untouched")
	}
}

func TestCORSPanicsOnBadPattern(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected a panic for a malformed pattern")
		}
	}()
	CORS([]string{"[bad"})
}
