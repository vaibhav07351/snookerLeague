// Package live pushes a match to everyone watching it the moment its scorer saves a shot,
// over a WebSocket at /v1/live/matches/{id}. Watching is read-only; scoring still goes
// through /v1/sync/push. One API instance means an in-memory hub is enough.
package live

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"

	"github.com/vaibhav/snookit-server/internal/auth"
	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

const (
	authTimeout  = 10 * time.Second
	pingEvery    = 30 * time.Second
	writeTimeout = 10 * time.Second
	// maxWatchers caps sockets per match so one popular match can't exhaust the VM.
	maxWatchers = 200
)

// Hub fans out saved matches to their watchers. A slow watcher only ever gets the newest
// copy: each watcher holds at most one pending document.
type Hub struct {
	mu       sync.Mutex
	watchers map[string]map[chan syncmod.Doc]struct{}
}

// NewHub builds an empty hub.
func NewHub() *Hub { return &Hub{watchers: map[string]map[chan syncmod.Doc]struct{}{}} }

// Publish implements sync.Publisher: called after a document is saved.
func (h *Hub) Publish(d syncmod.Doc) {
	if d.Entity != syncmod.EntityMatch {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.watchers[d.ID] {
		select {
		case ch <- d:
		default: // replace the stale pending copy with the newest one
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- d:
			default:
			}
		}
	}
}

func (h *Hub) subscribe(matchID string) (chan syncmod.Doc, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.watchers[matchID]
	if len(set) >= maxWatchers {
		return nil, false
	}
	if set == nil {
		set = map[chan syncmod.Doc]struct{}{}
		h.watchers[matchID] = set
	}
	ch := make(chan syncmod.Doc, 1)
	set[ch] = struct{}{}
	return ch, true
}

func (h *Hub) unsubscribe(matchID string, ch chan syncmod.Doc) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.watchers[matchID], ch)
	if len(h.watchers[matchID]) == 0 {
		delete(h.watchers, matchID)
	}
}

// Authenticator checks an access token.
type Authenticator interface {
	Authenticate(ctx context.Context, accessToken string) (auth.Claims, error)
}

// MatchReader loads a match and checks league membership.
type MatchReader interface {
	CurrentMatch(ctx context.Context, matchID string) (syncmod.Doc, error)
	IsMember(ctx context.Context, leagueID, userID string) (bool, error)
}

// Handler serves the live socket.
type Handler struct {
	hub     *Hub
	auth    Authenticator
	matches MatchReader
	origins []string
}

// NewHandler builds the live handler. origins are the web app hosts allowed to connect
// (phones send no Origin header).
func NewHandler(hub *Hub, a Authenticator, m MatchReader, origins []string) *Handler {
	return &Handler{hub: hub, auth: a, matches: m, origins: origins}
}

// Routes mounts the socket. It is not behind the auth middleware: a browser can't add an
// Authorization header to a WebSocket, so the token arrives as the first message instead
// (never in the URL, where it could end up in logs).
func (h *Handler) Routes(r chi.Router) {
	r.Get("/live/matches/{matchID}", h.watch)
}

type authMessage struct {
	Token string `json:"token"`
}

// message is what the server sends: the match document, or an error before closing.
type message struct {
	Type string       `json:"type"`
	Doc  *syncmod.Doc `json:"doc,omitempty"`
	Code string       `json:"code,omitempty"`
}

func (h *Handler) watch(w http.ResponseWriter, r *http.Request) {
	// The server's read/write timeouts are for normal requests; a watcher stays connected for
	// the whole match (pings below detect dead connections instead).
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})  // best effort: not every writer supports deadlines
	_ = rc.SetWriteDeadline(time.Time{}) // best effort, as above
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: h.origins})
	if err != nil {
		slog.Warn("live accept failed", "error", err)
		return
	}
	defer func() { _ = conn.CloseNow() }() // after a clean Close this is a no-op
	conn.SetReadLimit(8 * 1024)
	ctx := r.Context()

	matchID := chi.URLParam(r, "matchID")
	if code := h.authorize(ctx, conn, matchID); code != "" {
		_ = writeMsg(ctx, conn, message{Type: "error", Code: code})
		_ = conn.Close(websocket.StatusPolicyViolation, code)
		return
	}
	ch, ok := h.hub.subscribe(matchID)
	if !ok {
		_ = conn.Close(websocket.StatusTryAgainLater, "too many watchers")
		return
	}
	defer h.hub.unsubscribe(matchID, ch)

	// Send the current copy first, so the watcher starts from the latest state.
	if current, err := h.matches.CurrentMatch(ctx, matchID); err == nil {
		if err := writeMsg(ctx, conn, message{Type: "match", Doc: &current}); err != nil {
			return
		}
	}
	// The client never sends anything after auth; reading keeps control frames flowing and
	// tells us when it goes away.
	ctx = conn.CloseRead(ctx)
	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case d := <-ch:
			if err := writeMsg(ctx, conn, message{Type: "match", Doc: &d}); err != nil {
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.Ping(pctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// authorize reads the token message and checks the user may watch; it returns "" when allowed.
func (h *Handler) authorize(ctx context.Context, conn *websocket.Conn, matchID string) string {
	actx, cancel := context.WithTimeout(ctx, authTimeout)
	defer cancel()
	_, raw, err := conn.Read(actx)
	if err != nil {
		return "unauthorized"
	}
	var msg authMessage
	if json.Unmarshal(raw, &msg) != nil || msg.Token == "" {
		return "unauthorized"
	}
	claims, err := h.auth.Authenticate(actx, msg.Token)
	if err != nil {
		return "unauthorized"
	}
	match, err := h.matches.CurrentMatch(actx, matchID)
	if errors.Is(err, syncmod.ErrNotFound) {
		return "not_found"
	}
	if err != nil {
		slog.Error("live load match", "error", err)
		return "unavailable"
	}
	member, err := h.matches.IsMember(actx, match.LeagueID, claims.Subject)
	if err != nil {
		slog.Error("live membership", "error", err)
		return "unavailable"
	}
	if !member {
		return "forbidden"
	}
	return ""
}

func writeMsg(ctx context.Context, conn *websocket.Conn, m message) error {
	raw, err := json.Marshal(m)
	if err != nil {
		return fmt.Errorf("encode live message: %w", err)
	}
	wctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if err := conn.Write(wctx, websocket.MessageText, raw); err != nil {
		return fmt.Errorf("write live message: %w", err)
	}
	return nil
}
