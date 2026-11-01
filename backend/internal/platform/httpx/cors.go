package httpx

import (
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
)

const (
	corsAllowMethods = "GET, POST, PUT, PATCH, DELETE"
	corsAllowHeaders = "Authorization, Content-Type"
	corsMaxAge       = "600"
)

// CORS lets the web app (a different site from the API) call it from a browser.
// allowedHosts are host patterns matched against the request Origin's host with path.Match,
// the same rule the live socket uses (e.g. "snookit.expo.app", "*.snookit.expo.app",
// "localhost:*"). Requests with no Origin (the phone app) and from other origins pass through
// untouched, so the browser keeps blocking unknown sites.
// It panics on a malformed pattern: the list is fixed in code, so that is a programming error.
func CORS(allowedHosts []string) func(http.Handler) http.Handler {
	patterns := make([]string, len(allowedHosts))
	for i, p := range allowedHosts {
		p = strings.ToLower(p)
		if _, err := path.Match(p, ""); err != nil {
			panic(fmt.Sprintf("httpx.CORS: bad origin pattern %q: %v", p, err))
		}
		patterns[i] = p
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}
			h := w.Header()
			h.Add("Vary", "Origin")
			if !originAllowed(origin, patterns) {
				next.ServeHTTP(w, r)
				return
			}
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Expose-Headers", "X-Request-Id")
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				h.Add("Vary", "Access-Control-Request-Method")
				h.Add("Vary", "Access-Control-Request-Headers")
				h.Set("Access-Control-Allow-Methods", corsAllowMethods)
				h.Set("Access-Control-Allow-Headers", corsAllowHeaders)
				h.Set("Access-Control-Max-Age", corsMaxAge)
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func originAllowed(origin string, patterns []string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}
	host := strings.ToLower(u.Host)
	for _, p := range patterns {
		// Patterns were validated in CORS, so Match cannot return an error here.
		if ok, _ := path.Match(p, host); ok {
			return true
		}
	}
	return false
}
