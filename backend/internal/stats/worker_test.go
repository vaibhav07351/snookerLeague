package stats

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"
)

type dirtyRow struct {
	markedAt time.Time
	attempts int
	retryAt  time.Time
}

type memRepo struct {
	dirty     map[string]*dirtyRow
	leagues   map[string]LeagueData
	standings map[string][]Standing
	// failLoad lists leagues whose Load fails ("*" fails every league).
	failLoad []string
	// onLoad runs inside Load, to simulate a write landing during a recompute.
	onLoad func(id string)
	clock  time.Time
}

func newMemRepo(dirty ...string) *memRepo {
	m := &memRepo{dirty: map[string]*dirtyRow{}, leagues: map[string]LeagueData{},
		standings: map[string][]Standing{}, clock: time.Unix(1_000, 0)}
	for _, id := range dirty {
		_ = m.MarkDirty(context.Background(), id)
	}
	return m
}

func (m *memRepo) tick() time.Time {
	m.clock = m.clock.Add(time.Millisecond)
	return m.clock
}

func (m *memRepo) ClaimDirty(_ context.Context, limit int) ([]DirtyLeague, error) {
	var out []DirtyLeague
	for id, row := range m.dirty {
		if row.retryAt.IsZero() || !row.retryAt.After(time.Now()) {
			out = append(out, DirtyLeague{ID: id, MarkedAt: row.markedAt, Attempts: row.attempts})
		}
	}
	slices.SortFunc(out, func(a, b DirtyLeague) int { return a.MarkedAt.Compare(b.MarkedAt) })
	return out[:min(limit, len(out))], nil
}

func (m *memRepo) ClearDirty(_ context.Context, id string, markedAt time.Time) error {
	if row, ok := m.dirty[id]; ok {
		if row.markedAt.Equal(markedAt) {
			delete(m.dirty, id)
		} else {
			row.attempts, row.retryAt = 0, time.Time{}
		}
	}
	return nil
}

func (m *memRepo) DeferDirty(_ context.Context, id string, attempts int, retryAt time.Time) error {
	if row, ok := m.dirty[id]; ok {
		row.attempts, row.retryAt = attempts, retryAt
	}
	return nil
}

func (m *memRepo) MarkDirty(_ context.Context, id string) error {
	if row, ok := m.dirty[id]; ok {
		row.markedAt = m.tick()
		return nil
	}
	m.dirty[id] = &dirtyRow{markedAt: m.tick()}
	return nil
}

func (m *memRepo) Load(_ context.Context, id string) (LeagueData, bool, error) {
	if m.onLoad != nil {
		m.onLoad(id)
	}
	if slices.Contains(m.failLoad, id) || slices.Contains(m.failLoad, "*") {
		return LeagueData{}, false, errors.New("db down")
	}
	d, ok := m.leagues[id]
	return d, ok, nil
}

func (m *memRepo) Replace(_ context.Context, id string, rows []Standing) error {
	m.standings[id] = rows
	return nil
}

func (m *memRepo) Standings(_ context.Context, id string, _, _ int) ([]Standing, error) {
	return m.standings[id], nil
}

type memRanks map[string]CityRank

func (m memRanks) SetCityRank(_ context.Context, uid, _ string, r CityRank) error {
	m[uid] = r
	return nil
}

func won(id, a, b, at string) Match {
	return Match{ID: id, UpdatedAt: at, TeamA: []string{a}, TeamB: []string{b},
		Outcome: Outcome{Status: "completed", Winner: "a"}}
}

func TestWorkerStoresStandingsAndCityRanks(t *testing.T) {
	repo := newMemRepo("city_pune")
	repo.leagues["city_pune"] = LeagueData{
		Kind: "city", CityID: "pune",
		Cards: []Card{{ID: "c1", AuthUID: "u1"}, {ID: "c2", AuthUID: "u2"}, {ID: "g1"}},
		Matches: []Match{
			won("m1", "c1", "c2", "2026-01-01"), won("m2", "c1", "c2", "2026-01-02"),
			won("m3", "c1", "g1", "2026-01-03"),
		},
	}
	ranks := memRanks{}
	if err := NewWorker(repo, ranks, nil, nil).RunOnce(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}
	if got := len(repo.standings["city_pune"]); got != 3 {
		t.Fatalf("standings rows = %d, want 3", got)
	}
	if r := ranks["u1"]; r.Played != 3 || r.RankScore == 0 {
		t.Fatalf("u1 rank = %+v", r)
	}
	if r := ranks["u2"]; r.Played != 2 || r.RankScore != 0 {
		t.Fatalf("u2 has fewer than 3 games and must stay unranked: %+v", r)
	}
	if len(repo.dirty) != 0 {
		t.Fatalf("queue not drained: %v", repo.dirty)
	}
}

