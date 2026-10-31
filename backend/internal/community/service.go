package community

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/vaibhav/snookit-server/internal/stats"
)

const (
	maxDocBytes  = 32 * 1024
	defaultLimit = 50
	maxLimit     = 100
)

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

var (
	directoryKinds = []string{"club", "table", "referee", "organiser"}
	lookingKinds   = []string{"opponent", "player", "club", "table"}
	lookingStates  = []string{"open", "closed"}
)

// HubRefresher asks the stats worker to recompute a city hub (so a new or moved profile gets
// its server-computed rank).
type HubRefresher interface {
	MarkDirty(ctx context.Context, leagueID string) error
}

// Notifier sends a phone notification in the background (see the push module).
type Notifier interface {
	Notify(userID, title, body, url string)
}

// Service holds the community permission rules.
type Service struct {
	repo     Repository
	hubs     HubRefresher
	notifier Notifier
	now      func() time.Time
}

// SetNotifier turns on notifications for challenges and follows (nil turns them off).
func (s *Service) SetNotifier(n Notifier) { s.notifier = n }

// NewService builds the community service. hubs may be nil (tests).
func NewService(repo Repository, hubs HubRefresher) *Service {
	return &Service{repo: repo, hubs: hubs, now: func() time.Time { return time.Now().UTC() }}
}

// ParseKind validates a kind taken from the URL.
func ParseKind(raw string) (Kind, error) {
	k := Kind(raw)
	if !k.valid() {
		return "", fmt.Errorf("%w: unknown kind", ErrBadRequest)
	}
	return k, nil
}

// Put creates or replaces one document after checking the caller may write it.
func (s *Service) Put(ctx context.Context, userID string, kind Kind, id string, data json.RawMessage) error {
	if !idPattern.MatchString(id) {
		return fmt.Errorf("%w: invalid id", ErrBadRequest)
	}
	if len(data) == 0 || len(data) > maxDocBytes {
		return fmt.Errorf("%w: document must be under 32 KB", ErrBadRequest)
	}
	var body fields
	if err := json.Unmarshal(data, &body); err != nil || body == nil {
		return fmt.Errorf("%w: document must be a JSON object", ErrBadRequest)
	}
	if got := body.str("id"); got != "" && got != id {
		return fmt.Errorf("%w: data.id does not match id", ErrBadRequest)
	}
	var current *Doc
	switch cur, err := s.repo.Get(ctx, kind, id); {
	case err == nil:
		current = &cur
	case !errors.Is(err, ErrNotFound):
		return fmt.Errorf("load %s: %w", kind, err)
	}
	doc, err := s.index(ctx, userID, kind, id, body, current)
	if err != nil {
		return err
	}
	if doc.Data, err = json.Marshal(body); err != nil {
		return fmt.Errorf("encode %s: %w", kind, err)
	}
	doc.Kind, doc.ID = kind, id
	if err := s.repo.Put(ctx, doc); err != nil {
		return fmt.Errorf("save %s: %w", kind, err)
	}
	s.announce(userID, kind, body, current)
	if kind == KindProfile && doc.CityID != "" && s.hubs != nil && (current == nil || current.CityID != doc.CityID) {
		if err := s.hubs.MarkDirty(ctx, "city_"+doc.CityID); err != nil {
			return fmt.Errorf("refresh city rank: %w", err)
		}
	}
	return nil
}

// Get returns one document the caller may read.
func (s *Service) Get(ctx context.Context, userID string, kind Kind, id string) (json.RawMessage, error) {
	doc, err := s.repo.Get(ctx, kind, id)
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", kind, err)
	}
	if !canRead(userID, doc) {
		// Private rows look missing, so their existence is not revealed.
		return nil, ErrNotFound
	}
	return doc.Data, nil
}

// Delete removes a document the caller controls. Deleting a missing row succeeds, so a
// retried delete is harmless.
func (s *Service) Delete(ctx context.Context, userID string, kind Kind, id string) error {
	doc, err := s.repo.Get(ctx, kind, id)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load %s: %w", kind, err)
	}
	if doc.OwnerID != userID {
		return ErrForbidden
	}
	if err := s.repo.Delete(ctx, kind, id); err != nil {
		return fmt.Errorf("delete %s: %w", kind, err)
	}
	return nil
}

