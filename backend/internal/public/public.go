// Package public serves the pages anyone can open without the app: shared match, player,
// city and tournament pages (with WhatsApp-friendly previews), the community rules, privacy
// policy, "This is me, remove it" requests, and Android App Links verification.
//
// Privacy on these pages: names are shortened ("Rahul S."), no photos are shown, under-18
// players never appear (their profiles are not on city boards), and anyone can ask for a
// name to be removed.
package public

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/community"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

//go:embed static/logo.png
var static embed.FS

// MatchSource loads a match with its league and player cards.
type MatchSource interface {
	PublicMatch(ctx context.Context, matchID string) (match, league syncmod.Doc, players []syncmod.Doc, err error)
}

// ProfileSource reads public profiles.
type ProfileSource interface {
	Get(ctx context.Context, userID string, kind community.Kind, id string) (json.RawMessage, error)
	List(ctx context.Context, userID string, kind community.Kind, p community.ListParams) (community.Page, error)
}

// TournamentSource builds a tournament's public bracket ("" name means not found).
type TournamentSource interface {
	PublicBracket(ctx context.Context, tournamentID string) (Bracket, error)
}

// RemovalStore keeps "This is me, remove it" requests for review.
type RemovalStore interface {
	SaveRemovalRequest(ctx context.Context, target, message string) error
}

// Config holds the settings the pages need.
type Config struct {
	BaseURL             string   // e.g. https://snookit.duckdns.org
	AppURL              string   // where the "get the app" buttons go
	SupportEmail        string   // shown for account and removal questions ("" hides it)
	AndroidPackage      string   // e.g. com.snooker.league
	AndroidFingerprints []string // SHA-256 signing cert fingerprints for App Links
}

// Handler serves the public pages.
type Handler struct {
	cfg        Config
	matches    MatchSource
	profiles   ProfileSource
	tournament TournamentSource
	removals   RemovalStore
	limiter    *httpx.RateLimiter
}

// NewHandler builds the public pages handler.
func NewHandler(cfg Config, m MatchSource, p ProfileSource, t TournamentSource, r RemovalStore) *Handler {
	return &Handler{cfg: cfg, matches: m, profiles: p, tournament: t, removals: r,
		limiter: httpx.NewRateLimiter(5, time.Hour)}
}

// Routes mounts the pages at the site root.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/m/{id}", h.match)
	r.Get("/p/{uid}", h.player)
	r.Get("/c/{city}", h.city)
	r.Get("/t/{id}", h.tournamentPage)
	r.Get("/claim/{token}", h.claimPage)
	r.Get("/terms", h.terms)
	r.Get("/privacy", h.privacy)
	r.With(h.limiter.Middleware).Post("/remove-request", h.removeRequest)
	r.Get("/.well-known/assetlinks.json", h.assetLinks)
	r.Get("/static/logo.png", h.logo)
}

type view struct {
	Title       string
	Description string
	BaseURL     string
	URL         string
	AppURL      string
	Data        any
}

func (h *Handler) render(w http.ResponseWriter, status int, t *template.Template, v view) {
	v.BaseURL, v.AppURL = h.cfg.BaseURL, h.cfg.AppURL
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Public pages may be cached briefly; scores change, so not for long.
	w.Header().Set("Cache-Control", "public, max-age=60")
	w.WriteHeader(status)
	if err := t.ExecuteTemplate(w, "layout", v); err != nil {
		slog.Error("render public page", "error", err)
	}
}

func (h *Handler) notFound(w http.ResponseWriter) {
	h.render(w, http.StatusNotFound, messagePage, view{Title: "Not found - Snookit",
		Data: message{Heading: "Nothing here", Paragraphs: []string{"This page does not exist, or was removed."}}})
}

func (h *Handler) failed(w http.ResponseWriter, err error) {
	slog.Error("public page failed", "error", err)
	h.render(w, http.StatusInternalServerError, messagePage, view{Title: "Snookit",
		Data: message{Heading: "Something went wrong", Paragraphs: []string{"Try again in a moment."}}})
}

type message struct {
	Heading    string
	Paragraphs []string
}

// --- match ---

