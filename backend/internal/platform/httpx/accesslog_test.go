package httpx

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// captureLogs points the default logger at a buffer for one test.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func TestAccessLogNamesRouteUserAndStatusButNotThePath(t *testing.T) {
	logs := captureLogs(t)
	r := chi.NewRouter()
	r.Use(RequestIDMiddleware, AccessLog)
	r.Get("/claim/{token}", func(w http.ResponseWriter, r *http.Request) {
		SetUserID(r.Context(), "u_123")
		WriteJSON(w, http.StatusCreated, map[string]string{"ok": "yes"})
	})

	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/claim/secret-token", nil))

	var line map[string]any
	if err := json.Unmarshal(logs.Bytes(), &line); err != nil {
		t.Fatalf("one JSON log line expected, got %q: %v", logs.String(), err)
	}
	if line["route"] != "/claim/{token}" || line["user_id"] != "u_123" || line["status"] != float64(201) {
		t.Fatalf("unexpected log line: %v", line)
	}
	if line["request_id"] == "" || line["request_id"] == nil {
		t.Fatalf("request id missing: %v", line)
	}
	if strings.Contains(logs.String(), "secret-token") {
		t.Fatal("the raw path (with its token) must never be logged")
	}
}

func TestAccessLogSkipsHealthChecksAndMarksServerErrors(t *testing.T) {
	logs := captureLogs(t)
	r := chi.NewRouter()
	r.Use(AccessLog)
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	r.Get("/boom", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) })

	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if logs.Len() != 0 {
		t.Fatalf("health checks are not logged, got %q", logs.String())
	}
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/boom", nil))
	if !strings.Contains(logs.String(), `"level":"ERROR"`) {
		t.Fatalf("a 500 is logged as an error, got %q", logs.String())
	}
}