// ListParams are the list filters as they arrive from the URL.
type ListParams struct {
	City    string
	SubKind string
	// Owner / Subject filter follows ("who does X follow" / "who follows X").
	Owner   string
	Subject string
	// Box picks challenges: "sent" or "received" (always the caller's own).
	Box    string
	Cursor string
	Limit  int
}

// List returns one page of documents, newest or highest ranked first.
func (s *Service) List(ctx context.Context, userID string, kind Kind, p ListParams) (Page, error) {
	q := ListQuery{Kind: kind, Limit: p.Limit}
	switch kind {
	case KindProfile, KindLooking, KindDirectory:
		if p.City == "" {
			return Page{}, fmt.Errorf("%w: city is required", ErrBadRequest)
		}
		q.CityID = p.City
		if kind == KindDirectory {
			q.SubKind = p.SubKind
		}
	case KindFollow:
		if (p.Owner == "") == (p.Subject == "") {
			return Page{}, fmt.Errorf("%w: give exactly one of owner or subject", ErrBadRequest)
		}
		q.OwnerID, q.SubjectID = p.Owner, p.Subject
	case KindBlock:
		q.OwnerID = userID // only your own block list
	case KindChallenge:
		switch p.Box {
		case "sent":
			q.OwnerID = userID
		case "received":
			q.SubjectID = userID
		default:
			return Page{}, fmt.Errorf("%w: box must be sent or received", ErrBadRequest)
		}
	default:
		return Page{}, fmt.Errorf("%w: %s can't be listed", ErrBadRequest, kind)
	}
	if q.Limit <= 0 {
		q.Limit = defaultLimit
	}
	q.Limit = min(q.Limit, maxLimit)
	if p.Cursor != "" {
		after, err := parseCursor(p.Cursor)
		if err != nil {
			return Page{}, err
		}
		q.After = &after
	}
	limit := q.Limit
	q.Limit++ // one extra row tells us whether another page exists
	docs, err := s.repo.List(ctx, q)
	if err != nil {
		return Page{}, fmt.Errorf("list %s: %w", kind, err)
	}
	page := Page{Items: []json.RawMessage{}}
	if len(docs) > limit {
		docs, page.HasMore = docs[:limit], true
	}
	for _, d := range docs {
		page.Items = append(page.Items, d.Data)
	}
	if page.HasMore {
		last := docs[len(docs)-1]
		page.Cursor = formatCursor(Cursor{Sort: last.SortValue, ID: last.ID})
	}
	return page, nil
}

func canRead(userID string, d Doc) bool {
	switch d.Kind {
	case KindUser, KindBlock, KindReport, KindDevice:
		return d.OwnerID == userID
	case KindChallenge:
		return d.OwnerID == userID || d.SubjectID == userID
	}
	return true
}

