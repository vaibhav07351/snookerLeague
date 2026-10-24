package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	gosync "sync"
	"testing"
	"time"
)

// memStore is an in-memory Store for tests. It does not roll back: the service only writes
// after every check has passed, so a refused operation never leaves partial state.
type memStore struct {
	mu      gosync.Mutex
	version int64
	docs    map[string]Doc
	members map[string]Role // key: leagueID + "|" + userID
	applied map[string]OpResult
}

func newMemStore() *memStore {
	return &memStore{docs: map[string]Doc{}, members: map[string]Role{}, applied: map[string]OpResult{}}
}

func docKey(e Entity, id string) string { return string(e) + "|" + id }

func (m *memStore) InTx(_ context.Context, fn func(Tx) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return fn(m)
}

func (m *memStore) LockWrites(context.Context) error { return nil }

func (m *memStore) Get(_ context.Context, e Entity, id string) (Doc, error) {
	if d, ok := m.docs[docKey(e, id)]; ok {
		return d, nil
	}
	return Doc{}, ErrNotFound
}

func (m *memStore) Put(_ context.Context, d Doc) (Doc, error) {
	m.version++
	d.Version = m.version
	d.UpdatedAt = time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	m.docs[docKey(d.Entity, d.ID)] = d
	return d, nil
}

func (m *memStore) Role(_ context.Context, league, user string) (Role, error) {
	return m.members[league+"|"+user], nil
}

func (m *memStore) AddMember(_ context.Context, league, user string, r Role) error {
	m.members[league+"|"+user] = r
	return nil
}

func (m *memStore) AppliedResult(_ context.Context, user, op string) (OpResult, error) {
	if r, ok := m.applied[user+"|"+op]; ok {
		return r, nil
	}
	return OpResult{}, ErrNotFound
}

func (m *memStore) SaveResult(_ context.Context, op, user string, r OpResult) error {
	m.applied[user+"|"+op] = r
	return nil
}

func (m *memStore) Pull(_ context.Context, user string, since int64, limit int) ([]Doc, error) {
	var out []Doc
	for v := since + 1; v <= m.version && len(out) < limit; v++ {
		for _, d := range m.docs {
			if d.Version == v && m.members[d.LeagueID+"|"+user] != RoleNone {
				out = append(out, d)
			}
		}
	}
	return out, nil
}

// --- helpers ---

var opCounter int

func op(entity Entity, id, league string, base int64, data string) Op {
	opCounter++
	o := Op{OpID: fmt.Sprintf("op-%d", opCounter), Entity: entity, ID: id, LeagueID: league,
		Action: ActionUpsert, BaseVersion: base}
	if data != "" {
		o.Data = json.RawMessage(data)
	}
	return o
}

func del(entity Entity, id, league string, base int64) Op {
	o := op(entity, id, league, base, "")
	o.Action = ActionDelete
	return o
}

func push1(t *testing.T, s *Service, user string, o Op) OpResult {
	t.Helper()
	res, err := s.Push(context.Background(), user, []Op{o})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	return res[0]
}

func wantStatus(t *testing.T, r OpResult, status, code string) {
	t.Helper()
	if r.Status != status || r.Code != code {
		t.Fatalf("want %s/%s, got %s/%s (%s)", status, code, r.Status, r.Code, r.Message)
	}
}

const leagueJSON = `{"id":"lg1","name":"Club","kind":"club","createdByUid":"owner","inviteCode":"ABC"}`

// league with one owner and one extra member.
func setup(t *testing.T) (*Service, *memStore) {
	t.Helper()
	store := newMemStore()
	svc := NewService(store)
	wantStatus(t, push1(t, svc, "owner", op(EntityLeague, "lg1", "lg1", 0, leagueJSON)), StatusApplied, "")
	store.members["lg1|member"] = RoleMember
	store.members["lg1|other"] = RoleMember
	return svc, store
}

// --- tests ---

