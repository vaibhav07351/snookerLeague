package sync

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"testing"
)

func membersOf(t *testing.T, d Doc) []string {
	t.Helper()
	var body struct {
		MemberUids []string `json:"memberUids"`
	}
	if err := json.Unmarshal(d.Data, &body); err != nil {
		t.Fatalf("decode league: %v", err)
	}
	return body.MemberUids
}

func TestLeagueMemberListIsOwnedByTheServer(t *testing.T) {
	svc, store := setup(t)
	// A phone tries to add a stranger by editing memberUids: the server keeps its own list.
	sneaky := `{"id":"lg1","name":"Club","kind":"club","createdByUid":"owner","inviteCode":"ABC234","memberUids":["owner","stranger"]}`
	wantStatus(t, push1(t, svc, "owner", op(EntityLeague, "lg1", "lg1", 1, sneaky)), StatusApplied, "")
	got, _ := store.Get(context.Background(), EntityLeague, "lg1")
	if want := []string{"owner", "member", "other"}; !slices.Equal(membersOf(t, got), want) {
		t.Fatalf("memberUids = %v, want %v", membersOf(t, got), want)
	}
}

func TestJoinByCodeAddsMemberAndRepeatsHarmlessly(t *testing.T) {
	svc, store := setup(t)
	ctx := context.Background()
	if _, err := svc.JoinByCode(ctx, "newbie", "WRONG1"); !errors.Is(err, ErrInviteNotFound) {
		t.Fatalf("unknown code must be ErrInviteNotFound, got %v", err)
	}
	league, err := svc.JoinByCode(ctx, "newbie", " abc234 ")
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if !slices.Contains(membersOf(t, league), "newbie") {
		t.Fatalf("newbie missing from %v", membersOf(t, league))
	}
	if _, err := svc.JoinByCode(ctx, "newbie", "ABC234"); err != nil {
		t.Fatalf("second join: %v", err)
	}
	if role, _ := store.Role(ctx, "lg1", "newbie"); role != RoleMember {
		t.Fatalf("role = %q", role)
	}
	// The owner joining with the code stays the owner.
	if _, err := svc.JoinByCode(ctx, "owner", "ABC234"); err != nil {
		t.Fatalf("owner join: %v", err)
	}
	if role, _ := store.Role(ctx, "lg1", "owner"); role != RoleOwner {
		t.Fatalf("owner role = %q", role)
	}
}

func TestPreviewInviteShowsOnlyIdAndName(t *testing.T) {
	svc, _ := setup(t)
	got, err := svc.PreviewInvite(context.Background(), "abc234")
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if got != (InvitePreview{Code: "ABC234", LeagueID: "lg1", LeagueName: "Club"}) {
		t.Fatalf("preview = %+v", got)
	}
	if _, err := svc.PreviewInvite(context.Background(), "bad code!"); !errors.Is(err, ErrInviteNotFound) {
		t.Fatalf("malformed code must be ErrInviteNotFound, got %v", err)
	}
}

func TestCityHubIsCreatedByTheServerAndJoinedByAnyone(t *testing.T) {
	svc, store := setup(t)
	ctx := context.Background()
	first, err := svc.JoinCityHub(ctx, "member", "pune", "Pune")
	if err != nil {
		t.Fatalf("first join: %v", err)
	}
	f, _ := decodeFields(first.Data)
	if f.str("kind") != "city" || f.str("createdByUid") != "" || f.str("cityId") != "pune" {
		t.Fatalf("hub = %s", first.Data)
	}
	second, err := svc.JoinCityHub(ctx, "other", "pune", "Renamed")
	if err != nil {
		t.Fatalf("second join: %v", err)
	}
	s, _ := decodeFields(second.Data)
	if s.str("name") != f.str("name") {
		t.Fatalf("a later join must not rename the hub: %q -> %q", f.str("name"), s.str("name"))
	}
	if want := []string{"member", "other"}; !slices.Equal(membersOf(t, second), want) {
		t.Fatalf("members = %v", membersOf(t, second))
	}
	if role, _ := store.Role(ctx, "city_pune", "member"); role != RoleMember {
		t.Fatalf("hub joiners are plain members, got %q", role)
	}
	if _, err := svc.JoinCityHub(ctx, "member", "Pune City!", "Pune"); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("bad city id must be ErrBadRequest, got %v", err)
	}
}

