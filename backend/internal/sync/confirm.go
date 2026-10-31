package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
)

// Result confirmation (public rating, phase 6): a player from the other side confirms a
// finished match before it counts for the public rating. A confirmation is the only change a
// non-scoring player may make, and any later change to the result clears all confirmations.

// resultFields are the match fields that make up its result.
var resultFields = []string{"teamA", "teamB", "frames", "outcome"}

// confirmingOwnResult reports whether the change only adds userID to confirmedByUids on a
// finished match in which userID owns a player card.
func confirmingOwnResult(ctx context.Context, tx Tx, userID string, op Op, cur, next fields) (bool, error) {
	if op.Action != ActionUpsert || cur == nil {
		return false, nil
	}
	for _, k := range changedKeys(cur, next) {
		if k != "confirmedByUids" && k != "updatedAt" {
			return false, nil
		}
	}
	before, after := strList(cur["confirmedByUids"]), strList(next["confirmedByUids"])
	if slices.Contains(before, userID) || !reflect.DeepEqual(append(before, userID), after) {
		return false, nil
	}
	var outcome struct {
		Status string `json:"status"`
	}
	if raw, err := json.Marshal(cur["outcome"]); err != nil || json.Unmarshal(raw, &outcome) != nil ||
		(outcome.Status != "completed" && outcome.Status != "forfeited") {
		return false, nil
	}
	for _, id := range append(strList(cur["teamA"]), strList(cur["teamB"])...) {
		card, err := tx.Get(ctx, EntityPlayer, id)
		if errors.Is(err, ErrNotFound) {
			continue
		}
		if err != nil {
			return false, fmt.Errorf("load player card: %w", err)
		}
		f, err := decodeFields(card.Data)
		if err != nil {
			return false, err
		}
		if card.LeagueID == op.LeagueID && f.str("authUid") == userID {
			return true, nil
		}
	}
	return false, nil
}

// clearConfirmationsOnChange returns the match JSON with confirmedByUids emptied when the
// result changed, so an edited result must be confirmed again.
func clearConfirmationsOnChange(cur, next fields, data json.RawMessage) (json.RawMessage, error) {
	if cur == nil || len(strList(next["confirmedByUids"])) == 0 {
		return data, nil
	}
	changed := changedKeys(cur, next)
	if !slices.ContainsFunc(resultFields, func(k string) bool { return slices.Contains(changed, k) }) {
		return data, nil
	}
	next["confirmedByUids"] = []string{}
	out, err := json.Marshal(next)
	if err != nil {
		return nil, fmt.Errorf("encode match: %w", err)
	}
	return out, nil
}

func strList(v any) []string {
	items, _ := v.([]any)
	out := make([]string, 0, len(items))
	for _, it := range items {
		if s, ok := it.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