func TestCreateLeagueMakesCreatorOwner(t *testing.T) {
	svc, store := setup(t)
	if store.members["lg1|owner"] != RoleOwner {
		t.Fatal("creator must become the league owner")
	}
	page, err := svc.Pull(context.Background(), "owner", 0, 0)
	if err != nil || len(page.Docs) != 1 || page.Docs[0].ID != "lg1" {
		t.Fatalf("owner must see the league: %v %+v", err, page)
	}
}

func TestRetryIsIdempotent(t *testing.T) {
	svc, store := setup(t)
	o := op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1","displayName":"A"}`)
	first := push1(t, svc, "member", o)
	before := store.version
	second := push1(t, svc, "member", o)
	if first.Version != second.Version || store.version != before {
		t.Fatal("a retried operation must not be applied twice")
	}
}

func TestSameOpIDFromAnotherUserIsNotReplayed(t *testing.T) {
	svc, _ := setup(t)
	o := op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`)
	push1(t, svc, "member", o)
	o2 := o
	o2.ID = "p2"
	o2.Data = json.RawMessage(`{"id":"p2","leagueId":"lg1"}`)
	res := push1(t, svc, "other", o2)
	wantStatus(t, res, StatusApplied, "")
	if res.Version == 0 {
		t.Fatal("other user's operation must be applied on its own")
	}
}

func TestStaleBaseVersionConflictsAndReturnsCurrent(t *testing.T) {
	svc, _ := setup(t)
	first := push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1","displayName":"A"}`))
	push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", first.Version, `{"id":"p1","leagueId":"lg1","displayName":"B"}`))
	stale := push1(t, svc, "other", op(EntityPlayer, "p1", "lg1", first.Version, `{"id":"p1","leagueId":"lg1","displayName":"C"}`))
	wantStatus(t, stale, StatusConflict, "conflict")
	if stale.Current == nil || !strings.Contains(string(stale.Current.Data), `"B"`) {
		t.Fatal("a conflict must carry the server's current copy")
	}
}

func TestCreatingExistingDocumentConflicts(t *testing.T) {
	svc, _ := setup(t)
	push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`))
	res := push1(t, svc, "other", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`))
	wantStatus(t, res, StatusConflict, "conflict")
}

func TestNonMembersCannotWrite(t *testing.T) {
	svc, _ := setup(t)
	res := push1(t, svc, "stranger", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`))
	wantStatus(t, res, StatusRejected, "forbidden")
}

func TestClientsCannotCreateCityHubsOrEvents(t *testing.T) {
	svc, _ := setup(t)
	hub := `{"id":"city_pune","name":"Pune","kind":"city","cityId":"pune","createdByUid":"owner"}`
	wantStatus(t, push1(t, svc, "owner", op(EntityLeague, "city_pune", "city_pune", 0, hub)), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "owner", op(EntityEvent, "e1", "lg1", 0, `{"id":"e1","leagueId":"lg1"}`)), StatusRejected, "server_only")
}

func TestLeagueImmutableFieldsAndInviteCode(t *testing.T) {
	svc, _ := setup(t)
	cur := push1(t, svc, "owner", op(EntityLeague, "lg1", "lg1", 1, `{"id":"lg1","name":"Club 2","kind":"club","createdByUid":"owner","inviteCode":"ABC"}`))
	wantStatus(t, cur, StatusApplied, "")

	asCity := `{"id":"lg1","name":"Club 2","kind":"city","createdByUid":"owner","inviteCode":"ABC"}`
	wantStatus(t, push1(t, svc, "owner", op(EntityLeague, "lg1", "lg1", cur.Version, asCity)), StatusRejected, "forbidden")

	newCode := `{"id":"lg1","name":"Club 2","kind":"club","createdByUid":"owner","inviteCode":"ZZZ"}`
	wantStatus(t, push1(t, svc, "member", op(EntityLeague, "lg1", "lg1", cur.Version, newCode)), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "owner", op(EntityLeague, "lg1", "lg1", cur.Version, newCode)), StatusApplied, "")
}

func TestOnlyOwnerDeletesLeagueAndPlayers(t *testing.T) {
	svc, _ := setup(t)
	p := push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`))
	wantStatus(t, push1(t, svc, "member", del(EntityPlayer, "p1", "lg1", p.Version)), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "member", del(EntityLeague, "lg1", "lg1", 1)), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "owner", del(EntityPlayer, "p1", "lg1", p.Version)), StatusApplied, "")
}