func TestLeaveRemovesMemberButNotTheOwner(t *testing.T) {
	svc, store := setup(t)
	ctx := context.Background()
	league, err := svc.Leave(ctx, "member", "lg1")
	if err != nil {
		t.Fatalf("leave: %v", err)
	}
	if slices.Contains(membersOf(t, league), "member") {
		t.Fatalf("member still listed: %v", membersOf(t, league))
	}
	if role, _ := store.Role(ctx, "lg1", "member"); role != RoleNone {
		t.Fatalf("role after leave = %q", role)
	}
	if _, err := svc.Leave(ctx, "member", "lg1"); !errors.Is(err, ErrNotMember) {
		t.Fatalf("second leave must be ErrNotMember, got %v", err)
	}
	if _, err := svc.Leave(ctx, "owner", "lg1"); !errors.Is(err, ErrOwnerCantLeave) {
		t.Fatalf("owner leave must be ErrOwnerCantLeave, got %v", err)
	}
}

func TestPullLeagueReturnsHistoryOlderThanTheCursorForMembersOnly(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	wantStatus(t, push1(t, svc, "member", op(EntityPlayer, "p1", "lg1", 0, `{"id":"p1","leagueId":"lg1"}`)), StatusApplied, "")
	if _, err := svc.PullLeague(ctx, "newbie", "lg1", 0, 0); !errors.Is(err, ErrNotMember) {
		t.Fatalf("non-member must be ErrNotMember, got %v", err)
	}
	if _, err := svc.JoinByCode(ctx, "newbie", "ABC234"); err != nil {
		t.Fatalf("join: %v", err)
	}
	page, err := svc.PullLeague(ctx, "newbie", "lg1", 0, 0)
	if err != nil {
		t.Fatalf("pull league: %v", err)
	}
	var sawPlayer bool
	for _, d := range page.Docs {
		sawPlayer = sawPlayer || (d.Entity == EntityPlayer && d.ID == "p1")
	}
	if !sawPlayer {
		t.Fatalf("history missing from %+v", page.Docs)
	}
}

func TestHubMembersMayOnlyUpdateTitles(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	hub, err := svc.JoinCityHub(ctx, "member", "pune", "Pune")
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	var body map[string]any
	_ = json.Unmarshal(hub.Data, &body)

	body["raceKing"] = map[string]any{"playerId": "p1"}
	crowned, _ := json.Marshal(body)
	wantStatus(t, push1(t, svc, "member", op(EntityLeague, "city_pune", "city_pune", hub.Version, string(crowned))), StatusApplied, "")

	body["name"] = "Renamed"
	renamed, _ := json.Marshal(body)
	wantStatus(t, push1(t, svc, "member", op(EntityLeague, "city_pune", "city_pune", 0, string(renamed))), StatusRejected, "forbidden")
	wantStatus(t, push1(t, svc, "member", del(EntityLeague, "city_pune", "city_pune", 0)), StatusRejected, "forbidden")
}

func TestJoiningAgainChangesNothing(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	first, err := svc.JoinCityHub(ctx, "member", "pune", "Pune")
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	again, err := svc.JoinCityHub(ctx, "member", "pune", "Pune")
	if err != nil {
		t.Fatalf("second join: %v", err)
	}
	if again.Version != first.Version {
		t.Fatalf("a repeat join rewrote the hub: version %d -> %d", first.Version, again.Version)
	}
}