type matchDoc struct {
	ID             string   `json:"id"`
	TeamA          []string `json:"teamA"`
	TeamB          []string `json:"teamB"`
	NamedLabel     *string  `json:"namedLabel"`
	CrownsChampion bool     `json:"crownsChampion"`
	UpdatedAt      string   `json:"updatedAt"`
	Frames         []struct {
		TeamAPoints float64 `json:"teamAPoints"`
		TeamBPoints float64 `json:"teamBPoints"`
		Winner      string  `json:"winner"`
	} `json:"frames"`
	Outcome struct {
		Status      string `json:"status"`
		Winner      string `json:"winner"`
		ForfeitedBy string `json:"forfeitedBy"`
		FramesA     int    `json:"framesA"`
		FramesB     int    `json:"framesB"`
	} `json:"outcome"`
}

type frameRow struct {
	Number int
	A, B   int
	Winner string
}

type matchView struct {
	ID, Label, League, When, SideA, SideB, Winner, Status string
	FramesA, FramesB                                      int
	Live                                                  bool
	Frames                                                []frameRow
}

func (h *Handler) match(w http.ResponseWriter, r *http.Request) {
	m, league, players, err := h.matches.PublicMatch(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, syncmod.ErrNotFound) {
		h.notFound(w)
		return
	}
	if err != nil {
		h.failed(w, err)
		return
	}
	var doc matchDoc
	if err := json.Unmarshal(m.Data, &doc); err != nil {
		h.failed(w, fmt.Errorf("decode match: %w", err))
		return
	}
	names := map[string]string{}
	for _, p := range players {
		var card struct {
			DisplayName string `json:"displayName"`
		}
		if json.Unmarshal(p.Data, &card) == nil {
			names[p.ID] = ShortName(card.DisplayName)
		}
	}
	side := func(ids []string) string {
		var out []string
		for _, id := range ids {
			if n, ok := names[id]; ok {
				out = append(out, n)
			} else {
				out = append(out, "Player")
			}
		}
		return strings.Join(out, " & ")
	}
	var leagueDoc struct {
		Name string `json:"name"`
	}
	_ = json.Unmarshal(league.Data, &leagueDoc) // a missing name just shows nothing
	v := matchView{
		ID: m.ID, League: leagueDoc.Name, SideA: side(doc.TeamA), SideB: side(doc.TeamB),
		FramesA: doc.Outcome.FramesA, FramesB: doc.Outcome.FramesB, Live: doc.Outcome.Status == "in_progress",
		Label: "Snooker match",
	}
	if doc.NamedLabel != nil && *doc.NamedLabel != "" {
		v.Label = *doc.NamedLabel
	} else if doc.CrownsChampion {
		v.Label = "Title match"
	}
	if t, err := time.Parse(time.RFC3339Nano, doc.UpdatedAt); err == nil {
		v.When = t.In(indiaTime).Format("2 Jan 2006")
	}
	switch doc.Outcome.Status {
	case "completed":
		v.Winner = doc.Outcome.Winner
	case "forfeited":
		v.Winner = doc.Outcome.Winner
		v.Status = "Won by forfeit"
	}
	for i, f := range doc.Frames {
		v.Frames = append(v.Frames, frameRow{Number: i + 1, A: int(f.TeamAPoints), B: int(f.TeamBPoints), Winner: f.Winner})
	}
	title := fmt.Sprintf("%s %d - %d %s", v.SideA, v.FramesA, v.FramesB, v.SideB)
	h.render(w, http.StatusOK, matchPage, view{
		Title: title + " | Snookit", Description: v.Label + " on Snookit", URL: h.cfg.BaseURL + "/m/" + m.ID, Data: v,
	})
}

var indiaTime = time.FixedZone("IST", 5*60*60+30*60)

// --- player and city ---

type profileDoc struct {
	UID          string  `json:"uid"`
	DisplayName  string  `json:"displayName"`
	CityName     *string `json:"cityName"`
	Division     *string `json:"division"`
	Played       float64 `json:"played"`
	WinPct       float64 `json:"winPct"`
	Titles       float64 `json:"titles"`
	HighestBreak float64 `json:"highestBreak"`
	Centuries    float64 `json:"centuries"`
}

