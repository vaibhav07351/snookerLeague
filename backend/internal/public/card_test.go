package public

import (
	"bytes"
	"context"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/image/font"

	"github.com/vaibhav/snookit-server/internal/community"
)

func resultsRouter() http.Handler {
	r := chi.NewRouter()
	resultsHandler().Routes(r)
	return r
}

func TestResultCardIsALinkPreviewSizedPNG(t *testing.T) {
	for _, path := range []string{"/m/m1/card.png", "/r/r1/card.png", "/g/g1/card.png"} {
		rec := httptest.NewRecorder()
		resultsRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "image/png" {
			t.Fatalf("%s: status %d, type %q", path, rec.Code, rec.Header().Get("Content-Type"))
		}
		img, err := png.Decode(bytes.NewReader(rec.Body.Bytes()))
		if err != nil {
			t.Fatalf("%s: not a PNG: %v", path, err)
		}
		if b := img.Bounds(); b.Dx() != cardW || b.Dy() != cardH {
			t.Fatalf("%s: size %v", path, b)
		}
		// SNOOKIT_CARD_DIR=<folder> saves the cards to look at them.
		if dir := os.Getenv("SNOOKIT_CARD_DIR"); dir != "" {
			name := strings.ReplaceAll(strings.Trim(path, "/"), "/", "_")
			if err := os.WriteFile(filepath.Join(dir, name), rec.Body.Bytes(), 0o600); err != nil {
				t.Fatalf("save card: %v", err)
			}
		}
	}
	rec := httptest.NewRecorder()
	resultsRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/m/missing/card.png", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("missing game: status %d", rec.Code)
	}
}

func TestResultPageLinksItsCardAndStaysOutOfSearch(t *testing.T) {
	rec := httptest.NewRecorder()
	resultsRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/m/m1", nil))
	body := rec.Body.String()
	if !strings.Contains(body, `content="https://example.test/m/m1/card.png?v=`) {
		t.Fatalf("og:image must point at the generated card:\n%s", body)
	}
	if !strings.Contains(body, `<meta name="robots" content="noindex">`) {
		t.Fatal("shared results are kept out of search results")
	}
}

func TestLongNamesAreCutToFit(t *testing.T) {
	fonts, err := cardFonts()
	if err != nil {
		t.Fatal(err)
	}
	c := &canvas{fonts: fonts, faces: map[[2]int]font.Face{}}
	defer c.close()
	face, err := c.face(true, 40)
	if err != nil {
		t.Fatal(err)
	}
	long := "Maximilian Bartholomew-Fitzgerald the Third"
	got := fitWidth(face, long, 300)
	if !strings.HasSuffix(got, "...") || font.MeasureString(face, got).Ceil() > 300 {
		t.Fatalf("not cut to fit: %q", got)
	}
	if fitWidth(face, "Amit K.", 300) != "Amit K." {
		t.Fatal("a short name is left alone")
	}
}

type fakeCities []community.CityEntry

func (f fakeCities) PublicCities(context.Context, int) ([]community.CityEntry, error) { return f, nil }

func TestSitemapListsFixedPagesAndCities(t *testing.T) {
	h := resultsHandler()
	h.SetCities(fakeCities{{ID: "pune", UpdatedAt: time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)}})
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))
	body := rec.Body.String()
	for _, want := range []string{
		"<loc>https://example.test/privacy</loc>",
		"<loc>https://example.test/c/pune</loc>",
		"<lastmod>2026-11-01</lastmod>",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("sitemap misses %s:\n%s", want, body)
		}
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	robots := rec.Body.String()
	if !strings.Contains(robots, "Disallow: /v1/") || !strings.Contains(robots, "Sitemap: https://example.test/sitemap.xml") {
		t.Fatalf("robots.txt:\n%s", robots)
	}
}
