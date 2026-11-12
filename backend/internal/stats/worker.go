package stats

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// Card is a league player card as the worker needs it.
type Card struct {
	ID        string
	AuthUID   string
	UpdatedAt string
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

// DirtyLeague is one league waiting for a recompute.
type DirtyLeague struct {
	ID string
	// MarkedAt is when a write last queued it; a later mark means "run again".
	MarkedAt time.Time
	// Attempts counts failed recomputes in a row.
	Attempts int
}

// Repository is the worker's persistence boundary.
type Repository interface {
	// ClaimDirty returns up to limit due leagues, longest-waiting first, without removing them.
	ClaimDirty(ctx context.Context, limit int) ([]DirtyLeague, error)
	// ClearDirty removes a recomputed league unless it was marked again after markedAt.
	ClearDirty(ctx context.Context, leagueID string, markedAt time.Time) error
	// DeferDirty keeps a failed league queued and makes it wait until retryAt.
	DeferDirty(ctx context.Context, leagueID string, attempts int, retryAt time.Time) error
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

// memberCardID is the stable id of a person's own card in a league (memberPlayerId in the app).
func memberCardID(leagueID, uid string) string {
	return "pm_" + leagueID + "_" + uid
}

// cityRanks picks, for each person in a city hub, one card (a person can end up with two
// cards after a claim) and turns it into their public numbers. Same rule as the app's
// hubCardsByUid: the stable-id card first, then the most games, then the latest update.
func cityRanks(leagueID string, d LeagueData, rows []Standing) map[string]CityRank {
	byCard := map[string]Standing{}
	for _, r := range rows {
		byCard[r.PlayerID] = r
	}
	best := map[string]cardPick{}
	for _, c := range d.Cards {
		if c.AuthUID == "" {
			continue
		}
		next := cardPick{card: c, s: byCard[c.ID]}
		cur, ok := best[c.AuthUID]
		if !ok || betterCard(leagueID, next, cur) {
			best[c.AuthUID] = next
		}
	}
	out := map[string]CityRank{}
	for uid, p := range best {
		s := p.s
		st := s.Standard
		out[uid] = CityRank{
			RankScore: RankScore(st.Played, st.WinPct), Played: st.Played, WinPct: st.WinPct,
			Titles: st.Titles, HighestBreak: st.HighestBreak, Centuries: st.Centuries,
			Breaks50: st.Breaks50, Maximums: st.Maximums,
		}
	}
	return out
}

// cardPick is one candidate card for a person's city rank, with its numbers.
type cardPick struct {
	card Card
	s    Standing
}

func betterCard(leagueID string, next, cur cardPick) bool {
	stable := memberCardID(leagueID, next.card.AuthUID)
	if (next.card.ID == stable) != (cur.card.ID == stable) {
		return next.card.ID == stable
	}
	if next.s.Standard.Played != cur.s.Standard.Played {
		return next.s.Standard.Played > cur.s.Standard.Played
	}
	return next.card.UpdatedAt > cur.card.UpdatedAt
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

const (
	// maxBatchesPerRun bounds one run: a league written to during its own recompute stays due,
	// and is picked up again on the next tick rather than in a loop here.
	maxBatchesPerRun = 20
	firstRetryDelay  = 30 * time.Second
	maxRetryDelay    = time.Hour
	// reportAfter failures in a row, a league is reported as broken (Sentry, when on).
	reportAfter = 3
)

// retryDelay doubles with each failure in a row, up to maxRetryDelay.
func retryDelay(attempts int) time.Duration {
	d := firstRetryDelay
	for i := 1; i < attempts && d < maxRetryDelay; i++ {
		d *= 2
	}
	return min(d, maxRetryDelay)
}

// RunOnce recomputes the queued leagues that are due. A league stays queued until its
// recompute succeeds; one that fails waits (longer each time) while the others carry on.
func (w *Worker) RunOnce(ctx context.Context) error {
	for range maxBatchesPerRun {
		batch, err := w.repo.ClaimDirty(ctx, batchSize)
		if err != nil {
			return fmt.Errorf("claim dirty leagues: %w", err)
		}
		if len(batch) == 0 {
			return nil
		}
		for _, d := range batch {
			if err := w.recompute(ctx, d.ID); err != nil {
				if ctx.Err() != nil {
					return nil // shutting down: the league is still queued for next time
				}
				if err := w.deferLeague(ctx, d, err); err != nil {
					return err
				}
				continue
			}
			if err := w.repo.ClearDirty(ctx, d.ID, d.MarkedAt); err != nil {
				return fmt.Errorf("clear %s: %w", d.ID, err)
			}
		}
	}
	return nil
}

// deferLeague logs a failed recompute and makes the league wait before its next try.
func (w *Worker) deferLeague(ctx context.Context, d DirtyLeague, cause error) error {
	attempts := d.Attempts + 1
	wait := retryDelay(attempts)
	slog.Error("recompute league failed", "league", d.ID, "attempts", attempts,
		"retry_in", wait.String(), "error", cause)
	if attempts >= reportAfter && httpx.ReportError != nil {
		httpx.ReportError(ctx, fmt.Errorf("stats for league %s failed %d times: %w", d.ID, attempts, cause))
	}
	if err := w.repo.DeferDirty(ctx, d.ID, attempts, time.Now().Add(wait)); err != nil {
		return fmt.Errorf("defer %s: %w", d.ID, err)
	}
	return nil
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
		for uid, rank := range cityRanks(leagueID, data, rows) {
			if err := w.ranks.SetCityRank(ctx, uid, data.CityID, rank); err != nil {
				return fmt.Errorf("set city rank: %w", err)
			}
		}
	}
	return nil
}
