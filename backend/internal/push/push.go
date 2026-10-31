// Package push sends phone notifications through Expo's push service (which uses Google's
// FCM for Android underneath). Sending never blocks a request: notices go out in the
// background, and a failure is logged, never shown to the person who triggered it.
package push

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

const (
	expoURL     = "https://exp.host/--/api/v2/push/send"
	sendTimeout = 15 * time.Second
	maxDevices  = 10
)

// Devices finds and forgets a person's push tokens.
type Devices interface {
	DeviceTokens(ctx context.Context, userID string, limit int) ([]string, error)
	RemoveDeviceToken(ctx context.Context, token string) error
}

// Sender delivers notices to every phone of a person.
type Sender struct {
	devices     Devices
	client      *http.Client
	accessToken string // only needed when "enhanced push security" is on in the Expo project
	url         string
}

// NewSender builds the sender. accessToken may be "".
func NewSender(devices Devices, accessToken string) *Sender {
	return &Sender{devices: devices, client: &http.Client{Timeout: sendTimeout}, accessToken: accessToken, url: expoURL}
}

type message struct {
	To        string            `json:"to"`
	Title     string            `json:"title"`
	Body      string            `json:"body"`
	Data      map[string]string `json:"data,omitempty"`
	Sound     string            `json:"sound"`
	ChannelID string            `json:"channelId"`
}

type ticket struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Details struct {
		Error string `json:"error"`
	} `json:"details"`
}

// Notify sends a notice in the background. url is the in-app path a tap should open.
func (s *Sender) Notify(userID, title, body, url string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
		defer cancel()
		if err := s.send(ctx, userID, title, body, url); err != nil {
			slog.Warn("push notice not sent", "user", userID, "error", err)
		}
	}()
}

func (s *Sender) send(ctx context.Context, userID, title, body, url string) error {
	tokens, err := s.devices.DeviceTokens(ctx, userID, maxDevices)
	if err != nil {
		return fmt.Errorf("load devices: %w", err)
	}
	if len(tokens) == 0 {
		return nil
	}
	msgs := make([]message, 0, len(tokens))
	for _, t := range tokens {
		msgs = append(msgs, message{To: t, Title: title, Body: body, Sound: "default", ChannelID: "default",
			Data: map[string]string{"url": url}})
	}
	raw, err := json.Marshal(msgs)
	if err != nil {
		return fmt.Errorf("encode notices: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if s.accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.accessToken)
	}
	res, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("send notices: %w", err)
	}
	defer func() { _ = res.Body.Close() }() // nothing useful to do if closing fails
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("expo push returned %d", res.StatusCode)
	}
	var out struct {
		Data []ticket `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return fmt.Errorf("decode push tickets: %w", err)
	}
	for i, t := range out.Data {
		// A token Expo no longer knows (app uninstalled, token rotated) is removed for good.
		if t.Status == "error" && t.Details.Error == "DeviceNotRegistered" && i < len(tokens) {
			if err := s.devices.RemoveDeviceToken(ctx, tokens[i]); err != nil {
				slog.Warn("remove dead push token", "error", err)
			}
		}
	}
	return nil
}