func TestDeleteLeavesTombstoneInPull(t *testing.T) {
	svc, _ := setup(t)
	p := push1(t, svc, "owner", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`))
	push1(t, svc, "owner", del(EntityPlayer, "p1", "lg1", p.Version))
	page, _ := svc.Pull(context.Background(), "member", p.Version, 0)
	if len(page.Docs) != 1 || !page.Docs[0].Deleted || len(page.Docs[0].Data) != 0 {
		t.Fatalf("pull must deliver a tombstone: %+v", page.Docs)
	}
	wantStatus(t, push1(t, svc, "owner", op(EntityPlayer, "p1", "lg1", page.Docs[0].Version, `{"id":"p1","leagueId":"lg1"}`)), StatusRejected, "deleted")
}

func TestPlayerCardOwnerCannotChange(t *testing.T) {
	svc, _ := setup(t)
	p := push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1","authUid":null}`))
	claim := `{"id":"p1","leagueId":"lg1","authUid":"member"}`
	wantStatus(t, push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", p.Version, claim)), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "member", op(EntityPlayer, "p2", "lg1", 0, `{"id":"p2","leagueId":"lg1","authUid":"other"}`)), StatusRejected, "forbidden")
}

func TestMatchScoringRules(t *testing.T) {
	svc, _ := setup(t)
	match := func(scorer, policy string) string {
		return fmt.Sprintf(`{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":%q,"scoringPolicy":%q,"outcome":{"status":"in_progress"},"frames":[]}`, scorer, policy)
	}
	created := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, match("member", "anyone")))
	wantStatus(t, created, StatusApplied, "")

	// someone else creating a match as another user is refused
	wantStatus(t, push1(t, svc, "other", op(EntityMatch, "m2", "lg1", 0, `{"id":"m2","leagueId":"lg1","createdByUid":"member"}`)), StatusRejected, "forbidden")

	// a bystander cannot change the score...
	scored := `{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","scoringPolicy":"anyone","outcome":{"status":"in_progress"},"frames":[{"a":10}]}`
	wantStatus(t, push1(t, svc, "other", op(EntityMatch, "m1", "lg1", created.Version, scored)), StatusRejected, "forbidden")

	// ...but may take over scoring when the policy is "anyone"
	takeOver := match("other", "anyone")
	res := push1(t, svc, "other", op(EntityMatch, "m1", "lg1", created.Version, takeOver))
	wantStatus(t, res, StatusApplied, "")

	// the owner of the league can always manage the match
	wantStatus(t, push1(t, svc, "owner", op(EntityMatch, "m1", "lg1", res.Version, match("other", "chosen"))), StatusApplied, "")
}

func TestTakeOverRefusedWhenPolicyChosenOrMatchFinished(t *testing.T) {
	svc, _ := setup(t)
	chosen := `{"id":"m1","leagueId":"lg1","createdByUid":"member","scorerUid":"member","scoringPolicy":"chosen","allowedScorerUids":[],"outcome":{"status":"in_progress"}}`
	created := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, chosen))
	steal := strings.Replace(chosen, `"scorerUid":"member"`, `"scorerUid":"other"`, 1)
	wantStatus(t, push1(t, svc, "other", op(EntityMatch, "m1", "lg1", created.Version, steal)), StatusRejected, "forbidden")

	done := `{"id":"m2","leagueId":"lg1","createdByUid":"member","scorerUid":"member","outcome":{"status":"completed"}}`
	c2 := push1(t, svc, "member", op(EntityMatch, "m2", "lg1", 0, done))
	steal2 := strings.Replace(done, `"scorerUid":"member"`, `"scorerUid":"other"`, 1)
	wantStatus(t, push1(t, svc, "other", op(EntityMatch, "m2", "lg1", c2.Version, steal2)), StatusRejected, "forbidden")
}

