package stats

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"time"
)

// Public rating rules (decision D7 and the phase 6 anti-cheating rules):
//   - only singles matches between two different accounts count, never guests;
//   - each side must have agreed to the result: its player scored/created the match or
//     confirmed it afterwards (so one person can't feed themselves wins);
//   - walkovers don't count;
//   - at most maxPairGames rated games per pair of players in any pairWindow;
//   - a win over an account younger than newAccountAge moves the winner only half as much.
const (
	publicK       = 32.0
	maxPairGames  = 3
	pairWindow    = 30 * 24 * time.Hour
	newAccountAge = 14 * 24 * time.Hour
)

// RatedGame is one candidate result for the public rating, already reduced to accounts.
type RatedGame struct {
	At       time.Time
	WinnerID string
	LoserID  string
}

// PublicRating is one account's public rating.
type PublicRating struct {
	UserID string  `json:"userId"`
	Rating float64 `json:"rating"`
	Games  int     `json:"games"`
	Peak   float64 `json:"peak"`
}

// PublicRatings replays the games in time order under the rules above.
func PublicRatings(games []RatedGame, accountCreated map[string]time.Time) []PublicRating {
	ordered := append([]RatedGame(nil), games...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].At.Before(ordered[j].At) })

	byID := map[string]*PublicRating{}
	var order []string
	entry := func(id string) *PublicRating {
		if r, ok := byID[id]; ok {
			return r
		}
		r := &PublicRating{UserID: id, Rating: BaseRating, Peak: BaseRating}
		byID[id] = r
		order = append(order, id)
		return r
	}
	pairGames := map[[2]string][]time.Time{}
	for _, g := range ordered {
		if g.WinnerID == "" || g.LoserID == "" || g.WinnerID == g.LoserID {
			continue
		}
		key := [2]string{g.WinnerID, g.LoserID}
		if key[1] < key[0] {
			key = [2]string{key[1], key[0]}
		}
		var recent []time.Time
		for _, at := range pairGames[key] {
			if g.At.Sub(at) < pairWindow {
				recent = append(recent, at)
			}
		}
		if len(recent) >= maxPairGames {
			pairGames[key] = recent
			continue
		}
		pairGames[key] = append(recent, g.At)

		w, l := entry(g.WinnerID), entry(g.LoserID)
		gain := publicK * (1 - expected(w.Rating, l.Rating))
		winnerGain := gain
		if created, ok := accountCreated[g.LoserID]; ok && g.At.Sub(created) < newAccountAge {
			winnerGain = gain / 2
		}
		w.Rating += winnerGain
		l.Rating -= gain
		w.Games++
		l.Games++
		if w.Rating > w.Peak {
			w.Peak = w.Rating
		}
	}
	out := make([]PublicRating, 0, len(order))
	for _, id := range order {
		r := byID[id]
		r.Rating, r.Peak = roundHalfUp(r.Rating), roundHalfUp(r.Peak)
		out = append(out, *r)
	}
	return out
}

// PublicRepository loads the candidate games and stores the results.
type PublicRepository interface {
	RatedGames(ctx context.Context) ([]RatedGame, map[string]time.Time, error)
	ReplacePublicRatings(ctx context.Context, rows []PublicRating) error
}

// PublicRatingWriter copies an account's public rating onto its public profile.
type PublicRatingWriter interface {
	SetPublicRating(ctx context.Context, uid string, r PublicRating) error
}

// RecomputePublic rebuilds every public rating from scratch. It reads every finished match,
// which is fine at the current size; it runs every publicEvery, not on each write.
func RecomputePublic(ctx context.Context, repo PublicRepository, profiles PublicRatingWriter) error {
	games, created, err := repo.RatedGames(ctx)
	if err != nil {
		return fmt.Errorf("load rated games: %w", err)
	}
	rows := PublicRatings(games, created)
	if err := repo.ReplacePublicRatings(ctx, rows); err != nil {
		return fmt.Errorf("save public ratings: %w", err)
	}
	for _, r := range rows {
		if err := profiles.SetPublicRating(ctx, r.UserID, r); err != nil {
			return fmt.Errorf("set public rating: %w", err)
		}
	}
	slog.Info("public ratings rebuilt", "players", len(rows), "games", len(games))
	return nil
}
