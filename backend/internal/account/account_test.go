package account

import (
	"context"
	"errors"
	"testing"
)

type step struct {
	name string
	log  *[]string
	err  error
}

func (s step) ForgetUser(_ context.Context, user string) error {
	*s.log = append(*s.log, s.name+":"+user)
	return s.err
}

func (s step) DeleteAccount(_ context.Context, user string) error {
	*s.log = append(*s.log, s.name+":"+user)
	return s.err
}

func TestDeleteErasesDataBeforeTheAccount(t *testing.T) {
	var log []string
	svc := NewService(step{"account", &log, nil}, step{"sync", &log, nil}, step{"community", &log, nil})
	if err := svc.Delete(context.Background(), "u1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	want := []string{"sync:u1", "community:u1", "account:u1"}
	if len(log) != len(want) {
		t.Fatalf("steps = %v", log)
	}
	for i := range want {
		if log[i] != want[i] {
			t.Fatalf("steps = %v, want %v", log, want)
		}
	}
}

func TestAFailedStepKeepsTheAccountSoTheUserCanRetry(t *testing.T) {
	var log []string
	boom := errors.New("db down")
	svc := NewService(step{"account", &log, nil}, step{"sync", &log, boom})
	if err := svc.Delete(context.Background(), "u1"); !errors.Is(err, boom) {
		t.Fatalf("want the step's error, got %v", err)
	}
	for _, s := range log {
		if s == "account:u1" {
			t.Fatal("the account must not be removed after a failed step")
		}
	}
}
