package sync

import (
	"context"
	"encoding/json"
	"fmt"
)

// deletedPlayerName replaces the name on a deleted account's player cards.
const deletedPlayerName = "Deleted player"

// ForgetUser erases a deleting account's league data (Google Play account deletion):
//   - leagues they own are deleted, with everything in them, as tombstones so every other
//     member's phone removes them too;
//   - their player cards in other people's leagues become unowned guest cards named
//     "Deleted player", so scores and stats stay correct for everyone else.
//
// Safe to run again after a partial failure: finished steps find nothing left to do.
func (s *Service) ForgetUser(ctx context.Context, userID string) error {
	err := s.store.InTx(ctx, func(tx Tx) error {
		if err := tx.LockWrites(ctx); err != nil {
			return err
		}
		owned, err := tx.OwnedLeagues(ctx, userID)
		if err != nil {
			return fmt.Errorf("list owned leagues: %w", err)
		}
		for _, leagueID := range owned {
			docs, err := tx.LiveLeagueDocs(ctx, leagueID)
			if err != nil {
				return fmt.Errorf("list league docs: %w", err)
			}
			for _, d := range docs {
				if _, err := tx.Put(ctx, Doc{Entity: d.Entity, ID: d.ID, LeagueID: d.LeagueID, Deleted: true}); err != nil {
					return fmt.Errorf("delete %s: %w", d.Entity, err)
				}
			}
		}
		cards, err := tx.PlayerCardsOf(ctx, userID)
		if err != nil {
			return fmt.Errorf("list player cards: %w", err)
		}
		for _, card := range cards {
			data, err := anonymised(card.Data)
			if err != nil {
				return err
			}
			if _, err := tx.Put(ctx, Doc{Entity: EntityPlayer, ID: card.ID, LeagueID: card.LeagueID, Data: data}); err != nil {
				return fmt.Errorf("anonymise player card: %w", err)
			}
			if err := tx.MarkDirty(ctx, card.LeagueID); err != nil {
				return fmt.Errorf("mark league for stats: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("forget user: %w", err)
	}
	return nil
}

func anonymised(raw json.RawMessage) (json.RawMessage, error) {
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, fmt.Errorf("decode player card: %w", err)
	}
	body["authUid"] = nil
	body["kind"] = "guest"
	body["displayName"] = deletedPlayerName
	body["photoUrl"] = nil
	out, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode player card: %w", err)
	}
	return out, nil
}
