package stats

import (
	"encoding/json"
	"math"
	"sort"
)

// UnmarshalJSON accepts a number, "dnf" or null, like the app's RacePlace.
func (p *Place) UnmarshalJSON(raw []byte) error {
	// Decoding null into a number succeeds in Go (leaving 0), so check for it first.
	if string(raw) == "null" {
		*p = Place{}
		return nil
	}
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil {
		*p = Place{N: int(n), Set: true}
		return nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil && s == "dnf" {
		*p = Place{DNF: true, Set: true}
		return nil
	}
	*p = Place{}
	return nil
}

// MarshalJSON writes the place back in the app's shape.
func (p Place) MarshalJSON() ([]byte, error) {
	switch {
	case p.DNF:
		return []byte(`"dnf"`), nil
	case p.Set:
		return json.Marshal(p.N)
	}
	return []byte("null"), nil
}

// roundHalfUp matches JavaScript's Math.round (halves round towards +infinity).
func roundHalfUp(x float64) float64 { return math.Floor(x + 0.5) }

func pct(part, whole int) float64 {
	if whole <= 0 {
		return 0
	}
	return roundHalfUp(float64(part)/float64(whole)*1000) / 10
}

func avgOrNil(sum float64, count int) *float64 {
	if count <= 0 {
		return nil
	}
	v := roundHalfUp(sum / float64(count))
	return &v
}

func contains(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// visit is one scoring visit (a break).
type visit struct {
	side     string
	value    float64
	playerID string
}

// visitBreaks mirrors frame-engine.ts: a foul, miss or safety ends the visit.
func visitBreaks(shots []Shot) []visit {
	var out []visit
	var current float64
	side, player := "", ""
	flush := func() {
		if side != "" && current > 0 {
			out = append(out, visit{side: side, value: current, playerID: player})
		}
		current, side, player = 0, "", ""
	}
	for _, s := range shots {
		if s.Kind == "pot" || s.Kind == "free_ball" {
			shotPlayer := ""
			if s.PlayerID != nil {
				shotPlayer = *s.PlayerID
			}
			if side != "" && (side != s.Side || (shotPlayer != "" && player != "" && shotPlayer != player)) {
				flush()
			}
			side = s.Side
			if shotPlayer != "" {
				player = shotPlayer
			}
			current += s.Points
		} else {
			flush()
		}
	}
	flush()
	return out
}

type shotTotals struct{ scored, fouls, foulPoints float64 }

// playerShotTotals mirrors frame-rank.ts: untagged shots count for the side's last player.
func playerShotTotals(shots []Shot, teamA, teamB []string) map[string]*shotTotals {
	totals := map[string]*shotTotals{}
	for _, id := range append(append([]string{}, teamA...), teamB...) {
		totals[id] = &shotTotals{}
	}
	last := map[string]string{}
	first := func(side string) string {
		ids := teamA
		if side == "b" {
			ids = teamB
		}
		if len(ids) == 0 {
			return ""
		}
		return ids[0]
	}
	for _, s := range shots {
		pid := ""
		if s.PlayerID != nil && *s.PlayerID != "" {
			pid = *s.PlayerID
			last[s.Side] = pid
		} else if l := last[s.Side]; l != "" {
			pid = l
		} else {
			pid = first(s.Side)
		}
		t, ok := totals[pid]
		if pid == "" || !ok {
			continue
		}
		switch s.Kind {
		case "pot", "free_ball":
			t.scored += s.Points
			last[s.Side] = pid
		case "foul":
			t.fouls++
			t.foulPoints += s.Points
		}
	}
	return totals
}

// sortedBy returns a copy ordered by updatedAt (stable, like Array.prototype.sort).
func sortedMatches(ms []Match) []Match {
	out := append([]Match(nil), ms...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].UpdatedAt < out[j].UpdatedAt })
	return out
}

