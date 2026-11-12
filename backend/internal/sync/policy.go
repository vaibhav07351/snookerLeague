package sync

import (
	"context"
	"encoding/json"
	"errors"
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
	league, err := leagueFields(ctx, tx, op.LeagueID)
	if errors.Is(err, errLeagueDeleted) {
		return reject("deleted", "This league was deleted."), nil
	}
	if err != nil {
		return nil, err
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
	if current == nil && op.Action == ActionUpsert {
		if rej, err := checkLeagueRoom(ctx, tx, op.LeagueID, league.str("kind") == "city"); rej != nil || err != nil {
			return rej, err
		}
	}

	switch op.Entity {
	case EntityPlayer:
		return authorizePlayer(userID, role, op, cur, next, league.str("kind") == "city"), nil
	case EntityMatch:
		ok, err := confirmingOwnResult(ctx, tx, userID, op, cur, next)
		if err != nil {
			return nil, err
		}
		if ok {
			return nil, nil
		}
		return authorizeMatch(userID, role, op, cur, next), nil
	case EntityRace:
		return authorizeGame("race", userID, role, op, cur, next), nil
	case EntityGroupMatch:
		return authorizeGame("match", userID, role, op, cur, next), nil
	case EntityEvent:
		return authorizeEvent(ctx, tx, userID, role, op, cur, next)
	case EntityTournament:
		return authorizeTournament(userID, role, op, cur, next), nil
	}
	return reject("bad_entity", "Unknown entity."), nil
}

// errLeagueDeleted marks a write into a league that was deleted.
var errLeagueDeleted = errors.New("league deleted")

// leagueFields loads the league a document belongs to. A league that does not exist yet
// gives empty fields (the role check has already refused non-members).
func leagueFields(ctx context.Context, tx Tx, leagueID string) (fields, error) {
	doc, err := tx.Get(ctx, EntityLeague, leagueID)
	switch {
	case errors.Is(err, ErrNotFound):
		return fields{}, nil
	case err != nil:
		return nil, fmt.Errorf("load league: %w", err)
	case doc.Deleted:
		return nil, errLeagueDeleted
	}
	return decodeFields(doc.Data)
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
		owned, err := tx.OwnedLeagues(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("count owned leagues: %w", err)
		}
		if len(owned) >= maxOwnedLeagues {
			return reject("limit_reached", fmt.Sprintf("You can own at most %d leagues.", maxOwnedLeagues)), nil
		}
		// Titles are not checked here: a league made offline is uploaded before its matches,
		// which can't be saved until the league exists. Every later title change is checked.
		return checkInviteCode(ctx, tx, op.ID, next.str("inviteCode"))
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
		// Nobody renames or deletes a hub. Phones still post the derived titles (champions,
		// race king) until the server computes them, so only those fields may change, and
		// only to a title a real result gave.
		if op.Action == ActionDelete || !onlyChanged(changedKeys(cur, next), cityHubWritable) {
			return reject("forbidden", "City hubs can't be changed by members."), nil
		}
		return checkTitles(ctx, tx, op.ID, cur, next)
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
	if slices.Contains(changed, "inviteCode") {
		if role != RoleOwner {
			return reject("forbidden", "Only the owner can change the invite code."), nil
		}
		if rej, err := checkInviteCode(ctx, tx, op.ID, next.str("inviteCode")); rej != nil || err != nil {
			return rej, err
		}
	}
	return checkTitles(ctx, tx, op.ID, cur, next)
}

// maxOwnedLeagues caps how many club leagues one account can create (storage abuse).
const maxOwnedLeagues = 25

// checkInviteCode refuses a code with the wrong shape or one another live league already uses,
// so a code always leads to exactly one league.
func checkInviteCode(ctx context.Context, tx Tx, leagueID, code string) (*rejection, error) {
	if NormalizeInviteCode(code) != code {
		return reject("bad_document", "The invite code must be 4 to 12 capital letters or digits."), nil
	}
	other, err := tx.FindLeagueByInviteCode(ctx, code)
	switch {
	case errors.Is(err, ErrNotFound):
		return nil, nil
	case err != nil:
		return nil, fmt.Errorf("check invite code: %w", err)
	case other.ID != leagueID:
		return reject("code_taken", "That invite code is taken. Make a new one."), nil
	}
	return nil, nil
}

func authorizePlayer(userID string, role Role, op Op, cur, next fields, cityHub bool) *rejection {
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
	// "That's me": a member may claim a guest card that has no owner yet, for themselves only
	// (the same rule Firestore had; owner-approved claims come later). Once a card has an
	// owner, it never changes through sync.
	if cur.str("authUid") != next.str("authUid") {
		if cur.str("authUid") == "" && next.str("authUid") == userID {
			if cityHub {
				// Anyone can join a city hub, so "That's me" there would let a stranger take a
				// guest's whole history. Hub cards are claimed with a claim link instead.
				return reject("forbidden", "In a city hub, ask the person who added you for a claim link.")
			}
			return nil
		}
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
		if key != "scorerUid" && key != "updatedAt" && key != "settingsUpdatedAt" &&
			!slices.Contains(serverOwnedMatchKeys, key) {
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

// authorizeGame covers races and free-for-all matches. They have no scorer hand-over, so any
// member may score one while it is live (as the app allows). Once it is finished, only its
// creator or the league owner may change or delete it, and the creator never changes, so a
// finished result can't be rewritten by someone else. `noun` names the game in messages.
func authorizeGame(noun string, userID string, role Role, op Op, cur, next fields) *rejection {
	manager := role == RoleOwner || (cur != nil && cur.str("createdByUid") == userID)
	if op.Action == ActionDelete {
		if !manager {
			return reject("forbidden", "Only the "+noun+" creator or league owner can delete a "+noun+".")
		}
		return nil
	}
	if cur == nil {
		if next.str("createdByUid") != userID {
			return reject("forbidden", "You can only create a "+noun+" as yourself.")
		}
		return nil
	}
	if next.str("createdByUid") != cur.str("createdByUid") {
		return reject("forbidden", "The "+noun+" creator can't be changed.")
	}
	if cur.str("status") == "completed" && !manager {
		return reject("forbidden", "Only the "+noun+" creator or league owner can change a finished "+noun+".")
	}
	return nil
}

// retryLaterCode is an authorization answer meaning "can't be checked yet": the document it
// depends on has not reached the server. apply turns it into a conflict, which the phone
// retries after sending the rest of its queue.
const retryLaterCode = "retry_later"

// gameEntities are the documents a feed event can be about.
var gameEntities = []Entity{EntityMatch, EntityRace, EntityGroupMatch}

// authorizeEvent: feed events are still written by the phone that finished the game (the
// server takes this over with the stats worker). An event must be about a real game in this
// league (the app always puts the game's id last in relatedIds), posted by someone who could
// record that game's result. Only the league owner may delete one.
func authorizeEvent(ctx context.Context, tx Tx, userID string, role Role, op Op, cur, next fields) (*rejection, error) {
	if op.Action == ActionDelete {
		if role != RoleOwner {
			return reject("forbidden", "Only the league owner can delete feed events."), nil
		}
		return nil, nil
	}
	if role == RoleOwner {
		return nil, nil
	}
	related := next.strList("relatedIds")
	if len(related) == 0 {
		return reject("forbidden", "A feed post must be about a game."), nil
	}
	gameID := related[len(related)-1]
	for _, entity := range gameEntities {
		game, err := tx.Get(ctx, entity, gameID)
		if errors.Is(err, ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("load game: %w", err)
		}
		if game.LeagueID != op.LeagueID {
			return reject("forbidden", "A feed post must be about a game in this league."), nil
		}
		if game.Deleted {
			// The game was deleted: its post may only be withdrawn.
			if cur != nil && next["retracted"] == true && onlyChanged(changedKeys(cur, next), []string{"retracted", "updatedAt"}) {
				return nil, nil
			}
			return reject("forbidden", "That game was deleted."), nil
		}
		g, err := decodeFields(game.Data)
		if err != nil {
			return nil, err
		}
		if entity == EntityMatch && scorerOf(g) != userID && g.str("createdByUid") != userID {
			return reject("forbidden", "Only the match scorer can post its result."), nil
		}
		return nil, nil
	}
	return reject(retryLaterCode, "The game this post is about has not been saved yet."), nil
}

// checkTitles accepts a new reigning champion or race king only when a real result gave it:
// the named title match (or crowning race) is finished in this league and the named players
// won it. Clearing a title is allowed. A title whose result has not reached the server yet is
// retried later (the phone sends the league before the match).
func checkTitles(ctx context.Context, tx Tx, leagueID string, cur, next fields) (*rejection, error) {
	if team, ok := next["reigningTeam"].(map[string]any); ok && (cur == nil || !reflect.DeepEqual(cur["reigningTeam"], next["reigningTeam"])) {
		if rej, err := checkTeamTitle(ctx, tx, leagueID, fields(team)); rej != nil || err != nil {
			return rej, err
		}
	}
	if king, ok := next["raceKing"].(map[string]any); ok && (cur == nil || !reflect.DeepEqual(cur["raceKing"], next["raceKing"])) {
		return checkRaceKing(ctx, tx, leagueID, fields(king))
	}
	return nil, nil
}

// titleSource loads the game a title points at, or a retry-later answer when it is missing.
func titleSource(ctx context.Context, tx Tx, entity Entity, id, leagueID string) (fields, *rejection, error) {
	doc, err := tx.Get(ctx, entity, id)
	if errors.Is(err, ErrNotFound) {
		return nil, reject(retryLaterCode, "The title's result has not been saved yet."), nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("load title %s: %w", entity, err)
	}
	if doc.Deleted || doc.LeagueID != leagueID {
		return nil, reject("forbidden", "That title does not match a result in this league."), nil
	}
	f, err := decodeFields(doc.Data)
	return f, nil, err
}

func checkTeamTitle(ctx context.Context, tx Tx, leagueID string, team fields) (*rejection, error) {
	m, rej, err := titleSource(ctx, tx, EntityMatch, team.str("matchId"), leagueID)
	if rej != nil || err != nil {
		return rej, err
	}
	status := m.outcomeStatus()
	if status != "completed" && status != "forfeited" {
		return reject(retryLaterCode, "The title match is not finished yet."), nil
	}
	if m["crownsChampion"] != true {
		return reject("forbidden", "That match was not a title match."), nil
	}
	outcome, _ := m["outcome"].(map[string]any)
	winners := m.strList("teamA")
	if w, _ := outcome["winner"].(string); w == "b" {
		winners = m.strList("teamB")
	}
	if !sameSet(winners, team.strList("playerIds")) {
		return reject("forbidden", "The champions must be the title match winners."), nil
	}
	return nil, nil
}

func checkRaceKing(ctx context.Context, tx Tx, leagueID string, king fields) (*rejection, error) {
	r, rej, err := titleSource(ctx, tx, EntityRace, king.str("raceId"), leagueID)
	if rej != nil || err != nil {
		return rej, err
	}
	if r.str("status") != "completed" {
		return reject(retryLaterCode, "The crowning race is not finished yet."), nil
	}
	if r["crownsRaceChampion"] != true {
		return reject("forbidden", "That race did not crown a race king."), nil
	}
	entrants, _ := r["entrants"].([]any)
	for _, raw := range entrants {
		e, _ := raw.(map[string]any)
		if place, _ := e["place"].(float64); place == 1 && e["playerId"] == king.str("playerId") {
			return nil, nil
		}
	}
	return reject("forbidden", "The race king must be the race winner."), nil
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for _, x := range a {
		if !slices.Contains(b, x) {
			return false
		}
	}
	return true
}

// Live documents one league may hold (storage abuse). City hubs gather a whole city.
const (
	maxClubDocs = 20_000
	maxHubDocs  = 300_000
)

// checkLeagueRoom refuses a new document when the league is full.
func checkLeagueRoom(ctx context.Context, tx Tx, leagueID string, cityHub bool) (*rejection, error) {
	limit := maxClubDocs
	if cityHub {
		limit = maxHubDocs
	}
	n, err := tx.CountLiveDocs(ctx, leagueID)
	if err != nil {
		return nil, fmt.Errorf("count league documents: %w", err)
	}
	if n >= limit {
		return reject("limit_reached", "This league is full. Delete old games to add new ones."), nil
	}
	return nil, nil
}

// cityHubWritable are the hub fields a member may change (memberUids is replaced by the
// server's own list on every write anyway).
var cityHubWritable = []string{"reigningTeam", "raceKing", "updatedAt", "memberUids"}

func onlyChanged(changed, allowed []string) bool {
	for _, k := range changed {
		if !slices.Contains(allowed, k) {
			return false
		}
	}
	return true
}

// authorizeTournament: any member may organise a tournament (as themselves); only the
// organiser or the league owner may change or delete it afterwards.
func authorizeTournament(userID string, role Role, op Op, cur, next fields) *rejection {
	if cur == nil {
		if op.Action == ActionDelete {
			return reject("not_found", "Nothing to delete.")
		}
		if next.str("createdByUid") != userID {
			return reject("forbidden", "You can only create tournaments as yourself.")
		}
		return nil
	}
	if cur.str("createdByUid") != userID && role != RoleOwner {
		return reject("forbidden", "Only the organiser or league owner can change this tournament.")
	}
	if op.Action == ActionUpsert && cur.str("createdByUid") != next.str("createdByUid") {
		return reject("forbidden", "The organiser can't be changed.")
	}
	return nil
}