// index checks the write and fills the permission and query columns.
func (s *Service) index(ctx context.Context, userID string, kind Kind, id string, body fields, current *Doc) (Doc, error) {
	switch kind {
	case KindUser:
		if id != userID {
			return Doc{}, ErrForbidden
		}
		// D5: the date of birth stays on the phone; the server never stores it.
		delete(body, "dateOfBirth")
		return Doc{OwnerID: userID, CityID: body.str("cityId")}, nil
	case KindProfile:
		if id != userID || (body.str("uid") != "" && body.str("uid") != userID) {
			return Doc{}, ErrForbidden
		}
		delete(body, "dateOfBirth")
		sortValue, err := keepServerRank(body, current)
		if err != nil {
			return Doc{}, err
		}
		city := body.str("cityId")
		if slices.Contains(minorDivisions, body.str("division")) {
			// D5: under-18 players keep their profile but are left off public city boards.
			city = ""
		}
		return Doc{OwnerID: userID, CityID: city, SortValue: sortValue}, nil
	case KindDirectory, KindLooking:
		if current == nil {
			if err := s.checkCanPost(ctx, userID, kind); err != nil {
				return Doc{}, err
			}
		}
		return s.indexPost(userID, kind, body, current)
	case KindBlock:
		blocker, blocked := body.str("blockerUid"), body.str("blockedUid")
		if blocker != userID {
			return Doc{}, ErrForbidden
		}
		if blocked == "" || blocked == blocker || id != "bl_"+blocker+"_"+blocked {
			return Doc{}, fmt.Errorf("%w: invalid block", ErrBadRequest)
		}
		return Doc{OwnerID: userID, SubjectID: blocked, SortValue: s.createdMillis(body, current)}, nil
	case KindReport:
		return s.indexReport(ctx, userID, body, current)
	case KindDevice:
		return s.indexDevice(userID, body)
	case KindFollow:
		follower, following := body.str("followerUid"), body.str("followingUid")
		if follower != userID {
			return Doc{}, ErrForbidden
		}
		if following == "" || following == follower || id != "fl_"+follower+"_"+following {
			return Doc{}, fmt.Errorf("%w: invalid follow", ErrBadRequest)
		}
		if current == nil {
			if err := s.checkNotBlocked(ctx, following, userID); err != nil {
				return Doc{}, err
			}
		}
		return Doc{OwnerID: userID, SubjectID: following, SortValue: s.createdMillis(body, current)}, nil
	case KindChallenge:
		if current == nil {
			if err := s.checkNotBlocked(ctx, body.str("toUid"), userID); err != nil {
				return Doc{}, err
			}
		}
		return s.indexChallenge(userID, body, current)
	}
	return Doc{}, fmt.Errorf("%w: unknown kind", ErrBadRequest)
}

// indexPost covers directory listings and looking posts: the author owns them, and the city
// and kind can't change after posting (they decide which lists the row appears in).
func (s *Service) indexPost(userID string, kind Kind, body fields, current *Doc) (Doc, error) {
	if body.str("createdByUid") != userID || (current != nil && current.OwnerID != userID) {
		return Doc{}, ErrForbidden
	}
	city, sub := body.str("cityId"), body.str("kind")
	allowed := directoryKinds
	if kind == KindLooking {
		allowed = lookingKinds
		if !slices.Contains(lookingStates, body.str("status")) {
			return Doc{}, fmt.Errorf("%w: invalid status", ErrBadRequest)
		}
	}
	if city == "" || !slices.Contains(allowed, sub) {
		return Doc{}, fmt.Errorf("%w: cityId and a valid kind are required", ErrBadRequest)
	}
	if current != nil && (current.CityID != city || current.SubKind != sub) {
		return Doc{}, fmt.Errorf("%w: city and kind can't change", ErrBadRequest)
	}
	return Doc{OwnerID: userID, CityID: city, SubKind: sub, SortValue: s.createdMillis(body, current)}, nil
}

// challengeFixed are the fields set by the challenger that nobody may change afterwards.
var challengeFixed = []string{"fromUid", "toUid", "cityId", "format", "bestOf", "createdAt"}

func (s *Service) indexChallenge(userID string, body fields, current *Doc) (Doc, error) {
	from, to := body.str("fromUid"), body.str("toUid")
	if current == nil {
		if from != userID {
			return Doc{}, ErrForbidden
		}
		if to == "" || to == from || body.str("status") != "pending" || body.str("cityId") == "" {
			return Doc{}, fmt.Errorf("%w: invalid challenge", ErrBadRequest)
		}
		return Doc{OwnerID: from, SubjectID: to, CityID: body.str("cityId"),
			SortValue: s.createdMillis(body, nil)}, nil
	}
	if userID != current.OwnerID && userID != current.SubjectID {
		return Doc{}, ErrForbidden
	}
	var cur fields
	if err := json.Unmarshal(current.Data, &cur); err != nil {
		return Doc{}, fmt.Errorf("decode challenge: %w", err)
	}
	for _, key := range challengeFixed {
		if !jsonEqual(cur[key], body[key]) {
			return Doc{}, fmt.Errorf("%w: %s can't change", ErrBadRequest, key)
		}
	}
	before, after := cur.str("status"), body.str("status")
	if before != after {
		ok := before == "pending" &&
			((userID == current.OwnerID && after == "cancelled") ||
				(userID == current.SubjectID && (after == "accepted" || after == "declined")))
		if !ok {
			return Doc{}, ErrForbidden
		}
	}
	if !jsonEqual(cur["matchId"], body["matchId"]) && (userID != current.SubjectID || after != "accepted") {
		return Doc{}, ErrForbidden
	}
	return Doc{OwnerID: current.OwnerID, SubjectID: current.SubjectID, CityID: current.CityID,
		SortValue: current.SortValue}, nil
}

