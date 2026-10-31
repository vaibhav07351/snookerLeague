package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
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

// Service applies pushed operations and serves pulls.
type Service struct {
	store Store
}

// NewService builds the sync service.
func NewService(store Store) *Service { return &Service{store: store} }

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
		result, err = s.apply(ctx, tx, userID, op)
		return err
	})
	if err != nil {
		return OpResult{}, fmt.Errorf("apply op %s: %w", op.OpID, err)
	}
	return result, nil
}

func (s *Service) apply(ctx context.Context, tx Tx, userID string, op Op) (OpResult, error) {
	var current *Doc
	doc, err := tx.Get(ctx, op.Entity, op.ID)
	switch {
	case err == nil:
		current = &doc
	case !errors.Is(err, ErrNotFound):
		return OpResult{}, fmt.Errorf("load document: %w", err)
	}

	// Document ids are unique across ALL leagues, so an id that exists must belong to the league
	// named in the request. Without this check a member of league A could name their own league
	// but another league's document id: they would read it through the conflict reply, or move
	// and overwrite it. The refusal reveals nothing about the other document.
	if current != nil && current.LeagueID != op.LeagueID {
		slog.Warn("sync op names another league's document", "op", op.OpID, "entity", op.Entity)
		return refused(op, "id_taken", "That id is already in use."), nil
	}
	if current == nil && op.Action == ActionDelete {
		return refused(op, "not_found", "Nothing to delete."), nil
	}
	if rej, err := authorize(ctx, tx, userID, op, current); err != nil {
		return OpResult{}, err
	} else if rej != nil {
		slog.Info("sync op rejected", "op", op.OpID, "entity", op.Entity, "code", rej.code)
		return refused(op, rej.code, rej.message), nil
	}

	// The phone must have seen the latest server version, otherwise two phones edited the
	// same item from the same starting point and one would silently erase the other.
	currentVersion := int64(0)
	if current != nil {
		currentVersion = current.Version
	}
	if op.BaseVersion != currentVersion {
		return OpResult{OpID: op.OpID, Status: StatusConflict, Code: conflictCode,
			Message: conflictReason, Current: current}, nil
	}

	if current == nil && op.Entity == EntityLeague {
		if err := tx.AddMember(ctx, op.ID, userID, RoleOwner); err != nil {
			return OpResult{}, fmt.Errorf("add league owner: %w", err)
		}
	}
	stored := Doc{Entity: op.Entity, ID: op.ID, LeagueID: op.LeagueID}
	if op.Action == ActionDelete {
		stored.Deleted = true
	} else {
		stored.Data = op.Data
		if op.Entity == EntityLeague {
			// The member list belongs to the server: whatever a phone sends is replaced.
			if stored.Data, err = withMembers(ctx, tx, op.ID, op.Data); err != nil {
				return OpResult{}, err
			}
		}
	}
	saved, err := tx.Put(ctx, stored)
	if err != nil {
		return OpResult{}, fmt.Errorf("save document: %w", err)
	}
	result := OpResult{OpID: op.OpID, Status: StatusApplied, Version: saved.Version}
	if err := tx.SaveResult(ctx, op.OpID, userID, result); err != nil {
		return OpResult{}, fmt.Errorf("save result: %w", err)
	}
	return result, nil
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
	var body struct {
		ID       string `json:"id"`
		LeagueID string `json:"leagueId"`
	}
	if err := json.Unmarshal(op.Data, &body); err != nil {
		return "data must be a JSON object."
	}
	if body.ID != "" && body.ID != op.ID {
		return "data.id does not match id."
	}
	if op.Entity != EntityLeague && body.LeagueID != "" && body.LeagueID != op.LeagueID {
		return "data.leagueId does not match leagueId."
	}
	return ""
}

// Pull returns the next page of changes after `since` for the leagues the user belongs to.
func (s *Service) Pull(ctx context.Context, userID string, since int64, limit int) (PullPage, error) {
	if since < 0 {
		return PullPage{}, fmt.Errorf("%w: since can't be negative", ErrBadRequest)
	}
	if limit <= 0 {
		limit = defaultPull
	}
	limit = min(limit, maxPullLimit)
	docs, err := s.store.Pull(ctx, userID, since, limit+1)
	if err != nil {
		return PullPage{}, fmt.Errorf("pull: %w", err)
	}
	return pageOf(docs, since, limit), nil
}
