package sync

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Membership errors the handler maps to client responses.
var (
	ErrInviteNotFound = errors.New("invite code not found")
	ErrNotMember      = errors.New("not a member of this league")
	ErrOwnerCantLeave = errors.New("the owner can't leave their own league")
)

var (
	inviteCodePattern = regexp.MustCompile(`^[A-Z0-9]{4,12}$`)
	cityIDPattern     = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,47}$`)
)

// cityHubPrefix marks league ids of city hubs (one shared league per city).
const cityHubPrefix = "city_"

// InvitePreview is what a person sees before joining: enough to recognise the league, nothing
// that only members may read.
type InvitePreview struct {
	Code       string `json:"code"`
	LeagueID   string `json:"leagueId"`
	LeagueName string `json:"leagueName"`
}

// NormalizeInviteCode upper-cases and trims a code; it returns "" for an invalid code.
func NormalizeInviteCode(code string) string {
	c := strings.ToUpper(strings.TrimSpace(code))
	if !inviteCodePattern.MatchString(c) {
		return ""
	}
	return c
}

// PreviewInvite resolves an invite code to its league's id and name.
func (s *Service) PreviewInvite(ctx context.Context, code string) (InvitePreview, error) {
	c := NormalizeInviteCode(code)
	if c == "" {
		return InvitePreview{}, ErrInviteNotFound
	}
	var preview InvitePreview
	err := s.store.InTx(ctx, func(tx Tx) error {
		league, err := tx.FindLeagueByInviteCode(ctx, c)
		if errors.Is(err, ErrNotFound) {
			return ErrInviteNotFound
		}
		if err != nil {
			return err
		}
		f, err := decodeFields(league.Data)
		if err != nil {
			return fmt.Errorf("decode league: %w", err)
		}
		preview = InvitePreview{Code: c, LeagueID: league.ID, LeagueName: f.str("name")}
		return nil
	})
	if err != nil {
		return InvitePreview{}, fmt.Errorf("preview invite: %w", err)
	}
	return preview, nil
}

// JoinByCode adds the user to the club league whose current invite code is code and returns
// the league document. Joining twice is harmless.
func (s *Service) JoinByCode(ctx context.Context, userID, code string) (Doc, error) {
	c := NormalizeInviteCode(code)
	if c == "" {
		return Doc{}, ErrInviteNotFound
	}
	var league Doc
	err := s.store.InTx(ctx, func(tx Tx) error {
		if err := tx.LockWrites(ctx); err != nil {
			return err
		}
		found, err := tx.FindLeagueByInviteCode(ctx, c)
		if errors.Is(err, ErrNotFound) {
			return ErrInviteNotFound
		}
		if err != nil {
			return err
		}
		league, err = s.addMember(ctx, tx, found, userID)
		return err
	})
	if err != nil {
		return Doc{}, fmt.Errorf("join league: %w", err)
	}
	return league, nil
}

// JoinCityHub adds the user to their city's hub, creating the hub the first time anyone from
// that city joins. Hubs have no owner, and their name and code are set here, never by a phone.
func (s *Service) JoinCityHub(ctx context.Context, userID, cityID, cityName string) (Doc, error) {
	cityName = strings.TrimSpace(cityName)
	if !cityIDPattern.MatchString(cityID) || cityName == "" || len(cityName) > 60 {
		return Doc{}, fmt.Errorf("%w: invalid city", ErrBadRequest)
	}
	hubID := cityHubPrefix + cityID
	var league Doc
	err := s.store.InTx(ctx, func(tx Tx) error {
		if err := tx.LockWrites(ctx); err != nil {
			return err
		}
		found, err := tx.Get(ctx, EntityLeague, hubID)
		switch {
		case errors.Is(err, ErrNotFound) || (err == nil && found.Deleted):
			if found, err = newCityHub(hubID, cityID, cityName); err != nil {
				return err
			}
		case err != nil:
			return err
		}
		league, err = s.addMember(ctx, tx, found, userID)
		return err
	})
	if err != nil {
		return Doc{}, fmt.Errorf("join city hub: %w", err)
	}
	return league, nil
}

// Leave removes the user from a league. A club league's owner deletes it instead of leaving.
func (s *Service) Leave(ctx context.Context, userID, leagueID string) (Doc, error) {
	var league Doc
	err := s.store.InTx(ctx, func(tx Tx) error {
		if err := tx.LockWrites(ctx); err != nil {
			return err
		}
		role, err := tx.Role(ctx, leagueID, userID)
		if err != nil {
			return fmt.Errorf("load role: %w", err)
		}
		if role == RoleNone {
			return ErrNotMember
		}
		if role == RoleOwner {
			return ErrOwnerCantLeave
		}
		found, err := tx.Get(ctx, EntityLeague, leagueID)
		if err != nil {
			return err
		}
		if err := tx.RemoveMember(ctx, leagueID, userID); err != nil {
			return err
		}
		league, err = s.saveMembers(ctx, tx, found)
		return err
	})
	if err != nil {
		return Doc{}, fmt.Errorf("leave league: %w", err)
	}
	return league, nil
}

func (s *Service) addMember(ctx context.Context, tx Tx, league Doc, userID string) (Doc, error) {
	if league.Deleted {
		return Doc{}, ErrInviteNotFound
	}
	role, err := tx.Role(ctx, league.ID, userID)
	if err != nil {
		return Doc{}, fmt.Errorf("load role: %w", err)
	}
	if role != RoleNone && league.Version > 0 {
		// Already in: nothing changes, so every other member is spared a re-download.
		return league, nil
	}
	if err := tx.AddMember(ctx, league.ID, userID, RoleMember); err != nil {
		return Doc{}, err
	}
	return s.saveMembers(ctx, tx, league)
}

// saveMembers writes the league document again with the current member list, so every phone
// in the league learns about the change through its next pull.
func (s *Service) saveMembers(ctx context.Context, tx Tx, league Doc) (Doc, error) {
	data, err := withMembers(ctx, tx, league.ID, league.Data)
	if err != nil {
		return Doc{}, err
	}
	saved, err := tx.Put(ctx, Doc{Entity: EntityLeague, ID: league.ID, LeagueID: league.ID, Data: data})
	if err != nil {
		return Doc{}, fmt.Errorf("save league members: %w", err)
	}
	saved.Data = data
	return saved, nil
}

// withMembers returns the league JSON with memberUids replaced by the server's member list.
func withMembers(ctx context.Context, tx Tx, leagueID string, data json.RawMessage) (json.RawMessage, error) {
	members, err := tx.Members(ctx, leagueID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	var body map[string]any
	if err := json.Unmarshal(data, &body); err != nil {
		return nil, fmt.Errorf("decode league: %w", err)
	}
	body["memberUids"] = members
	out, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode league: %w", err)
	}
	return out, nil
}

func newCityHub(hubID, cityID, cityName string) (Doc, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	code, err := randomCode(5)
	if err != nil {
		return Doc{}, err
	}
	data, err := json.Marshal(map[string]any{
		"id":                hubID,
		"name":              cityName + " · Snookit",
		"inviteCode":        "C" + code,
		"createdAt":         now,
		"updatedAt":         now,
		"createdByUid":      "",
		"memberUids":        []string{},
		"defaultRaceTarget": 50,
		"defaultBestOf":     5,
		"reigningTeam":      nil,
		"raceKing":          nil,
		"kind":              "city",
		"cityId":            cityID,
	})
	if err != nil {
		return Doc{}, fmt.Errorf("encode city hub: %w", err)
	}
	return Doc{Entity: EntityLeague, ID: hubID, LeagueID: hubID, Data: data}, nil
}

// randomCode returns n characters from an alphabet without look-alikes (no 0/O, 1/I).
func randomCode(n int) (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("random code: %w", err)
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b), nil
}

// PullLeague returns one league's documents after `since`, for a member of that league.
func (s *Service) PullLeague(ctx context.Context, userID, leagueID string, since int64, limit int) (PullPage, error) {
	if since < 0 || leagueID == "" || len(leagueID) > maxIDLength {
		return PullPage{}, fmt.Errorf("%w: invalid league or since", ErrBadRequest)
	}
	if limit <= 0 {
		limit = defaultPull
	}
	limit = min(limit, maxPullLimit)
	var role Role
	if err := s.store.InTx(ctx, func(tx Tx) error {
		var err error
		role, err = tx.Role(ctx, leagueID, userID)
		return err
	}); err != nil {
		return PullPage{}, fmt.Errorf("load role: %w", err)
	}
	if role == RoleNone {
		return PullPage{}, ErrNotMember
	}
	docs, err := s.store.PullLeague(ctx, userID, leagueID, since, limit+1)
	if err != nil {
		return PullPage{}, fmt.Errorf("pull league: %w", err)
	}
	return pageOf(docs, since, limit), nil
}

func pageOf(docs []Doc, since int64, limit int) PullPage {
	hasMore := len(docs) > limit
	if hasMore {
		docs = docs[:limit]
	}
	cursor := since
	if len(docs) > 0 {
		cursor = docs[len(docs)-1].Version
	}
	return PullPage{Docs: docs, Cursor: cursor, HasMore: hasMore}
}
