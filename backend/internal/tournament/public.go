package tournament

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/vaibhav/snookit-server/internal/public"
	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

// Loader reads a tournament and everything its page needs.
type Loader interface {
	PublicTournament(ctx context.Context, id string) (tournament, league syncmod.Doc, fixtures, players []syncmod.Doc, err error)
}

// PublicPages adapts tournaments to the public bracket page (public.TournamentSource).
type PublicPages struct{ loader Loader }

// NewPublicPages builds the adapter.
func NewPublicPages(l Loader) *PublicPages { return &PublicPages{loader: l} }

// PublicBracket builds the page view with short names (guest privacy).
func (p *PublicPages) PublicBracket(ctx context.Context, id string) (public.Bracket, error) {
	tDoc, lDoc, fixtureDocs, playerDocs, err := p.loader.PublicTournament(ctx, id)
	if err != nil {
		return public.Bracket{}, err
	}
	var t Tournament
	if err := json.Unmarshal(tDoc.Data, &t); err != nil {
		return public.Bracket{}, fmt.Errorf("decode tournament: %w", err)
	}
	fixtures := make([]Fixture, 0, len(fixtureDocs))
	for _, d := range fixtureDocs {
		var f Fixture
		if err := json.Unmarshal(d.Data, &f); err != nil {
			return public.Bracket{}, fmt.Errorf("decode fixture: %w", err)
		}
		fixtures = append(fixtures, f)
	}
	state, err := Derive(t, fixtures)
	if err != nil {
		return public.Bracket{}, err
	}
	names := map[string]string{}
	for _, d := range playerDocs {
		var card struct {
			DisplayName string `json:"displayName"`
		}
		if json.Unmarshal(d.Data, &card) == nil {
			names[d.ID] = public.ShortName(card.DisplayName)
		}
	}
	name := func(id string) string {
		if id == "" {
			return "-"
		}
		if n, ok := names[id]; ok {
			return n
		}
		return "Player"
	}
	var league struct {
		Name string `json:"name"`
	}
	_ = json.Unmarshal(lDoc.Data, &league) // a missing name just shows nothing
	b := public.Bracket{Name: t.Name, League: league.Name, Status: "In progress"}
	if state.Completed {
		b.Status, b.Champion = "Finished", name(state.Champion)
	}
	side := func(winner, a string) string {
		switch {
		case winner == "":
			return ""
		case winner == a:
			return "a"
		}
		return "b"
	}
	if t.Format == Knockout {
		for r, slots := range state.Rounds {
			round := public.BracketRound{Name: RoundName(r, len(state.Rounds))}
			for _, s := range slots {
				score := "-"
				if s.MatchID != "" {
					score = strconv.Itoa(s.FramesA) + " - " + strconv.Itoa(s.FramesB)
				}
				round.Matches = append(round.Matches, public.BracketMatch{
					SideA: name(s.A), SideB: name(s.B), Score: score, Winner: side(s.Winner, s.A)})
			}
			b.Rounds = append(b.Rounds, round)
		}
		return b, nil
	}
	table := public.BracketRound{Name: "Table"}
	for i, row := range state.Standings {
		table.Matches = append(table.Matches, public.BracketMatch{
			SideA: strconv.Itoa(i+1) + ". " + name(row.PlayerID),
			Score: strconv.Itoa(row.Points) + " pts",
			SideB: strconv.Itoa(row.Won) + "-" + strconv.Itoa(row.Lost),
		})
	}
	fixturesRound := public.BracketRound{Name: "Fixtures"}
	for _, pr := range state.Pairings {
		fixturesRound.Matches = append(fixturesRound.Matches, public.BracketMatch{
			SideA: name(pr.A), SideB: name(pr.B), Score: map[bool]string{true: "played", false: "-"}[pr.Winner != ""],
			Winner: side(pr.Winner, pr.A)})
	}
	b.Rounds = []public.BracketRound{table, fixturesRound}
	return b, nil
}
