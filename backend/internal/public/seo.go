package public

import (
	"context"
	"encoding/xml"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/vaibhav/snookit-server/internal/community"
)

// CityLister lists the cities that have a public ranking page.
type CityLister interface {
	PublicCities(ctx context.Context, limit int) ([]community.CityEntry, error)
}

// SetCities connects the city list the sitemap needs (nil leaves only the fixed pages).
func (h *Handler) SetCities(c CityLister) { h.cities = c }

// maxSitemapCities keeps the sitemap far below the 50,000 URL limit of one file.
const maxSitemapCities = 5000

// robots answers /robots.txt. Search engines may read the public pages, but not the API or
// one-off claim links. Shared results stay reachable for link previews; they carry a noindex
// tag instead (see view.NoIndex), because some preview fetchers obey robots.txt.
func (h *Handler) robots(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, err := fmt.Fprintf(w, "User-agent: *\nDisallow: /v1/\nDisallow: /claim/\nDisallow: /remove-request\nAllow: /\n\nSitemap: %s/sitemap.xml\n", h.cfg.BaseURL)
	if err != nil {
		slog.Error("write robots.txt", "error", err)
	}
}

type sitemapURL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

type urlSet struct {
	XMLName xml.Name     `xml:"urlset"`
	NS      string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

// sitemap answers /sitemap.xml: the fixed pages and every city ranking page. Player, result
// and tournament pages are left out on purpose: they are shared by link, not advertised.
func (h *Handler) sitemap(w http.ResponseWriter, r *http.Request) {
	set := urlSet{NS: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	for _, p := range []string{"/terms", "/privacy", "/delete-account"} {
		set.URLs = append(set.URLs, sitemapURL{Loc: h.cfg.BaseURL + p})
	}
	if h.cities != nil {
		cities, err := h.cities.PublicCities(r.Context(), maxSitemapCities)
		if err != nil {
			slog.Error("sitemap cities", "error", err)
			http.Error(w, "Try again later.", http.StatusServiceUnavailable)
			return
		}
		for _, c := range cities {
			set.URLs = append(set.URLs, sitemapURL{
				Loc:     h.cfg.BaseURL + "/c/" + url.PathEscape(c.ID),
				LastMod: c.UpdatedAt.UTC().Format(time.DateOnly),
			})
		}
	}
	body, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		slog.Error("encode sitemap", "error", err)
		http.Error(w, "Try again later.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if _, err := w.Write(append([]byte(xml.Header), body...)); err != nil {
		slog.Error("write sitemap", "error", err)
	}
}