func (h *Handler) player(w http.ResponseWriter, r *http.Request) {
	raw, err := h.profiles.Get(r.Context(), "", community.KindProfile, chi.URLParam(r, "uid"))
	if errors.Is(err, community.ErrNotFound) {
		h.notFound(w)
		return
	}
	if err != nil {
		h.failed(w, err)
		return
	}
	var p profileDoc
	if err := json.Unmarshal(raw, &p); err != nil {
		h.failed(w, fmt.Errorf("decode profile: %w", err))
		return
	}
	if p.Division != nil && (*p.Division == "u16" || *p.Division == "u18") {
		h.notFound(w) // D5: no public page for under-18 players
		return
	}
	name := ShortName(p.DisplayName)
	city := ""
	if p.CityName != nil {
		city = *p.CityName
	}
	data := map[string]any{
		"Name": name, "City": city, "Division": divisionLabel(p.Division), "Played": int(p.Played),
		"WinPct": p.WinPct, "Titles": int(p.Titles), "HighestBreak": int(p.HighestBreak), "Centuries": int(p.Centuries),
	}
	h.render(w, http.StatusOK, playerPage, view{
		Title: name + " | Snookit", Description: fmt.Sprintf("%s plays snooker%s on Snookit.", name, inCity(city)),
		URL: h.cfg.BaseURL + "/p/" + p.UID, Data: data,
	})
}

func inCity(city string) string {
	if city == "" {
		return ""
	}
	return " in " + city
}

func divisionLabel(d *string) string {
	if d == nil {
		return ""
	}
	return map[string]string{"u21": "Under 21", "open": "Open", "masters": "Masters", "seniors": "Seniors"}[*d]
}

type cityRow struct {
	Rank      int
	UID, Name string
	Played    int
	WinPct    float64
}

func (h *Handler) city(w http.ResponseWriter, r *http.Request) {
	cityID := chi.URLParam(r, "city")
	page, err := h.profiles.List(r.Context(), "", community.KindProfile, community.ListParams{City: cityID, Limit: 50})
	if err != nil {
		h.failed(w, err)
		return
	}
	var rows []cityRow
	cityName := cityID
	for _, raw := range page.Items {
		var p profileDoc
		if json.Unmarshal(raw, &p) != nil || p.Played < 3 {
			continue
		}
		if p.CityName != nil && *p.CityName != "" {
			cityName = *p.CityName
		}
		rows = append(rows, cityRow{Rank: len(rows) + 1, UID: p.UID, Name: ShortName(p.DisplayName),
			Played: int(p.Played), WinPct: math.Round(p.WinPct*10) / 10})
	}
	h.render(w, http.StatusOK, cityPage, view{
		Title: "Best snooker players in " + cityName + " | Snookit", Description: "The city snooker ranking on Snookit.",
		URL: h.cfg.BaseURL + "/c/" + cityID, Data: map[string]any{"City": cityName, "Rows": rows},
	})
}

// --- tournament ---

func (h *Handler) tournamentPage(w http.ResponseWriter, r *http.Request) {
	if h.tournament == nil {
		h.notFound(w)
		return
	}
	b, err := h.tournament.PublicBracket(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, syncmod.ErrNotFound) {
		h.notFound(w)
		return
	}
	if err != nil {
		h.failed(w, err)
		return
	}
	h.render(w, http.StatusOK, tournamentPage, view{
		Title: b.Name + " | Snookit", Description: "Tournament bracket on Snookit.",
		URL: h.cfg.BaseURL + "/t/" + chi.URLParam(r, "id"), Data: b,
	})
}

// --- claim links ---

// claimPage is where a claim link lands when the app is not installed (with the app, Android
// App Links open the app straight away).
func (h *Handler) claimPage(w http.ResponseWriter, _ *http.Request) {
	h.render(w, http.StatusOK, messagePage, view{Title: "Claim your player - Snookit", Data: message{
		Heading: "Claim your player",
		Paragraphs: []string{
			"A friend added you to their Snookit league. Install Snookit, sign in with Google, then open this link again to take over your player card and its match history.",
			"Get Snookit: " + h.cfg.AppURL,
		},
	}})
}

