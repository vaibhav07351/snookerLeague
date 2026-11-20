package sync

import (
	"context"
	"encoding/json"

	"github.com/vaibhav/snookit-server/internal/events"
)

// EventRecorder saves product events. Recording is best effort and never fails the caller.
type EventRecorder interface {
	Record(ctx context.Context, e events.Event)
}

// SetEvents connects event recording (optional; nil turns it off).
func (s *Service) SetEvents(r EventRecorder) { s.events = r }

func (s *Service) record(ctx context.Context, e events.Event) {
	if s.events != nil {
		s.events.Record(ctx, e)
	}
}

// gameKinds names the games whose finish counts as a scored game, as the public result
// links call them.
var gameKinds = map[Entity]string{EntityMatch: "match", EntityRace: "race", EntityGroupMatch: "group"}

// recordGameFinished records match_scored the first time a saved game is finished. It runs
// after the commit; the dedupe key keeps later edits of a finished game from counting again.
func (s *Service) recordGameFinished(ctx context.Context, userID string, op Op, saved json.RawMessage) {
	kind, ok := gameKinds[op.Entity]
	if !ok || saved == nil || !gameFinished(op.Entity, saved) {
		return
	}
	s.record(ctx, events.Event{
		Name: events.MatchScored, UserID: userID, LeagueID: op.LeagueID, Ref: op.ID,
		Props: map[string]string{"kind": kind}, DedupeKey: events.MatchScored + ":" + op.ID,
	})
}

// gameFinished reports whether a stored match, race or free-for-all body is finished.
func gameFinished(entity Entity, data json.RawMessage) bool {
	f, err := decodeFields(data)
	if err != nil {
		return false
	}
	if entity == EntityMatch {
		return isFinished(f.outcomeStatus())
	}
	return f.str("status") == "completed"
}
