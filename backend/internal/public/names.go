package public

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// ShortName turns "Rahul Sharma" into "Rahul S.", so public pages never show a guest's full
// name (guests never agreed to anything). One-word names stay as they are.
func ShortName(full string) string {
	parts := strings.Fields(full)
	switch len(parts) {
	case 0:
		return "Player"
	case 1:
		return parts[0]
	}
	last := parts[len(parts)-1]
	r, _ := utf8.DecodeRuneInString(last)
	return parts[0] + " " + string(unicode.ToUpper(r)) + "."
}
