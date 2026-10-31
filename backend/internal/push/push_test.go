package push

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

type memDevices struct {
	tokens  []string
	removed []string
}

func (m *memDevices) DeviceTokens(context.Context, string, int) ([]string, error) {
	return m.tokens, nil
}

func (m *memDevices) RemoveDeviceToken(_ context.Context, token string) error {
	m.removed = append(m.removed, token)
	return nil
}

func TestSendDeliversToEveryPhoneAndDropsDeadTokens(t *testing.T) {
	var got []message
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &got)
		_, _ = w.Write([]byte(`{"data":[{"status":"ok"},{"status":"error","details":{"error":"DeviceNotRegistered"}}]}`))
	}))
	defer srv.Close()
	devices := &memDevices{tokens: []string{"ExponentPushToken[a]", "ExponentPushToken[b]"}}
	s := NewSender(devices, "")
	s.url = srv.URL
	if err := s.send(context.Background(), "u1", "New challenge", "Open Snookit", "/x"); err != nil {
		t.Fatalf("send: %v", err)
	}
	if len(got) != 2 || got[0].Data["url"] != "/x" {
		t.Fatalf("messages = %+v", got)
	}
	if len(devices.removed) != 1 || devices.removed[0] != "ExponentPushToken[b]" {
		t.Fatalf("removed = %v", devices.removed)
	}
}

func TestNoPhonesMeansNoRequest(t *testing.T) {
	s := NewSender(&memDevices{}, "")
	s.url = "http://127.0.0.1:1" // would fail if called
	if err := s.send(context.Background(), "u1", "t", "b", "/"); err != nil {
		t.Fatalf("send with no devices: %v", err)
	}
}
