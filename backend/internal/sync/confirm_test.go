package sync

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestOpponentsConfirmFinishedResultsAndEditsResetThem(t *testing.T) {
	svc, store := setup(t)
	ctx := context.Background()
	wantStatus(t, push1(t, svc, "member", op(EntityPlayer, "pa", "lg1", 0, `{"id":"pa","leagueId":"lg1","authUid":"member"}`)), StatusApplied, "")
	wantStatus(t, push1(t, svc, "other", op(EntityPlayer, "pb", "lg1", 0, `{"id":"pb","leagueId":"lg1","authUid":"other"}`)), StatusApplied, "")
	base := `{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","teamA":["pa"],"teamB":["pb"],%s"outcome":{"status":"%s","winner":"a"}}`
	live := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, sprintf(base, "", "in_progress")))
	confirm := sprintf(base, `"confirmedByUids":["other"],`, "in_progress")
	wantStatus(t, push1(t, svc, "other", op(EntityMatch, "m1", "lg1", live.Version, confirm)), StatusRejected, "forbidden")

	done := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", live.Version, sprintf(base, "", "completed")))
	confirm = sprintf(base, `"confirmedByUids":["other"],`, "completed")
	wantStatus(t, push1(t, svc, "stranger", op(EntityMatch, "m1", "lg1", done.Version, sprintf(base, `"confirmedByUids":["stranger"],`, "completed"))), StatusRejected, "forbidden")
	confirmed := push1(t, svc, "other", op(EntityMatch, "m1", "lg1", done.Version, confirm))
	wantStatus(t, confirmed, StatusApplied, "")

	// The scorer edits the result: confirmations are cleared.
	edited := (`{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","teamA":["pa"],"teamB":["pb"],"confirmedByUids":["other"],"outcome":{"status":"completed","winner":"b"}}`)
	wantStatus(t, push1(t, svc, "member", op(EntityMatch, "m1", "lg1", confirmed.Version, edited)), StatusApplied, "")
	got, _ := store.Get(ctx, EntityMatch, "m1")
	if !strings.Contains(string(got.Data), `"confirmedByUids":[]`) {
		t.Fatalf("edited result must clear confirmations: %s", got.Data)
	}
}

func sprintf(format string, args ...any) string { return fmt.Sprintf(format, args...) }
