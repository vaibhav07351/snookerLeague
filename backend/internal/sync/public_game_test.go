package sync

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestPublicGameReadsOnlyTheCardsAGameMayHold(t *testing.T) {
	entrants := make([]string, 0, maxRaceSize+4)
	for i := range maxRaceSize + 4 {
		entrants = append(entrants, fmt.Sprintf(`{"playerId":"p%d"}`, i))
	}
	race := json.RawMessage(`{"entrants":[` + strings.Join(entrants, ",") + `]}`)
	if ids, err := gamePlayerIDs(EntityRace, race); err != nil || len(ids) != maxRaceSize || ids[0] != "p0" {
		t.Fatalf("race ids %v (%v)", ids, err)
	}
	group := json.RawMessage(`{"playerIds":["a","b","c"]}`)
	if ids, err := gamePlayerIDs(EntityGroupMatch, group); err != nil || len(ids) != 3 {
		t.Fatalf("group ids %v (%v)", ids, err)
	}
	match := json.RawMessage(`{"teamA":["a","b","c"],"teamB":["d","e"]}`)
	if ids, err := gamePlayerIDs(EntityMatch, match); err != nil || len(ids) != 2*maxTeamSize {
		t.Fatalf("match ids %v (%v)", ids, err)
	}
	if _, err := gamePlayerIDs(EntityLeague, match); err == nil {
		t.Fatal("a league is not a game")
	}
}
