package community

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"
)

// memRepo is an in-memory Repository with the same ordering and filters as the SQL one.
type memRepo struct{ rows map[string]Doc }

func newMemRepo() *memRepo { return &memRepo{rows: map[string]Doc{}} }

func key(k Kind, id string) string { return string(k) + "|" + id }

func (m *memRepo) Get(_ context.Context, k Kind, id string) (Doc, error) {
	if d, ok := m.rows[key(k, id)]; ok {
		return d, nil
	}
	return Doc{}, ErrNotFound
}

func (m *memRepo) Put(_ context.Context, d Doc) error {
	m.rows[key(d.Kind, d.ID)] = d
	return nil
}

func (m *memRepo) Delete(_ context.Context, k Kind, id string) error {
	delete(m.rows, key(k, id))
	return nil
}

func (m *memRepo) List(_ context.Context, q ListQuery) ([]Doc, error) {
	out := []Doc{}
	for _, d := range m.rows {
		if d.Kind != q.Kind || (q.CityID != "" && d.CityID != q.CityID) ||
			(q.SubKind != "" && d.SubKind != q.SubKind) || (q.OwnerID != "" && d.OwnerID != q.OwnerID) ||
			(q.SubjectID != "" && d.SubjectID != q.SubjectID) {
			continue
		}
		if q.After != nil && !(d.SortValue < q.After.Sort || (d.SortValue == q.After.Sort && d.ID < q.After.ID)) {
			continue
		}
		out = append(out, d)
	}
	slices.SortFunc(out, func(a, b Doc) int {
		if a.SortValue != b.SortValue {
			if a.SortValue > b.SortValue {
				return -1
			}
			return 1
		}
		return -strings.Compare(a.ID, b.ID)
	})
	if len(out) > q.Limit {
		out = out[:q.Limit]
	}
	return out, nil
}

func newSvc() (*Service, *memRepo) {
	repo := newMemRepo()
	svc := NewService(repo)
	svc.now = func() time.Time { return time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC) }
	return svc, repo
}

func put(t *testing.T, s *Service, user string, k Kind, id, data string) error {
	t.Helper()
	return s.Put(context.Background(), user, k, id, json.RawMessage(data))
}

func mustPut(t *testing.T, s *Service, user string, k Kind, id, data string) {
	t.Helper()
	if err := put(t, s, user, k, id, data); err != nil {
		t.Fatalf("put %s/%s: %v", k, id, err)
	}
}

func TestUserDocIsPrivateAndNeverStoresDateOfBirth(t *testing.T) {
	svc, repo := newSvc()
	ctx := context.Background()
	mustPut(t, svc, "u1", KindUser, "u1", `{"uid":"u1","cityId":"pune","dateOfBirth":"2000-01-01"}`)
	if strings.Contains(string(repo.rows[key(KindUser, "u1")].Data), "dateOfBirth") {
		t.Fatal("date of birth was stored")
	}
	if err := put(t, svc, "u2", KindUser, "u1", `{"uid":"u1"}`); !errors.Is(err, ErrForbidden) {
		t.Fatalf("writing someone else's user doc must be forbidden, got %v", err)
	}
	if _, err := svc.Get(ctx, "u2", KindUser, "u1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another user's settings must look missing, got %v", err)
	}
	if _, err := svc.Get(ctx, "u1", KindUser, "u1"); err != nil {
		t.Fatalf("own settings: %v", err)
	}
	if _, err := svc.List(ctx, "u1", KindUser, ListParams{}); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("user docs can't be listed, got %v", err)
	}
}

