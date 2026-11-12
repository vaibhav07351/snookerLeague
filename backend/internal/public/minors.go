package public

import (
	"context"
	"encoding/json"
	"fmt"

	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

// MinorChecker tells which accounts belong to players under 18. Their names never appear on
// public pages (decision D5); their results still do, as "Player".
type MinorChecker interface {
	MinorUIDs(ctx context.Context, uids []string) (map[string]bool, error)
}

// hiddenName is shown instead of an under-18 player's name.
const hiddenName = "Player"

// CardNames maps player card ids to the name a public page may show: the short name ("Rahul
// S."), or "Player" for a card owned by an under-18 account. Guest cards (no account) show
// their short name; a guest's age is unknown, and anyone can ask for a name to be removed.
func CardNames(ctx context.Context, minors MinorChecker, cards []syncmod.Doc) (map[string]string, error) {
	type card struct {
		DisplayName string `json:"displayName"`
		AuthUID     string `json:"authUid"`
	}
	parsed := map[string]card{}
	var uids []string
	for _, d := range cards {
		var c card
		if json.Unmarshal(d.Data, &c) != nil {
			continue
		}
		parsed[d.ID] = c
		if c.AuthUID != "" {
			uids = append(uids, c.AuthUID)
		}
	}
	minor := map[string]bool{}
	if len(uids) > 0 {
		var err error
		if minor, err = minors.MinorUIDs(ctx, uids); err != nil {
			return nil, fmt.Errorf("check ages: %w", err)
		}
	}
	names := make(map[string]string, len(parsed))
	for id, c := range parsed {
		if c.AuthUID != "" && minor[c.AuthUID] {
			names[id] = hiddenName
		} else {
			names[id] = ShortName(c.DisplayName)
		}
	}
	return names, nil
}
