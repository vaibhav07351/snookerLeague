package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

// Server trust rules (stage 2): results, titles and claims a phone cannot fake.

func storedFields(t *testing.T, store *memStore, e Entity, id string) fields {
	t.Helper()
	d, err := store.Get(context.Background(), e, id)
	if err != nil {
		t.Fatalf("get %s %s: %v", e, id, err)
	}
	f, err := decodeFields(d.Data)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	return f
}

func TestTheScorerCannotConfirmForTheOpponent(t *testing.T) {
	svc, store := setup(t)
	finished := `{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","teamA":["pa"],"teamB":["pb"],%s"outcome":{"status":"completed","winner":"a"}}`

	// Not when creating the match...
	created := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, fmt.Sprintf(finished, `"confirmedByUids":["other"],`)))
	wantStatus(t, created, StatusApplied, "")
	if got := strList(storedFields(t, store, EntityMatch, "m1")["confirmedByUids"]); len(got) != 0 {
		t.Fatalf("a new match must start unconfirmed, got %v", got)
	}
	// ...nor in a later save.
	edit := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", created.Version, fmt.Sprintf(finished, `"confirmedByUids":["other"],"namedLabel":"Final",`)))
	wantStatus(t, edit, StatusApplied, "")
	if got := strList(storedFields(t, store, EntityMatch, "m1")["confirmedByUids"]); len(got) != 0 {
		t.Fatalf("the scorer must not add confirmations, got %v", got)
	}
}

func TestAConfirmationSurvivesTheScorersLaterSave(t *testing.T) {
	svc, store := setup(t)
	push1(t, svc, "member", op(EntityPlayer, "pa", "lg1", 0, `{"id":"pa","leagueId":"lg1","authUid":"member"}`))
	push1(t, svc, "other", op(EntityPlayer, "pb", "lg1", 0, `{"id":"pb","leagueId":"lg1","authUid":"other"}`))
	base := `{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","teamA":["pa"],"teamB":["pb"],%s"outcome":{"status":"completed","winner":"a"}}`
	done := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, fmt.Sprintf(base, "")))
	pinned := storedFields(t, store, EntityMatch, "m1")[serverFinishedAtKey]
	// The opponent's phone sends back the server field it received: still only a confirmation.
	confirm := fmt.Sprintf(base, fmt.Sprintf(`"confirmedByUids":["other"],"serverFinishedAt":%q,`, pinned))
	confirmed := push1(t, svc, "other", op(EntityMatch, "m1", "lg1", done.Version, confirm))
	wantStatus(t, confirmed, StatusApplied, "")

	// The scorer's phone has not pulled yet and sends the match without the confirmation.
	rename := fmt.Sprintf(base, `"namedLabel":"Final",`)
	wantStatus(t, push1(t, svc, "member", op(EntityMatch, "m1", "lg1", confirmed.Version, rename)), StatusApplied, "")
	if got := strList(storedFields(t, store, EntityMatch, "m1")["confirmedByUids"]); len(got) != 1 || got[0] != "other" {
		t.Fatalf("the opponent's confirmation must be kept, got %v", got)
	}
}

func TestTheServerStampsWhenAMatchFinished(t *testing.T) {
	svc, store := setup(t)
	svc.now = func() time.Time { return time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC) }
	body := `{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","teamA":["a"],"teamB":["b"],%s"outcome":{"status":"%s","winner":"a"}}`
	live := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, fmt.Sprintf(body, "", "in_progress")))
	if _, ok := storedFields(t, store, EntityMatch, "m1")[serverFinishedAtKey]; ok {
		t.Fatal("a live match has no finish time")
	}

	// A backdated time from the phone is ignored; the server's clock is used.
	backdated := fmt.Sprintf(body, `"serverFinishedAt":"2020-01-01T00:00:00Z","finishedAt":"2020-01-01T00:00:00Z",`, "completed")
	done := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", live.Version, backdated))
	wantStatus(t, done, StatusApplied, "")
	if got := storedFields(t, store, EntityMatch, "m1").str(serverFinishedAtKey); got != "2026-11-12T10:00:00Z" {
		t.Fatalf("serverFinishedAt = %q", got)
	}

	// Later edits keep the first finish time.
	svc.now = func() time.Time { return time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC) }
	push1(t, svc, "member", op(EntityMatch, "m1", "lg1", done.Version, fmt.Sprintf(body, `"namedLabel":"Final",`, "completed")))
	if got := storedFields(t, store, EntityMatch, "m1").str(serverFinishedAtKey); got != "2026-11-12T10:00:00Z" {
		t.Fatalf("a later edit must keep the finish time, got %q", got)
	}
}