func TestAFailedLeagueStaysQueuedAndWaits(t *testing.T) {
	repo := newMemRepo("lg1")
	repo.failLoad = []string{"*"}
	if err := NewWorker(repo, memRanks{}, nil, nil).RunOnce(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}
	row, ok := repo.dirty["lg1"]
	if !ok {
		t.Fatal("a failed league must stay on the queue")
	}
	if row.attempts != 1 || !row.retryAt.After(time.Now()) {
		t.Fatalf("a failed league must wait before its next try, got %+v", row)
	}
}

func TestOneFailingLeagueDoesNotDropTheRestOfTheBatch(t *testing.T) {
	repo := newMemRepo("bad", "good1", "good2")
	repo.failLoad = []string{"bad"}
	repo.leagues["good1"] = LeagueData{Cards: []Card{{ID: "a"}}}
	repo.leagues["good2"] = LeagueData{Cards: []Card{{ID: "b"}}}

	if err := NewWorker(repo, memRanks{}, nil, nil).RunOnce(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}
	if len(repo.standings["good1"]) != 1 || len(repo.standings["good2"]) != 1 {
		t.Fatalf("the healthy leagues must be computed, got %v", repo.standings)
	}
	if _, ok := repo.dirty["bad"]; !ok || len(repo.dirty) != 1 {
		t.Fatalf("only the failing league may stay queued, queue = %v", repo.dirty)
	}
}

func TestAWriteDuringTheRecomputeKeepsTheLeagueQueued(t *testing.T) {
	repo := newMemRepo("lg1")
	repo.leagues["lg1"] = LeagueData{Cards: []Card{{ID: "a"}}}
	marked := false
	repo.onLoad = func(id string) {
		if !marked {
			marked = true
			_ = repo.MarkDirty(context.Background(), id) // a match was saved meanwhile
		}
	}

	if err := NewWorker(repo, memRanks{}, nil, nil).RunOnce(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}
	if !marked || len(repo.dirty) != 0 {
		t.Fatalf("the league must be recomputed again after the new write, queue = %v", repo.dirty)
	}
}

func TestRetryDelayDoublesUpToAnHour(t *testing.T) {
	got := []time.Duration{retryDelay(1), retryDelay(2), retryDelay(3), retryDelay(20)}
	want := []time.Duration{30 * time.Second, time.Minute, 2 * time.Minute, time.Hour}
	if !slices.Equal(got, want) {
		t.Fatalf("retryDelay = %v, want %v", got, want)
	}
}

func TestRankScoreNeedsThreeGames(t *testing.T) {
	if RankScore(2, 100) != 0 {
		t.Fatal("two games must not rank")
	}
	if got := RankScore(3, 100); got != 138.63 {
		t.Fatalf("RankScore(3, 100) = %v, want 138.63 (100 * ln 4, 2 decimals)", got)
	}
}

func TestCityRankPrefersTheStableCardLikeTheApp(t *testing.T) {
	stable := memberCardID("hub", "u1")
	d := LeagueData{Cards: []Card{
		{ID: "old-claimed", AuthUID: "u1", UpdatedAt: "2026-01-01T00:00:00Z"},
		{ID: stable, AuthUID: "u1", UpdatedAt: "2026-02-01T00:00:00Z"},
	}}
	rows := []Standing{
		{PlayerID: "old-claimed", Standard: StandardStats{Played: 9}},
		{PlayerID: stable, Standard: StandardStats{Played: 2}},
	}
	if got := cityRanks("hub", d, rows)["u1"].Played; got != 2 {
		t.Fatalf("rank must come from the stable card (2 games), got %v", got)
	}
}

func TestCityRankFallsBackToMostGamesThenLatest(t *testing.T) {
	d := LeagueData{Cards: []Card{
		{ID: "a", AuthUID: "u1", UpdatedAt: "2026-01-01T00:00:00Z"},
		{ID: "b", AuthUID: "u1", UpdatedAt: "2026-03-01T00:00:00Z"},
		{ID: "c", AuthUID: "u1", UpdatedAt: "2026-02-01T00:00:00Z"},
	}}
	rows := []Standing{
		{PlayerID: "a", Standard: StandardStats{Played: 4, WinPct: 10}},
		{PlayerID: "b", Standard: StandardStats{Played: 4, WinPct: 50}},
		{PlayerID: "c", Standard: StandardStats{Played: 3, WinPct: 90}},
	}
	if got := cityRanks("hub", d, rows)["u1"].WinPct; got != 50 {
		t.Fatalf("expected the most-played, latest card (b), got win %% %v", got)
	}
}
