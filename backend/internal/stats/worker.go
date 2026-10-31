package stats

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"
)

// Card is a league player card as the worker needs it.
type Card struct {
	ID      string
	AuthUID string
}

// LeagueData is everything one league's numbers are computed from.
type LeagueData struct {
	Kind    string // "club" or "city"
	CityID  string
	Cards   []Card
	Matches []Match
	Races   []Race
}

// Standing is one player's server-computed numbers in a league.
type Standing struct {
	PlayerID string        `json:"playerId"`
	Standard StandardStats `json:"standard"`
	Race     RaceStats     `json:"race"`
	Rating   Rating        `json:"rating"`
}

// CityRank is the public city-board numbers for one person, from their city hub card.
type CityRank struct {
	RankScore    float64
	Played       int
	WinPct       float64
	Titles       int
	HighestBreak float64
	Centuries    int
	Breaks50     int
	Maximums     int
}

// Repository is the worker's persistence boundary.
type Repository interface {
	// ClaimDirty removes and returns up to limit queued league ids.
	ClaimDirty(ctx context.Context, limit int) ([]string, error)
	MarkDirty(ctx context.Context, leagueID string) error
	// Load returns the league's live documents; ok is false when the league is gone.
	Load(ctx context.Context, leagueID string) (data LeagueData, ok bool, err error)
	// Replace stores the league's standings, removing rows for players no longer there.
	Replace(ctx context.Context, leagueID string, rows []Standing) error
	// Standings returns one page of the league's rows, best rating first.
	Standings(ctx context.Context, leagueID string, limit, offset int) ([]Standing, error)
}

// CityRankWriter sets the server-owned ranking fields on a person's public profile.
type CityRankWriter interface {
	SetCityRank(ctx context.Context, uid, cityID string, r CityRank) error
}

const (
	minGamesForRank = 3
	batchSize       = 10
	pollEvery       = 3 * time.Second
)

// RankScore is the city-board score: 0 until a player has played enough, then win rate
// weighted by experience (the same formula the app shows).
func RankScore(played int, winPct float64) float64 {
	if played < minGamesForRank {
		return 0
	}
	return roundHalfUp(winPct*math.Log(float64(played+1))*100) / 100
}

// Compute builds every card's standing for one league.
func Compute(d LeagueData) []Standing {
	ratings := map[string]Rating{}
	for _, r := range Ratings(d.Matches, d.Races) {
		ratings[r.PlayerID] = r
	}
	rows := make([]Standing, 0, len(d.Cards))
	for _, c := range d.Cards {
		rating, ok := ratings[c.ID]
		if !ok {
			rating = Rating{PlayerID: c.ID, Rating: BaseRating, Peak: BaseRating, Provisional: true,
				History: []float64{}, Form: []int{}}
		}
		rows = append(rows, Standing{
			PlayerID: c.ID,
			Standard: Standard(c.ID, d.Matches),
			Race:     RaceStatsFor(c.ID, d.Races),
			Rating:   rating,
		})
	}
	return rows
}

// cityRanks picks, for each person in a city hub, the card with the most games (a person can
// end up with two cards after a claim) and turns it into their public numbers.
func cityRanks(d LeagueData, rows []Standing) map[string]CityRank {
	byCard := map[string]Standing{}
	for _, r := range rows {
		byCard[r.PlayerID] = r
	}
	best := map[string]Standing{}
	for _, c := range d.Cards {
		if c.AuthUID == "" {
			continue
		}
		s := byCard[c.ID]
		if cur, ok := best[c.AuthUID]; !ok || s.Standard.Played > cur.Standard.Played {
			best[c.AuthUID] = s
		}
	}
	out := map[string]CityRank{}
	for uid, s := range best {
		st := s.Standard
		out[uid] = CityRank{
			RankScore: RankScore(st.Played, st.WinPct), Played: st.Played, WinPct: st.WinPct,
			Titles: st.Titles, HighestBreak: st.HighestBreak, Centuries: st.Centuries,
			Breaks50: st.Breaks50, Maximums: st.Maximums,
		}
	}
	return out
}

// Worker recomputes queued leagues in the background, and the public rating periodically.
type Worker struct {
	repo     Repository
	ranks    CityRankWriter
	public   PublicRepository
	profiles PublicRatingWriter
}

// NewWorker builds the stats worker. public and profiles may be nil (tests).
func NewWorker(repo Repository, ranks CityRankWriter, public PublicRepository, profiles PublicRatingWriter) *Worker {
	return &Worker{repo: repo, ranks: ranks, public: public, profiles: profiles}
}

// publicEvery is how often the public rating is rebuilt from all confirmed matches.
const publicEvery = 10 * time.Minute

// Run processes the queue until ctx ends.
func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(pollEvery)
	defer ticker.Stop()
	nextPublic := time.Now()
	for {
		if err := w.RunOnce(ctx); err != nil && ctx.Err() == nil {
			slog.Error("stats worker pass failed", "error", err)
		}
		if w.public != nil && !time.Now().Before(nextPublic) {
			nextPublic = time.Now().Add(publicEvery)
			if err := RecomputePublic(ctx, w.public, w.profiles); err != nil && ctx.Err() == nil {
				slog.Error("public rating rebuild failed", "error", err)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RunOnce recomputes every queued league once. A league that fails goes back on the queue.
func (w *Worker) RunOnce(ctx context.Context) error {
	for {
		ids, err := w.repo.ClaimDirty(ctx, batchSize)
		if err != nil {
			return fmt.Errorf("claim dirty leagues: %w", err)
		}
		if len(ids) == 0 {
			return nil
		}
		for _, id := range ids {
			if err := w.recompute(ctx, id); err != nil {
				slog.Error("recompute league failed", "league", id, "error", err)
				if requeueErr := w.repo.MarkDirty(ctx, id); requeueErr != nil {
					return fmt.Errorf("requeue %s: %w", id, requeueErr)
				}
				return nil // try again on the next pass, not in a tight loop
			}
		}
	}
}

func (w *Worker) recompute(ctx context.Context, leagueID string) error {
	data, ok, err := w.repo.Load(ctx, leagueID)
	if err != nil {
		return fmt.Errorf("load league: %w", err)
	}
	if !ok {
		return w.repo.Replace(ctx, leagueID, nil)
	}
	rows := Compute(data)
	if err := w.repo.Replace(ctx, leagueID, rows); err != nil {
		return fmt.Errorf("save standings: %w", err)
	}
	if data.Kind == "city" && data.CityID != "" {
		for uid, rank := range cityRanks(data, rows) {
			if err := w.ranks.SetCityRank(ctx, uid, data.CityID, rank); err != nil {
				return fmt.Errorf("set city rank: %w", err)
			}
		}
	}
	return nil
}
