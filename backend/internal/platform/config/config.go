// Package config loads server settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

// Config holds every setting the server needs. Secrets come only from the environment.
type Config struct {
	Port                 string
	DatabaseURL          string
	JWTSigningKey        []byte
	GoogleWebClientID    string
	GoogleAndroidClients []string
	SentryDSN            string
	MinAppVersion        string
	AccessTokenTTL       time.Duration
	RefreshTokenTTL      time.Duration
	RefreshGrace         time.Duration
}

const minSigningKeyBytes = 32

// Load reads the configuration and fails fast on anything missing or unsafe.
func Load() (Config, error) {
	cfg := Config{
		Port:                 getenv("PORT", "8080"),
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		JWTSigningKey:        []byte(os.Getenv("JWT_SIGNING_KEY")),
		GoogleWebClientID:    os.Getenv("GOOGLE_WEB_CLIENT_ID"),
		GoogleAndroidClients: splitList(os.Getenv("GOOGLE_ANDROID_CLIENT_IDS")),
		SentryDSN:            os.Getenv("SENTRY_DSN"),
		MinAppVersion:        getenv("MIN_APP_VERSION", "0.0.0"),
		AccessTokenTTL:       30 * time.Minute,
		RefreshTokenTTL:      60 * 24 * time.Hour,
		RefreshGrace:         60 * time.Second,
	}
	var problems []error
	if cfg.DatabaseURL == "" {
		problems = append(problems, errors.New("DATABASE_URL is required"))
	}
	if len(cfg.JWTSigningKey) < minSigningKeyBytes {
		problems = append(problems, fmt.Errorf("JWT_SIGNING_KEY must be at least %d bytes", minSigningKeyBytes))
	}
	if cfg.GoogleWebClientID == "" {
		problems = append(problems, errors.New("GOOGLE_WEB_CLIENT_ID is required"))
	}
	if len(cfg.GoogleAndroidClients) == 0 {
		problems = append(problems, errors.New("GOOGLE_ANDROID_CLIENT_IDS is required"))
	}
	return cfg, errors.Join(problems...)
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitList(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