// --- legal, removal, app links ---

func (h *Handler) terms(w http.ResponseWriter, _ *http.Request) {
	h.render(w, http.StatusOK, messagePage, view{Title: "Community rules - Snookit", Data: message{
		Heading: "Community rules",
		Paragraphs: append([]string{
			"Snookit is for people aged 13 and over. Players under 18 can use the app, but are never shown on public city boards or pages.",
			"Be respectful. No harassment, hate, threats, sexual content, spam or scams in posts, names or listings.",
			"Only record real matches, and only add other people with their agreement. Anyone can ask for their name to be removed from a public page.",
			"You can report a post or a player and block anyone from your profile screens. We review reports and remove content or accounts that break these rules.",
			"Posting is limited to a few posts a day to keep the community useful.",
		}, contact(h.cfg.SupportEmail)...),
	}})
}

func (h *Handler) privacy(w http.ResponseWriter, _ *http.Request) {
	h.render(w, http.StatusOK, messagePage, view{Title: "Privacy policy - Snookit", Data: message{
		Heading: "Privacy policy",
		Paragraphs: append([]string{
			"What we collect: your Google account name, email and photo when you sign in; your city if you set one; the leagues, players, matches, races and posts you create; and a push notification token for your phone if you allow notifications.",
			"What stays on your phone: your date of birth. Only your age band (for example Open or Masters) is shared, and only if you choose to.",
			"Why: to sync your leagues between phones, show scores and rankings, and let other players find, follow and challenge you.",
			"Who sees it: members of your leagues see that league's data. City boards and public pages show shortened names and stats, never emails, photos or anyone under 18. We do not sell your data or show ads.",
			"Where: on our server in India-region cloud hosting, with nightly backups kept for 7 days. Error reports (without your personal details) go to our error tracking service.",
			"Your choices: you can edit your profile, leave leagues, and delete your account and data at any time from Settings (see the delete account page). You can also ask us for a copy of your data.",
		}, contact(h.cfg.SupportEmail)...),
	}})
}

func contact(email string) []string {
	if email == "" {
		return nil
	}
	return []string{"Questions, removal requests and complaints (grievance contact under India's DPDP Act): " + email}
}

func (h *Handler) removeRequest(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024)
	if err := r.ParseForm(); err != nil {
		h.render(w, http.StatusBadRequest, messagePage, view{Title: "Snookit", Data: message{Heading: "That didn't work", Paragraphs: []string{"Please try again."}}})
		return
	}
	target := strings.TrimSpace(r.PostForm.Get("target"))
	msg := strings.TrimSpace(r.PostForm.Get("message"))
	if target == "" || len(target) > 200 || len(msg) > 500 {
		h.render(w, http.StatusBadRequest, messagePage, view{Title: "Snookit", Data: message{Heading: "That didn't work", Paragraphs: []string{"Please try again."}}})
		return
	}
	if err := h.removals.SaveRemovalRequest(r.Context(), target, msg); err != nil {
		h.failed(w, err)
		return
	}
	h.render(w, http.StatusOK, messagePage, view{Title: "Request sent - Snookit", Data: message{
		Heading:    "Request sent",
		Paragraphs: []string{"Thanks. We will remove the name within a few days."},
	}})
}

func (h *Handler) assetLinks(w http.ResponseWriter, _ *http.Request) {
	links := []map[string]any{}
	if h.cfg.AndroidPackage != "" && len(h.cfg.AndroidFingerprints) > 0 {
		links = append(links, map[string]any{
			"relation": []string{"delegate_permission/common.handle_all_urls"},
			"target": map[string]any{
				"namespace": "android_app", "package_name": h.cfg.AndroidPackage,
				"sha256_cert_fingerprints": h.cfg.AndroidFingerprints,
			},
		})
	}
	httpx.WriteJSON(w, http.StatusOK, links)
}

func (h *Handler) logo(w http.ResponseWriter, _ *http.Request) {
	raw, err := static.ReadFile("static/logo.png")
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = w.Write(raw) // the client may have gone; nothing useful to do about it
}
