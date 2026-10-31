package sync

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type memClaims struct{ links map[string]ClaimLink }

func (m *memClaims) SaveClaimLink(_ context.Context, l ClaimLink) error {
	m.links[l.TokenHash] = l
	return nil
}

func (m *memClaims) ClaimLinkForUpdate(_ context.Context, _ Tx, h string) (ClaimLink, error) {
	if l, ok := m.links[h]; ok {
		return l, nil
	}
	return ClaimLink{}, ErrNotFound
}

func (m *memClaims) MarkClaimUsed(_ context.Context, _ Tx, h string, at time.Time) error {
	l := m.links[h]
	l.UsedAt = &at
	m.links[h] = l
	return nil
}

func TestClaimLinksHandOverAGuestCardOnce(t *testing.T) {
	svc, store := setup(t)
	ctx := context.Background()
	claims := &memClaims{links: map[string]ClaimLink{}}
	svc.SetClaims(claims)
	push1(t, svc, "member", op(EntityPlayer, "g1", "lg1", 0, `{"id":"g1","leagueId":"lg1","displayName":"Guest","kind":"guest","authUid":null}`))

	if _, err := svc.CreateClaimLink(ctx, "stranger", "g1"); !errors.Is(err, ErrNotMember) {
		t.Fatalf("outsiders can't make claim links, got %v", err)
	}
	token, err := svc.CreateClaimLink(ctx, "member", "g1")
	if err != nil || len(token) < 20 {
		t.Fatalf("create: %v %q", err, token)
	}
	for h := range claims.links {
		if h == token {
			t.Fatal("the raw token must never be stored")
		}
	}
	league, card, err := svc.RedeemClaimLink(ctx, "newbie", token)
	if err != nil {
		t.Fatalf("redeem: %v", err)
	}
	if !strings.Contains(string(card.Data), `"authUid":"newbie"`) || !strings.Contains(string(league.Data), "newbie") {
		t.Fatalf("card=%s league=%s", card.Data, league.Data)
	}
	if role, _ := store.Role(ctx, "lg1", "newbie"); role != RoleMember {
		t.Fatalf("claimer must join the league, role=%q", role)
	}
	if _, _, err := svc.RedeemClaimLink(ctx, "someone", token); !errors.Is(err, ErrClaimInvalid) {
		t.Fatalf("a used link must be refused, got %v", err)
	}
	if _, err := svc.CreateClaimLink(ctx, "member", "g1"); !errors.Is(err, ErrCardTaken) {
		t.Fatalf("an owned card can't get a new link, got %v", err)
	}
}

func TestExpiredClaimLinksAreRefused(t *testing.T) {
	svc, _ := setup(t)
	claims := &memClaims{links: map[string]ClaimLink{}}
	svc.SetClaims(claims)
	push1(t, svc, "member", op(EntityPlayer, "g1", "lg1", 0, `{"id":"g1","leagueId":"lg1","authUid":null}`))
	token, err := svc.CreateClaimLink(context.Background(), "member", "g1")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	for h, l := range claims.links {
		l.ExpiresAt = time.Now().Add(-time.Minute)
		claims.links[h] = l
	}
	if _, _, err := svc.RedeemClaimLink(context.Background(), "newbie", token); !errors.Is(err, ErrClaimInvalid) {
		t.Fatalf("expired link must be refused, got %v", err)
	}
}
