package sync

import (
	"fmt"
	"unicode/utf8"
)

// Shape checks on synced documents. Phones send whole documents the server mostly stores as
// they are, so these keep out what would break other phones, stats or public pages: wrong
// types and unbounded lists or text. Limits sit above what the app itself allows, so a real
// app write is never refused; a missing field is fine (older documents lack some).

const (
	maxNameRunes  = 80
	maxLabelRunes = 80
	maxTitleRunes = 160
	maxBodyRunes  = 600
	maxTeamSize   = 2
	maxRaceSize   = 16 // the app allows 12
	maxGroupSize  = 10 // the app allows 8
	maxEntrants   = 64 // the app allows 32
	maxFrames     = 80 // best of 35 at most, plus edits
	maxRelatedIDs = 12
)

type shapeRule func(body fields) string

var shapeRules = map[Entity][]shapeRule{
	EntityLeague: {textField("name", maxNameRunes)},
	EntityPlayer: {textField("displayName", maxNameRunes)},
	EntityMatch: {
		idList("teamA", 1, maxTeamSize), idList("teamB", 1, maxTeamSize),
		listField("frames", maxFrames), textField("namedLabel", maxLabelRunes),
	},
	EntityRace: {listField("entrants", maxRaceSize), textField("namedLabel", maxLabelRunes)},
	EntityGroupMatch: {
		idList("playerIds", 0, maxGroupSize), listField("frames", maxFrames),
		textField("namedLabel", maxLabelRunes),
	},
	EntityEvent: {
		textField("title", maxTitleRunes), textField("body", maxBodyRunes),
		idList("relatedIds", 0, maxRelatedIDs),
	},
	EntityTournament: {textField("name", maxNameRunes), idList("entrants", 0, maxEntrants)},
}

// checkShape returns "" when the body fits its entity's rules, else what is wrong.
func checkShape(e Entity, body fields) string {
	for _, rule := range shapeRules[e] {
		if msg := rule(body); msg != "" {
			return msg
		}
	}
	return ""
}

// textField: when present (and not null), a string of at most maxRunes characters.
func textField(key string, maxRunes int) shapeRule {
	return func(body fields) string {
		v, ok := body[key]
		if !ok || v == nil {
			return ""
		}
		s, isStr := v.(string)
		if !isStr || utf8.RuneCountInString(s) > maxRunes {
			return fmt.Sprintf("%s must be text of at most %d characters.", key, maxRunes)
		}
		return ""
	}
}

// listField: when present, a list of at most maxLen items.
func listField(key string, maxLen int) shapeRule {
	return func(body fields) string {
		v, ok := body[key]
		if !ok || v == nil {
			return ""
		}
		items, isList := v.([]any)
		if !isList || len(items) > maxLen {
			return fmt.Sprintf("%s must be a list of at most %d items.", key, maxLen)
		}
		return ""
	}
}

// idList: when present, a list of minLen to maxLen non-empty ids.
func idList(key string, minLen, maxLen int) shapeRule {
	return func(body fields) string {
		v, ok := body[key]
		if !ok || v == nil {
			return ""
		}
		items, isList := v.([]any)
		if !isList || len(items) < minLen || len(items) > maxLen {
			return fmt.Sprintf("%s must list %d to %d ids.", key, minLen, maxLen)
		}
		for _, it := range items {
			if s, isStr := it.(string); !isStr || s == "" || len(s) > maxIDLength {
				return fmt.Sprintf("%s must list ids.", key)
			}
		}
		return ""
	}
}
