package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"time"
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

// serverFinishedAtKey is when the server first saw the match finished. The public rating uses
// it instead of the phone's finishedAt, which a phone could backdate past the anti-cheat
// window (at most 3 rated games per pair per 30 days).
const serverFinishedAtKey = "serverFinishedAt"

// serverOwnedMatchKeys are match fields the server sets itself (settleMatchFields), so a phone's
// stale copy of them never counts as a change in permission checks.
var serverOwnedMatchKeys = []string{"confirmedByUids", serverFinishedAtKey}

func isFinished(status string) bool { return status == "completed" || status == "forfeited" }

func resultChanged(cur, next fields) bool {
	changed := changedKeys(cur, next)
	return slices.ContainsFunc(resultFields, func(k string) bool { return slices.Contains(changed, k) })
}

// pinServerFinishedAt overwrites whatever serverFinishedAt a phone sent with the stored one, so
// phones can never set it and permission checks never see it as a change.
func pinServerFinishedAt(cur fields, data json.RawMessage) (json.RawMessage, error) {
	next, err := decodeFields(data)
	if err != nil {
		return data, nil //nolint:nilerr // invalid JSON is refused by the permission check
	}
	_, sent := next[serverFinishedAtKey]
	stored, has := cur[serverFinishedAtKey]
	if !sent && !has {
		return data, nil
	}
	if has {
		next[serverFinishedAtKey] = stored
	} else {
		delete(next, serverFinishedAtKey)
	}
	out, err := json.Marshal(next)
	if err != nil {
		return nil, fmt.Errorf("encode match: %w", err)
	}
	return out, nil
}

// settleMatchFields sets the match fields the server owns before saving:
//   - confirmedByUids: only an opponent's own confirmation adds to it (confirming); any other
//     write keeps the stored list, emptied on a new match or when the result changed.
//   - serverFinishedAt: stamped when the match first becomes finished, kept while it stays
//     finished, removed when it is reopened.
func settleMatchFields(cur, next fields, confirming bool, now time.Time) (json.RawMessage, error) {
	if !confirming {
		keep := []string{}
		if cur != nil && !resultChanged(cur, next) {
			keep = strList(cur["confirmedByUids"])
		}
		_, sent := next["confirmedByUids"]
		if sent || len(keep) > 0 {
			next["confirmedByUids"] = keep
		}
	}
	switch {
	case !isFinished(next.outcomeStatus()):
		delete(next, serverFinishedAtKey)
	case cur == nil || !isFinished(cur.outcomeStatus()) || cur.str(serverFinishedAtKey) == "":
		next[serverFinishedAtKey] = now.UTC().Format(time.RFC3339Nano)
	default:
		next[serverFinishedAtKey] = cur[serverFinishedAtKey]
	}
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
