package public

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/platform/httpx"
	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

// GameSource loads a match, race or free-for-all with its league and player cards.
type GameSource interface {
	PublicGame(ctx context.Context, entity syncmod.Entity, id string) (game, league syncmod.Doc, players []syncmod.Doc, err error)
}

// Result kinds, as they appear in result links and the JSON endpoint.
const (
	KindMatch = "match"
	KindRace  = "race"
	KindGroup = "group"
)

var kindEntity = map[string]syncmod.Entity{
	KindMatch: syncmod.EntityMatch,
	KindRace:  syncmod.EntityRace,
	KindGroup: syncmod.EntityGroupMatch,
}

// kindPath is the short public path of each kind: /m/<id>, /r/<id>, /g/<id>.
var kindPath = map[string]string{KindMatch: "/m/", KindRace: "/r/", KindGroup: "/g/"}

// FrameRow is one frame of a two-sided match.
type FrameRow struct {
	Number int    `json:"number"`
	A      int    `json:"a"`
	B      int    `json:"b"`
	Winner string `json:"winner"`
}

// StandingRow is one player in a race or free-for-all, best first.
type StandingRow struct {
	Place  string `json:"place"`
	Name   string `json:"name"`
	Detail string `json:"detail"`
	Winner bool   `json:"winner"`
}

// Result is a finished or live game as anyone may see it: short names, under-18 players
// shown as "Player". The same view feeds the public web page and the app's result screen
// for people outside the league.
type Result struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Label   string `json:"label"`
	Caption string `json:"caption"`
	League  string `json:"league"`
	When    string `json:"when"`
	// UpdatedAt is the server's time of the last change (ISO 8601 UTC).
	UpdatedAt string `json:"updatedAt"`
	Live      bool   `json:"live"`
	// Status is a note such as "Won by forfeit" ("" for a normal result).
	Status string `json:"status"`
	// Two-sided match only.
	SideA   string     `json:"sideA,omitempty"`
	SideB   string     `json:"sideB,omitempty"`
	FramesA int        `json:"framesA"`
	FramesB int        `json:"framesB"`
	Winner  string     `json:"winner,omitempty"`
	Frames  []FrameRow `json:"frames,omitempty"`
	// Race and free-for-all only.
	Standings []StandingRow `json:"standings,omitempty"`
}

// errBadKind marks a kind the endpoint does not know (answered as not found).
var errBadKind = errors.New("unknown result kind")

// loadResult builds the public view of one game.
func (h *Handler) loadResult(ctx context.Context, kind, id string) (Result, error) {
	entity, ok := kindEntity[kind]
	if !ok || h.games == nil {
		return Result{}, errBadKind
	}
	game, league, players, err := h.games.PublicGame(ctx, entity, id)
	if err != nil {
		return Result{}, err
	}
	names, err := CardNames(ctx, h.minors, players)
	if err != nil {
		return Result{}, err
	}
	nameOf := func(id string) string {
		if n, ok := names[id]; ok {
			return n
		}
		return hiddenName
	}
	var leagueDoc struct {
		Name string `json:"name"`
	}
	_ = json.Unmarshal(league.Data, &leagueDoc) // a missing name just shows nothing
	res := Result{Kind: kind, ID: game.ID, League: leagueDoc.Name,
		UpdatedAt: game.UpdatedAt.UTC().Format(time.RFC3339)}
	if !game.UpdatedAt.IsZero() {
		res.When = game.UpdatedAt.In(indiaTime).Format("2 Jan 2006")
	}
	switch kind {
	case KindMatch:
		err = fillMatch(&res, game.Data, nameOf)
	case KindRace:
		err = fillRace(&res, game.Data, nameOf)
	default:
		err = fillGroup(&res, game.Data, nameOf)
	}
	if err != nil {
		return Result{}, err
	}
	return res, nil
}

func labelOr(named *string, fallback string) string {
	if named != nil && strings.TrimSpace(*named) != "" {
		return *named
	}
	return fallback
}

