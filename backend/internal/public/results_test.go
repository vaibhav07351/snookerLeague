package public

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

type fakeGames map[syncmod.Entity]map[string]string

func (f fakeGames) PublicGame(_ context.Context, entity syncmod.Entity, id string) (syncmod.Doc, syncmod.Doc, []syncmod.Doc, error) {
	data, ok := f[entity][id]
	if !ok {
		return syncmod.Doc{}, syncmod.Doc{}, nil, syncmod.ErrNotFound
	}
	game := syncmod.Doc{Entity: entity, ID: id, LeagueID: "lg1", Data: json.RawMessage(data),
		UpdatedAt: time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC)}
	league := syncmod.Doc{Entity: syncmod.EntityLeague, ID: "lg1", Data: json.RawMessage(`{"name":"Cue Club"}`)}
	players := []syncmod.Doc{
		card("pa", "Rahul Sharma", "adult"), card("pb", "Aarav Mehta", "kid"),
		card("pc", "Amit Kumar", ""), card("pd", "Vikram Singh", ""),
	}
	return game, league, players, nil
}

func resultsHandler() *Handler {
	return NewHandler(Config{BaseURL: "https://example.test"}, fakeGames{
		syncmod.EntityMatch: {"m1": `{"teamA":["pa"],"teamB":["pb"],"bestOf":5,"frames":[{"teamAPoints":60,"teamBPoints":20,"winner":"a"}],"outcome":{"status":"forfeited","winner":"a","framesA":3,"framesB":1}}`},
		syncmod.EntityRace: {"r1": `{"targetScore":50,"status":"completed","entrants":[
			{"playerId":"pc","score":40,"foulPoints":4,"place":"dnf"},
			{"playerId":"pd","score":30,"place":2},
			{"playerId":"pa","score":55,"foulPoints":5,"place":1}]}`},
		syncmod.EntityGroupMatch: {"g1": `{"playerIds":["pa","pc","pd"],"bestOf":3,"status":"completed","winnerId":"pc","frames":[
			{"points":{"pa":40,"pc":30,"pd":10},"winnerId":"pa"},
			{"points":{"pa":10,"pc":50,"pd":5},"winnerId":"pc"}]}`},
	}, nil, nil, nil, fakeMinors{"kid": true})
}

func TestMatchResultHidesMinorsAndKeepsForfeit(t *testing.T) {
	res, err := resultsHandler().loadResult(context.Background(), KindMatch, "m1")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if res.SideA != "Rahul S." || res.SideB != "Player" {
		t.Errorf("sides %q / %q", res.SideA, res.SideB)
	}
	if res.Winner != "a" || res.Status != "Won by forfeit" || res.FramesA != 3 || res.Caption != "Best of 5" {
		t.Errorf("unexpected result %+v", res)
	}
	if len(res.Frames) != 1 || res.Frames[0].A != 60 {
		t.Errorf("frames %+v", res.Frames)
	}
}

func TestRaceResultOrdersByPlaceWithDropoutsLast(t *testing.T) {
	res, err := resultsHandler().loadResult(context.Background(), KindRace, "r1")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	got := []string{}
	for _, s := range res.Standings {
		got = append(got, s.Place+" "+s.Name+" "+s.Detail)
	}
	want := "1 Rahul S. 50 pts|2 Vikram S. 30 pts|Out Amit K. 36 pts"
	if strings.Join(got, "|") != want {
		t.Errorf("standings %q, want %q", strings.Join(got, "|"), want)
	}
	if !res.Standings[0].Winner || res.Standings[1].Winner || res.Caption != "Race to 50" {
		t.Errorf("unexpected race %+v", res)
	}
}

func TestGroupResultPutsTheWinnerFirst(t *testing.T) {
	res, err := resultsHandler().loadResult(context.Background(), KindGroup, "g1")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	// pa and pc both won a frame; pc won the match (on points), so pc leads.
	if res.Standings[0].Name != "Amit K." || !res.Standings[0].Winner {
		t.Errorf("first row %+v", res.Standings[0])
	}
	if res.Standings[0].Detail != "1 frame · 80 pts" || res.Standings[1].Name != "Rahul S." {
		t.Errorf("rows %+v", res.Standings)
	}
}

func TestResultEndpointAndPages(t *testing.T) {
	h := resultsHandler()
	r := chi.NewRouter()
	h.Routes(r)
	r.Route("/v1", h.APIRoutes)
	get := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec
	}
	rec := get("/v1/public/results/race/r1")
	if rec.Code != http.StatusOK {
		t.Fatalf("race json status %d", rec.Code)
	}
	var body Result
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Kind != KindRace || len(body.Standings) != 3 {
		t.Errorf("race json %s (%v)", rec.Body.String(), err)
	}
	for path, want := range map[string]int{
		"/v1/public/results/race/nope":  http.StatusNotFound,
		"/v1/public/results/league/lg1": http.StatusNotFound,
		"/r/r1":                         http.StatusOK,
		"/g/g1":                         http.StatusOK,
		"/m/m1":                         http.StatusOK,
		"/g/nope":                       http.StatusNotFound,
	} {
		if got := get(path).Code; got != want {
			t.Errorf("%s: status %d, want %d", path, got, want)
		}
	}
	if page := get("/m/m1").Body.String(); strings.Contains(page, "Aarav") {
		t.Error("an under-18 player's name must not appear on the match page")
	}
}
