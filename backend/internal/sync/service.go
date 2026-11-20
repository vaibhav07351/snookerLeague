package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

const (
	maxOpsPerPush  = 100
	maxDocBytes    = 512 * 1024
	maxIDLength    = 128
	defaultPull    = 200
	maxPullLimit   = 500
	maxOpIDLength  = 64
	invalidOpCode  = "bad_request"
	conflictCode   = "conflict"
	conflictReason = "This item changed on the server."
)

// Publisher is told about every saved match (the live module pushes it to watchers).
type Publisher interface {
	Publish(d Doc)
}

// Service applies pushed operations and serves pulls.
type Service struct {
	store     Store
	publisher Publisher
	claims    ClaimStore
	events    EventRecorder
	now       func() time.Time
}

// SetPublisher connects live updates (optional; nil turns them off).
func (s *Service) SetPublisher(p Publisher) { s.publisher = p }

// NewService builds the sync service.
func NewService(store Store) *Service {
	return &Service{store: store, now: func() time.Time { return time.Now().UTC() }}
}

// Push applies each operation independently, so one refused operation never blocks or drops
// the rest of the batch. Results come back in the same order as the operations.
func (s *Service) Push(ctx context.Context, userID string, ops []Op) ([]OpResult, error) {
	if len(ops) == 0 || len(ops) > maxOpsPerPush {
		return nil, fmt.Errorf("%w: send between 1 and %d operations", ErrBadRequest, maxOpsPerPush)
	}
	results := make([]OpResult, 0, len(ops))
	for _, op := range ops {
		result, err := s.applyOne(ctx, userID, op)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

// ErrBadRequest marks a malformed request as a whole (not a single refused operation).
var ErrBadRequest = errors.New("bad request")

func (s *Service) applyOne(ctx context.Context, userID string, op Op) (OpResult, error) {
	if msg := validateOp(op); msg != "" {
		return OpResult{OpID: op.OpID, Status: StatusRejected, Code: invalidOpCode, Message: msg}, nil
	}
	var result OpResult
	var saved json.RawMessage
	err := s.store.InTx(ctx, func(tx Tx) error {
		if err := tx.LockWrites(ctx); err != nil {
			return err
		}
		// A retry of an operation that already succeeded gets the original answer.
		prev, err := tx.AppliedResult(ctx, userID, op.OpID)
		if err == nil {
			result = prev
			return nil
		}
		if !errors.Is(err, ErrNotFound) {
			return err
		}
		result, saved, err = s.apply(ctx, tx, userID, op)
		return err
	})
	if err != nil {
		return OpResult{}, fmt.Errorf("apply op %s: %w", op.OpID, err)
	}
	// Only after the commit, so watchers never see a change that was rolled back. A retried
	// operation (saved == nil for upserts) was published the first time.
	if s.publisher != nil && result.Status == StatusApplied && op.Entity == EntityMatch &&
		(op.Action == ActionDelete || saved != nil) {
		d := Doc{Entity: op.Entity, ID: op.ID, LeagueID: op.LeagueID, Version: result.Version}
		if op.Action == ActionDelete {
			d.Deleted = true
		} else {
			d.Data = saved
		}
		s.publisher.Publish(d)
	}
	if result.Status == StatusApplied && op.Action == ActionUpsert {
		s.recordGameFinished(ctx, userID, op, saved)
	}
	return result, nil
}

// apply checks and saves one operation. It returns the answer for the phone and, for a saved
// upsert, the stored body (which can differ from what the phone sent: see settleMatchFields).
func (s *Service) apply(ctx context.Context, tx Tx, userID string, op Op) (OpResult, json.RawMessage, error) {
	var current *Doc
	doc, err := tx.Get(ctx, op.Entity, op.ID)
	switch {
	case err == nil:
		current = &doc
	case !errors.Is(err, ErrNotFound):
		return OpResult{}, nil, fmt.Errorf("load document: %w", err)
	}

	// Document ids are unique across ALL leagues, so an id that exists must belong to the league
	// named in the request. Without this check a member of league A could name their own league
	// but another league's document id: they would read it through the conflict reply, or move
	// and overwrite it. The refusal reveals nothing about the other document.
	if current != nil && current.LeagueID != op.LeagueID {
		slog.Warn("sync op names another league's document", "op", op.OpID, "entity", op.Entity)
		return refused(op, "id_taken", "That id is already in use."), nil, nil
	}
	if current == nil && op.Action == ActionDelete {
		return refused(op, "not_found", "Nothing to delete."), nil, nil
	}
	var cur fields
	if current != nil && !current.Deleted {
		if cur, err = decodeFields(current.Data); err != nil {
			return OpResult{}, nil, err
		}
	}
	isMatchUpsert := op.Entity == EntityMatch && op.Action == ActionUpsert
	if isMatchUpsert {
		if op.Data, err = pinServerFinishedAt(cur, op.Data); err != nil {
			return OpResult{}, nil, err
		}
		if res, err := staleConfirmationAnswer(ctx, tx, userID, op, current, cur); err != nil || res != nil {
			return deref(res), nil, err
		}
	}
	if rej, err := authorize(ctx, tx, userID, op, current); err != nil {
		return OpResult{}, nil, err
	} else if rej != nil {
		if rej.code == retryLaterCode {
			// Something this write depends on is not on the server yet: the phone sends the
			// rest of its queue and tries again.
			return OpResult{OpID: op.OpID, Status: StatusConflict, Code: conflictCode,
				Message: rej.message, Current: current}, nil, nil
		}
		slog.Info("sync op rejected", "op", op.OpID, "entity", op.Entity, "code", rej.code)
		return refused(op, rej.code, rej.message), nil, nil
	}

	// The phone must have seen the latest server version, otherwise two phones edited the
	// same item from the same starting point and one would silently erase the other.
	currentVersion := int64(0)
	if current != nil {
		currentVersion = current.Version
	}
	if op.BaseVersion != currentVersion {
		return OpResult{OpID: op.OpID, Status: StatusConflict, Code: conflictCode,
			Message: conflictReason, Current: current}, nil, nil
	}

	if current == nil && op.Entity == EntityLeague {
		if err := tx.AddMember(ctx, op.ID, userID, RoleOwner); err != nil {
			return OpResult{}, nil, fmt.Errorf("add league owner: %w", err)
		}
	}
	stored := Doc{Entity: op.Entity, ID: op.ID, LeagueID: op.LeagueID}
	if op.Action == ActionDelete {
		stored.Deleted = true
	} else if stored.Data, err = s.storedBody(ctx, tx, userID, op, cur); err != nil {
		return OpResult{}, nil, err
	}
	saved, err := tx.Put(ctx, stored)
	if err != nil {
		return OpResult{}, nil, fmt.Errorf("save document: %w", err)
	}
	if op.Entity == EntityLeague && op.Action == ActionDelete {
		if err := deleteLeagueContents(ctx, tx, op.ID); err != nil {
			return OpResult{}, nil, err
		}
	}
	if affectsStats(op.Entity) {
		if err := tx.MarkDirty(ctx, op.LeagueID); err != nil {
			return OpResult{}, nil, fmt.Errorf("mark league for stats: %w", err)
		}
	}
	result := OpResult{OpID: op.OpID, Status: StatusApplied, Version: saved.Version}
	if err := tx.SaveResult(ctx, op.OpID, userID, result); err != nil {
		return OpResult{}, nil, fmt.Errorf("save result: %w", err)
	}
	return result, stored.Data, nil
}

// staleConfirmationAnswer handles an opponent confirming from a copy that is behind the
// server's (the scorer renamed the match, or someone else confirmed, meanwhile). The permission
// check would refuse it, because the old copy looks like an edit of the match. Instead: while
// the result is the one they saw, answer with a conflict so the phone lays its confirmation
// over the newer copy and sends it again; when the result changed, say so. nil means the write
// is not such a confirmation and takes the normal path.
func staleConfirmationAnswer(ctx context.Context, tx Tx, userID string, op Op, current *Doc, cur fields) (*OpResult, error) {
	if current == nil || current.Deleted || op.BaseVersion == current.Version {
		return nil, nil
	}
	next, err := decodeFields(op.Data)
	if err != nil {
		return nil, nil //nolint:nilerr // invalid JSON is refused by the permission check
	}
	adding, sameResult := staleConfirmation(userID, cur, next)
	if !adding {
		return nil, nil
	}
	role, err := tx.Role(ctx, op.LeagueID, userID)
	if err != nil {
		return nil, fmt.Errorf("load role: %w", err)
	}
	if role == RoleNone {
		return nil, nil
	}
	if !sameResult {
		res := refused(op, "result_changed", "The result changed after you saw it. Check it and confirm again.")
		return &res, nil
	}
	return &OpResult{OpID: op.OpID, Status: StatusConflict, Code: conflictCode,
		Message: conflictReason, Current: current}, nil
}

func deref(r *OpResult) OpResult {
	if r == nil {
		return OpResult{}
	}
	return *r
}

// storedBody is the document body to save for an upsert: the phone's body, with the fields
// the server owns put right (league members, match confirmations and finish time).
func (s *Service) storedBody(ctx context.Context, tx Tx, userID string, op Op, cur fields) (json.RawMessage, error) {
	switch op.Entity {
	case EntityLeague:
		// The member list belongs to the server: whatever a phone sends is replaced.
		return withMembers(ctx, tx, op.ID, op.Data)
	case EntityMatch:
		next, err := decodeFields(op.Data)
		if err != nil {
			return nil, err
		}
		confirming, err := confirmingOwnResult(ctx, tx, userID, op, cur, next)
		if err != nil {
			return nil, err
		}
		confirmer := ""
		if confirming {
			confirmer = userID
		}
		return settleMatchFields(cur, next, confirmer, s.now())
	}
	return op.Data, nil
}

// deleteLeagueContents deletes everything in a deleted league, so its games leave public pages,
// stats and ratings, and every member's phone removes them on its next pull. Memberships stay
// so members still receive these deletions.
func deleteLeagueContents(ctx context.Context, tx Tx, leagueID string) error {
	docs, err := tx.LiveLeagueDocs(ctx, leagueID)
	if err != nil {
		return fmt.Errorf("list league contents: %w", err)
	}
	for _, d := range docs {
		if d.Entity == EntityLeague {
			continue
		}
		if _, err := tx.Put(ctx, Doc{Entity: d.Entity, ID: d.ID, LeagueID: d.LeagueID, Deleted: true}); err != nil {
			return fmt.Errorf("delete %s %s: %w", d.Entity, d.ID, err)
		}
	}
	if err := tx.MarkDirty(ctx, leagueID); err != nil {
		return fmt.Errorf("mark deleted league for stats: %w", err)
	}
	return nil
}

func refused(op Op, code, message string) OpResult {
	return OpResult{OpID: op.OpID, Status: StatusRejected, Code: code, Message: message}
}

// validateOp checks the shape of an operation. It returns "" when the operation is fine.
func validateOp(op Op) string {
	switch {
	case op.OpID == "" || len(op.OpID) > maxOpIDLength:
		return "opId is required (max 64 characters)."
	case !op.Entity.valid():
		return "Unknown entity."
	case op.ID == "" || len(op.ID) > maxIDLength:
		return "id is required (max 128 characters)."
	case op.LeagueID == "" || len(op.LeagueID) > maxIDLength:
		return "leagueId is required (max 128 characters)."
	case op.Action != ActionUpsert && op.Action != ActionDelete:
		return "action must be upsert or delete."
	case op.BaseVersion < 0:
		return "baseVersion can't be negative."
	}
	if op.Action == ActionDelete {
		return ""
	}
	if len(op.Data) == 0 || len(op.Data) > maxDocBytes {
		return "data is required and must be under 512 KB."
	}
	var body fields
	if err := json.Unmarshal(op.Data, &body); err != nil || body == nil {
		return "data must be a JSON object."
	}
	if id, _ := body["id"].(string); id != "" && id != op.ID {
		return "data.id does not match id."
	}
	if leagueID, _ := body["leagueId"].(string); op.Entity != EntityLeague && leagueID != "" && leagueID != op.LeagueID {
		return "data.leagueId does not match leagueId."
	}
	return checkShape(op.Entity, body)
}

// Pull returns the next page of changes after `since` for the leagues the user belongs to.
// Opt-in kinds (see optInEntities) are only included when listed in `optIn`.
func (s *Service) Pull(ctx context.Context, userID string, since int64, limit int, optIn ...Entity) (PullPage, error) {
	if since < 0 {
		return PullPage{}, fmt.Errorf("%w: since can't be negative", ErrBadRequest)
	}
	if limit <= 0 {
		limit = defaultPull
	}
	limit = min(limit, maxPullLimit)
	docs, err := s.store.Pull(ctx, userID, since, limit+1, hiddenEntities(optIn))
	if err != nil {
		return PullPage{}, fmt.Errorf("pull: %w", err)
	}
	return pageOf(docs, since, limit), nil
}

// affectsStats reports whether a write to this kind of document changes league numbers.
func affectsStats(e Entity) bool {
	return e == EntityMatch || e == EntityRace || e == EntityPlayer
}
