// Package sync stores and distributes the app's documents (leagues, players, matches,
// races, events) between phones: idempotent batched pushes, version-based pulls.
package sync

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// Entity names a kind of synced document.
type Entity string

// The synced document kinds. Events are written by the server only.
const (
	EntityLeague Entity = "league"
	EntityPlayer Entity = "player"
	EntityMatch  Entity = "match"
	EntityRace   Entity = "race"
	EntityEvent  Entity = "event"
)

func (e Entity) valid() bool {
	switch e {
	case EntityLeague, EntityPlayer, EntityMatch, EntityRace, EntityEvent:
		return true
	}
	return false
}

// Action is what a push operation does to a document.
type Action string

// Push actions.
const (
	ActionUpsert Action = "upsert"
	ActionDelete Action = "delete"
)

// Role is a user's standing inside a league. The zero value means "not a member".
type Role string

// League roles. City hubs have no owner.
const (
	RoleNone   Role = ""
	RoleMember Role = "member"
	RoleOwner  Role = "owner"
)

// Doc is one stored document. Deleted documents are tombstones with no Data.
type Doc struct {
	Entity    Entity          `json:"entity"`
	ID        string          `json:"id"`
	LeagueID  string          `json:"leagueId"`
	Version   int64           `json:"version"`
	Deleted   bool            `json:"deleted"`
	Data      json.RawMessage `json:"data,omitempty"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// Op is one queued change from a phone.
type Op struct {
	OpID     string `json:"opId"`
	Entity   Entity `json:"entity"`
	ID       string `json:"id"`
	LeagueID string `json:"leagueId"`
	Action   Action `json:"action"`
	// BaseVersion is the server version the phone last saw (0 for a new document).
	BaseVersion int64           `json:"baseVersion"`
	Data        json.RawMessage `json:"data,omitempty"`
}

// Result statuses for a push operation.
const (
	StatusApplied  = "applied"
	StatusConflict = "conflict"
	StatusRejected = "rejected"
)

// OpResult tells the phone what happened to one operation.
type OpResult struct {
	OpID    string `json:"opId"`
	Status  string `json:"status"`
	Version int64  `json:"version,omitempty"`
	// Current is the server's copy, sent with a conflict so the phone can rebase.
	Current *Doc   `json:"current,omitempty"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

// PullPage is one page of changes after a cursor.
type PullPage struct {
	Docs    []Doc `json:"docs"`
	Cursor  int64 `json:"cursor"`
	HasMore bool  `json:"hasMore"`
}

// ErrNotFound is returned when a document or result does not exist.
var ErrNotFound = errors.New("not found")

// Tx is the set of reads and writes allowed inside one push operation's transaction.
type Tx interface {
	// LockWrites serializes writers so versions are committed in order.
	LockWrites(ctx context.Context) error
	Get(ctx context.Context, entity Entity, id string) (Doc, error)
	// Put stores the document and assigns it the next version.
	Put(ctx context.Context, d Doc) (Doc, error)
	Role(ctx context.Context, leagueID, userID string) (Role, error)
	AddMember(ctx context.Context, leagueID, userID string, role Role) error
	AppliedResult(ctx context.Context, userID, opID string) (OpResult, error)
	SaveResult(ctx context.Context, opID, userID string, r OpResult) error
}

// Store is the persistence boundary of the sync module.
type Store interface {
	InTx(ctx context.Context, fn func(Tx) error) error
	// Pull returns documents in leagues the user belongs to with version > since.
	Pull(ctx context.Context, userID string, since int64, limit int) ([]Doc, error)
}
