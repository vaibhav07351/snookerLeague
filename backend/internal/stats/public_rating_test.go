package stats

import (
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)

func day(n int) time.Time { return t0.Add(time.Duration(n) * 24 * time.Hour) }

func byUser(rows []PublicRating) map[string]PublicRating {
	out := map[string]PublicRating{}
	for _, r := range rows {
		out[r.UserID] = r
	}
	return out
}

func TestAPairCountsAtMostThreeTimesPerThirtyDays(t *testing.T) {
	var games []RatedGame
	for i := 0; i < 5; i++ {
		games = append(games, RatedGame{At: day(i), WinnerID: "a", LoserID: "b"})
	}
	games = append(games, RatedGame{At: day(40), WinnerID: "a", LoserID: "b"})
	got := byUser(PublicRatings(games, nil))
	if got["a"].Games != 4 || got["b"].Games != 4 {
		t.Fatalf("games = a:%d b:%d, want 4 each (3 in the window, 1 after it)", got["a"].Games, got["b"].Games)
	}
}

func TestBeatingANewAccountCountsHalf(t *testing.T) {
	game := []RatedGame{{At: day(5), WinnerID: "a", LoserID: "b"}}
	old := byUser(PublicRatings(game, map[string]time.Time{"b": day(-100)}))
	fresh := byUser(PublicRatings(game, map[string]time.Time{"b": day(0)}))
	if gainOld, gainFresh := old["a"].Rating-BaseRating, fresh["a"].Rating-BaseRating; gainOld != 16 || gainFresh != 8 {
		t.Fatalf("gains old=%v fresh=%v, want 16 and 8", gainOld, gainFresh)
	}
	if fresh["b"].Rating != BaseRating-16 {
		t.Fatalf("the loser still loses the full amount, got %v", fresh["b"].Rating)
	}
}

func TestOnlyAgreedSinglesBetweenAccountsCount(t *testing.T) {
	owners := map[string]string{"c1": "u1", "c2": "u2", "c3": "u1"}
	cases := map[string]struct {
		raw  string
		want bool
	}{
		"confirmed by opponent": {`{"updatedAt":"2026-10-01T00:00:00Z","createdByUid":"u1","teamA":["c1"],"teamB":["c2"],"confirmedByUids":["u2"],"outcome":{"winner":"a"}}`, true},
		"not confirmed":         {`{"updatedAt":"2026-10-01T00:00:00Z","createdByUid":"u1","teamA":["c1"],"teamB":["c2"],"outcome":{"winner":"a"}}`, false},
		"guest opponent":        {`{"updatedAt":"2026-10-01T00:00:00Z","createdByUid":"u1","teamA":["c1"],"teamB":["g1"],"outcome":{"winner":"a"}}`, false},
		"same person twice":     {`{"updatedAt":"2026-10-01T00:00:00Z","createdByUid":"u1","teamA":["c1"],"teamB":["c3"],"outcome":{"winner":"a"}}`, false},
		"doubles":               {`{"updatedAt":"2026-10-01T00:00:00Z","createdByUid":"u1","teamA":["c1","c3"],"teamB":["c2"],"confirmedByUids":["u2"],"outcome":{"winner":"a"}}`, false},
	}
	for name, c := range cases {
		if _, ok := ratedGame([]byte(c.raw), owners); ok != c.want {
			t.Errorf("%s: rated=%v, want %v", name, ok, c.want)
		}
	}
}
