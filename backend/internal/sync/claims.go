package sync

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Claim links (phase 4): a league member creates a link for a guest card; whoever opens it
// and signs in takes over that card (and its history) and joins the league.

const claimLinkTTL = 7 * 24 * time.Hour

// Claim link errors the handler maps to client responses.
var (
	ErrClaimInvalid = errors.New("claim link invalid or used")
	ErrCardTaken    = errors.New("card already has an owner")
)

// ClaimLink is one stored link (only the token's hash is kept).
type ClaimLink struct {
	TokenHash string
	PlayerID  string
	LeagueID  string
	CreatedBy string
	ExpiresAt time.Time
	UsedAt    *time.Time
}

// ClaimStore keeps claim links. It is separate from Tx so links never touch versions.
type ClaimStore interface {
	SaveClaimLink(ctx context.Context, l ClaimLink) error
	// ClaimLinkForUpdate loads a link and locks it until the transaction ends.
	ClaimLinkForUpdate(ctx context.Context, tx Tx, tokenHash string) (ClaimLink, error)
	MarkClaimUsed(ctx context.Context, tx Tx, tokenHash string, at time.Time) error
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// SetClaims connects claim link storage (required for the claim endpoints).
func (s *Service) SetClaims(c ClaimStore) { s.claims = c }

// CreateClaimLink makes a single-use link for an unowned card in a league the user belongs to.
// It returns the token; the caller builds the URL.
func (s *Service) CreateClaimLink(ctx context.Context, userID, playerID string) (string, error) {
	if s.claims == nil {
		return "", errors.New("claim links are not configured")
	}
	var link ClaimLink
	err := s.store.InTx(ctx, func(tx Tx) error {
		card, err := tx.Get(ctx, EntityPlayer, playerID)
		if err != nil {
			return err
		}
		if card.Deleted {
			return ErrNotFound
		}
		role, err := tx.Role(ctx, card.LeagueID, userID)
		if err != nil {
			return fmt.Errorf("load role: %w", err)
		}
		if role == RoleNone {
			return ErrNotMember
		}
		f, err := decodeFields(card.Data)
		if err != nil {
			return err
		}
		if f.str("authUid") != "" {
			return ErrCardTaken
		}
		link = ClaimLink{PlayerID: playerID, LeagueID: card.LeagueID, CreatedBy: userID,
			ExpiresAt: time.Now().UTC().Add(claimLinkTTL)}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("create claim link: %w", err)
	}
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("claim token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	link.TokenHash = hashToken(token)
	if err := s.claims.SaveClaimLink(ctx, link); err != nil {
		return "", fmt.Errorf("save claim link: %w", err)
	}
	return token, nil
}

// RedeemClaimLink gives the card to the user, adds them to the league, and uses up the link.
// It returns the league and the claimed card.
func (s *Service) RedeemClaimLink(ctx context.Context, userID, token string) (league, card Doc, err error) {
	if s.claims == nil {
		return Doc{}, Doc{}, errors.New("claim links are not configured")
	}
	err = s.store.InTx(ctx, func(tx Tx) error {
		if err := tx.LockWrites(ctx); err != nil {
			return err
		}
		link, err := s.claims.ClaimLinkForUpdate(ctx, tx, hashToken(token))
		if errors.Is(err, ErrNotFound) {
			return ErrClaimInvalid
		}
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		if link.UsedAt != nil || now.After(link.ExpiresAt) {
			return ErrClaimInvalid
		}
		current, err := tx.Get(ctx, EntityPlayer, link.PlayerID)
		if err != nil || current.Deleted {
			return ErrClaimInvalid
		}
		var body map[string]any
		if err := json.Unmarshal(current.Data, &body); err != nil {
			return fmt.Errorf("decode card: %w", err)
		}
		if owner, _ := body["authUid"].(string); owner != "" && owner != userID {
			return ErrCardTaken
		}
		body["authUid"], body["kind"] = userID, "member"
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("encode card: %w", err)
		}
		lg, err := tx.Get(ctx, EntityLeague, link.LeagueID)
		if err != nil {
			return err
		}
		if league, err = s.addMember(ctx, tx, lg, userID); err != nil {
			return err
		}
		if card, err = tx.Put(ctx, Doc{Entity: EntityPlayer, ID: current.ID, LeagueID: current.LeagueID, Data: data}); err != nil {
			return fmt.Errorf("save card: %w", err)
		}
		card.Data = data
		if err := tx.MarkDirty(ctx, link.LeagueID); err != nil {
			return err
		}
		return s.claims.MarkClaimUsed(ctx, tx, link.TokenHash, now)
	})
	if err != nil {
		return Doc{}, Doc{}, fmt.Errorf("redeem claim link: %w", err)
	}
	return league, card, nil
}
