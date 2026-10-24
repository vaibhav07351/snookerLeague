package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
)

// rejection is a permission or validation refusal: the operation is dropped and the phone
// re-reads the document. It is a normal outcome, not a server failure.
type rejection struct {
	code    string
	message string
}

func reject(code, message string) *rejection { return &rejection{code: code, message: message} }

// fields is a decoded document body, used only to read the few fields rules depend on.
type fields map[string]any

func decodeFields(raw json.RawMessage) (fields, error) {
	if len(raw) == 0 {
		return fields{}, nil
	}
	var f fields
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, fmt.Errorf("decode document: %w", err)
	}
	return f, nil
}

func (f fields) str(key string) string {
	s, _ := f[key].(string)
	return s
}

func (f fields) strList(key string) []string {
	raw, _ := f[key].([]any)
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func (f fields) outcomeStatus() string {
	o, _ := f["outcome"].(map[string]any)
	s, _ := o["status"].(string)
	return s
}

// changedKeys lists the top-level keys whose values differ between two documents.
func changedKeys(a, b fields) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range []fields{a, b} {
		for k := range m {
			if seen[k] {
				continue
			}
			seen[k] = true
			if !reflect.DeepEqual(a[k], b[k]) {
				out = append(out, k)
			}
		}
	}
	return out
}

// authorize decides whether userID may apply op to the current stored document (nil when the
// document does not exist yet). These rules are ported from the old Firestore rules, with the
// known holes closed: league fields are immutable where they must be, and city hubs have no
// owner, cannot be created by clients and cannot be deleted.
func authorize(ctx context.Context, tx Tx, userID string, op Op, current *Doc) (*rejection, error) {
	if op.Entity == EntityEvent {
		return reject("server_only", "Feed events are created by the server."), nil
	}
	if current != nil && current.Deleted {
		return reject("deleted", "This item was deleted."), nil
	}
	if op.Entity == EntityLeague {
		return authorizeLeague(ctx, tx, userID, op, current)
	}

	role, err := tx.Role(ctx, op.LeagueID, userID)
	if err != nil {
		return nil, fmt.Errorf("load role: %w", err)
	}
	if role == RoleNone {
		return reject("forbidden", "You are not in this league."), nil
	}
	next, err := decodeFields(op.Data)
	if err != nil {
		return reject("bad_document", "Document is not valid JSON."), nil //nolint:nilerr // client error
	}
	var cur fields
	if current != nil {
		if cur, err = decodeFields(current.Data); err != nil {
			return nil, err
		}
	}

	switch op.Entity {
	case EntityPlayer:
		return authorizePlayer(userID, role, op, cur, next), nil
	case EntityMatch:
		return authorizeMatch(userID, role, op, cur, next), nil
	case EntityRace:
		return authorizeRace(userID, role, op, cur, next), nil
	}
	return reject("bad_entity", "Unknown entity."), nil
}

func authorizeLeague(ctx context.Context, tx Tx, userID string, op Op, current *Doc) (*rejection, error) {
	if op.LeagueID != op.ID {
		return reject("bad_document", "A league's leagueId must equal its id."), nil
	}
	next, err := decodeFields(op.Data)
	if err != nil {
		return reject("bad_document", "Document is not valid JSON."), nil //nolint:nilerr // client error
	}
	if current == nil {
		if op.Action == ActionDelete {
			return reject("not_found", "Nothing to delete."), nil
		}
		if next.str("kind") == "city" {
			return reject("forbidden", "City hubs are created by the server."), nil
		}
		if next.str("createdByUid") != userID {
			return reject("forbidden", "You can only create leagues you own."), nil
		}
		return nil, nil
	}

	role, err := tx.Role(ctx, op.ID, userID)
	if err != nil {
		return nil, fmt.Errorf("load role: %w", err)
	}
	if role == RoleNone {
		return reject("forbidden", "You are not in this league."), nil
	}
	cur, err := decodeFields(current.Data)
	if err != nil {
		return nil, err
	}
	if cur.str("kind") == "city" {
		return reject("forbidden", "City hubs can't be changed by members."), nil
	}
	if op.Action == ActionDelete {
		if role != RoleOwner {
			return reject("forbidden", "Only the league owner can delete it."), nil
		}
		return nil, nil
	}
	changed := changedKeys(cur, next)
	for _, immutable := range []string{"kind", "cityId", "createdByUid"} {
		if slices.Contains(changed, immutable) {
			return reject("forbidden", immutable+" can't be changed."), nil
		}
	}
	if slices.Contains(changed, "inviteCode") && role != RoleOwner {
		return reject("forbidden", "Only the owner can change the invite code."), nil
	}
	return nil, nil
}

func authorizePlayer(userID string, role Role, op Op, cur, next fields) *rejection {
	if op.Action == ActionDelete {
		if role != RoleOwner {
			return reject("forbidden", "Only the league owner can delete players.")
		}
		return nil
	}
	if cur == nil {
		if owner := next.str("authUid"); owner != "" && owner != userID {
			return reject("forbidden", "You can only create your own player card.")
		}
		return nil
	}
	// A card's owner never changes through sync. Claiming a guest card is a separate,
	// approved action (not part of this module yet).
	if cur.str("authUid") != next.str("authUid") {
		return reject("forbidden", "A player card's owner can't be changed.")
	}
	return nil
}

func scorerOf(m fields) string {
	if s := m.str("scorerUid"); s != "" {
		return s
	}
	return m.str("createdByUid")
}

// takingOverScoring: only the scorer fields change, to yourself, while the match is live and
// its scoring policy allows you.
func takingOverScoring(userID string, cur, next fields) bool {
	for _, key := range changedKeys(cur, next) {
		if key != "scorerUid" && key != "updatedAt" && key != "settingsUpdatedAt" {
			return false
		}
	}
	if next.str("scorerUid") != userID || cur.outcomeStatus() != "in_progress" {
		return false
	}
	policy := cur.str("scoringPolicy")
	return policy == "" || policy == "anyone" || slices.Contains(cur.strList("allowedScorerUids"), userID)
}

func authorizeMatch(userID string, role Role, op Op, cur, next fields) *rejection {
	if op.Action == ActionDelete {
		if cur.str("createdByUid") != userID && role != RoleOwner {
			return reject("forbidden", "Only the match creator or league owner can delete a match.")
		}
		return nil
	}
	if cur == nil {
		if next.str("createdByUid") != userID {
			return reject("forbidden", "You can only create matches as yourself.")
		}
		return nil
	}
	if scorerOf(cur) == userID || cur.str("createdByUid") == userID || role == RoleOwner ||
		takingOverScoring(userID, cur, next) {
		return nil
	}
	return reject("forbidden", "Only the current scorer can change this match.")
}

func authorizeRace(userID string, role Role, op Op, cur, next fields) *rejection {
	if op.Action == ActionDelete {
		if cur.str("createdByUid") != userID && role != RoleOwner {
			return reject("forbidden", "Only the race creator or league owner can delete a race.")
		}
		return nil
	}
	if cur == nil && next.str("createdByUid") != userID {
		return reject("forbidden", "You can only create races as yourself.")
	}
	// Races have no scorer lock yet (planned for phase 6): any member may score.
	return nil
}
