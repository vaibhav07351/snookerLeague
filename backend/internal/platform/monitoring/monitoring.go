// Package monitoring sends unexpected server errors to Sentry. With no SENTRY_DSN it does
// nothing, so local runs and tests never need an account.
package monitoring

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/getsentry/sentry-go"

	"github.com/vaibhav/snookit-server/internal/platform/httpx"
)

// Init starts Sentry when dsn is set and routes every unexpected 500 and panic to it. The
// returned flush waits briefly on shutdown so the last events are not lost.
func Init(dsn, release string) (flush func(), err error) {
	if dsn == "" {
		return func() {}, nil
	}
	if err := sentry.Init(sentry.ClientOptions{
		Dsn:     dsn,
		Release: release,
		// Never send request bodies, cookies or headers: they can hold tokens and personal data.
		SendDefaultPII: false,
	}); err != nil {
		return nil, fmt.Errorf("init sentry: %w", err)
	}
	httpx.ReportError = func(ctx context.Context, err error) {
		hub := sentry.CurrentHub().Clone()
		hub.Scope().SetTag("request_id", httpx.RequestID(ctx))
		hub.CaptureException(err)
	}
	slog.Info("error reporting on")
	return func() { sentry.Flush(2 * time.Second) }, nil
}