// createdMillis keeps the first sort time of a row; for a new row it uses the document's
// createdAt, clamped so a phone with a wrong clock can't pin its post to the top.
func (s *Service) createdMillis(body fields, current *Doc) float64 {
	if current != nil {
		return current.SortValue
	}
	now := s.now()
	created, err := time.Parse(time.RFC3339Nano, body.str("createdAt"))
	if err != nil || created.After(now) {
		created = now
	}
	return float64(created.UnixMilli())
}

func formatCursor(c Cursor) string {
	return strconv.FormatFloat(c.Sort, 'f', -1, 64) + "|" + c.ID
}

func parseCursor(raw string) (Cursor, error) {
	sortPart, id, ok := strings.Cut(raw, "|")
	sortValue, err := strconv.ParseFloat(sortPart, 64)
	if !ok || err != nil || math.IsNaN(sortValue) || !idPattern.MatchString(id) {
		return Cursor{}, fmt.Errorf("%w: invalid cursor", ErrBadRequest)
	}
	return Cursor{Sort: sortValue, ID: id}, nil
}

// fields is a decoded JSON object with typed accessors.
type fields map[string]any

func (f fields) str(key string) string {
	if v, ok := f[key].(string); ok {
		return v
	}
	return ""
}

func (f fields) num(key string) float64 {
	if v, ok := f[key].(float64); ok && !math.IsNaN(v) && !math.IsInf(v, 0) {
		return v
	}
	return 0
}

func jsonEqual(a, b any) bool {
	left, errA := json.Marshal(a)
	right, errB := json.Marshal(b)
	return errA == nil && errB == nil && string(left) == string(right)
}

// ForgetUser removes the user's settings, profile, posts, listings, follows and challenges,
// including rows other people made about them. Safe to repeat.
func (s *Service) ForgetUser(ctx context.Context, userID string) error {
	if err := s.repo.DeleteForUser(ctx, userID); err != nil {
		return fmt.Errorf("forget user: %w", err)
	}
	return nil
}

// serverRankFields are the profile numbers the stats worker owns. A phone's copy of them is
// never trusted: an edit keeps the server's values, and a new profile starts from zero
// until the worker fills them in.
var serverRankFields = []string{"rankScore", "played", "winPct", "titles", "highestBreak",
	"centuries", "breaks50", "maximums", "publicRating", "publicGames"}

func keepServerRank(body fields, current *Doc) (float64, error) {
	var cur fields
	if current != nil {
		if err := json.Unmarshal(current.Data, &cur); err != nil {
			return 0, fmt.Errorf("decode profile: %w", err)
		}
	}
	for _, k := range serverRankFields {
		if v, ok := cur[k]; ok {
			body[k] = v
		} else {
			body[k] = 0
		}
	}
	if current != nil && current.CityID == body.str("cityId") {
		return current.SortValue, nil
	}
	return 0, nil // a new city starts unranked until its hub is recomputed
}

func rankFields(r stats.CityRank) map[string]any {
	return map[string]any{
		"rankScore": r.RankScore, "played": r.Played, "winPct": r.WinPct, "titles": r.Titles,
		"highestBreak": r.HighestBreak, "centuries": r.Centuries, "breaks50": r.Breaks50,
		"maximums": r.Maximums,
	}
}

// minorDivisions are the age bands kept off public boards (decision D5).
var minorDivisions = []string{"u16", "u18"}

const (
	postsPerDay   = 5
	reportsPerDay = 20
	maxReasonLen  = 500
)

var reportTargets = []string{"profile", "looking", "directory", "player", "match", "user"}