// Standard computes one player's match statistics (recomputeStandardStats in the app).
func Standard(playerID string, matches []Match) StandardStats {
	var relevant []Match
	for _, m := range sortedMatches(matches) {
		if m.Outcome.Status != "in_progress" && (contains(m.TeamA, playerID) || contains(m.TeamB, playerID)) {
			relevant = append(relevant, m)
		}
	}
	var s StandardStats
	var winSecs, lossSecs float64
	for _, m := range relevant {
		side := "b"
		if contains(m.TeamA, playerID) {
			side = "a"
		}
		won := (m.Outcome.Status == "completed" || m.Outcome.Status == "forfeited") && m.Outcome.Winner == side
		if m.Outcome.Status == "forfeited" {
			if m.Outcome.ForfeitedBy == side {
				s.Forfeits++
			}
			if won {
				s.WinsByForfeit++
			}
		}
		if won {
			s.Wins++
			s.Streak++
		} else {
			s.Streak = 0
		}
		if m.CrownsChampion && won {
			s.Titles++
		}
		at := m.UpdatedAt
		s.LastPlayedAt = &at

		for _, f := range m.Frames {
			tagged := false
			for _, sh := range f.Shots {
				if sh.PlayerID != nil && *sh.PlayerID != "" {
					tagged = true
					break
				}
			}
			if tagged {
				if mine, ok := playerShotTotals(f.Shots, m.TeamA, m.TeamB)[playerID]; ok {
					s.PointsScored += mine.scored
					s.Fouls += int(mine.fouls)
					s.FoulPoints += mine.foulPoints
				}
			} else if side == "a" {
				s.PointsScored += f.TeamAPoints
			} else {
				s.PointsScored += f.TeamBPoints
			}
			for _, v := range visitBreaks(f.Shots) {
				if (v.playerID != "" && v.playerID != playerID) || (v.playerID == "" && v.side != side) {
					continue
				}
				if v.value > s.HighestBreak {
					s.HighestBreak = v.value
				}
				if v.value >= 50 {
					s.Breaks50++
				}
				if v.value >= 100 {
					s.Centuries++
				}
				if v.value == 147 {
					s.Maximums++
				}
			}
			if f.DurationSeconds == nil || *f.DurationSeconds < 0 || math.IsInf(*f.DurationSeconds, 0) {
				continue
			}
			d := *f.DurationSeconds
			s.TimedFrames++
			s.TotalFrameSeconds += d
			if s.FastestFrameSeconds == nil || d < *s.FastestFrameSeconds {
				v := d
				s.FastestFrameSeconds = &v
			}
			if s.SlowestFrameSeconds == nil || d > *s.SlowestFrameSeconds {
				v := d
				s.SlowestFrameSeconds = &v
			}
			if f.Winner == side {
				s.TimedFramesWon++
				winSecs += d
			} else {
				s.TimedFramesLost++
				lossSecs += d
			}
		}
	}
	s.Played = len(relevant)
	s.WinPct = pct(s.Wins, s.Played)
	s.AvgFrameSeconds = avgOrNil(s.TotalFrameSeconds, s.TimedFrames)
	s.AvgWinFrameSeconds = avgOrNil(winSecs, s.TimedFramesWon)
	s.AvgLossFrameSeconds = avgOrNil(lossSecs, s.TimedFramesLost)
	s.NetPoints = s.PointsScored - s.FoulPoints
	return s
}

// RaceStatsFor computes one player's race statistics (recomputeRaceStats in the app).
func RaceStatsFor(playerID string, races []Race) RaceStats {
	ordered := append([]Race(nil), races...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].UpdatedAt < ordered[j].UpdatedAt })
	var s RaceStats
	var placeSum, placeCount int
	for _, r := range ordered {
		if r.Status != "completed" {
			continue
		}
		var entrant *Entrant
		for i := range r.Entrants {
			if r.Entrants[i].PlayerID == playerID {
				entrant = &r.Entrants[i]
				break
			}
		}
		if entrant == nil {
			continue
		}
		s.Played++
		at := r.UpdatedAt
		s.LastPlayedAt = &at
		if !entrant.Place.Set || entrant.Place.DNF {
			s.FirstStreak = 0
			continue
		}
		place := entrant.Place.N
		placeSum += place
		placeCount++
		if place == 1 {
			s.Firsts++
			s.FirstStreak++
		} else {
			s.FirstStreak = 0
		}
		if place == 2 {
			s.Seconds++
		}
		if place == 3 {
			s.Thirds++
		}
		if r.CrownsRaceChampion && place == 1 {
			s.Titles++
		}
	}
	s.PodiumPct = pct(s.Firsts+s.Seconds+s.Thirds, s.Played)
	s.FirstPct = pct(s.Firsts, s.Played)
	if placeCount > 0 {
		v := roundHalfUp(float64(placeSum)/float64(placeCount)*10) / 10
		s.AvgPlace = &v
	}
	return s
}
