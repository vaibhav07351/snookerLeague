package sync

import (
	"context"
	"testing"
)

const groupJSON = `{"id":"gm1","leagueId":"lg1","createdByUid":"member","playerIds":["p1","p2","p3"]}`

func TestGroupMatchesOnlyReachClientsThatAskForThem(t *testing.T) {
	svc, _ := setup(t)
	wantStatus(t, push1(t, svc, "member", op(EntityGroupMatch, "gm1", "lg1", 0, groupJSON)), StatusApplied, "")
	ctx := context.Background()

	old, err := svc.Pull(ctx, "other", 0, 0)
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	for _, d := range old.Docs {
		if d.Entity == EntityGroupMatch {
			t.Fatal("a client that did not opt in must not receive group matches")
		}
	}

	page, err := svc.Pull(ctx, "other", 0, 0, EntityGroupMatch)
	if err != nil || !hasDoc(page, EntityGroupMatch, "gm1") {
		t.Fatalf("an opted-in client must receive the group match: %v %+v", err, page)
	}

	league, err := svc.PullLeague(ctx, "other", "lg1", 0, 0, EntityGroupMatch)
	if err != nil || !hasDoc(league, EntityGroupMatch, "gm1") {
		t.Fatalf("league pull must honour the opt-in too: %v %+v", err, league)
	}
	if plain, _ := svc.PullLeague(ctx, "other", "lg1", 0, 0); hasDoc(plain, EntityGroupMatch, "gm1") {
		t.Fatal("league pull without opt-in must hide group matches")
	}
}

func TestGroupMatchPermissions(t *testing.T) {
	svc, _ := setup(t)
	wantStatus(t, push1(t, svc, "other", op(EntityGroupMatch, "gm1", "lg1", 0, groupJSON)), StatusRejected, "forbidden")

	created := push1(t, svc, "member", op(EntityGroupMatch, "gm1", "lg1", 0, groupJSON))
	wantStatus(t, created, StatusApplied, "")

	// Any member may score.
	scored := push1(t, svc, "other", op(EntityGroupMatch, "gm1", "lg1", created.Version, groupJSON))
	wantStatus(t, scored, StatusApplied, "")

	wantStatus(t, push1(t, svc, "other", del(EntityGroupMatch, "gm1", "lg1", scored.Version)), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "owner", del(EntityGroupMatch, "gm1", "lg1", scored.Version)), StatusApplied, "")
}

func hasDoc(page PullPage, entity Entity, id string) bool {
	for _, d := range page.Docs {
		if d.Entity == entity && d.ID == id {
			return true
		}
	}
	return false
}
