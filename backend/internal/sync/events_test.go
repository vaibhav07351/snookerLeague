package sync

import (
	"context"
	"testing"

	"github.com/vaibhav/snookit-server/internal/events"
)

type fakeRecorder struct{ got []events.Event }

func (f *fakeRecorder) Record(_ context.Context, e events.Event) { f.got = append(f.got, e) }

func TestFinishedGameRecordsMatchScoredOncePerGame(t *testing.T) {
	svc, _ := setup(t)
	rec := &fakeRecorder{}
	svc.SetEvents(rec)
	live := `{"id":"gm1","leagueId":"lg1","createdByUid":"member","playerIds":["p1","p2","p3"],"status":"in_progress"}`
	done := `{"id":"gm1","leagueId":"lg1","createdByUid":"member","playerIds":["p1","p2","p3"],"status":"completed"}`

	v1 := push1(t, svc, "member", op(EntityGroupMatch, "gm1", "lg1", 0, live))
	wantStatus(t, v1, StatusApplied, "")
	if len(rec.got) != 0 {
		t.Fatalf("a live game is not scored yet: %+v", rec.got)
	}
	v2 := push1(t, svc, "member", op(EntityGroupMatch, "gm1", "lg1", v1.Version, done))
	wantStatus(t, v2, StatusApplied, "")
	if len(rec.got) != 1 {
		t.Fatalf("finishing records one event, got %+v", rec.got)
	}
	e := rec.got[0]
	if e.Name != events.MatchScored || e.UserID != "member" || e.Ref != "gm1" || e.Props["kind"] != "group" ||
		e.DedupeKey != "match_scored:gm1" {
		t.Fatalf("unexpected event: %+v", e)
	}
	// A later edit of the finished game offers the same dedupe key, so the store keeps one row.
	wantStatus(t, push1(t, svc, "member", op(EntityGroupMatch, "gm1", "lg1", v2.Version, done)), StatusApplied, "")
	if len(rec.got) != 2 || rec.got[1].DedupeKey != e.DedupeKey {
		t.Fatalf("a re-save must reuse the dedupe key: %+v", rec.got)
	}
}

func TestRefusedWriteRecordsNothing(t *testing.T) {
	svc, _ := setup(t)
	rec := &fakeRecorder{}
	svc.SetEvents(rec)
	done := `{"id":"gm1","leagueId":"lg1","createdByUid":"member","playerIds":["p1","p2"],"status":"completed"}`
	wantStatus(t, push1(t, svc, "other", op(EntityGroupMatch, "gm1", "lg1", 0, done)), StatusRejected, "forbidden")
	if len(rec.got) != 0 {
		t.Fatalf("a refused write records nothing: %+v", rec.got)
	}
}