func TestFinishedRacesAreLockedToTheirCreator(t *testing.T) {
	svc, _ := setup(t)
	race := func(status, by string) string {
		return fmt.Sprintf(`{"id":"r1","leagueId":"lg1","createdByUid":%q,"status":%q,"entrants":[]}`, by, status)
	}
	live := push1(t, svc, "member", op(EntityRace, "r1", "lg1", 0, race("in_progress", "member")))
	// Any member may score a live race (the app has no hand-over for races)...
	scored := push1(t, svc, "other", op(EntityRace, "r1", "lg1", live.Version, race("completed", "member")))
	wantStatus(t, scored, StatusApplied, "")
	// ...but once finished, only the creator or owner may change it, and never its creator.
	wantStatus(t, push1(t, svc, "other", op(EntityRace, "r1", "lg1", scored.Version, race("in_progress", "member"))), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "member", op(EntityRace, "r1", "lg1", scored.Version, race("completed", "other"))), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "member", op(EntityRace, "r1", "lg1", scored.Version, race("in_progress", "member"))), StatusApplied, "")
}

func TestCityHubGuestsAreClaimedOnlyByLink(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	if _, err := svc.JoinCityHub(ctx, "member", "pune", "Pune"); err != nil {
		t.Fatalf("join: %v", err)
	}
	if _, err := svc.JoinCityHub(ctx, "stranger", "pune", "Pune"); err != nil {
		t.Fatalf("join: %v", err)
	}
	guest := push1(t, svc, "member", op(EntityPlayer, "g1", "city_pune", 0, `{"id":"g1","leagueId":"city_pune","displayName":"Rahul"}`))
	wantStatus(t, guest, StatusApplied, "")
	mine := `{"id":"g1","leagueId":"city_pune","displayName":"Rahul","authUid":"stranger"}`
	wantStatus(t, push1(t, svc, "stranger", op(EntityPlayer, "g1", "city_pune", guest.Version, mine)), StatusRejected, "forbidden")
}

func TestDeletingALeagueDeletesEverythingInIt(t *testing.T) {
	svc, store := setup(t)
	p := push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`))
	push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, `{"id":"m1","leagueId":"lg1","createdByUid":"member","teamA":["p1"],"teamB":["p2"]}`))
	league, _ := store.Get(context.Background(), EntityLeague, "lg1")

	wantStatus(t, push1(t, svc, "owner", del(EntityLeague, "lg1", "lg1", league.Version)), StatusApplied, "")

	live, _ := store.LiveLeagueDocs(context.Background(), "lg1")
	if len(live) != 0 {
		t.Fatalf("nothing may stay live in a deleted league, got %d documents", len(live))
	}
	// Late writes from phones that have not heard yet are refused as "deleted".
	wantStatus(t, push1(t, svc, "member", op(EntityPlayer, "p9", "lg1", 0, `{"id":"p9","leagueId":"lg1"}`)), StatusRejected, "deleted")
	wantStatus(t, push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", p.Version, `{"id":"p1","leagueId":"lg1"}`)), StatusRejected, "deleted")
	if _, _, _, err := svc.PublicMatch(context.Background(), "m1"); err == nil {
		t.Fatal("a deleted league's match must not have a public page")
	}
}

func TestTitlesWaitForTheirResultAndMustMatchIt(t *testing.T) {
	svc, store := setup(t)
	league := func(team string) string {
		return `{"id":"lg1","name":"Club","kind":"club","createdByUid":"owner","inviteCode":"ABC234","reigningTeam":` + team + `}`
	}
	crown := `{"playerIds":["pa"],"matchId":"m1"}`
	// The phone sends the league before the match: answered "try again", not refused.
	wantStatus(t, push1(t, svc, "member", op(EntityLeague, "lg1", "lg1", 1, league(crown))), StatusConflict, conflictCode)

	match := `{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","crownsChampion":true,"teamA":["pa"],"teamB":["pb"],"outcome":{"status":"completed","winner":"a"}}`
	wantStatus(t, push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, match)), StatusApplied, "")
	wantStatus(t, push1(t, svc, "member", op(EntityLeague, "lg1", "lg1", 1, league(`{"playerIds":["pb"],"matchId":"m1"}`))), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "member", op(EntityLeague, "lg1", "lg1", 1, league(crown))), StatusApplied, "")
	if team, _ := storedFields(t, store, EntityLeague, "lg1")["reigningTeam"].(map[string]any); team["matchId"] != "m1" {
		t.Fatalf("title not saved: %v", team)
	}
}

