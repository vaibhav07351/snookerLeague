package public

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

type fakeMinors map[string]bool

func (f fakeMinors) MinorUIDs(_ context.Context, uids []string) (map[string]bool, error) {
	out := map[string]bool{}
	for _, u := range uids {
		if f[u] {
			out[u] = true
		}
	}
	return out, nil
}

func card(id, name, uid string) syncmod.Doc {
	data, _ := json.Marshal(map[string]string{"displayName": name, "authUid": uid})
	return syncmod.Doc{Entity: syncmod.EntityPlayer, ID: id, Data: data}
}

func TestUnder18NamesNeverAppearOnPublicPages(t *testing.T) {
	names, err := CardNames(context.Background(), fakeMinors{"kid": true}, []syncmod.Doc{
		card("c1", "Rahul Sharma", "adult"),
		card("c2", "Aarav Mehta", "kid"),
		card("c3", "Guest Person", ""),
	})
	if err != nil {
		t.Fatalf("names: %v", err)
	}
	want := map[string]string{"c1": "Rahul S.", "c2": "Player", "c3": "Guest P."}
	for id, w := range want {
		if names[id] != w {
			t.Errorf("%s: got %q, want %q", id, names[id], w)
		}
	}
}

func TestPublicPagesSendSecurityHeaders(t *testing.T) {
	h := NewHandler(Config{}, nil, nil, nil, nil, fakeMinors{})
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/terms", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	for _, header := range []string{"Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"} {
		if rec.Header().Get(header) == "" {
			t.Errorf("missing %s", header)
		}
	}
}
