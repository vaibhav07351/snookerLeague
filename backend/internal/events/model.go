// Package events records product events (a game scored, a result shared, a claim link opened
// or used) so we can see how the app is used. Recording is best effort: a failure is logged
// and never fails the request that caused it.
package events

import "context"

// Event names. The server records the first three itself; the app may only send the ones in
// clientNames.
const (
	MatchScored = "match_scored"
	ClaimOpened = "claim_opened"
	ClaimDone   = "claim_done"
	ShareTapped = "share_tapped"
)

// Event is one thing that happened. Only ids and short labels go in it, never names, messages
// or tokens.
type Event struct {
	Name     string
	UserID   string
	LeagueID string
	// Ref is the id the event is about (a game or player card), "" for none.
	Ref   string
	Props map[string]string
	// DedupeKey, when set, records the event only once (later ones with the same key are
	// ignored).
	DedupeKey string
}

// Store saves events and forgets a user's link to them.
type Store interface {
	Insert(ctx context.Context, e Event) error
	ForgetUser(ctx context.Context, userID string) error
}