func TestAnOfflineLeagueUploadsWithItsTitleBeforeItsMatches(t *testing.T) {
	store := newMemStore()
	svc := NewService(store)
	league := `{"id":"lg9","name":"Made offline","kind":"club","createdByUid":"u","inviteCode":"OFF234",` +
		`"reigningTeam":{"playerIds":["pa"],"matchId":"m9"}}`
	wantStatus(t, push1(t, svc, "u", op(EntityLeague, "lg9", "lg9", 0, league)), StatusApplied, "")
	match := `{"id":"m9","leagueId":"lg9","createdByUid":"u","crownsChampion":true,"teamA":["pa"],"teamB":["pb"],"outcome":{"status":"completed","winner":"a"}}`
	wantStatus(t, push1(t, svc, "u", op(EntityMatch, "m9", "lg9", 0, match)), StatusApplied, "")
}

func TestDocumentShapesAreChecked(t *testing.T) {
	svc, _ := setup(t)
	cases := map[string]Op{
		"three-a-side match": op(EntityMatch, "m1", "lg1", 0, `{"id":"m1","leagueId":"lg1","createdByUid":"member","teamA":["a","b","c"],"teamB":["d"]}`),
		"name as a number":   op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1","displayName":7}`),
		"huge name":          op(EntityPlayer, "p1", "lg1", 0, fmt.Sprintf(`{"id":"p1","leagueId":"lg1","displayName":%q}`, strings.Repeat("x", 200))),
		"not an object":      op(EntityPlayer, "p1", "lg1", 0, `[1,2]`),
	}
	for name, o := range cases {
		t.Run(name, func(t *testing.T) {
			wantStatus(t, push1(t, svc, "member", o), StatusRejected, invalidOpCode)
		})
	}
	// Names in any script are counted in characters, not bytes.
	hindi := op(EntityPlayer, "p2", "lg1", 0, fmt.Sprintf(`{"id":"p2","leagueId":"lg1","displayName":%q}`, strings.Repeat("र", 60)))
	wantStatus(t, push1(t, svc, "member", hindi), StatusApplied, "")
}

func TestOneAccountCanOwnOnlySoManyLeagues(t *testing.T) {
	store := newMemStore()
	svc := NewService(store)
	for i := range maxOwnedLeagues {
		id := fmt.Sprintf("lg%d", i)
		body, _ := json.Marshal(map[string]any{"id": id, "name": "L", "kind": "club", "createdByUid": "u", "inviteCode": fmt.Sprintf("CODE%02d", i)})
		wantStatus(t, push1(t, svc, "u", op(EntityLeague, id, id, 0, string(body))), StatusApplied, "")
	}
	extra := `{"id":"lgx","name":"L","kind":"club","createdByUid":"u","inviteCode":"CODEXX"}`
	wantStatus(t, push1(t, svc, "u", op(EntityLeague, "lgx", "lgx", 0, extra)), StatusRejected, "limit_reached")
}
