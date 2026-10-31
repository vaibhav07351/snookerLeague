package stats

import (
	"math"
	"sort"
)

// Rating constants, the same as the app's rating.service.ts.
const (
	BaseRating      = 1000.0
	ProvisionalGame = 5
	kMatch          = 32.0
	kRace           = 24.0
	historyLength   = 20
	formLength      = 10
)

func expected(rating, opponent float64) float64 {
	return 1 / (1 + math.Pow(10, (opponent-rating)/400))
}

type table struct {
	byID  map[string]*Rating
	order []string
}

func (t *table) entry(id string) *Rating {
	if e, ok := t.byID[id]; ok {
		return e
	}
	e := &Rating{PlayerID: id, Rating: BaseRating, Peak: BaseRating, Provisional: true,
		History: []float64{}, Form: []int{}}
	t.byID[id] = e
	t.order = append(t.order, id)
	return e
}

func pushCappedF(list []float64, v float64, limit int) []float64 {
	list = append(list, v)
	if len(list) > limit {
		list = list[1:]
	}
	return list
}

func pushCappedI(list []int, v int, limit int) []int {
	list = append(list, v)
	if len(list) > limit {
		list = list[1:]
	}
	return list
}

func applyDelta(e *Rating, delta float64, result int) {
	e.Rating += delta
	e.Peak = math.Max(e.Peak, e.Rating)
	e.Games++
	e.Provisional = e.Games < ProvisionalGame
	e.History = pushCappedF(e.History, roundHalfUp(e.Rating), historyLength)
	e.Form = pushCappedI(e.Form, result, formLength)
}

func (t *table) teamRating(ids []string) float64 {
	if len(ids) == 0 {
		return BaseRating
	}
	sum := 0.0
	for _, id := range ids {
		sum += t.entry(id).Rating
	}
	return sum / float64(len(ids))
}

func (t *table) rateMatch(m Match) {
	if m.Outcome.Status == "in_progress" || len(m.TeamA) == 0 || len(m.TeamB) == 0 {
		return
	}
	ra, rb := t.teamRating(m.TeamA), t.teamRating(m.TeamB)
	aWon := m.Outcome.Winner == "a"
	forfeit := m.Outcome.Status == "forfeited"
	// A walkover is a full loss for the side that walked, but only half a win for the other.
	winnerFactor := 1.0
	if forfeit {
		winnerFactor = 0.5
	}
	scoreA, factorA, factorB := 0.0, 1.0, winnerFactor
	if aWon {
		scoreA, factorA, factorB = 1, winnerFactor, 1
	}
	deltaA := kMatch * (scoreA - expected(ra, rb)) * factorA
	deltaB := kMatch * ((1 - scoreA) - expected(rb, ra)) * factorB
	sides := []struct {
		ids   []string
		delta float64
		won   bool
		side  string
	}{{m.TeamA, deltaA, aWon, "a"}, {m.TeamB, deltaB, !aWon, "b"}}
	for _, s := range sides {
		walked := forfeit && m.Outcome.ForfeitedBy == s.side
		result := 0
		if s.won {
			result = 1
		} else if walked {
			result = -1
		}
		for _, id := range s.ids {
			e := t.entry(id)
			applyDelta(e, s.delta, result)
			if s.won {
				e.CurrentStreak++
			} else {
				e.CurrentStreak = 0
			}
			if e.CurrentStreak > e.BestStreak {
				e.BestStreak = e.CurrentStreak
			}
		}
	}
}

func placeKey(p Place) float64 {
	if p.Set && !p.DNF {
		return float64(p.N)
	}
	return math.Inf(1)
}

func (t *table) rateRace(r Race) {
	if r.Status != "completed" || len(r.Entrants) < 2 {
		return
	}
	n := len(r.Entrants)
	pairK := kRace / float64(n-1)
	before := make([]float64, n)
	for i, e := range r.Entrants {
		before[i] = t.entry(e.PlayerID).Rating
	}
	deltas := make([]float64, n)
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			pi, pj := placeKey(r.Entrants[i].Place), placeKey(r.Entrants[j].Place)
			score := 0.0
			switch {
			case pi == pj:
				score = 0.5
			case pi < pj:
				score = 1
			}
			d := pairK * (score - expected(before[i], before[j]))
			deltas[i] += d
			deltas[j] -= d
		}
	}
	for i, e := range r.Entrants {
		result := 0
		if e.Place.Set && !e.Place.DNF && e.Place.N == 1 {
			result = 1
		}
		applyDelta(t.entry(e.PlayerID), deltas[i], result)
	}
}

// Ratings replays every finished match and race in time order (computeRatings in the app)
// and returns one entry per player who has played, in first-seen order.
func Ratings(matches []Match, races []Race) []Rating {
	type event struct {
		at    string
		match *Match
		race  *Race
	}
	var events []event
	for i := range matches {
		if matches[i].Outcome.Status != "in_progress" {
			events = append(events, event{at: matches[i].UpdatedAt, match: &matches[i]})
		}
	}
	for i := range races {
		if races[i].Status == "completed" {
			events = append(events, event{at: races[i].UpdatedAt, race: &races[i]})
		}
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i].at < events[j].at })

	t := &table{byID: map[string]*Rating{}}
	for _, e := range events {
		if e.match != nil {
			t.rateMatch(*e.match)
		} else {
			t.rateRace(*e.race)
		}
	}
	out := make([]Rating, 0, len(t.order))
	for _, id := range t.order {
		e := t.byID[id]
		e.Rating = roundHalfUp(e.Rating)
		e.Peak = roundHalfUp(e.Peak)
		out = append(out, *e)
	}
	return out
}
