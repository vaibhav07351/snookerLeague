package public

import "testing"

func TestShortNameHidesSurnames(t *testing.T) {
	cases := map[string]string{
		"Rahul Sharma":       "Rahul S.",
		"rahul kumar singh":  "rahul S.",
		"Asha":               "Asha",
		"  ":                 "Player",
		"Ravi \u0101dhikari": "Ravi \u0100.",
	}
	for in, want := range cases {
		if got := ShortName(in); got != want {
			t.Errorf("ShortName(%q) = %q, want %q", in, got, want)
		}
	}
}
