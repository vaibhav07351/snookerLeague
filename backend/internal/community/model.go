// Package community stores the documents that live outside any one league: a user's private
// settings, public player profiles, the player directory, "looking for a game" posts, follows
// and challenges. Unlike league documents they are read by live queries (a city's board, my
// inbox), so there is no version history: a write replaces the row, a delete removes it.
package community

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// Kind names a community document type. The values match the app's sync entity names.
type Kind string

// The community document kinds.
const (
	KindUser      Kind = "user"
	KindProfile   Kind = "profile"
	KindDirectory Kind = "directory"
	KindLooking   Kind = "looking"
	KindFollow    Kind = "follow"
	KindChallenge Kind = "challenge"
)

func (k Kind) valid() bool {
	switch k {
	case KindUser, KindProfile, KindDirectory, KindLooking, KindFollow, KindChallenge:
		return true
	}
	return false
}

// Doc is one stored document plus the columns copied out of it for permissions and queries.
type Doc struct {
	Kind Kind
	ID   string
	// OwnerID controls the row: the user, author, follower or challenger.
	OwnerID string
	// SubjectID is who the row is about: the followed or challenged player ("" otherwise).
	SubjectID string
	CityID    string
	// SubKind is the listing or post kind (club, table, opponent...), "" otherwise.
	SubKind string
	// SortValue orders lists, newest or highest first: rank score for profiles, creation
	// time in milliseconds for everything else.
	SortValue float64
	Data      json.RawMessage
	UpdatedAt time.Time
}

// Cursor marks the last row of a page; the next page starts strictly after it.
type Cursor struct {
	Sort float64
	ID   string
}

// ListQuery selects rows of one kind. Empty filters match everything.
type ListQuery struct {
	Kind      Kind
	CityID    string
	SubKind   string
	OwnerID   string
	SubjectID string
	After     *Cursor
	Limit     int
}

// Page is one page of a list, newest or highest first.
type Page struct {
	Items   []json.RawMessage `json:"items"`
	Cursor  string            `json:"cursor"`
	HasMore bool              `json:"hasMore"`
}

// Repository is the persistence boundary of the community module.
type Repository interface {
	Get(ctx context.Context, kind Kind, id string) (Doc, error)
	Put(ctx context.Context, d Doc) error
	Delete(ctx context.Context, kind Kind, id string) error
	List(ctx context.Context, q ListQuery) ([]Doc, error)
}

// Errors the handler maps to client responses.
var (
	ErrNotFound   = errors.New("not found")
	ErrForbidden  = errors.New("forbidden")
	ErrBadRequest = errors.New("bad request")
)