func TestCityBoardListsProfilesByRankWithPaging(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	for i, rank := range []int{30, 10, 50, 20, 40} {
		id := fmt.Sprintf("u%d", i)
		mustPut(t, svc, id, KindProfile, id, fmt.Sprintf(`{"uid":%q,"cityId":"pune","rankScore":%d}`, id, rank))
	}
	mustPut(t, svc, "x", KindProfile, "x", `{"uid":"x","cityId":"delhi","rankScore":99}`)

	var got []string
	cursor := ""
	for pages := 0; ; pages++ {
		page, err := svc.List(ctx, "viewer", KindProfile, ListParams{City: "pune", Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for _, item := range page.Items {
			var p struct {
				UID string `json:"uid"`
			}
			_ = json.Unmarshal(item, &p)
			got = append(got, p.UID)
		}
		if !page.HasMore {
			break
		}
		if pages > 5 {
			t.Fatal("paging never ended")
		}
		cursor = page.Cursor
	}
	if want := []string{"u2", "u4", "u0", "u3", "u1"}; !slices.Equal(got, want) {
		t.Fatalf("board = %v, want %v", got, want)
	}
	if err := put(t, svc, "u1", KindProfile, "u0", `{"uid":"u0","cityId":"pune"}`); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editing another profile must be forbidden, got %v", err)
	}
}

func TestPostsBelongToTheirAuthor(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	post := `{"id":"lp1","cityId":"pune","createdByUid":"a","kind":"opponent","status":"open","createdAt":"2026-10-30T10:00:00Z"}`
	mustPut(t, svc, "a", KindLooking, "lp1", post)
	closed := strings.Replace(post, `"open"`, `"closed"`, 1)
	if err := put(t, svc, "b", KindLooking, "lp1", strings.Replace(closed, `"a"`, `"b"`, 1)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("someone else closing a post must be forbidden, got %v", err)
	}
	mustPut(t, svc, "a", KindLooking, "lp1", closed)
	moved := strings.Replace(post, `"pune"`, `"delhi"`, 1)
	if err := put(t, svc, "a", KindLooking, "lp1", moved); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("moving a post to another city must fail, got %v", err)
	}
	if err := put(t, svc, "a", KindLooking, "lp2", strings.Replace(post, `"opponent"`, `"spam"`, 1)); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("unknown post kind must fail, got %v", err)
	}

	listing := `{"id":"dl1","cityId":"pune","createdByUid":"a","kind":"club","name":"Cue Club"}`
	mustPut(t, svc, "a", KindDirectory, "dl1", listing)
	if err := svc.Delete(ctx, "b", KindDirectory, "dl1"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("deleting someone else's listing must be forbidden, got %v", err)
	}
	page, _ := svc.List(ctx, "b", KindDirectory, ListParams{City: "pune", SubKind: "club"})
	if len(page.Items) != 1 {
		t.Fatalf("listing missing from directory: %d items", len(page.Items))
	}
	if err := svc.Delete(ctx, "a", KindDirectory, "dl1"); err != nil {
		t.Fatalf("delete own listing: %v", err)
	}
	if err := svc.Delete(ctx, "a", KindDirectory, "dl1"); err != nil {
		t.Fatalf("repeating a delete must succeed, got %v", err)
	}
}

func TestFollowsUseTheFollowersOwnId(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	mustPut(t, svc, "a", KindFollow, "fl_a_b", `{"id":"fl_a_b","followerUid":"a","followingUid":"b"}`)
	if err := put(t, svc, "a", KindFollow, "fl_c_b", `{"id":"fl_c_b","followerUid":"c","followingUid":"b"}`); !errors.Is(err, ErrForbidden) {
		t.Fatalf("following on someone else's behalf must be forbidden, got %v", err)
	}
	if err := put(t, svc, "a", KindFollow, "fl_a_a", `{"id":"fl_a_a","followerUid":"a","followingUid":"a"}`); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("self-follow must fail, got %v", err)
	}
	followers, _ := svc.List(ctx, "z", KindFollow, ListParams{Subject: "b"})
	following, _ := svc.List(ctx, "z", KindFollow, ListParams{Owner: "a"})
	if len(followers.Items) != 1 || len(following.Items) != 1 {
		t.Fatalf("followers=%d following=%d", len(followers.Items), len(following.Items))
	}
	if _, err := svc.List(ctx, "z", KindFollow, ListParams{}); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("an unfiltered follow list must fail, got %v", err)
	}
}