func fillMatch(res *Result, data json.RawMessage, nameOf func(string) string) error {
	var doc struct {
		TeamA          []string `json:"teamA"`
		TeamB          []string `json:"teamB"`
		NamedLabel     *string  `json:"namedLabel"`
		CrownsChampion bool     `json:"crownsChampion"`
		BestOf         int      `json:"bestOf"`
		Frames         []struct {
			TeamAPoints float64 `json:"teamAPoints"`
			TeamBPoints float64 `json:"teamBPoints"`
			Winner      string  `json:"winner"`
		} `json:"frames"`
		Outcome struct {
			Status  string `json:"status"`
			Winner  string `json:"winner"`
			FramesA int    `json:"framesA"`
			FramesB int    `json:"framesB"`
		} `json:"outcome"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return fmt.Errorf("decode match: %w", err)
	}
	side := func(ids []string) string {
		out := make([]string, 0, len(ids))
		for _, id := range firstIDs(ids, 2) {
			out = append(out, nameOf(id))
		}
		return strings.Join(out, " & ")
	}
	fallback := "Snooker match"
	if doc.CrownsChampion {
		fallback = "Title match"
	}
	res.Label = labelOr(doc.NamedLabel, fallback)
	if doc.BestOf > 0 {
		res.Caption = "Best of " + strconv.Itoa(doc.BestOf)
	}
	res.SideA, res.SideB = side(doc.TeamA), side(doc.TeamB)
	res.FramesA, res.FramesB = doc.Outcome.FramesA, doc.Outcome.FramesB
	res.Live = doc.Outcome.Status == "in_progress"
	switch doc.Outcome.Status {
	case "completed":
		res.Winner = doc.Outcome.Winner
	case "forfeited":
		res.Winner = doc.Outcome.Winner
		res.Status = "Won by forfeit"
	}
	for i, f := range doc.Frames {
		res.Frames = append(res.Frames, FrameRow{Number: i + 1, A: int(f.TeamAPoints), B: int(f.TeamBPoints), Winner: f.Winner})
	}
	return nil
}

func firstIDs(ids []string, n int) []string { return ids[:min(len(ids), n)] }

func fillRace(res *Result, data json.RawMessage, nameOf func(string) string) error {
	var doc struct {
		NamedLabel  *string `json:"namedLabel"`
		TargetScore int     `json:"targetScore"`
		Status      string  `json:"status"`
		Entrants    []struct {
			PlayerID   string          `json:"playerId"`
			Score      float64         `json:"score"`
			FoulPoints float64         `json:"foulPoints"`
			Place      json.RawMessage `json:"place"`
		} `json:"entrants"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return fmt.Errorf("decode race: %w", err)
	}
	res.Label = labelOr(doc.NamedLabel, "Snooker race")
	res.Caption = "Race to " + strconv.Itoa(doc.TargetScore)
	res.Live = doc.Status == "in_progress"
	type row struct {
		name  string
		net   int
		place int // 0 = not placed yet, -1 = did not finish
	}
	rows := make([]row, 0, len(doc.Entrants))
	for _, e := range doc.Entrants {
		r := row{name: nameOf(e.PlayerID), net: int(e.Score - e.FoulPoints)}
		var n int
		var s string
		switch {
		case json.Unmarshal(e.Place, &n) == nil && n > 0:
			r.place = n
		case json.Unmarshal(e.Place, &s) == nil && s == "dnf":
			r.place = -1
		}
		rows = append(rows, r)
	}
	// Placed players by place, then players still in by score, then players who dropped out.
	rank := func(r row) int {
		switch {
		case r.place > 0:
			return r.place
		case r.place == 0:
			return 1000
		}
		return 2000
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rank(rows[i]) != rank(rows[j]) {
			return rank(rows[i]) < rank(rows[j])
		}
		return rows[i].net > rows[j].net
	})
	for i, r := range rows {
		place := strconv.Itoa(i + 1)
		if r.place == -1 {
			place = "Out"
		}
		res.Standings = append(res.Standings, StandingRow{
			Place: place, Name: r.name, Detail: strconv.Itoa(r.net) + " pts",
			Winner: !res.Live && r.place == 1,
		})
	}
	return nil
}

