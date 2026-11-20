package sync

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
)

// fixtureTagKeys tie a match to a tournament slot. The bracket is worked out from them, so a
// wrong tag would put a result into somebody's tournament.
var fixtureTagKeys = []string{"tournamentId", "round", "slot"}

// checkFixtureTag guards the tournament tag on a match write:
//   - it is set when the match is created and never changes, so an old result can't be moved
//     into a bracket afterwards;
//   - a new fixture must be a singles match between two entrants of a tournament in this league.
//
// A tournament that has not reached the server yet is retried later (the phone sends it in the
// same queue). A deleted tournament leaves its fixtures as ordinary league matches.
func checkFixtureTag(ctx context.Context, tx Tx, op Op, cur, next fields) (*rejection, error) {
	if op.Action != ActionUpsert {
		return nil, nil
	}
	if cur != nil {
		for _, k := range fixtureTagKeys {
			if !reflect.DeepEqual(cur[k], next[k]) {
				return reject("forbidden", "A match's tournament fixture can't be changed."), nil
			}
		}
		return nil, nil
	}
	id := next.str("tournamentId")
	if id == "" {
		return nil, nil
	}
	doc, err := tx.Get(ctx, EntityTournament, id)
	if errors.Is(err, ErrNotFound) {
		return reject(retryLaterCode, "The tournament this fixture belongs to has not been saved yet."), nil
	}
	if err != nil {
		return nil, fmt.Errorf("load tournament: %w", err)
	}
	if doc.LeagueID != op.LeagueID {
		return reject("forbidden", "That tournament is not in this league."), nil
	}
	if doc.Deleted {
		return nil, nil
	}
	t, err := decodeFields(doc.Data)
	if err != nil {
		return nil, err
	}
	entrants := t.strList("entrants")
	a, b := next.strList("teamA"), next.strList("teamB")
	if len(a) != 1 || len(b) != 1 || a[0] == b[0] ||
		!slices.Contains(entrants, a[0]) || !slices.Contains(entrants, b[0]) {
		return reject("forbidden", "A tournament fixture must be between two of its entrants."), nil
	}
	return nil, nil
}
