//go:build integration

// Package integration runs the Postgres repositories and the services on top of them against
// a real database. It is skipped unless built with `-tags integration` and given
// TEST_DATABASE_URL. Use a scratch database: tests create their own rows with random ids.
package integration

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/community"
	"github.com/vaibhav/snookit-server/internal/platform/db"
	"github.com/vaibhav/snookit-server/internal/platform/httpx"
	"github.com/vaibhav/snookit-server/internal/stats"
	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

func randID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func openPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Running migrations twice must be a harmless no-op (the server migrates on every start).
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	return pool
}

type fakeGoogle struct{ ident auth.GoogleIdentity }

func (f fakeGoogle) Verify(context.Context, string) (auth.GoogleIdentity, error) { return f.ident, nil }

func newUser(t *testing.T, users *auth.PGUsers) auth.User {
	t.Helper()
	u := auth.User{ID: randID("u_"), GoogleSub: randID("g_"), Email: randID("e") + "@example.com",
		DisplayName: "Test", CreatedAt: time.Now().UTC()}
	if err := users.Create(context.Background(), u); err != nil {
		t.Fatalf("create user: %v", err)
	}
	return u
}

func TestAuthAgainstPostgres(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	users, sessions := auth.NewPGUsers(pool), auth.NewPGSessions(pool)

	u := newUser(t, users)
	if got, err := users.FindByGoogleSub(ctx, u.GoogleSub); err != nil || got.ID != u.ID {
		t.Fatalf("find by sub: %v %+v", err, got)
	}
	if _, err := users.FindByID(ctx, "u_missing"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("missing user must be ErrNotFound, got %v", err)
	}

	// Rotation compare-and-swap: the second rotation from the same starting secret must fail.
	s := auth.Session{ID: randID("s_"), UserID: u.ID, CurrentHash: "h1", RotatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(time.Hour)}
	if err := sessions.Create(ctx, s); err != nil {
		t.Fatalf("create session: %v", err)
	}
	rotated := s
	rotated.PrevHash, rotated.CurrentHash = "h1", "h2"
	if err := sessions.Update(ctx, rotated); err != nil {
		t.Fatalf("first rotation: %v", err)
	}
	if err := sessions.Update(ctx, rotated); err == nil {
		t.Fatal("a rotation from a stale secret must fail instead of overwriting")
	}

	// Full service flow on real tables.
	svc := auth.NewService(users, sessions, fakeGoogle{auth.GoogleIdentity{Sub: randID("g_"), Email: "a@example.com"}},
		auth.NewTokenIssuer([]byte("0123456789abcdef0123456789abcdef"), 30*time.Minute), time.Hour, time.Minute)
	_, pair, err := svc.SignInWithGoogle(ctx, "token")
	if err != nil {
		t.Fatalf("sign in: %v", err)
	}
	next, err := svc.Refresh(ctx, pair.RefreshToken)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	claims, err := svc.Authenticate(ctx, next.AccessToken)
	if err != nil {
		t.Fatalf("authenticate: %v", err)
	}
	if err := svc.Logout(ctx, claims.SessionID); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, err := svc.Authenticate(ctx, next.AccessToken); !errors.Is(err, httpx.ErrUnauthorized) {
		t.Fatalf("logged-out session must be rejected, got %v", err)
	}
}

func put(t *testing.T, svc *syncmod.Service, user string, op syncmod.Op) syncmod.OpResult {
	t.Helper()
	res, err := svc.Push(context.Background(), user, []syncmod.Op{op})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	return res[0]
}

func upsert(entity syncmod.Entity, id, league string, base int64, data string) syncmod.Op {
	return syncmod.Op{OpID: randID("op_"), Entity: entity, ID: id, LeagueID: league,
		Action: syncmod.ActionUpsert, BaseVersion: base, Data: []byte(data)}
}