// checkCanPost enforces the posting rules: community rules accepted (termsAcceptedAt on the
// user's settings) and at most postsPerDay new posts of a kind per day.
func (s *Service) checkCanPost(ctx context.Context, userID string, kind Kind) error {
	settings, err := s.repo.Get(ctx, KindUser, userID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return fmt.Errorf("load settings: %w", err)
	}
	var f fields
	if err == nil {
		if err := json.Unmarshal(settings.Data, &f); err != nil {
			return fmt.Errorf("decode settings: %w", err)
		}
	}
	if f.str("termsAcceptedAt") == "" {
		return ErrTermsRequired
	}
	n, err := s.countSince(ctx, kind, userID, 24*time.Hour)
	if err != nil {
		return err
	}
	if n >= postsPerDay {
		return ErrTooManyPosts
	}
	return nil
}

// countSince counts the user's rows of a kind created within the window (enough to apply
// the daily limits; rows come newest first).
func (s *Service) countSince(ctx context.Context, kind Kind, userID string, window time.Duration) (int, error) {
	docs, err := s.repo.List(ctx, ListQuery{Kind: kind, OwnerID: userID, Limit: reportsPerDay + 1})
	if err != nil {
		return 0, fmt.Errorf("count recent %s: %w", kind, err)
	}
	since := float64(s.now().Add(-window).UnixMilli())
	n := 0
	for _, d := range docs {
		if d.SortValue >= since {
			n++
		}
	}
	return n, nil
}

// checkNotBlocked refuses a follow or challenge when target has blocked actor.
func (s *Service) checkNotBlocked(ctx context.Context, target, actor string) error {
	if target == "" {
		return nil
	}
	_, err := s.repo.Get(ctx, KindBlock, "bl_"+target+"_"+actor)
	switch {
	case err == nil:
		return ErrForbidden
	case errors.Is(err, ErrNotFound):
		return nil
	default:
		return fmt.Errorf("check block: %w", err)
	}
}

// indexReport: anyone signed in may report content, a limited number a day. Reports are
// read by the team only (see docs/RUNBOOK.md), never listed in the app.
func (s *Service) indexReport(ctx context.Context, userID string, body fields, current *Doc) (Doc, error) {
	if current != nil || body.str("reporterUid") != userID {
		return Doc{}, ErrForbidden
	}
	if !slices.Contains(reportTargets, body.str("targetKind")) || body.str("targetId") == "" ||
		len(body.str("reason")) > maxReasonLen {
		return Doc{}, fmt.Errorf("%w: invalid report", ErrBadRequest)
	}
	n, err := s.countSince(ctx, KindReport, userID, 24*time.Hour)
	if err != nil {
		return Doc{}, err
	}
	if n >= reportsPerDay {
		return Doc{}, ErrTooManyPosts
	}
	return Doc{OwnerID: userID, SubjectID: body.str("targetUid"), SortValue: s.createdMillis(body, nil)}, nil
}

// indexDevice stores one phone's push token for its owner (see the push module).
func (s *Service) indexDevice(userID string, body fields) (Doc, error) {
	if body.str("uid") != userID {
		return Doc{}, ErrForbidden
	}
	token := body.str("pushToken")
	if !strings.HasPrefix(token, "ExponentPushToken[") && !strings.HasPrefix(token, "ExpoPushToken[") {
		return Doc{}, fmt.Errorf("%w: invalid push token", ErrBadRequest)
	}
	return Doc{OwnerID: userID, SortValue: float64(s.now().UnixMilli())}, nil
}

// announce tells the other person about a new challenge, an accepted challenge or a new
// follower. It never fails the write: notices are best effort.
func (s *Service) announce(userID string, kind Kind, body fields, current *Doc) {
	if s.notifier == nil {
		return
	}
	switch {
	case kind == KindChallenge && current == nil:
		s.notifier.Notify(body.str("toUid"), "New challenge",
			"Someone challenged you to a match. Open Snookit to accept or decline.", "/(main)/(tabs)/community")
	case kind == KindChallenge && current != nil && body.str("status") == "accepted" && userID == current.SubjectID:
		url := "/(main)/(tabs)/community"
		if m := body.str("matchId"); m != "" {
			url = "/match/" + m
		}
		s.notifier.Notify(current.OwnerID, "Challenge accepted", "Your challenge was accepted. Time to play!", url)
	case kind == KindFollow && current == nil:
		s.notifier.Notify(body.str("followingUid"), "New follower",
			"Someone started following you on Snookit.", "/(main)/city-player?uid="+userID)
	}
}
