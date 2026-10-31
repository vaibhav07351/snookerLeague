package stats

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
)

// The app computes the same numbers in TypeScript; both read this file (see "about" in it).
const fixturePath = "../../../fixtures/stats/cases.json"

type fixture struct {
	Players  []string        `json:"players"`
	Matches  []Match         `json:"matches"`
	Races    []Race          `json:"races"`
	Expected json.RawMessage `json:"expected"`
}

func TestMatchesTheAppOnSharedFixtures(t *testing.T) {
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var f fixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	standard := map[string]StandardStats{}
	race := map[string]RaceStats{}
	for _, id := range f.Players {
		standard[id] = Standard(id, f.Matches)
		race[id] = RaceStatsFor(id, f.Races)
	}
	ratings := map[string]Rating{}
	for _, r := range Ratings(f.Matches, f.Races) {
		ratings[r.PlayerID] = r
	}
	got, err := json.Marshal(map[string]any{"standard": standard, "race": race, "ratings": ratings})
	if err != nil {
		t.Fatal(err)
	}
	var gotAny, wantAny any
	_ = json.Unmarshal(got, &gotAny)
	_ = json.Unmarshal(f.Expected, &wantAny)
	if !reflect.DeepEqual(gotAny, wantAny) {
		var diffs []string
		diff("", gotAny, wantAny, &diffs)
		t.Fatalf("Go and the app disagree:\n%s", strings.Join(diffs, "\n"))
	}
}

func diff(path string, got, want any, out *[]string) {
	g, gok := got.(map[string]any)
	w, wok := want.(map[string]any)
	if gok && wok {
		for k := range g {
			diff(path+"."+k, g[k], w[k], out)
		}
		for k := range w {
			if _, ok := g[k]; !ok {
				*out = append(*out, fmt.Sprintf("%s.%s: missing in Go", path, k))
			}
		}
		return
	}
	if !reflect.DeepEqual(got, want) {
		*out = append(*out, fmt.Sprintf("%s: go=%v app=%v", path, got, want))
	}
}