func fillGroup(res *Result, data json.RawMessage, nameOf func(string) string) error {
	var doc struct {
		NamedLabel *string  `json:"namedLabel"`
		PlayerIDs  []string `json:"playerIds"`
		BestOf     int      `json:"bestOf"`
		Status     string   `json:"status"`
		WinnerID   *string  `json:"winnerId"`
		Frames     []struct {
			Points   map[string]float64 `json:"points"`
			WinnerID string             `json:"winnerId"`
		} `json:"frames"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return fmt.Errorf("decode free-for-all: %w", err)
	}
	res.Label = labelOr(doc.NamedLabel, "Free-for-all")
	res.Caption = fmt.Sprintf("%d players · best of %d", len(doc.PlayerIDs), doc.BestOf)
	res.Live = doc.Status == "in_progress"
	type row struct {
		id             string
		frames, points int
	}
	rows := make([]row, 0, len(doc.PlayerIDs))
	for _, id := range doc.PlayerIDs {
		r := row{id: id}
		for _, f := range doc.Frames {
			r.points += int(f.Points[id])
			if f.WinnerID == id {
				r.frames++
			}
		}
		rows = append(rows, r)
	}
	winner := ""
	if doc.WinnerID != nil {
		winner = *doc.WinnerID
	}
	// The winner first (it may have won on a tie-break), then frames, then points.
	sort.SliceStable(rows, func(i, j int) bool {
		if (rows[i].id == winner) != (rows[j].id == winner) {
			return rows[i].id == winner
		}
		if rows[i].frames != rows[j].frames {
			return rows[i].frames > rows[j].frames
		}
		return rows[i].points > rows[j].points
	})
	for i, r := range rows {
		frames := "frames"
		if r.frames == 1 {
			frames = "frame"
		}
		res.Standings = append(res.Standings, StandingRow{
			Place: strconv.Itoa(i + 1), Name: nameOf(r.id),
			Detail: fmt.Sprintf("%d %s · %d pts", r.frames, frames, r.points),
			Winner: !res.Live && r.id == winner && winner != "",
		})
	}
	return nil
}

// resultTitle is the page title and share preview line, e.g. "Rahul S. 3 - 1 Amit K.".
func resultTitle(res Result) string {
	if res.Kind == KindMatch {
		return fmt.Sprintf("%s %d - %d %s", res.SideA, res.FramesA, res.FramesB, res.SideB)
	}
	for _, s := range res.Standings {
		if s.Winner {
			return s.Name + " wins: " + res.Label
		}
	}
	return res.Label
}

// resultPage serves the HTML page of one kind.
func (h *Handler) resultPage(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		res, err := h.loadResult(r.Context(), kind, chi.URLParam(r, "id"))
		if errors.Is(err, syncmod.ErrNotFound) || errors.Is(err, errBadKind) {
			h.notFound(w)
			return
		}
		if err != nil {
			h.failed(w, err)
			return
		}
		tmpl := standingsPage
		if kind == KindMatch {
			tmpl = matchPage
		}
		h.render(w, http.StatusOK, tmpl, view{
			Title: resultTitle(res) + " | Snookit", Description: res.Label + " on Snookit",
			URL: h.cfg.BaseURL + kindPath[kind] + res.ID, Data: res,
		})
	}
}

// resultJSON answers GET /v1/public/results/{kind}/{id}: the app shows it when a shared
// result link is opened by someone outside the league.
func (h *Handler) resultJSON(w http.ResponseWriter, r *http.Request) {
	res, err := h.loadResult(r.Context(), chi.URLParam(r, "kind"), chi.URLParam(r, "id"))
	if errors.Is(err, syncmod.ErrNotFound) || errors.Is(err, errBadKind) {
		httpx.WriteError(w, r, httpx.ErrNotFound)
		return
	}
	if err != nil {
		httpx.WriteError(w, r, fmt.Errorf("public result: %w", err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}
