// Package tournament works out a tournament's state from its fixtures. Nothing is stored:
// the bracket (who plays whom next, who advanced) is recomputed from the tournament document
// and the finished matches tagged with it, so every phone and the public page agree and
// winners "move on" by themselves. The app has the same logic in TypeScript
// (frontend/src/features/tournament/services/bracket.ts); fixtures/tournament keeps them equal.
package tournament

import (
	"fmt"
	"sort"
)

// Formats.
const (
	Knockout   = "knockout"
	RoundRobin = "round_robin"
)

// Tournament is the stored document.
type Tournament struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Format   string   `json:"format"`
	Entrants []string `json:"entrants"` // player ids in seed order (best first)
}

// Fixture is a finished or running tournament match.
type Fixture struct {
	ID           string   `json:"id"`
	TournamentID string   `json:"tournamentId"`
	Round        int      `json:"round"`
	Slot         int      `json:"slot"`
	TeamA        []string `json:"teamA"`
	TeamB        []string `json:"teamB"`
	Outcome      struct {
		Status  string `json:"status"`
		Winner  string `json:"winner"`
		FramesA int    `json:"framesA"`
		FramesB int    `json:"framesB"`
	} `json:"outcome"`
}

// Slot is one knockout pairing.
type Slot struct {
	Round   int    `json:"round"`
	Slot    int    `json:"slot"`
	A       string `json:"a"`       // "" = bye or not decided yet
	B       string `json:"b"`       // "" = bye or not decided yet
	Winner  string `json:"winner"`  // player id, "" until decided
	MatchID string `json:"matchId"` // fixture played for this slot, if any
	FramesA int    `json:"framesA"`
	FramesB int    `json:"framesB"`
}

// Standing is one round-robin table row.
type Standing struct {
	PlayerID      string `json:"playerId"`
	Played        int    `json:"played"`
	Won           int    `json:"won"`
	Lost          int    `json:"lost"`
	FramesFor     int    `json:"framesFor"`
	FramesAgainst int    `json:"framesAgainst"`
	Points        int    `json:"points"`
}

// Pairing is one round-robin fixture (Slot is its fixture index).
type Pairing struct {
	Slot    int    `json:"slot"`
	A       string `json:"a"`
	B       string `json:"b"`
	Winner  string `json:"winner"`
	MatchID string `json:"matchId"`
}

// State is everything the bracket screen and page show.
type State struct {
	Format    string     `json:"format"`
	Rounds    [][]Slot   `json:"rounds,omitempty"`    // knockout
	Pairings  []Pairing  `json:"pairings,omitempty"`  // round robin
	Standings []Standing `json:"standings,omitempty"` // round robin
	Champion  string     `json:"champion"`
	Completed bool       `json:"completed"`
}

// Derive computes the tournament state from its fixtures.
func Derive(t Tournament, fixtures []Fixture) (State, error) {
	byKey := map[[2]int]Fixture{}
	for _, f := range fixtures {
		if f.TournamentID != t.ID {
			continue
		}
		key := [2]int{f.Round, f.Slot}
		// Prefer a finished fixture if a slot was (wrongly) played twice.
		if prev, ok := byKey[key]; !ok || (!finished(prev) && finished(f)) {
			byKey[key] = f
		}
	}
	switch t.Format {
	case Knockout:
		return knockout(t, byKey), nil
	case RoundRobin:
		return roundRobin(t, byKey), nil
	}
	return State{}, fmt.Errorf("unknown tournament format %q", t.Format)
}

func finished(f Fixture) bool {
	return f.Outcome.Status == "completed" || f.Outcome.Status == "forfeited"
}

func winnerOf(f Fixture) string {
	if !finished(f) {
		return ""
	}
	team := f.TeamA
	if f.Outcome.Winner == "b" {
		team = f.TeamB
	}
	if len(team) == 0 {
		return ""
	}
	return team[0]
}

// SeedPositions returns the standard bracket order for size (a power of two): seed numbers
// (1-based) by bracket position, so the top seeds can only meet late.
func SeedPositions(size int) []int {
	pos := []int{1, 2}
	for len(pos) < size {
		next := make([]int, 0, len(pos)*2)
		n := len(pos)*2 + 1
		for _, s := range pos {
			next = append(next, s, n-s)
		}
		pos = next
	}
	return pos
}

func bracketSize(entrants int) int {
	size := 2
	for size < entrants {
		size *= 2
	}
	return size
}