func TestSyncAgainstPostgres(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	users := auth.NewPGUsers(pool)
	owner, member, stranger := newUser(t, users), newUser(t, users), newUser(t, users)
	svc := syncmod.NewService(syncmod.NewPGStore(pool))

	league := randID("lg_")
	leagueDoc := fmt.Sprintf(`{"id":%q,"name":"Club","kind":"club","createdByUid":%q,"inviteCode":"ABC"}`, league, owner.ID)
	res := put(t, svc, owner.ID, upsert(syncmod.EntityLeague, league, league, 0, leagueDoc))
	if res.Status != syncmod.StatusApplied || res.Version == 0 {
		t.Fatalf("league create: %+v", res)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO league_members (league_id, user_id, role) VALUES ($1,$2,'member')", league, member.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	// Ids are unique across leagues and other runs share this database, so they must be random.
	p1, p2, p3 := randID("p_"), randID("p_"), randID("p_")

	// Idempotent retry: same op id, same answer, no new version.
	op := upsert(syncmod.EntityPlayer, p1, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q,"displayName":"A"}`, p1, league))
	first := put(t, svc, member.ID, op)
	retry := put(t, svc, member.ID, op)
	if first.Version != retry.Version || first.Status != syncmod.StatusApplied {
		t.Fatalf("retry must repeat the original result: %+v vs %+v", first, retry)
	}

	// Stale base version conflicts and hands back the current copy.
	_ = put(t, svc, member.ID, upsert(syncmod.EntityPlayer, p1, league, first.Version, fmt.Sprintf(`{"id":%q,"leagueId":%q,"displayName":"B"}`, p1, league)))
	stale := put(t, svc, owner.ID, upsert(syncmod.EntityPlayer, p1, league, first.Version, fmt.Sprintf(`{"id":%q,"leagueId":%q,"displayName":"C"}`, p1, league)))
	if stale.Status != syncmod.StatusConflict || stale.Current == nil {
		t.Fatalf("expected conflict with current copy: %+v", stale)
	}

	// A non-member is refused and sees nothing.
	denied := put(t, svc, stranger.ID, upsert(syncmod.EntityPlayer, p2, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q}`, p2, league)))
	if denied.Status != syncmod.StatusRejected {
		t.Fatalf("stranger must be rejected: %+v", denied)
	}
	if page, err := svc.Pull(ctx, stranger.ID, 0, 0); err != nil || len(page.Docs) != 0 {
		t.Fatalf("stranger must see no documents: %v %+v", err, page)
	}

	// Delete leaves a tombstone the member receives.
	cur := put(t, svc, owner.ID, upsert(syncmod.EntityPlayer, p3, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q}`, p3, league)))
	del := syncmod.Op{OpID: randID("op_"), Entity: syncmod.EntityPlayer, ID: p3, LeagueID: league,
		Action: syncmod.ActionDelete, BaseVersion: cur.Version}
	if r := put(t, svc, owner.ID, del); r.Status != syncmod.StatusApplied {
		t.Fatalf("delete: %+v", r)
	}
	page, err := svc.Pull(ctx, member.ID, 0, 500)
	if err != nil {
		t.Fatal(err)
	}
	tomb := false
	for _, d := range page.Docs {
		if d.ID == p3 && d.Deleted && len(d.Data) == 0 {
			tomb = true
		}
	}
	if !tomb {
		t.Fatal("member must receive the tombstone")
	}
}

func TestCrossLeagueIDCollisionIsRefused(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	users := auth.NewPGUsers(pool)
	a, b := newUser(t, users), newUser(t, users)
	svc := syncmod.NewService(syncmod.NewPGStore(pool))
	leagueA, leagueB := randID("lg_"), randID("lg_")
	for _, l := range []struct{ id, owner string }{{leagueA, a.ID}, {leagueB, b.ID}} {
		doc := fmt.Sprintf(`{"id":%q,"name":"L","kind":"club","createdByUid":%q}`, l.id, l.owner)
		if r := put(t, svc, l.owner, upsert(syncmod.EntityLeague, l.id, l.id, 0, doc)); r.Status != syncmod.StatusApplied {
			t.Fatalf("league: %+v", r)
		}
	}
	shared := randID("p_")
	first := put(t, svc, a.ID, upsert(syncmod.EntityPlayer, shared, leagueA, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q}`, shared, leagueA)))
	res := put(t, svc, b.ID, upsert(syncmod.EntityPlayer, shared, leagueB, first.Version, fmt.Sprintf(`{"id":%q,"leagueId":%q}`, shared, leagueB)))
	if res.Status != syncmod.StatusRejected || res.Current != nil {
		t.Fatalf("collision must be refused without leaking: %+v", res)
	}
	page, err := svc.Pull(ctx, a.ID, 0, 500)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range page.Docs {
		if d.ID == shared && d.LeagueID != leagueA {
			t.Fatalf("the document was moved to another league: %+v", d)
		}
	}
}

