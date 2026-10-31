package sync

import (
	"context"
	"strings"
	"testing"
)

func TestForgetUserDeletesOwnLeaguesAndAnonymisesCardsElsewhere(t *testing.T) {
	svc, store := setup(t) // "owner" owns lg1; "member" and "other" are members
	ctx := context.Background()
	push1(t, svc, "owner", op(EntityPlayer, "own", "lg1", 0, `{"id":"own","leagueId":"lg1","authUid":"owner"}`))
	// The leaving member also owns a league of their own.
	wantStatus(t, push1(t, svc, "member", op(EntityLeague, "lg2", "lg2", 0,
		`{"id":"lg2","name":"Mine","kind":"club","createdByUid":"member","inviteCode":"MINE22"}`)), StatusApplied, "")
	push1(t, svc, "member", op(EntityMatch, "m2", "lg2", 0, `{"id":"m2","leagueId":"lg2","createdByUid":"member"}`))
	push1(t, svc, "member", op(EntityPlayer, "card", "lg1", 0,
		`{"id":"card","leagueId":"lg1","authUid":"member","displayName":"Asha","photoUrl":"https://x/p.jpg","kind":"member"}`))

	for range 2 { // the second run must change nothing
		if err := svc.ForgetUser(ctx, "member"); err != nil {
			t.Fatalf("forget: %v", err)
		}
	}

	for _, key := range []string{docKey(EntityLeague, "lg2"), docKey(EntityMatch, "m2")} {
		if !store.docs[key].Deleted {
			t.Fatalf("%s must be a tombstone", key)
		}
	}
	card := string(store.docs[docKey(EntityPlayer, "card")].Data)
	for _, want := range []string{`"authUid":null`, `"displayName":"Deleted player"`, `"kind":"guest"`, `"photoUrl":null`} {
		if !strings.Contains(card, want) {
			t.Fatalf("card %s missing %s", card, want)
		}
	}
	if store.docs[docKey(EntityLeague, "lg1")].Deleted || store.docs[docKey(EntityPlayer, "own")].Deleted {
		t.Fatal("other people's leagues and cards must be untouched")
	}
}