func knockout(t Tournament, fixtures map[[2]int]Fixture) State {
	size := bracketSize(len(t.Entrants))
	seeds := SeedPositions(size)
	entrant := func(seed int) string {
		if seed <= len(t.Entrants) {
			return t.Entrants[seed-1]
		}
		return "" // bye
	}
	st := State{Format: Knockout}
	var prev []Slot
	for round := 0; size>>round > 1; round++ {
		count := size >> (round + 1)
		slots := make([]Slot, count)
		for s := 0; s < count; s++ {
			slot := Slot{Round: round, Slot: s}
			if round == 0 {
				slot.A, slot.B = entrant(seeds[2*s]), entrant(seeds[2*s+1])
			} else {
				slot.A, slot.B = prev[2*s].Winner, prev[2*s+1].Winner
			}
			switch {
			case round == 0 && slot.A != "" && slot.B == "":
				slot.Winner = slot.A // bye
			case round == 0 && slot.B != "" && slot.A == "":
				slot.Winner = slot.B
			default:
				if f, ok := fixtures[[2]int{round, s}]; ok {
					slot.MatchID, slot.FramesA, slot.FramesB = f.ID, f.Outcome.FramesA, f.Outcome.FramesB
					if slot.A != "" && slot.B != "" {
						slot.Winner = winnerOf(f)
					}
				}
			}
			slots[s] = slot
		}
		st.Rounds = append(st.Rounds, slots)
		prev = slots
	}
	if len(prev) == 1 && prev[0].Winner != "" {
		st.Champion, st.Completed = prev[0].Winner, true
	}
	return st
}

// RoundRobinPairs lists every pairing once, in a fixed order (its index is the fixture slot).
func RoundRobinPairs(entrants []string) [][2]string {
	var out [][2]string
	for i := 0; i < len(entrants); i++ {
		for j := i + 1; j < len(entrants); j++ {
			out = append(out, [2]string{entrants[i], entrants[j]})
		}
	}
	return out
}

func roundRobin(t Tournament, fixtures map[[2]int]Fixture) State {
	rows := map[string]*Standing{}
	seed := map[string]int{}
	for i, id := range t.Entrants {
		rows[id] = &Standing{PlayerID: id}
		seed[id] = i
	}
	st := State{Format: RoundRobin}
	pairs := RoundRobinPairs(t.Entrants)
	done := 0
	for i, p := range pairs {
		pairing := Pairing{Slot: i, A: p[0], B: p[1]}
		if f, ok := fixtures[[2]int{0, i}]; ok {
			pairing.MatchID = f.ID
			if w := winnerOf(f); w != "" {
				pairing.Winner = w
				done++
				// Frames are counted from each player's own side, whichever side they played.
				a, b := rows[p[0]], rows[p[1]]
				aFrames, bFrames := f.Outcome.FramesA, f.Outcome.FramesB
				if len(f.TeamA) > 0 && f.TeamA[0] == p[1] {
					aFrames, bFrames = bFrames, aFrames
				}
				a.Played++
				b.Played++
				a.FramesFor += aFrames
				a.FramesAgainst += bFrames
				b.FramesFor += bFrames
				b.FramesAgainst += aFrames
				if w == p[0] {
					a.Won++
					b.Lost++
				} else {
					b.Won++
					a.Lost++
				}
			}
		}
		st.Pairings = append(st.Pairings, pairing)
	}
	for _, id := range t.Entrants {
		r := rows[id]
		r.Points = 2 * r.Won
		st.Standings = append(st.Standings, *r)
	}
	sort.SliceStable(st.Standings, func(i, j int) bool {
		a, b := st.Standings[i], st.Standings[j]
		if a.Points != b.Points {
			return a.Points > b.Points
		}
		if da, db := a.FramesFor-a.FramesAgainst, b.FramesFor-b.FramesAgainst; da != db {
			return da > db
		}
		if a.FramesFor != b.FramesFor {
			return a.FramesFor > b.FramesFor
		}
		return seed[a.PlayerID] < seed[b.PlayerID]
	})
	if len(pairs) > 0 && done == len(pairs) {
		st.Champion, st.Completed = st.Standings[0].PlayerID, true
	}
	return st
}

// RoundName names a knockout round counted from the start, given the number of rounds.
func RoundName(round, rounds int) string {
	switch rounds - round {
	case 1:
		return "Final"
	case 2:
		return "Semi-finals"
	case 3:
		return "Quarter-finals"
	}
	return fmt.Sprintf("Round of %d", 1<<(rounds-round))
}
