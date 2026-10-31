//go:build integration

package integration

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/vaibhav/snookit-server/internal/auth"
	"github.com/vaibhav/snookit-server/internal/community"
	"github.com/vaibhav/snookit-server/internal/public"
	"github.com/vaibhav/snookit-server/internal/stats"
	syncmod "github.com/vaibhav/snookit-server/internal/sync"
	"github.com/vaibhav/snookit-server/internal/tournament"
)

// Exercises every SQL query added after the first deploy against a real database.
func TestStatsTournamentsAndPublicPagesAgainstPostgres(t *testing.T) {
	pool := openPool(t)
	ctx := context.Background()
	users := auth.NewPGUsers(pool)
	a, b := newUser(t, users), newUser(t, users)
	svc := syncmod.NewService(syncmod.NewPGStore(pool))
	repo := stats.NewPGRepository(pool)
	profiles := community.NewPGRepository(pool)

	league := randID("lg_")
	doc := fmt.Sprintf(`{"id":%q,"name":"Club","kind":"club","createdByUid":%q,"inviteCode":%q}`,
		league, a.ID, "S"+strings.ToUpper(randID(""))[:7])
	put(t, svc, a.ID, upsert(syncmod.EntityLeague, league, league, 0, doc))
	if _, err := svc.JoinByCode(ctx, b.ID, strings.Split(strings.Split(doc, `"inviteCode":"`)[1], `"`)[0]); err != nil {
		t.Fatalf("join: %v", err)
	}
	pa, pb := randID("p_"), randID("p_")
	put(t, svc, a.ID, upsert(syncmod.EntityPlayer, pa, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q,"displayName":"Asha Rao","authUid":%q}`, pa, league, a.ID)))
	put(t, svc, b.ID, upsert(syncmod.EntityPlayer, pb, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q,"displayName":"Ravi Kumar","authUid":%q}`, pb, league, b.ID)))
	tid := randID("tn_")
	put(t, svc, a.ID, upsert(syncmod.EntityTournament, tid, league, 0,
		fmt.Sprintf(`{"id":%q,"leagueId":%q,"name":"Cup","format":"knockout","entrants":[%q,%q],"createdByUid":%q}`, tid, league, pa, pb, a.ID)))
	mid := randID("mt_")
	match := fmt.Sprintf(`{"id":%q,"leagueId":%q,"createdByUid":%q,"scorerUid":%q,"teamA":[%q],"teamB":[%q],"tournamentId":%q,"round":0,"slot":0,"confirmedByUids":[%q],"updatedAt":"2026-10-30T10:00:00Z","frames":[],"outcome":{"status":"completed","winner":"a","framesA":2,"framesB":1}}`,
		mid, league, a.ID, a.ID, pa, pb, tid, b.ID)
	if r := put(t, svc, a.ID, upsert(syncmod.EntityMatch, mid, league, 0, match)); r.Status != syncmod.StatusApplied {
		t.Fatalf("match: %+v", r)
	}

	// Stats worker queries.
	if err := stats.NewWorker(repo, profiles, nil, nil).RunOnce(ctx); err != nil {
		t.Fatalf("worker: %v", err)
	}
	rows, err := repo.Standings(ctx, league, 10, 0)
	if err != nil || len(rows) != 2 {
		t.Fatalf("standings: %v %d", err, len(rows))
	}
	// Public rating queries.
	if err := stats.RecomputePublic(ctx, repo, profiles); err != nil {
		t.Fatalf("public ratings: %v", err)
	}
	var games int
	if err := pool.QueryRow(ctx, `SELECT games FROM public_ratings WHERE user_id = $1`, a.ID).Scan(&games); err != nil || games < 1 {
		t.Fatalf("public rating row: %v games=%d", err, games)
	}
	// Public pages.
	if _, _, players, err := svc.PublicMatch(ctx, mid); err != nil || len(players) != 2 {
		t.Fatalf("public match: %v %d", err, len(players))
	}
	bracket, err := tournament.NewPublicPages(svc).PublicBracket(ctx, tid)
	if err != nil || bracket.Champion != "Asha R." {
		t.Fatalf("bracket: %v %+v", err, bracket)
	}
	if err := public.NewPGRemovals(pool).SaveRemovalRequest(ctx, "match:"+mid, "test"); err != nil {
		t.Fatalf("removal request: %v", err)
	}
	// Community: devices, blocks, city rank writer.
	csvc := community.NewService(profiles, repo)
	deviceID := "dv_" + randID("")
	device := fmt.Sprintf(`{"id":%q,"uid":%q,"pushToken":"ExponentPushToken[%s]"}`, deviceID, a.ID, randID(""))
	if err := csvc.Put(ctx, a.ID, community.KindDevice, deviceID, []byte(device)); err != nil {
		t.Fatalf("device: %v", err)
	}
	tokens, err := profiles.DeviceTokens(ctx, a.ID, 10)
	if err != nil || len(tokens) != 1 {
		t.Fatalf("tokens: %v %v", err, tokens)
	}
	if err := profiles.RemoveDeviceToken(ctx, tokens[0]); err != nil {
		t.Fatalf("remove token: %v", err)
	}
	if err := profiles.SetCityRank(ctx, a.ID, "nowhere", stats.CityRank{RankScore: 1}); err != nil {
		t.Fatalf("set city rank: %v", err)
	}

	// Claim links: create, redeem once, refuse a second use.
	svc.SetClaims(syncmod.NewPGClaims(pool))
	guest := randID("p_")
	put(t, svc, a.ID, upsert(syncmod.EntityPlayer, guest, league, 0, fmt.Sprintf(`{"id":%q,"leagueId":%q,"displayName":"Guest","kind":"guest","authUid":null}`, guest, league)))
	claimer := newUser(t, users)
	token, err := svc.CreateClaimLink(ctx, a.ID, guest)
	if err != nil {
		t.Fatalf("create claim: %v", err)
	}
	if _, card, err := svc.RedeemClaimLink(ctx, claimer.ID, token); err != nil || !strings.Contains(string(card.Data), claimer.ID) {
		t.Fatalf("redeem claim: %v %s", err, card.Data)
	}
	if _, _, err := svc.RedeemClaimLink(ctx, b.ID, token); err == nil {
		t.Fatal("a used claim link must be refused")
	}
}
