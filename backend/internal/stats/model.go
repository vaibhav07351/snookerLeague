// Package stats computes the numbers the app shows from match and race documents: player
// statistics and the per-league Elo rating. It mirrors the app's TypeScript (stats.service.ts,
// rating.service.ts, frame-engine visitBreaks, frame-rank playerShotTotals) exactly, and the
// shared cases in fixtures/stats keep the two from drifting apart.
package stats

// Shot is one logged shot.
type Shot struct {
	Side     string  `json:"side"`
	Kind     string  `json:"kind"`
	Points   float64 `json:"points"`
	PlayerID *string `json:"playerId,omitempty"`
}

// Frame is one finished frame.
type Frame struct {
	TeamAPoints     float64  `json:"teamAPoints"`
	TeamBPoints     float64  `json:"teamBPoints"`
	Winner          string   `json:"winner"`
	DurationSeconds *float64 `json:"durationSeconds,omitempty"`
	Shots           []Shot   `json:"shots,omitempty"`
}

// Outcome is a match result. Status is completed, forfeited or in_progress.
type Outcome struct {
	Status      string `json:"status"`
	Winner      string `json:"winner,omitempty"`
	ForfeitedBy string `json:"forfeitedBy,omitempty"`
}

// Match is the part of a match document the numbers depend on.
type Match struct {
	ID        string `json:"id"`
	UpdatedAt string `json:"updatedAt"`
	// FinishedAt is when the result was decided; later edits only move UpdatedAt.
	FinishedAt     string   `json:"finishedAt"`
	TeamA          []string `json:"teamA"`
	TeamB          []string `json:"teamB"`
	CrownsChampion bool     `json:"crownsChampion"`
	Frames         []Frame  `json:"frames"`
	Outcome        Outcome  `json:"outcome"`
}

// PlayedAt is when the match was played: its finish time, or the last edit for matches saved
// before finish times existed (playedAt / matchPlayedAt in the app).
func (m Match) PlayedAt() string {
	if m.FinishedAt != "" {
		return m.FinishedAt
	}
	return m.UpdatedAt
}

// Place is a race finishing place: a number, "dnf", or nothing yet.
type Place struct {
	N   int
	DNF bool
	Set bool
}

// Entrant is one player in a race.
type Entrant struct {
	PlayerID string `json:"playerId"`
	Place    Place  `json:"place"`
}

// RaceShot is one live-scored race shot. Ball 1 is a red (10 points in a race).
type RaceShot struct {
	PlayerID string  `json:"playerId"`
	Kind     string  `json:"kind"`
	Points   float64 `json:"points"`
	Ball     int     `json:"ball,omitempty"`
}

// Race is the part of a race document the numbers depend on.
type Race struct {
	ID                 string     `json:"id"`
	UpdatedAt          string     `json:"updatedAt"`
	Status             string     `json:"status"`
	CrownsRaceChampion bool       `json:"crownsRaceChampion"`
	Entrants           []Entrant  `json:"entrants"`
	LiveShots          []RaceShot `json:"liveShots,omitempty"`
}

// StandardStats are a player's match statistics (same fields as the app's StandardStats).
type StandardStats struct {
	Played              int      `json:"played"`
	Wins                int      `json:"wins"`
	WinPct              float64  `json:"winPct"`
	LastPlayedAt        *string  `json:"lastPlayedAt"`
	Streak              int      `json:"streak"`
	Titles              int      `json:"titles"`
	Forfeits            int      `json:"forfeits"`
	WinsByForfeit       int      `json:"winsByForfeit"`
	TimedFrames         int      `json:"timedFrames"`
	TotalFrameSeconds   float64  `json:"totalFrameSeconds"`
	AvgFrameSeconds     *float64 `json:"avgFrameSeconds"`
	TimedFramesWon      int      `json:"timedFramesWon"`
	AvgWinFrameSeconds  *float64 `json:"avgWinFrameSeconds"`
	TimedFramesLost     int      `json:"timedFramesLost"`
	AvgLossFrameSeconds *float64 `json:"avgLossFrameSeconds"`
	FastestFrameSeconds *float64 `json:"fastestFrameSeconds"`
	SlowestFrameSeconds *float64 `json:"slowestFrameSeconds"`
	HighestBreak        float64  `json:"highestBreak"`
	Breaks50            int      `json:"breaks50"`
	Centuries           int      `json:"centuries"`
	Maximums            int      `json:"maximums"`
	PointsScored        float64  `json:"pointsScored"`
	Fouls               int      `json:"fouls"`
	FoulPoints          float64  `json:"foulPoints"`
	NetPoints           float64  `json:"netPoints"`
	Misses              int      `json:"misses"`
	Safeties            int      `json:"safeties"`
}

// RaceStats are a player's race statistics (same fields as the app's RaceStats).
type RaceStats struct {
	Played       int      `json:"played"`
	Firsts       int      `json:"firsts"`
	Seconds      int      `json:"seconds"`
	Thirds       int      `json:"thirds"`
	PodiumPct    float64  `json:"podiumPct"`
	AvgPlace     *float64 `json:"avgPlace"`
	FirstPct     float64  `json:"firstPct"`
	LastPlayedAt *string  `json:"lastPlayedAt"`
	FirstStreak  int      `json:"firstStreak"`
	Titles       int      `json:"titles"`
	// From the live shot log; races scored by typing totals add nothing.
	Reds           int     `json:"reds"`
	MostRedsInRace int     `json:"mostRedsInRace"`
	HighestBreak   float64 `json:"highestBreak"`
	Misses         int     `json:"misses"`
	Safeties       int     `json:"safeties"`
}

// Rating is one player's league rating after replaying every result.
type Rating struct {
	PlayerID      string    `json:"playerId"`
	Rating        float64   `json:"rating"`
	Peak          float64   `json:"peak"`
	Games         int       `json:"games"`
	Provisional   bool      `json:"provisional"`
	History       []float64 `json:"history"`
	Form          []int     `json:"form"`
	CurrentStreak int       `json:"currentStreak"`
	BestStreak    int       `json:"bestStreak"`
}
