package community

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestDivisionFromDOBMatchesTheApp(t *testing.T) {
	on := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	cases := map[string]string{
		"2010-11-13": "u16",  // 15, sixteenth birthday tomorrow
		"2010-11-12": "u18",  // 16 today
		"2008-11-13": "u18",  // 17
		"2008-11-12": "u21",  // 18 today
		"2005-11-12": "open", // 21 today
		"1986-11-13": "open", // 39
		"1986-11-12": "masters",
		"1976-11-12": "seniors",
		"":           "",
		"12-11-2000": "",
		"2030-01-01": "",
	}
	for dob, want := range cases {
		if got := divisionFromDOB(dob, on); got != want {
			t.Errorf("divisionFromDOB(%q) = %q, want %q", dob, got, want)
		}
	}
}

func TestTheProfileAgeBandComesFromTheSavedDateOfBirth(t *testing.T) {
	svc, repo := newSvc() // today is 2026-10-31
	mustPut(t, svc, "kid", KindUser, "kid", `{"uid":"kid","dateOfBirth":"2012-05-01"}`)
	// The phone claims an adult band to get onto the city board.
	mustPut(t, svc, "kid", KindProfile, "kid", `{"uid":"kid","cityId":"pune","division":"open"}`)
	saved := repo.rows[key(KindProfile, "kid")]
	if !strings.Contains(string(saved.Data), `"division":"u16"`) || saved.CityID != "" {
		t.Fatalf("an under-18 profile must carry its real band and stay off the city board: %s city=%q", saved.Data, saved.CityID)
	}
}

func TestUnder18PlayersCannotPostPublicly(t *testing.T) {
	svc, _ := newSvc()
	mustPut(t, svc, "kid", KindUser, "kid", `{"uid":"kid","termsAcceptedAt":"2026-10-31T00:00:00Z","dateOfBirth":"2012-05-01"}`)
	err := put(t, svc, "kid", KindLooking, "lk1", `{"id":"lk1","authorUid":"kid","cityId":"pune","kind":"opponent","status":"open","title":"Anyone?"}`)
	if !errors.Is(err, ErrAdultsOnly) {
		t.Fatalf("want ErrAdultsOnly, got %v", err)
	}
}