func TestChallengeStatusChangesFollowWhoIsAsking(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	base := `{"id":"ch1","fromUid":"a","toUid":"b","cityId":"pune","format":"singles","bestOf":3,"status":%q,"matchId":%s,"createdAt":"2026-10-30T10:00:00Z"}`
	pending := fmt.Sprintf(base, "pending", "null")
	if err := put(t, svc, "b", KindChallenge, "ch1", pending); !errors.Is(err, ErrForbidden) {
		t.Fatalf("creating a challenge as someone else must be forbidden, got %v", err)
	}
	mustPut(t, svc, "a", KindChallenge, "ch1", pending)

	if _, err := svc.Get(ctx, "c", KindChallenge, "ch1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("outsiders must not see challenges, got %v", err)
	}
	if err := put(t, svc, "a", KindChallenge, "ch1", fmt.Sprintf(base, "accepted", `"m1"`)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("the challenger can't accept their own challenge, got %v", err)
	}
	if err := put(t, svc, "b", KindChallenge, "ch1", strings.Replace(pending, `"bestOf":3`, `"bestOf":9`, 1)); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("changing the terms must fail, got %v", err)
	}
	mustPut(t, svc, "b", KindChallenge, "ch1", fmt.Sprintf(base, "accepted", `"m1"`))
	if err := put(t, svc, "a", KindChallenge, "ch1", fmt.Sprintf(base, "cancelled", `"m1"`)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("an accepted challenge can't be cancelled, got %v", err)
	}

	sent, _ := svc.List(ctx, "a", KindChallenge, ListParams{Box: "sent"})
	received, _ := svc.List(ctx, "b", KindChallenge, ListParams{Box: "received"})
	othersInbox, _ := svc.List(ctx, "c", KindChallenge, ListParams{Box: "received"})
	if len(sent.Items) != 1 || len(received.Items) != 1 || len(othersInbox.Items) != 0 {
		t.Fatalf("sent=%d received=%d others=%d", len(sent.Items), len(received.Items), len(othersInbox.Items))
	}
}

func TestBadInputIsRejected(t *testing.T) {
	svc, _ := newSvc()
	ctx := context.Background()
	cases := map[string]error{
		"bad id":      put(t, svc, "u1", KindProfile, "u1 x", `{}`),
		"not object":  put(t, svc, "u1", KindProfile, "u1", `[1,2]`),
		"id mismatch": put(t, svc, "u1", KindProfile, "u1", `{"id":"u2"}`),
		"huge":        put(t, svc, "u1", KindProfile, "u1", `{"x":"`+strings.Repeat("a", maxDocBytes)+`"}`),
		"bad cursor": func() error {
			_, err := svc.List(ctx, "u1", KindProfile, ListParams{City: "p", Cursor: "zz"})
			return err
		}(),
		"missing city": func() error { _, err := svc.List(ctx, "u1", KindLooking, ListParams{}); return err }(),
	}
	for name, err := range cases {
		if !errors.Is(err, ErrBadRequest) {
			t.Errorf("%s: want ErrBadRequest, got %v", name, err)
		}
	}
	if _, err := ParseKind("leagues"); !errors.Is(err, ErrBadRequest) {
		t.Errorf("unknown kind: want ErrBadRequest, got %v", err)
	}
}

func TestFutureCreatedAtIsClampedToNow(t *testing.T) {
	svc, repo := newSvc()
	mustPut(t, svc, "a", KindLooking, "lp1",
		`{"id":"lp1","cityId":"pune","createdByUid":"a","kind":"opponent","status":"open","createdAt":"2099-01-01T00:00:00Z"}`)
	if got, want := repo.rows[key(KindLooking, "lp1")].SortValue, float64(svc.now().UnixMilli()); got != want {
		t.Fatalf("sort value = %v, want now (%v)", got, want)
	}
}
