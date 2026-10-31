package stats

import (
	"context"
	"errors"
	"testing"
)

type memRepo struct {
	dirty     []string
	leagues   map[string]LeagueData
	standings map[string][]Standing
	failLoad  bool
}

func (m *memRepo) ClaimDirty(_ context.Context, limit int) ([]string, error) {
	n := min(limit, len(m.dirty))
	out := m.dirty[:n]
	m.dirty = m.dirty[n:]
	return out, nil
}

func (m *memRepo) MarkDirty(_ context.Context, id string) error {
	m.dirty = append(m.dirty, id)
	return nil
}

func (m *memRepo) Load(_ context.Context, id string) (LeagueData, bool, error) {
	if m.failLoad {
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
	repo := &memRepo{
		dirty:     []string{"city_pune"},
		standings: map[string][]Standing{},
		leagues: map[string]LeagueData{"city_pune": {
			Kind: "city", CityID: "pune",
			Cards: []Card{{ID: "c1", AuthUID: "u1"}, {ID: "c2", AuthUID: "u2"}, {ID: "g1"}},
			Matches: []Match{
				won("m1", "c1", "c2", "2026-01-01"), won("m2", "c1", "c2", "2026-01-02"),
				won("m3", "c1", "g1", "2026-01-03"),
			},
		}},
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

func TestAFailedLeagueGoesBackOnTheQueue(t *testing.T) {
	repo := &memRepo{dirty: []string{"lg1"}, standings: map[string][]Standing{}, failLoad: true}
	if err := NewWorker(repo, memRanks{}, nil, nil).RunOnce(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}
	if len(repo.dirty) != 1 || repo.dirty[0] != "lg1" {
		t.Fatalf("league must be requeued, queue = %v", repo.dirty)
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
