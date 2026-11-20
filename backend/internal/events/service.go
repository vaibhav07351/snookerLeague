package events

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"time"

	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// recordTimeout bounds one insert, so a slow database never holds up the request behind it.
const recordTimeout = 2 * time.Second

// clientNames are the events the app may send. Everything else is recorded by the server
// itself, so a phone cannot inflate those counts.
var clientNames = map[string]bool{ShareTapped: true}

// Allowed values of the app's events: the result kinds a share can be about.
var shareKinds = map[string]bool{"match": true, "race": true, "group": true}

// idPattern matches the app's document ids (letters, digits, _ and -).
var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// Service records events.
type Service struct {
	store Store
}

// NewService builds the events service.
func NewService(store Store) *Service { return &Service{store: store} }

// Record saves an event. It never returns an error: a lost event must not fail a score save
// or a claim, so failures are logged with the event name only.
func (s *Service) Record(ctx context.Context, e Event) {
	// Detached from the request, so a phone that hangs up right after its write still counts.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), recordTimeout)
	defer cancel()
	if err := s.store.Insert(ctx, e); err != nil {
		slog.Error("record event", "event", e.Name, "error", err, "request_id", httpx.RequestID(ctx))
	}
}

// ClientEvent is what the app sends to POST /v1/events.
type ClientEvent struct {
	Name  string            `json:"name"`
	Ref   string            `json:"ref"`
	Props map[string]string `json:"props"`
}

// RecordFromClient checks an event the app sent and records it for the signed-in user.
func (s *Service) RecordFromClient(ctx context.Context, userID string, in ClientEvent) error {
	if !clientNames[in.Name] {
		return httpx.BadRequest("Unknown event.")
	}
	if in.Ref != "" && !idPattern.MatchString(in.Ref) {
		return httpx.BadRequest("Invalid event reference.")
	}
	kind := in.Props["kind"]
	if len(in.Props) != 1 || !shareKinds[kind] {
		return httpx.BadRequest("Invalid event details.")
	}
	s.Record(ctx, Event{Name: in.Name, UserID: userID, Ref: in.Ref, Props: map[string]string{"kind": kind}})
	return nil
}

// ForgetUser unlinks a deleted account from its events (the counts stay, the person does not).
func (s *Service) ForgetUser(ctx context.Context, userID string) error {
	if err := s.store.ForgetUser(ctx, userID); err != nil {
		return fmt.Errorf("forget events: %w", err)
	}
	return nil
}
