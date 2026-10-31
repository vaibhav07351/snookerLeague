package live

import (
	"testing"

	syncmod "github.com/vaibhav/snookit-server/internal/sync"
)

func TestHubKeepsOnlyTheNewestCopyForASlowWatcher(t *testing.T) {
	h := NewHub()
	ch, ok := h.subscribe("m1")
	if !ok {
		t.Fatal("subscribe refused")
	}
	h.Publish(syncmod.Doc{Entity: syncmod.EntityMatch, ID: "m1", Version: 1})
	h.Publish(syncmod.Doc{Entity: syncmod.EntityMatch, ID: "m1", Version: 2})
	h.Publish(syncmod.Doc{Entity: syncmod.EntityMatch, ID: "other", Version: 3})
	h.Publish(syncmod.Doc{Entity: syncmod.EntityPlayer, ID: "m1", Version: 4})
	if d := <-ch; d.Version != 2 {
		t.Fatalf("got version %d, want the newest (2)", d.Version)
	}
	select {
	case d := <-ch:
		t.Fatalf("unexpected extra update %+v", d)
	default:
	}
	h.unsubscribe("m1", ch)
	if len(h.watchers) != 0 {
		t.Fatal("watcher not removed")
	}
}

func TestHubCapsWatchersPerMatch(t *testing.T) {
	h := NewHub()
	for i := 0; i < maxWatchers; i++ {
		if _, ok := h.subscribe("m1"); !ok {
			t.Fatalf("watcher %d refused", i)
		}
	}
	if _, ok := h.subscribe("m1"); ok {
		t.Fatal("watcher over the cap must be refused")
	}
}
