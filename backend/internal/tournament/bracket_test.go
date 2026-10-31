package tournament

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The app computes the same states in TypeScript; both read this file.
const fixturePath = "../../../fixtures/tournament/cases.json"

func TestMatchesTheAppOnSharedFixtures(t *testing.T) {
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var f struct {
		Cases []struct {
			Tournament Tournament `json:"tournament"`
			Matches    []Fixture  `json:"matches"`
		} `json:"cases"`
		Expected json.RawMessage `json:"expected"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	var got []State
	for _, c := range f.Cases {
		st, err := Derive(c.Tournament, c.Matches)
		if err != nil {
			t.Fatalf("derive %s: %v", c.Tournament.ID, err)
		}
		got = append(got, st)
	}
	gotRaw, _ := json.Marshal(got)
	var gotAny, wantAny any
	if err := json.Unmarshal(gotRaw, &gotAny); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(f.Expected, &wantAny); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(gotAny, wantAny) {
		pretty, _ := json.MarshalIndent(gotAny, "", " ")
		t.Fatalf("Go and the app disagree. Go:\n%s", pretty)
	}
}

func TestSeedPositionsKeepTopSeedsApart(t *testing.T) {
	if got := SeedPositions(8); !reflect.DeepEqual(got, []int{1, 8, 4, 5, 2, 7, 3, 6}) {
		t.Fatalf("SeedPositions(8) = %v", got)
	}
	if RoundName(0, 4) != "Round of 16" || RoundName(3, 4) != "Final" {
		t.Fatal("round names")
	}
}