func TestConcurrentWritersGetUniqueOrderedVersions(t *testing.T) {
	pool := openPool(t)
	users := auth.NewPGUsers(pool)
	owner := newUser(t, users)
	svc := syncmod.NewService(syncmod.NewPGStore(pool))
	league := randID("lg_")
	leagueDoc := fmt.Sprintf(`{"id":%q,"name":"C","kind":"club","createdByUid":%q}`, league, owner.ID)
	if r := put(t, svc, owner.ID, upsert(syncmod.EntityLeague, league, league, 0, leagueDoc)); r.Status != syncmod.StatusApplied {
		t.Fatalf("league: %+v", r)
	}

	const writers = 25
	prefix := randID("pw_") // ids are unique across leagues, and other tests share this database
	versions := make(chan int64, writers)
	var wg gosync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := fmt.Sprintf("%s_%d", prefix, i)
			res, err := svc.Push(context.Background(), owner.ID, []syncmod.Op{
				upsert(syncmod.EntityPlayer, id, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q}`, id, league))})
			if err != nil || res[0].Status != syncmod.StatusApplied {
				t.Errorf("writer %d: %v %+v", i, err, res)
				return
			}
			versions <- res[0].Version
		}(i)
	}
	wg.Wait()
	close(versions)
	seen := map[int64]bool{}
	for v := range versions {
		if seen[v] {
			t.Fatalf("duplicate version %d", v)
		}
		seen[v] = true
	}

	// Paging through the whole league returns every document once, strictly increasing.
	var cursor, last int64
	count := 0
	for {
		page, err := svc.Pull(context.Background(), owner.ID, cursor, 10)
		if err != nil {
			t.Fatal(err)
		}
		for _, d := range page.Docs {
			if d.Version <= last {
				t.Fatalf("versions must increase: %d after %d", d.Version, last)
			}
			last = d.Version
			count++
		}
		cursor = page.Cursor
		if !page.HasMore {
			break
		}
	}
	if count != writers+1 {
		t.Fatalf("want %d documents (players + league), got %d", writers+1, count)
	}
}

func TestMembershipAgainstPostgres(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	users := auth.NewPGUsers(pool)
	owner, joiner := newUser(t, users), newUser(t, users)
	svc := syncmod.NewService(syncmod.NewPGStore(pool))

	league := randID("lg_")
	code := "J" + strings.ToUpper(randID(""))[:7]
	doc := fmt.Sprintf(`{"id":%q,"name":"Club","kind":"club","createdByUid":%q,"inviteCode":%q}`, league, owner.ID, code)
	if r := put(t, svc, owner.ID, upsert(syncmod.EntityLeague, league, league, 0, doc)); r.Status != syncmod.StatusApplied {
		t.Fatalf("league: %+v", r)
	}
	player := randID("p_")
	put(t, svc, owner.ID, upsert(syncmod.EntityPlayer, player, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q}`, player, league)))

	preview, err := svc.PreviewInvite(ctx, strings.ToLower(code))
	if err != nil || preview.LeagueID != league {
		t.Fatalf("preview: %v %+v", err, preview)
	}
	joined, err := svc.JoinByCode(ctx, joiner.ID, code)
	if err != nil || !strings.Contains(string(joined.Data), joiner.ID) {
		t.Fatalf("join: %v %s", err, joined.Data)
	}
	page, err := svc.PullLeague(ctx, joiner.ID, league, 0, 500)
	if err != nil {
		t.Fatalf("pull league: %v", err)
	}
	found := false
	for _, d := range page.Docs {
		found = found || d.ID == player
	}
	if !found {
		t.Fatal("joiner must receive the league's existing players")
	}
	if _, err := svc.Leave(ctx, joiner.ID, league); err != nil {
		t.Fatalf("leave: %v", err)
	}
	if _, err := svc.PullLeague(ctx, joiner.ID, league, 0, 10); !errors.Is(err, syncmod.ErrNotMember) {
		t.Fatalf("after leaving, pull must be refused, got %v", err)
	}

	city := strings.ToLower(randID("c"))
	hub, err := svc.JoinCityHub(ctx, joiner.ID, city, "Testville")
	// JSONB stores "key": "value" with a space, so compare without spaces.
	if err != nil || !strings.Contains(strings.ReplaceAll(string(hub.Data), " ", ""), `"kind":"city"`) {
		t.Fatalf("city hub: %v %s", err, hub.Data)
	}
}

func TestCommunityAgainstPostgres(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	users := auth.NewPGUsers(pool)
	a, b := newUser(t, users), newUser(t, users)
	repo := community.NewPGRepository(pool)
	svc := community.NewService(repo, nil)
	city := randID("city")

	for i, u := range []auth.User{a, b} {
		doc := fmt.Sprintf(`{"uid":%q,"cityId":%q}`, u.ID, city)
		if err := svc.Put(ctx, u.ID, community.KindProfile, u.ID, []byte(doc)); err != nil {
			t.Fatalf("profile: %v", err)
		}
		// Ranks are set by the stats worker, never by the phone.
		if err := repo.SetCityRank(ctx, u.ID, city, stats.CityRank{RankScore: float64(10 * (i + 1))}); err != nil {
			t.Fatalf("rank: %v", err)
		}
	}
	first, err := svc.List(ctx, a.ID, community.KindProfile, community.ListParams{City: city, Limit: 1})
	if err != nil || len(first.Items) != 1 || !first.HasMore || !strings.Contains(string(first.Items[0]), b.ID) {
		t.Fatalf("first page: %v %+v", err, first)
	}
	second, err := svc.List(ctx, a.ID, community.KindProfile, community.ListParams{City: city, Limit: 1, Cursor: first.Cursor})
	if err != nil || len(second.Items) != 1 || second.HasMore || !strings.Contains(string(second.Items[0]), a.ID) {
		t.Fatalf("second page: %v %+v", err, second)
	}

	follow := "fl_" + a.ID + "_" + b.ID
	if err := svc.Put(ctx, a.ID, community.KindFollow, follow,
		[]byte(fmt.Sprintf(`{"id":%q,"followerUid":%q,"followingUid":%q}`, follow, a.ID, b.ID))); err != nil {
		t.Fatalf("follow: %v", err)
	}
	followers, err := svc.List(ctx, b.ID, community.KindFollow, community.ListParams{Subject: b.ID})
	if err != nil || len(followers.Items) != 1 {
		t.Fatalf("followers: %v %+v", err, followers)
	}
	if err := svc.Delete(ctx, a.ID, community.KindFollow, follow); err != nil {
		t.Fatalf("unfollow: %v", err)
	}
}
