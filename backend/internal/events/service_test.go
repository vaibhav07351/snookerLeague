package events

import (
	"context"
	"errors"
	"testing"
)

type memStore struct {
	got     []Event
	failing bool
}

func (m *memStore) Insert(_ context.Context, e Event) error {
	if m.failing {
		return errors.New("db down")
	}
	m.got = append(m.got, e)
	return nil
}

func (m *memStore) ForgetUser(context.Context, string) error { return nil }

func TestRecordFromClientAcceptsOnlyShareEventsWithAKnownKind(t *testing.T) {
	store := &memStore{}
	svc := NewService(store)
	ctx := context.Background()

	if err := svc.RecordFromClient(ctx, "u1", ClientEvent{Name: ShareTapped, Ref: "mt_1", Props: map[string]string{"kind": "match"}}); err != nil {
		t.Fatalf("a share event is accepted: %v", err)
	}
	if len(store.got) != 1 || store.got[0].UserID != "u1" || store.got[0].Ref != "mt_1" {
		t.Fatalf("recorded for the signed-in user: %+v", store.got)
	}

	refused := []ClientEvent{
		{Name: MatchScored, Props: map[string]string{"kind": "match"}},                         // server-only
		{Name: ShareTapped, Props: map[string]string{"kind": "poker"}},                         // unknown kind
		{Name: ShareTapped, Props: map[string]string{"kind": "match", "name": "Rahul Sharma"}}, // extra props
		{Name: ShareTapped, Ref: "../etc/passwd", Props: map[string]string{"kind": "match"}},   // bad id
	}
	for _, in := range refused {
		if err := svc.RecordFromClient(ctx, "u1", in); err == nil {
			t.Fatalf("must be refused: %+v", in)
		}
	}
	if len(store.got) != 1 {
		t.Fatalf("refused events are not stored: %+v", store.got)
	}
}

func TestRecordNeverFailsTheCaller(t *testing.T) {
	svc := NewService(&memStore{failing: true})
	// Must not panic or block; the failure is only logged.
	svc.Record(context.Background(), Event{Name: MatchScored})
}

func TestRecordSurvivesACancelledRequest(t *testing.T) {
	store := &memStore{}
	svc := NewService(store)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	svc.Record(ctx, Event{Name: ClaimDone})
	if len(store.got) != 1 {
		t.Fatal("an event is still recorded after the phone hangs up")
	}
}