func TestMatchDeleteByCreatorOrOwnerOnly(t *testing.T) {
	svc, _ := setup(t)
	m := push1(t, svc, "member", op(EntityMatch, "m1", "lg1", 0, `{"id":"m1","leagueId":"lg1","createdByUid":"member"}`))
	wantStatus(t, push1(t, svc, "other", del(EntityMatch, "m1", "lg1", m.Version)), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "member", del(EntityMatch, "m1", "lg1", m.Version)), StatusApplied, "")
}

func TestOperationValidation(t *testing.T) {
	svc, _ := setup(t)
	bad := map[string]Op{
		"unknown entity":    op("widget", "x", "lg1", 0, `{}`),
		"mismatched id":     op(EntityPlayer, "p1", "lg1", 0, `{"id":"other","leagueId":"lg1"}`),
		"mismatched league": op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg2"}`),
		"missing data":      op(EntityPlayer, "p1", "lg1", 0, ""),
		"not an object":     op(EntityPlayer, "p1", "lg1", 0, `[1]`),
		"negative base":     op(EntityPlayer, "p1", "lg1", -1, `{"id":"p1"}`),
		"too big":           op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","x":"`+strings.Repeat("a", maxDocBytes)+`"}`),
	}
	for name, o := range bad {
		if r := push1(t, svc, "member", o); r.Status != StatusRejected || r.Code != "bad_request" {
			t.Errorf("%s: want rejected/bad_request, got %s/%s", name, r.Status, r.Code)
		}
	}
	if _, err := svc.Push(context.Background(), "member", nil); err == nil {
		t.Error("an empty batch must be refused")
	}
	if _, err := svc.Push(context.Background(), "member", make([]Op, maxOpsPerPush+1)); err == nil {
		t.Error("an oversized batch must be refused")
	}
}

func TestBatchKeepsGoingAfterARefusedOperation(t *testing.T) {
	svc, _ := setup(t)
	results, err := svc.Push(context.Background(), "member", []Op{
		op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1","authUid":"someone-else"}`),
		op(EntityPlayer, "p2", "lg1", 0, `{"id":"p2","leagueId":"lg1"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	wantStatus(t, results[0], StatusRejected, "forbidden")
	wantStatus(t, results[1], StatusApplied, "")
}

func TestPullPagesAndHidesOtherLeagues(t *testing.T) {
	svc, store := setup(t)
	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("p%d", i)
		push1(t, svc, "member", op(EntityPlayer, id, "lg1", 0, fmt.Sprintf(`{"id":%q,"leagueId":"lg1"}`, id)))
	}
	store.docs[docKey(EntityPlayer, "secret")] = Doc{Entity: EntityPlayer, ID: "secret", LeagueID: "lg-private", Version: 99}
	store.version = 99

	first, _ := svc.Pull(context.Background(), "member", 0, 3)
	if len(first.Docs) != 3 || !first.HasMore {
		t.Fatalf("first page: %+v", first)
	}
	second, _ := svc.Pull(context.Background(), "member", first.Cursor, 3)
	if len(second.Docs) != 3 || second.HasMore {
		t.Fatalf("second page (league doc + 5 players = 6 docs): %+v", second)
	}
	for _, d := range append(first.Docs, second.Docs...) {
		if d.LeagueID != "lg1" {
			t.Fatalf("leaked a document from another league: %+v", d)
		}
	}
	if _, err := svc.Pull(context.Background(), "member", -1, 0); err == nil {
		t.Error("negative cursor must be refused")
	}
}
