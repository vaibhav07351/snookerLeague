# Snookit Production Plan

> From personal project to a Play Store app that people use, share and benefit from,
> growing by itself with no paid marketing. Backend: own Go + PostgreSQL server on Oracle
> Cloud Always Free (Firebase removed).

|               |                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **Status**    | v4.4 - App switched to the Snookit API, Firebase removed (2026-10-31). Not yet tested on a device. |
| **Created**   | 2026-10-12 (v1-v3 Firebase plan), 2026-10-12 (v4 Oracle plan)                                      |
| **Next step** | Device test of Phase 2b, then the stats + Elo worker (Phase 1)                                     |

---

## Contents

1. [The goal in one minute](#1-the-goal-in-one-minute)
2. [What moving off Firebase changes](#2-what-moving-off-firebase-changes)
3. [Decisions needed from you](#3-decisions-needed-from-you)
4. [The new architecture](#4-the-new-architecture)
5. [Sign-in design (reviewing the IronCoach way)](#5-sign-in-design-reviewing-the-ironcoach-way)
6. [How the app will grow by itself](#6-how-the-app-will-grow-by-itself)
7. [The phases at a glance](#7-the-phases-at-a-glance)
8. [Phase details (with checklists)](#8-phase-details-with-checklists)
9. [What we deliberately cut](#9-what-we-deliberately-cut)
10. [What could go wrong](#10-what-could-go-wrong)
11. [Not yet verified](#11-not-yet-verified)
12. [Terms used](#12-terms-used)
13. [History of this plan](#13-history-of-this-plan)

---

## 1. The goal in one minute

**What:** Make Snookit an app snooker players in India actually use, where every match scored
becomes a free advert that reaches other players.

**Why:** No marketing budget, so the product itself has to spread, the way CricHeroes grew: every
scorecard reaches the other players, and their stats pull them into the app.

**Analogy:** Today Snookit is a great scorebook in one person's pocket. After this plan it is a
scorebook that hands every opponent a copy of the result with a note: _"your stats are waiting,
tap here"_.

```
You score a match
    |
    v
Share card -> WhatsApp group (10-50 players see it, with a rich link preview)
    |
    v
Opponent taps "see your stats" -> public page on our server -> installs the app
    |
    v
Claims their match history, scores their next match -> loop repeats
```

**Already strong (keep):** shot-by-shot scoring, offline scoring, scorer handover, Elo, head-to-head.

---

## 2. What moving off Firebase changes

You are right that a lot of problems disappear. Some stay, and a few new ones arrive because you
now run the server yourself.

### Problems that disappear

| Old problem                                                         | Why it goes away                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Blaze billing, kill switch, budget alerts                           | No per-read or per-call billing. Oracle Always Free is a flat zero within limits. |
| Firestore read costs from live viewers and public pages             | Our own server; 10 TB/month outbound traffic is free.                             |
| Server function firing on every shot                                | We decide in Go code when to compute; no triggers.                                |
| Firestore rules language limits, rules tests on an emulator         | Permissions become normal Go code with normal Go tests.                           |
| 1 MB document limit for long matches                                | Shots live in their own Postgres table.                                           |
| City listener capped at 200 matches (bug B2)                        | Replaced by paged API calls and server-side totals.                               |
| Stats computed on phones, fakeable rankings (B6)                    | The server computes stats and Elo from day one.                                   |
| Members editing any league field, claiming any card (B4, B5)        | The API only accepts the specific actions we allow.                               |
| Crashlytics / App Check needing native Firebase modules             | Not needed. Sentry for crashes, our own rate limits for abuse.                    |
| Phone clocks deciding which edit wins (sync uses phone `updatedAt`) | The server assigns an ever-increasing version number to every change.             |

### Problems that stay

| Problem                                              | Why it stays                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| City takeover (B1) **in the current Firebase build** | Still live until the cutover; the new API simply never gives anyone ownership of a city hub. |
| Phone storage data-loss (B3, B7)                     | The app stays offline-first, so the local store bug must still be fixed.                     |
| Play Store rules                                     | Account deletion, report/block, 12-tester closed test, target SDK 36.                        |
| India privacy law (DPDP)                             | Accounts 18+, guest name masking.                                                            |
| Cheating with fake Google accounts                   | No backend fixes this alone; opponent confirmation + limits still needed.                    |
| Growth and cold-start design                         | Unchanged.                                                                                   |

### New problems (because you run the server)

| New problem                                                     | How the plan handles it                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **You are the operations team** (uptime, OS updates, security)  | Docker Compose, automatic security updates, Caddy for HTTPS, a free uptime monitor, a written runbook.                                                                   |
| **Backups are your job**                                        | Nightly database dump to Oracle Object Storage (free) **and** a weekly copy outside Oracle; restore drill every month.                                                   |
| **Oracle can stop "idle" free VMs**                             | A free VM idle for 7 days (CPU, network and memory all under 20%) can be stopped. Fix: upgrade the account to Pay As You Go (still free within limits), see decision D3. |
| **One VM = one point of failure**                               | Fine at this size. Boot volume backups + runbook to rebuild in under an hour.                                                                                            |
| **Live scoring for watchers** (Firestore did this for free)     | WebSocket from the Go server; one VM means no extra message broker.                                                                                                      |
| **Sync between phone and server** (Firestore SDK did this)      | Our own push/pull endpoints with idempotent operations (section 4).                                                                                                      |
| **Moving existing data and users** off Firebase                 | Not needed: the app is not live, so the new server starts blank (decided 2026-10-31, section 3b).                                                                        |
| **Scoring logic in two languages** (TypeScript app + Go server) | Shared test fixtures: the same JSON cases run in Jest and `go test`, so the two can't drift.                                                                             |
| **Push notifications**                                          | Android push only works through Google's FCM. A Firebase project stays **only** as the free FCM pipe (no database, no login). Push is in the last phase.                 |

---

## 3. Decisions needed from you

| #      | Question                                                                                                                                                                                                                                                                                                           | Recommended                                                                                                                          | Why                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Run Snookit on a **new VM** or share the `ironcoach-api` VM?                                                                                                                                                                                                                                                       | **New A1 VM, 2 OCPU / 12 GB**                                                                                                        | Free allowance is 4 OCPU / 24 GB; IronCoach uses 1 / 6. A separate VM means a bad deploy or a database crash in one app can't take down the other. Leaves 1 OCPU / 6 GB spare. _Alternative:_ resize the existing VM to 3 / 18 and run both there (one box to patch, but shared fate). |
| **D2** | Buy a **domain** (e.g. `snookit.in`)?                                                                                                                                                                                                                                                                              | **Yes** (~Rs 700-1,000 a year, the only real cost)                                                                                   | Needed for HTTPS, Android App Links, trusted-looking share links and Google search. _Alternative:_ a free DuckDNS subdomain works technically but looks untrustworthy in WhatsApp.                                                                                                     |
| **D3** | Upgrade the Oracle account to **Pay As You Go**?                                                                                                                                                                                                                                                                   | **Yes**, plus a budget alert at Rs 1                                                                                                 | Protects both VMs from being stopped as "idle". Always Free resources stay free. Needs a card on file. Oracle has **no hard spending cap**; the alert only emails you, so only ever create shapes marked "Always Free eligible".                                                       |
| **D4** | Is the Firebase version **public on Play**, or internal testing only?                                                                                                                                                                                                                                              | Assumed **internal only** (`eas.json` submits to `internal` as `draft`)                                                              | If internal only, we do a clean cutover and skip all "old versions in the wild" work, which saves weeks.                                                                                                                                                                               |
| **D5** | Accounts **18+ only**, no date of birth stored?                                                                                                                                                                                                                                                                    | **Yes**                                                                                                                              | India's DPDP Act treats under-18s as children needing verifiable parental consent. Users pick an age band (Open / Masters / Seniors). Under-18s can still appear as guest names in private leagues.                                                                                    |
| **D6** | Approve new libraries? App: `expo-secure-store`, `@sentry/react-native`, `react-native-view-shot`, `expo-sharing`, `expo-store-review`, later `expo-notifications`. Go: `chi` (router), `pgx` (Postgres), `goose` (migrations), `google.golang.org/api/idtoken`, `golang-jwt/jwt`, `coder/websocket`, `sentry-go`. | **Yes**                                                                                                                              | Each does one job, all widely used.                                                                                                                                                                                                                                                    |
| **D7** | What does the Elo rating cover?                                                                                                                                                                                                                                                                                    | **Per-league Elo** (as today) computed by the server, plus a **separate public rating** from verified user-vs-user matches only (P6) | Elo today is per league, and guest cards have no account. Mixing everything into one global number would let guest-heavy friendly leagues distort public rankings.                                                                                                                     |

---

## 3b. Decisions answered (2026-10-24)

| #   | Answer                                         | Effect on the plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Share the existing `ironcoach-api` VM**      | Checked on the VM 2026-10-24: Ubuntu 22.04 Arm, 1 core, 5.8 GB RAM, 40 GB free disk, no swap, and IronCoach's own Caddy (in Docker) owns ports 80/443. So Snookit runs **no proxy**: its API joins IronCoach's Docker network as `snookit-api`, and one route is added to IronCoach's Caddyfile. Memory limits keep Snookit from starving IronCoach. The image is built on the VM (no registry). Recommended: resize the VM to 2 cores / 12 GB (free, within the 4 / 24 allowance) and add a swap file. |
| D2  | **No domain bought**                           | Use a free **DuckDNS** subdomain with Caddy's automatic HTTPS. **Cloudflare is dropped** (it needs a domain you control), so the Cloudflare caching, origin-certificate and real-IP notes in section 4 no longer apply: the server talks to users directly. Public pages get shorter caching in Caddy or none.                                                                                                                                                                                          |
| D3  | **No Pay As You Go**                           | The VM can still be reclaimed after 7 idle days. Mitigation: a small keep-alive job and a rebuild runbook. Both apps on the VM make it busy, which helps.                                                                                                                                                                                                                                                                                                                                               |
| D4  | **Internal testing only**                      | Clean cutover; no "old versions in the wild" work.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D5  | **No strict 18+ gate, but an easy safe limit** | A simple "I am 13 or older" confirmation, no date of birth stored, under-18 players hidden from public boards. Risk: India's DPDP Act sets the child line at 18; revisit before a public Play launch.                                                                                                                                                                                                                                                                                                   |
| D6  | **Approve new libraries**, checked             | All seven Go libraries were checked: official modules at current versions (chi v5.5.0, pgx v5.11.0, goose v3.29.0, google.golang.org/api v0.308.0, golang-jwt v5.3.1, coder/websocket v1.8.15, sentry-go v0.50.0).                                                                                                                                                                                                                                                                                      |
| D7  | **Per-league Elo + separate public rating**    | As recommended.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D8  | **Blank start, no data move** (2026-10-31)     | The app is not live, so no Firebase data or users are moved. Phase 2b drops the migration script and the staged cutover; testers simply sign in again on the new build.                                                                                                                                                                                                                                                                                                                                 |

---

## 4. The new architecture

**Analogy:** Firebase was a rented, fully serviced flat. Oracle is your own house: free rent,
but you fix the plumbing. The plan keeps the plumbing simple: one house, four rooms, one door.

```
 Phone (Expo app, offline-first)          Browser (WhatsApp link, Google search)
   local store + queue of changes              |
        |  HTTPS + WebSocket                    |
        v                                       v
 +-------------------- Cloudflare (free: DNS, hides server IP, caches public pages) ----+
                                       |
 +------------------- Oracle A1 VM "snookit" (Mumbai, Docker Compose) ------------------+
 |  Caddy (HTTPS certificates, reverse proxy, serves assetlinks.json)                   |
 |    |                                                                                 |
 |    v                                                                                 |
 |  Go API  (handlers -> services -> repositories -> Postgres)                          |
 |    - /auth, /sync, /leagues, /matches, /tournaments, /public pages, /live WebSocket |
 |    - computes stats + Elo, renders public HTML pages and share preview images       |
 |    |                                                                                 |
 |    v                                                                                 |
 |  PostgreSQL 16 (only reachable inside the VM)                                        |
 +--------------------------------------------------------------------------------------+
        |  nightly dump                                    |  weekly copy
        v                                                  v
 Oracle Object Storage (free 20 GB)              Outside Oracle (e.g. Google Drive)
```

### How it works, step by step

1. **The app stays offline-first.** Scoring writes to the phone first, exactly like today, so
   parlours with bad signal still work.
2. **Sync push sends whole documents, as the app does today.** The app's queue sends the full
   match (all frames and shots) and keeps only the latest copy per document. Undo, edit frame,
   delete frame, reopen, forfeit and "start midway" all rewrite earlier shots, so "append one shot
   at a time" would not fit. The server stores each match as a **JSONB** document (Postgres's
   JSON column type) and rebuilds `frames` / `shots` tables from it for queries and stats.
3. **Each push carries `opId` and `baseVersion`.** `opId` makes retries **idempotent** (applied
   once only). `baseVersion` is the server version the phone last saw. If the server has moved on
   since (two phones edited offline, for example during a scorer handover), it answers **409
   Conflict** with its current copy. The server also enforces the scorer lock from its own state,
   so only the current scorer's frames can win.
4. **Each op in a batch gets its own result**, so one bad op never blocks or drops the rest:

   | Answer           | Meaning               | What the app does                                                     |
   | ---------------- | --------------------- | --------------------------------------------------------------------- |
   | 200              | Applied               | Remove from queue                                                     |
   | 409              | Conflict              | Take the server copy, keep a "conflicted" copy for the user to review |
   | 401              | Token expired         | Refresh token, keep the op, retry                                     |
   | other 4xx        | Not allowed / invalid | Drop the op, refetch the document, tell the user                      |
   | 5xx / no network | Server problem        | Retry later with backoff                                              |

5. **Sync pull:** `GET /v1/sync/pull?since=<version>` returns changed rows **and deletions**
   (**tombstones**: "this id was deleted"), plus "you lost access to this league" entries, in
   pages. Versions come from the server, never phone clocks. A phone whose cursor is older than
   the oldest kept tombstone does a full resync.
6. **Derived data is the server's job.** Phones stop sending stats, reigning champions, city rank
   and feed events (today `persistMatchResult` queues all of these). The server ignores those
   fields if an old build sends them and creates feed events itself.
7. **Stats and Elo run in a background worker, not inside the push.** Elo depends on match order,
   so a match synced a day late, or an old frame edited, changes every later rating. The push only
   saves the match and marks "ratings need a replay from here". A single worker replays from the
   earliest affected match, ordered by the server's `completed_at`. Ratings catch up within seconds.
8. **Live watchers** open a WebSocket for one match. Pings every 30 seconds (Cloudflare closes
   idle connections after ~100 s); reconnect with backoff and resume from the last version.
9. **Public pages** (`/m/<id>`, `/p/<player>`, `/c/<city>`, `/t/<tournament>`) are plain HTML
   rendered by Go, with Open Graph tags and a generated preview image. WhatsApp shows a rich card,
   and Google can index them.

### Why this way

- **One VM, Docker Compose**: simplest thing that can run reliably at this size (thousands of users
  fit easily on 2 Arm cores). No Kubernetes.
- **Go**: you already use it; low memory; one binary; good fit for WebSockets.
- **Postgres**: rankings, head-to-head and tournament tables are natural SQL queries.
- **Server-rendered public pages**: the biggest gain from leaving Firebase. They give free Google
  search traffic and rich WhatsApp previews, which a Firestore single-page web app couldn't do.

### Other ways (not chosen)

| Alternative                          | When it would be better                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Oracle Autonomous Database (managed) | If you never want to run backups yourself; locks you to Oracle.                  |
| Supabase / Neon free tiers           | Managed Postgres, but free tiers pause or cap; you'd still need a server for Go. |
| Keep Firebase Auth only              | Zero login migration, but keeps a Firebase dependency you said you want gone.    |

### App side changes

- New `src/shared/api/` client: `fetch` with timeouts, auth header, automatic token refresh,
  typed errors.
- Each feature gets the `repositories/` folder that `claude.md` already describes. Repositories
  call the API; services stay unchanged where possible.
- `src/shared/sync/` keeps the queue, but it is **more than a transport swap**:
  - error handling moves from Firebase error codes to the table above;
  - `merge.ts` compares server versions instead of phone timestamps;
  - `persistMatchResult` stops queueing stats, champions, rank and events;
  - deletions come from tombstones instead of comparing full snapshots (`watch.ts`).
- 20 files import Firebase today (sync layer, auth, community and league services). All move to
  the API client.
- **One "upload everything" path** (a full snapshot of local data sent as idempotent upserts,
  keyed by existing ids), used when a demo user signs in with Google. (It was also planned for
  the first launch after the switch from Firebase; with the blank start, D8, that use is gone.)

### Cloudflare and Caddy, done safely

- **HTTPS to the server:** Cloudflare SSL mode **Full (strict)** (never "Flexible", which causes
  redirect loops and sends plain text). Caddy uses a free Cloudflare Origin certificate.
- **Caching only public pages:** cache rules for `/m/*`, `/p/*`, `/c/*`, `/t/*` and preview
  images only. Every API response sends `Cache-Control: private, no-store`. `/auth`, `/sync`,
  `/me` and `/live` always bypass the cache. Edits, deletions and "remove me" requests purge the
  affected public page.
- **Real visitor IP:** behind Cloudflare every request looks like it comes from Cloudflare. Rate
  limits use the `CF-Connecting-IP` header, trusted only from Cloudflare's IP ranges, and the
  firewall accepts ports 80/443 only from those ranges, so nobody can bypass Cloudflare or fake
  the header.

### Web app hosting

The Expo web build moves from EAS Hosting to `app.<domain>`, served by Caddy on the same VM. The
web app and API are then on the same site, so the login cookie works (browsers block cookies
between unrelated domains) and CORS stays simple.

---

## 5. Sign-in design (reviewing the IronCoach way)

**Verdict:** the IronCoach flow is the right shape (Google proves identity -> Go issues its own
token -> middleware checks it). Reuse it, with six upgrades. Most of them fix the "things I
noticed" list from IronCoach itself, so they are worth back-porting there too.

```
"Continue with Google" (native picker) -> Google ID token
  -> POST /v1/auth/google { id_token }
       -> verify signature LOCALLY with Google's cached public keys
          (check aud = our WEB client id, azp = our Android client id, iss, exp, email_verified)
       -> find user by google_sub (email only as a one-time link for migrated users)
       -> create session row: refresh token (hashed), device, expiry
  <- { access_token (30 min), refresh_token (60 days), user }
  -> app stores tokens in expo-secure-store (encrypted keystore)
  -> every call: Authorization: Bearer <access_token>
  -> on 401: POST /auth/refresh (rotates the refresh token) -> retry once
  -> on refresh failure: sign out
```

| #   | Upgrade vs IronCoach                                                                                                                     | Why                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Verify Google tokens **locally** (`idtoken.Validate`) instead of calling `tokeninfo`                                                     | Google says `tokeninfo` is for debugging: it may throttle or fail intermittently in production. Local checks also avoid an 8 s network hop per login.                          |
| 2   | **Short access token + revocable refresh token** (instead of one 7-day JWT)                                                              | Logout, account deletion and "sign out all devices" actually work; a leaked token dies in 30 minutes. Refresh tokens rotate and are stored hashed.                             |
| 3   | Tokens in **expo-secure-store** on native; web uses an httpOnly cookie for the refresh token                                             | AsyncStorage is plain text on the device.                                                                                                                                      |
| 4   | **No roles or league links inside the token** (only user id + session id)                                                                | League permissions (owner, member, scorer) are looked up per request, so they are never stale. This avoids the IronCoach "re-issue the JWT after redeeming an invite" problem. |
| 5   | A rejected token on startup signs the user out                                                                                           | IronCoach keeps a cached user after a 401.                                                                                                                                     |
| 6   | No ignored database errors; auth endpoints rate-limited                                                                                  | Matches the project rules; stops brute force and abuse.                                                                                                                        |
| 7   | **Refresh race handled**: the app runs only one refresh at a time, and the server accepts the just-replaced refresh token for 60 seconds | Otherwise two parallel calls both refresh, the second looks like a stolen token, and the user is logged out for no reason.                                                     |

**The audience gotcha:** the app asks Google for a token using the **web** client id
(`webClientId`), so tokens arrive with `aud` = web client id and the Android client only appears
as `azp`. The server must check both, exactly like that.

**Keep the Google Cloud project.** Today the OAuth client ids and the app's SHA-1 fingerprints live
in the Firebase/Google Cloud project. Removing Firebase from the **app** is fine; deleting that
**project** would break sign-in (and later push). The web client id moves from
`google-services.json` to `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

**Existing users:** their Firebase uids are kept as their user ids, so every `createdByUid`,
`memberUids` and `authUid` in the migrated data still points to the right person. All id columns
are `TEXT` (Firebase uids and the app's `prefix_xxx` ids are not UUIDs). `firebase auth:export`
(free) gives each uid's Google `sub` (the `rawId` of the `google.com` provider), stored as a
unique `google_sub`. No automatic linking by email; odd cases are reviewed by hand.

**Demo mode** stays local-only. On "upgrade to Google": `/auth/google` returns the user id, the
app re-labels its local data from the demo id to that id (`migrateDemoUidInStore` already does
this), then runs the "upload everything" path. If the Google account already has server data,
the two are merged by id.

---

## 6. How the app will grow by itself

| #   | Driver                           | How it works                                                                                                                  | Phase |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | **Parlour knockout tournaments** | One organiser shares one bracket link with 16-32 players. The biggest multiplier.                                             | 5     |
| 2   | **Share card after every match** | Result image + link, one tap to WhatsApp.                                                                                     | 4     |
| 3   | **Rich link previews**           | Server-rendered pages give WhatsApp a proper card (photo, score, names) instead of a bare link.                               | 4     |
| 4   | **Claim links**                  | "Rahul, your 5 matches are waiting." The guest becomes the next installer.                                                    | 4     |
| 5   | **Google search**                | Public player, city leaderboard and tournament pages are indexable ("best snooker players in Pune"). New with our own server. | 4     |
| 6   | **Play Store search (ASO)**      | Listing built around "snooker scoreboard / score counter".                                                                    | 4     |
| 7   | **Rating prompt**                | Only after a win or century, at most once every 90 days.                                                                      | 4     |
| 8   | **Push notifications**           | Bring people back (challenged, confirm this result, your match is ready).                                                     | 6     |

**Cold-start rule:** one user with one friend must get value. Home leads with "Score a match" and
head-to-head; city boards, Looking and Directory stay hidden until a city has about 20 active
players.

**Measure it:** the Go server logs events (`match_scored`, `share_tapped`, `claim_opened`,
`claim_done`, `install_from_link`) into a Postgres table. No third-party analytics needed.

---

## 7. The phases at a glance

```
P2a Phone storage fix (on Firebase, can start now)
P0 Server foundation -> P1 Go API core -> P2b App switch + data move -> P3 Launch-ready
                                                                           |
                  P6 Retention <- P5 Tournaments <- P4 Growth loops <------+
```

| Phase   | Theme                                                                         | Size |
| ------- | ----------------------------------------------------------------------------- | ---- |
| **P2a** | Phone storage data-loss fix + "update required" check (independent, do first) | M    |
| **P0**  | Oracle VM, Docker, HTTPS, backups, monitoring, deploy pipeline                | S    |
| **P1**  | Go API: auth, sync, leagues, matches, races, stats, Elo, live                 | L    |
| **P2b** | App talks to the API; move data off Firebase                                  | L    |
| **P3**  | Launch-ready: Play policies, 18+, deletion, safety, cold start                | M    |
| **P4**  | Growth: share cards, public pages, claim links, ASO                           | M    |
| **P5**  | Knockout tournaments                                                          | M    |
| **P6**  | Trusted public rankings, push notifications, round-robin                      | M    |

Sizes: **S** = a few days, **M** = 1-2 weeks, **L** = 2-4 weeks (solo, part-time estimates).

**Start the Play closed test (12 testers, 14 days) as soon as the P2b build is stable**, in
parallel with P3. It gates going public and doubles as user research.

---

## 8. Phase details (with checklists)

Tick boxes as work completes so the next session knows where we are.

### Phase 0 - Server foundation

**Goal:** a secure, backed-up, monitored server that deploys with one command.

- [x] Decide D1-D3. (done: shares the existing `ironcoach-api` VM, Ubuntu 22.04 Arm, with 2 GB
      swap added; resizing it is still optional)
- [ ] **Firewall, in two places** (a common Oracle gotcha):
  - OCI security list: 80/443 open **only to Cloudflare's IP ranges**; 22 only to your IP.
  - The VM's own iptables: Oracle's Ubuntu image ends INPUT with a REJECT rule, so the 80/443
    accept rules must go **above** it and be saved with `netfilter-persistent`.
  - SSH by key only, password login off, `fail2ban`.
- [ ] `unattended-upgrades` for automatic security patches.
- [x] Docker Compose: `api`, `postgres` (running on the VM since 2026-10-30; no Caddy of its own, one route in IronCoach's Caddy serves `https://snookit.duckdns.org`; steps in `docs/DEPLOY_BACKEND.md`), all **arm64** images. Postgres publishes no
      host port at all (Docker-published ports skip the host firewall). Healthchecks plus
      `depends_on: service_healthy`; log rotation (`max-size`); `stop_grace_period` for clean shutdown.
- [ ] Postgres tuned for the VM's memory; `statement_timeout` set.
- [x] ~~Domain on Cloudflare~~ Dropped by D2: free DuckDNS name with Caddy's automatic HTTPS
      (Let's Encrypt certificate issued 2026-10-30).
- [x] Secrets (done 2026-10-30) (`DATABASE_URL`, `JWT_SIGNING_KEY`, Google client ids, Sentry DSN) in a server-only
      `.env` with `chmod 600`; placeholders in a committed `.env.example`.
- [ ] **Backups:** (partly done 2026-10-30: nightly `pg_dump` at 03:00 UTC by a systemd timer,
      `backend/deploy/backup.sh`, 7 days kept in `~/backups` on the VM. Still to do: encryption,
      the off-VM copies and the restore drill below)
  - Nightly `pg_dump`, **encrypted** (with `age`) before it leaves the VM.
  - To Oracle Object Storage with a lifecycle rule deleting copies after 14 days. Note: the free
    20 GB (and the 5 free volume backups) are shared with IronCoach.
  - Weekly copy outside Oracle (e.g. Google Drive).
  - **Monthly restore drill** into a scratch database.
- [ ] **Monitoring:** UptimeRobot (free) on `/healthz`; Sentry for Go and the app; disk-space alert.
- [ ] **Deploy pipeline:** GitHub Actions builds an `arm64` image (buildx) -> GitHub Container
      Registry (free) -> SSH deploy -> health check -> keep the previous image for rollback.
- [x] Database migrations with `goose` (done: they run on every API start), run on deploy, always in **expand/contract** style: add
      new columns, backfill, and only drop old ones a release later, because offline phones can be
      weeks behind.
- [ ] `docs/RUNBOOK.md`: rebuild server, restore backup, rotate secrets, roll back a deploy.

### Phase 1 - Go API core

**Goal:** the server does everything Firestore did, plus trusted stats.

- [x] Repo layout: `backend/` (done 2026-10-24: config, httpx, db, auth, sync packages) (Go module) inside this repo, layered
      `handlers -> services -> repositories`, matching the app's rules.
- [x] **Auth** as designed in section 5 (done 2026-10-24: Google verify, access + rotating refresh tokens, grace window, theft detection, rate limit; tested with in-memory fakes and, since 2026-10-30, against real Postgres on the VM; NOT yet tried with a real Google token) (`users`, `sessions` tables; `/auth/google`,
      `/auth/refresh`, `/auth/logout`, `/me`).
- [x] **Schema**: (partly done: users, sessions, league_members, docs (JSONB), applied_ops, change sequence; stats/rating tables, invites, follows and challenges still to come) `users`, `sessions`, `player_profiles`, `leagues`, `league_members`, `players`
      (league cards), `matches` (JSONB document + version), `frames`, `shots` (rebuilt from the
      document), `races` (JSONB), `events`, `invites`, `follows`, `challenges`, `applied_ops`,
      `change_log` (versions and tombstones for pull), `rating_jobs`.
  - All ids `TEXT`; all times `timestamptz` in UTC (public pages show India time).
  - Phone-supplied times are validated and future times clamped.
  - Versions come from one sequence assigned inside the write transaction, and pull only reads
    up to versions that are certainly committed, so a slow transaction can't be skipped.
- [x] **Permissions in Go services** (partly done: leagues, players, matches, races, events ported with the old holes closed; join-by-invite, leave, claim approval and city-hub creation still to come) (ported from `firestore.rules`, with the holes closed):
  - City hubs have no owner; name, city and code are fixed; nobody deletes them.
  - League owner: settings, invite rotation, delete league, hand over ownership.
  - Match: scorer writes shots; creator/owner manage; take-over follows the scoring policy.
  - Races get the same scorer lock as matches.
  - Guest card claim: request -> league owner approves (claim links come in P4).
- [x] **Sync endpoints** under `/v1` (done 2026-10-24: `backend/internal/sync`, idempotent per user + opId, `baseVersion` conflicts, tombstones, paged pull; 17 tests on an in-memory store, plus integration tests on real Postgres passing on the VM 2026-10-30) (designed in section 4): `/sync/push` (batched, per-op
      results, `opId` + `baseVersion`, 409 on conflict), `/sync/pull` (paged, with tombstones and
      access-lost entries). City hubs pull only what the phone needs (own matches + top boards),
      never "all 500 cards".
- [ ] **Server owns derived data:** stats, reigning champions, race king, city rank and feed
      events. Fields sent by old builds are ignored, never trusted.
- [ ] **Stats + Elo worker:** a single background worker (one at a time, via a Postgres advisory
      lock) replays ratings from the earliest changed match. Port `stats.service.ts` and
      `rating.service.ts`. Rating scope is decision D7.
- [x] Graceful shutdown: (done) on stop, finish in-flight requests and close WebSockets cleanly (10-20 s).
- [x] Database connection pool sized (done) for the VM (`pgxpool`, ~10-20 connections).
- [x] Request ids in every log line. (request id header + context done; not yet added to every log line)
- [ ] **Shared fixtures:** frame engine, stats and Elo cases as JSON under `fixtures/`, run by both
      Jest and `go test`.
- [ ] **Live**: `/live/matches/{id}` WebSocket, read-only for watchers.
- [ ] Rate limiting per user and per IP; request size limits; structured JSON logs (no tokens, no
      emails).
- [ ] Every list endpoint paginated; every query parameterised (`pgx`).
- [ ] Tests: service tests with a real Postgres (Docker) for permissions, sync idempotency and
      stats. (partly done: `backend/internal/integration` covers auth, sync idempotency, conflicts,
      tombstones, cross-league ids and concurrent writers; stats and the remaining permissions
      still to come)

### Phase 2a - Phone storage fix (ships first, still on Firebase)

**Goal:** stop the phone data-loss bug before the big switch, so two risky changes never ship in
the same release.

- [x] **Fix phone storage** (bugs B3, B7) - done 2026-10-24 except the web 5 MB limit and Sentry:
  - Never save after a failed load (read-only safe mode + retry + Sentry report).
  - One storage key per match; migrate old key -> new keys -> verify -> keep old key one release.
  - Cheaper change detection than turning the whole store into text on every shot.
  - Web: handle the ~5 MB browser limit.
- [ ] Minimum-version check: `/config` (first read from a public Firestore doc, later from the Go
      API) returns `minVersion`; old app versions see "Update required".

### Phase 2b - App switch (blank start)

**Goal:** the app runs on the new server. Per D8 nothing is moved from Firebase: the server
starts empty and testers sign in again.

- [x] `src/shared/api/` client (timeouts, auth header, single-flight token refresh, typed
      errors) and `src/shared/sync/` reworked (done 2026-10-31): batched pushes with
      `baseVersion`, conflicts merged with the existing resolvers, version-cursor pull with
      tombstones, 10 s poll while the app is open. Still to do from section 4: phones still
      send derived data (stats, titles, feed events) until the stats worker exists.
- [x] Server endpoints the app needed (done 2026-10-31): join by invite code, invite preview,
      leave, city hubs created by the server on first join, single-league pull after joining,
      and a `community` module for user settings, profiles, directory, looking posts, follows
      and challenges. Guest card claim ("That's me") allowed for an unowned card, for yourself.
- [x] The "upload everything" path (used by demo upgrade) (done: any owned league the server
      has never seen is queued with its players, matches, races and events).
- [x] Sign-in: native Google picker -> `/v1/auth/google`; tokens in `expo-secure-store` (web
      uses browser storage) (done 2026-10-31).
- [x] Remove the `firebase` package from the app (done 2026-10-31; `legacy-firebase/` deleted
      too). **Keep** the Google Cloud/Firebase project (OAuth clients, SHA-1s, later push).
- [ ] Test on a real phone and the web build: sign in, create a league, join it from a second
      account, score a match, city hub, community screens.
- [ ] Web build served from `app.<domain>` by Caddy.
- [x] ~~**Data migration script**~~ Not needed (D8, blank start). Kept below for reference only:
  1. Count Firestore documents first, to confirm the read total fits the free daily limit
     (50,000 reads); otherwise run it over two days.
  2. `firebase auth:export` -> map Firebase uid -> Google `sub` (`rawId`).
  3. Transform everything, keeping ids: matches including `openFrame` (live matches) and frame
     fields (`startingReds`, `redsRemoved`, `carriedPoints`, `carriedOver`, `viaForfeit`), races
     including `liveShots` and `entrants`, players, leagues, invites, events, follows,
     challenges, profiles, looking posts and directory listings. `dateOfBirth` is **not**
     copied (D5).
  4. Clean up city hubs damaged by bug B1 (wrong owner, renamed, wrong city).
  5. Give every row a starting server version; queue a full stats + Elo replay.
  6. Verify counts for users, leagues, matches, frames, shots, races and race shots; spot-check
     10 matches by hand against the old app.
- [ ] **Cutover** (blank start, D8):
  1. Release the new build to internal testing; testers sign in with Google again.
  2. The new build ignores data saved on the phone by the Firebase build (it starts empty).
  3. Delete the Firestore data and remove `legacy-firebase/` whenever convenient. Keep the
     Firebase project itself (OAuth clients, SHA-1s, later push).

### Phase 3 - Launch-ready

**Goal:** pass Play review, follow the law, give value on day one.

- [ ] **18+ accounts** (D5): "I am 18+" check + self-declared age band; no date of birth stored;
      migrated DOBs are not copied (users under 18 by DOB are flagged and offered deletion).
- [ ] **Account deletion** in app and on a public web page (`/delete-account`), done **by the
      server in one transaction**: revoke sessions, hand over or delete owned leagues, rename cards
      "Deleted player", remove memberships, follows, challenges and posts, delete the user.
- [ ] **Safety for user posts:** report and block, terms accepted before the first post, rate
      limits, posts expire. Looking and Directory hidden until a city has ~20 active players.
- [ ] **Guest privacy:** public pages show "Rahul S.", no guest photos, "This is me, remove it".
- [ ] **Cold-start home:** "Score a match" and head-to-head first.
- [ ] Privacy policy with grievance contact (DPDP), Play **Data safety** form, a note for Play
      reviewers, target SDK 36 confirmed.
- [ ] Trim the side menu to the screens people use.

### Phase 4 - Growth loops

**Goal:** every match becomes a reason for someone new to install.

- [ ] **Share cards** after every match, 50+ break and title: image + link, one tap to WhatsApp.
- [ ] **Public pages** rendered by Go: match `/m/<id>`, player `/p/<id>`, city board `/c/<city>`;
      Open Graph tags + generated preview image; Cloudflare caches them; `sitemap.xml` for Google.
- [ ] **Claim links:** token hashed in the database, single use, 7-day expiry; the card's creator
      is told and can undo within 7 days; claiming never grants entry to a private league.
- [ ] **Android App Links:** Caddy serves `/.well-known/assetlinks.json`; `intentFilters` in
      `app.config.js`.
- [ ] **Rating prompt** after a win or century, at most once every 90 days.
- [ ] **Store listing:** "Snookit - Snooker Scoreboard & League", screenshots of scoring and share
      cards.

### Phase 5 - Knockout tournaments

**Goal:** one organiser brings a whole parlour into the app.

- [ ] Knockout with byes and random or manual seeding; entries from league players or a link.
- [ ] Fixtures are matches with `tournament_id`, `round` and `slot`; the server moves winners on.
- [ ] Public bracket page `/t/<id>` (same pattern as P4).
- [ ] Results entered by the organiser count for the tournament only, never for public rankings.

### Phase 6 - Trusted rankings + retention

- [ ] **Opponent confirms** a result before it counts for the public ranking; changes reset it.
- [ ] **Anti-cheating:** at most 3 rated games per pair per 30 days; wins over new accounts count
      for almost nothing; show "N verified opponents"; account at least 7 days old.
- [ ] **Push notifications** via Expo Push (free; uses Google's FCM underneath, so a Firebase
      project is kept only for FCM): challenged, confirm this result, your match is ready.
- [ ] Round-robin tournaments with a points table.
- [ ] Bottom-tab redesign.

---

## 9. What we deliberately cut

| Cut                                          | Why                                                   |
| -------------------------------------------- | ----------------------------------------------------- |
| Kubernetes, multiple servers, Redis          | One VM is enough at this size; add only when measured |
| Live shot-by-shot public web scoreboard      | Result pages first; the app already has live watching |
| Groups-then-knockout format                  | Knockout first, round-robin later                     |
| Club pages, achievements, badges             | Don't drive installs yet                              |
| "You lost your rank" and weekly-recap pushes | Annoying                                              |
| Looking and Directory at launch              | Empty without players, and they add moderation work   |
| Merging duplicate player cards               | Rare; fix by hand for now                             |

---

## 10. What could go wrong

| Risk                                              | How the plan handles it                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Data loss on the server**                       | Nightly + weekly off-Oracle backups, monthly restore drill.                                                                              |
| **Oracle stops or deletes the VM or account**     | PAYG upgrade (D3); off-Oracle backup copy; the runbook rebuilds on any Linux host (Docker Compose is portable).                          |
| **Server down = no syncing**                      | The app is offline-first: scoring still works and syncs later. Uptime alerts tell you fast.                                              |
| **Migration loses or garbles data**               | Count checks + manual spot checks; Firestore export kept; read-only freeze before copy.                                                  |
| **TypeScript and Go scoring disagree**            | Shared JSON fixtures run in both test suites.                                                                                            |
| **Security hole in your own API**                 | Permission tests for every endpoint; rate limits; Cloudflare in front; Postgres not exposed.                                             |
| **Cheating with fake accounts**                   | Can't be solved fully; confirmation + limits make it slow and visible.                                                                   |
| **Play closed test delays launch**                | Starts as soon as the P2b build is stable, in parallel with P3.                                                                          |
| **Two phones edit the same match offline**        | `baseVersion` check returns 409; the server's scorer lock decides; the losing copy is kept for the user to review, never silently wiped. |
| **Ratings briefly out of date** after a late sync | Accepted on purpose: the worker replays within seconds. Correct order beats instant numbers.                                             |
| **Running two apps on free resources**            | Separate VMs (D1); monitor CPU/memory; 1 OCPU / 6 GB still spare.                                                                        |

---

## 11. Not yet verified

- Whether upgrading to Pay As You Go still protects free VMs from idle reclamation (stated in a
  2023 Oracle notice; not confirmed on the current docs page). Check in the console before
  relying on it.
- Whether A1 capacity is available in Mumbai when creating the new VM ("out of capacity" is common;
  retry or resize the existing VM instead).
- Whether the Firebase version is public on Play (D4).
- The 2026 Play closed-test numbers (12 testers, 14 days) come from third-party sources.
- When the DPDP children's rules start (May 2027 in most sources, Nov 2026 in one).

---

## 12. Terms used

| Term                       | Plain meaning                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| **Always Free**            | Oracle resources that stay free forever within fixed limits                                    |
| **A1 / OCPU**              | Oracle's Arm VM type / one Arm CPU core                                                        |
| **Pay As You Go (PAYG)**   | Oracle account with a card on file; free resources stay free                                   |
| **Docker Compose**         | One file that starts all the server's parts (proxy, API, database) together                    |
| **Caddy**                  | A web server that gets and renews HTTPS certificates automatically                             |
| **Cloudflare**             | A free front door for your domain: DNS, hides your server, caches pages                        |
| **Idempotent**             | Safe to repeat: running it twice has the same effect as once                                   |
| **opId**                   | A unique id on each queued change, so the server can ignore repeats                            |
| **WebSocket**              | A connection that stays open so the server can push live updates                               |
| **Access / refresh token** | Short-lived pass for each call / long-lived pass to get a new one, which the server can cancel |
| **expo-secure-store**      | Encrypted storage on the phone for secrets like tokens                                         |
| **Open Graph tags**        | Page tags that tell WhatsApp what preview card to show                                         |
| **Migration (database)**   | A versioned script that changes the database structure safely                                  |
| **App Links**              | Web links that open the installed app instead of the browser                                   |
| **ASO**                    | Making the Play Store listing show up in search                                                |
| **Elo**                    | A rating where beating stronger players earns more points                                      |
| **DPDP Act**               | India's 2023 data protection law                                                               |
| **FCM**                    | Google's push notification service; the only way to push to Android                            |

---

## 13. History of this plan

1. **v1-v3 (Firebase):** drafted from a full codebase read, then reviewed by two independent
   reviewers (19 technical defects, 30 loopholes) and a second-round reviewer (15 ordering
   issues). Confirmed live bugs: city takeover (B1) and capped listener deleting matches (B2).
2. **v4 (this version):** rewritten after the decision to move to an own Go + PostgreSQL backend on
   Oracle Cloud Always Free. Firebase-specific work (Blaze, kill switch, rules tightening order,
   Firestore cost traps, native Firebase modules) was dropped; server operations, backups, sync
   design, data migration and the sign-in design (based on the IronCoach flow) were added.
   Policy, privacy, growth and cheating items carried over unchanged.
3. **v4 review:** an independent reviewer checked v4 against the code and found 15 defects, all
   fixed in this version. The biggest:
   - the app sends whole match documents and rewrites shots on undo/edit, so "append-only shots"
     didn't fit; now whole-document upserts with `baseVersion` conflicts;
   - no deletion handling in pull; now tombstones;
   - Elo inside the push transaction was wrong for late syncs; now a replay worker;
   - unsynced tester data would be lost at cutover; now "upload everything" on first launch;
   - the Google token audience is the web client id; the Google Cloud project must be kept;
   - Cloudflare caching, real-IP and TLS details; Oracle firewall and shared free limits;
   - the storage fix and the backend switch were in one release; now split (P2a, P2b).

### Bug list carried over (current Firebase build)

| #   | Bug                                                                           | Fixed by                         |
| --- | ----------------------------------------------------------------------------- | -------------------------------- |
| B1  | First person to join a city becomes its owner and can delete everything in it | P1 (no hub owners) + P2b cutover |
| B2  | Capped city listener deletes older matches locally, then stats drift down     | P1 sync design + P2b             |
| B3  | Failed storage load leads to overwriting real data with empty data            | P2a storage fix                  |
| B4  | Members can edit any league field                                             | P1 permissions                   |
| B5  | Any member can claim any guest card                                           | P1 claim approval                |
| B6  | Stats computed on phones, rankings fakeable                                   | P1 server stats                  |
| B7  | Whole store turned into text ~10 times per shot                               | P2a storage fix                  |
| B8  | No account deletion, no report/block, DOB from minors                         | P3                               |
