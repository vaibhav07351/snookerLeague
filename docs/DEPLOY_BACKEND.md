# Deploy the Snookit backend to the Oracle VM

Goal: run the Go API and PostgreSQL on your existing `ironcoach-api` VM, reachable at
`https://snookit.duckdns.org`, and prove it works against a real database.

Time: about 45 minutes the first time (the first Docker build is the slow part).

**Where each command runs.** Boxes are labelled:

- **PC** = PowerShell 5.1 on your Windows machine.
- **VM** = the SSH session on the Oracle VM (Ubuntu, bash).

**Never paste your `.env` contents into a chat or a file in git.** When something fails,
send me the command outputs listed in "If something goes wrong" instead.

---

## How the pieces fit

```
Phone / browser
      |  https://snookit.duckdns.org
      v
IronCoach's Caddy (already owns ports 80/443, gets the HTTPS certificate)
      |  Docker network "ironcoach-backend_ironcoach"
      v
snookit-api (Go)  --- private network "snookit_internal" ---  postgres
```

Snookit has no proxy of its own. It joins IronCoach's network and gets one new route.

---

## Step 1 (PC): check the DNS name

```powershell
nslookup snookit.duckdns.org
```

Expected: the answer contains `140.245.8.153`. If not, open duckdns.org and press **update ip**
for the `snookit` domain, wait a minute, and try again.

## Step 2 (PC): copy the backend folder to the VM

```powershell
scp -i "D:\Project Apps\ironcoach\Resources\ssh-key-2026-09-22.key" -r "D:\Project Apps\snooker\backend" ubuntu@140.245.8.153:~/snookit-backend
```

Expected: a list of files scrolls by with no error. This first copy creates `~/snookit-backend`.

**Do not run this exact command a second time.** The folder now exists, so `scp` would nest the
files one level deeper (`~/snookit-backend/backend`). For updates, use "Updating later" at the
bottom instead.

## Step 3 (PC): open an SSH session

```powershell
ssh -i "D:\Project Apps\ironcoach\Resources\ssh-key-2026-09-22.key" ubuntu@140.245.8.153
```

All remaining steps marked **VM** run inside this session.

## Step 4 (VM): add swap, then check Docker

The VM has 5.8 GB of memory and no swap. Swap is a safety net so a memory spike during the
build doesn't kill IronCoach.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
docker compose version
```

Expected: `free -h` shows `Swap: 2.0Gi`, and `docker compose version` prints a version.
If compose is missing: `sudo apt-get update && sudo apt-get install -y docker-compose-plugin`.

## Step 5 (VM): create the secrets file

**First-time setup only.** If `~/snookit-backend/deploy/.env` already exists, skip this step.
Running it again overwrites `.env` with a new database password, but Postgres keeps the password
it was first started with, so the API can no longer connect (see "password authentication
failed" under "If something goes wrong"). It also changes the JWT key, which signs everyone out.

```bash
cd ~/snookit-backend/deploy
cp .env.example .env
chmod 600 .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^JWT_SIGNING_KEY=.*|JWT_SIGNING_KEY=$(openssl rand -base64 48 | tr -d '\n')|" .env
sed -i "s|^GOOGLE_WEB_CLIENT_ID=.*|GOOGLE_WEB_CLIENT_ID=134168091127-3jjquh77bqp7qhbgd8geaqjg0afhbmb0.apps.googleusercontent.com|" .env
sed -i "s|^GOOGLE_ANDROID_CLIENT_IDS=.*|GOOGLE_ANDROID_CLIENT_IDS=134168091127-k21lnvgbgsr5jjfkdmac8kh04girc5tt.apps.googleusercontent.com,134168091127-n2c73mffu11bohdq9sj6lc4al613uqub.apps.googleusercontent.com,134168091127-oj56rqg20b6pi8oqkf41g6rbv6ba7dc1.apps.googleusercontent.com,134168091127-q1a2e2pnu963rlsv8u8sb2tjk62glrff.apps.googleusercontent.com|" .env
sed 's/=.*/=<hidden>/' .env
```

Expected: the last command lists these keys, each with `<hidden>`: `EDGE_NETWORK`,
`POSTGRES_PASSWORD`, `JWT_SIGNING_KEY`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_IDS`,
`SENTRY_DSN`, `MIN_APP_VERSION`. The password uses hex on purpose: characters like `/` or `+`
would break the database address.

## Step 6 (VM): build and start

```bash
cd ~/snookit-backend/deploy
docker compose up -d --build
docker compose ps
docker compose logs api --tail 30
```

The first build takes 3 to 8 minutes on one core.

Expected from `docker compose ps`: `postgres` is `healthy` and `api` is `running`.
Expected in the API logs: migration lines (`OK 00001_auth.sql`, `OK 00002_sync.sql`) and
`"msg":"listening"`. There must be no `error` lines.

## Step 7 (VM): check the API from inside Docker

This checks the API on IronCoach's network, before any proxy is involved.

```bash
docker run --rm --network ironcoach-backend_ironcoach curlimages/curl -s http://snookit-api:8080/healthz
```

Expected: `{"status":"ok"}`.

## Step 8 (VM): run the real-database tests

This runs the integration tests against a scratch database, `snookit_test`, so your real
`snookit` database is untouched.

```bash
cd ~/snookit-backend/deploy
docker compose exec postgres createdb -U snookit snookit_test
PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)
docker run --rm --network snookit_internal -v ~/snookit-backend:/src -w /src -e CGO_ENABLED=0 -e TEST_DATABASE_URL="postgres://snookit:$PW@postgres:5432/snookit_test?sslmode=disable" golang:1.27-alpine go test -tags integration -count=1 -v ./internal/integration
unset PW
```

Expected: four tests end with `--- PASS`: `TestAuthAgainstPostgres`, `TestSyncAgainstPostgres`,
`TestCrossLeagueIDCollisionIsRefused`, `TestConcurrentWritersGetUniqueOrderedVersions`, then
`ok`. The first run downloads Go modules and takes a few minutes. If a test says `SKIP`, the
database address did not reach the container.

The `INFO sync op rejected` and `WARN sync op names another league's document` lines are
expected: those tests check that bad writes are refused.

The tests are safe to run again later (for example after "Updating later"). They use random ids,
so rows left from earlier runs do not get in the way. On a rerun, `createdb` prints
`database "snookit_test" already exists`; that is harmless, or skip that line.

If it fails, **send me the full output**.

Optionally, remove the scratch database when you are done with it (it holds only test rows;
`createdb` above makes it again):

```bash
docker compose exec postgres dropdb -U snookit snookit_test
```

## Step 9 (VM): add the Snookit route to IronCoach's Caddy

This touches IronCoach's proxy, so back it up first and validate before reloading.

Find where IronCoach's Caddyfile lives on the VM:

```bash
docker inspect ironcoach-backend-caddy-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

Look for the line ending `-> /etc/caddy/Caddyfile`. The path before the arrow is the file
(probably `~/ironcoach-backend/Caddyfile` or similar). Use that path below; this guide calls it
`$CF`.

```bash
CF=/path/from/the/line/above
cp "$CF" "$CF.bak"
cat >> "$CF" <<'EOF'

snookit.duckdns.org {
	encode gzip
	reverse_proxy snookit-api:8080 {
		header_up X-Forwarded-For {remote_host}
	}
}
EOF
docker exec ironcoach-backend-caddy-1 tail -8 /etc/caddy/Caddyfile
```

Expected: the `tail` (run inside the Caddy container) ends with the `snookit.duckdns.org` block.
If it does not, the container still sees an older copy of the file: a single-file mount stays
pinned to the file that existed when Caddy started, so if that file was ever replaced (by an
editor save or a copy), edits on the host never reach the container. Validate and reload would
then check the old copy and quietly change nothing. Fix it by restarting Caddy, which mounts the
current file (IronCoach is down for about 2 seconds), then check again:

```bash
cd ~/ironcoach-backend
docker compose restart caddy
docker exec ironcoach-backend-caddy-1 tail -8 /etc/caddy/Caddyfile
```

Once the container shows the block, validate it:

```bash
docker exec ironcoach-backend-caddy-1 caddy validate --config /etc/caddy/Caddyfile
```

Expected: `Valid configuration`. Only then reload (skip this if you just restarted Caddy; the
restart already loaded the new config):

```bash
docker exec ironcoach-backend-caddy-1 caddy reload --config /etc/caddy/Caddyfile
docker logs ironcoach-backend-caddy-1 --tail 20
```

Expected: no errors, and within about a minute a log line about obtaining a certificate for
`snookit.duckdns.org`. A reload keeps the old config if the new one is bad, so IronCoach stays up.

A reload that prints only `using config from file` and `adapted config to JSON`, with no
`snookit` lines afterwards, means Caddy is reading the old copy: go back to the `tail` check above.
On the PC this shows up as curl `000`, or `SEC_E_INTERNAL_ERROR` from Windows, because Caddy has
no certificate for the name yet.

## Step 10 (PC): test over the internet

```powershell
curl.exe -s https://snookit.duckdns.org/healthz
curl.exe -s https://snookit.duckdns.org/v1/config
curl.exe -s -o NUL -w "me without a token: %{http_code}`n" https://snookit.duckdns.org/v1/me
curl.exe -s -o NUL -w "pull without a token: %{http_code}`n" https://snookit.duckdns.org/v1/sync/pull
curl.exe -s -o NUL -w "fake google token: %{http_code}`n" -X POST https://snookit.duckdns.org/v1/auth/google -H "Content-Type: application/json" -d '{\"idToken\":\"fake\"}'
```

Expected:

| Command                       | Result                   |
| ----------------------------- | ------------------------ |
| `/healthz`                    | `{"status":"ok"}`        |
| `/v1/config`                  | `{"minVersion":"0.0.0"}` |
| `/v1/me` with no token        | `401`                    |
| `/v1/sync/pull` with no token | `401`                    |
| fake Google token             | `401`                    |

Then check the rate limit (20 per minute per address on sign-in). The first 20 answer `401`,
the rest `429`:

```powershell
1..25 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code} " -X POST https://snookit.duckdns.org/v1/auth/google -H "Content-Type: application/json" -d '{\"idToken\":\"fake\"}' }
```

And confirm IronCoach still works (the exact path may differ; any normal page or health
response is fine):

```powershell
curl.exe -s -o NUL -w "ironcoach: %{http_code}`n" https://ironcoach.duckdns.org/
```

**What this does not prove yet:** a real Google sign-in. That needs the app, which is the next
piece of work. A test token from the Google OAuth Playground would be refused on purpose,
because it is issued to Google's own client, not to yours.

## Step 11 (VM): nightly backups (do this before real users)

The VM image has no `cron`, so the backup runs from a systemd timer (Ubuntu's built-in
scheduler). The script and both unit files live in `backend/deploy/`: `backup.sh`,
`snookit-backup.service` and `snookit-backup.timer`. They reach the VM with the backend folder
(Step 2), or copy just those three into `~/snookit-backend/deploy/`.

Install the timer, then run one backup straight away to prove it works:

```bash
cd ~/snookit-backend/deploy
chmod 755 backup.sh
sudo install -m 644 snookit-backup.service snookit-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now snookit-backup.timer
sudo systemctl start snookit-backup.service
journalctl -u snookit-backup.service --no-pager -n 5
systemctl list-timers snookit-backup.timer --no-pager
ls -lh ~/backups
```

Expected: the journal shows `backup written: /home/ubuntu/backups/snookit-<date>.sql.gz`, the
timer list shows the next run at 03:00, and `~/backups` holds a file of a few KB or more.

This keeps 7 days of dumps on the VM. A failed dump fails the job (it shows in the journal)
instead of leaving an empty file that looks like a backup. A copy stored off the VM is still to
do, because a backup on the same disk does not survive losing the VM.

---

## Done when

- [ ] Step 7 printed `{"status":"ok"}`
- [ ] Step 8 showed four `PASS` lines
- [ ] Step 10 table matches, including `429` after 20 tries
- [ ] IronCoach still answers
- [ ] A backup file exists in `~/backups`

## If something goes wrong

Send me the output of these (they contain no secrets):

```bash
cd ~/snookit-backend/deploy
docker compose ps
docker compose logs api --tail 50
docker compose logs postgres --tail 30
docker logs ironcoach-backend-caddy-1 --tail 50
```

| Symptom                                                                         | Likely cause and fix                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `network ironcoach-backend_ironcoach not found`                                 | Wrong network name. Run `docker network ls` and set `EDGE_NETWORK` in `.env`.                                      |
| API exits with `JWT_SIGNING_KEY must be at least 32 bytes` or `... is required` | A line in `.env` is empty. Re-run the matching `sed` line from Step 5.                                             |
| Build killed or very slow                                                       | Out of memory. Check swap with `free -h`.                                                                          |
| `invalid certificate` or timeout on `https://snookit...`                        | DNS not pointing at the VM yet, or the route is not loaded. Check Step 1 and the Caddy logs.                       |
| `502` from `snookit.duckdns.org`                                                | Caddy cannot reach the API. Run Step 7; check the API is running and on the `ironcoach-backend_ironcoach` network. |
| `scp` says permission denied (publickey)                                        | The key path is wrong. Use the exact path that worked for `ssh`.                                                   |
| API or tests: `password authentication failed for user "snookit"` (`28P01`)     | `.env` was recreated after Postgres first started. See "Password out of sync" below.                               |
| After an update, the build shows `CACHED [build 5/6] COPY . .`                  | The new code never reached the VM. Re-run the `scp` commands from "Updating later" and rebuild.                    |

### Password out of sync

Postgres reads `POSTGRES_PASSWORD` only when its data volume is first created. If `.env` got a
new password later (for example Step 5 was run twice), set the database user to the password
now in `.env`. This keeps all data, and the password never appears on screen:

```bash
cd ~/snookit-backend/deploy
PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)
echo "ALTER USER snookit WITH PASSWORD '$PW';" | docker compose exec -T postgres psql -U snookit -d snookit
unset PW
docker compose restart api
docker compose logs api --tail 10
```

Expected: `ALTER ROLE`, then the API logs end with `"msg":"listening"`. Then run Step 7.

## Undo everything

```bash
cd ~/snookit-backend/deploy
docker compose down
cp "$CF.bak" "$CF"
docker exec ironcoach-backend-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

`docker compose down` keeps the database volume. Deleting the data as well would be
`docker compose down -v`, which cannot be undone, so only run that if you really want a blank
start.

## Updating later

Copy only the folders that changed. The destination folder already exists, so each command
merges into it. Never copy `deploy` over the server's copy unless you changed the compose file,
and never touch `deploy/.env` (it only exists on the VM).

```powershell
scp -i "D:\Project Apps\ironcoach\Resources\ssh-key-2026-09-22.key" -r "D:\Project Apps\snooker\backend\internal" ubuntu@140.245.8.153:~/snookit-backend/
scp -i "D:\Project Apps\ironcoach\Resources\ssh-key-2026-09-22.key" -r "D:\Project Apps\snooker\backend\cmd" ubuntu@140.245.8.153:~/snookit-backend/
```

If `go.mod` or `go.sum` changed, copy those two files as well:

```powershell
scp -i "D:\Project Apps\ironcoach\Resources\ssh-key-2026-09-22.key" "D:\Project Apps\snooker\backend\go.mod" "D:\Project Apps\snooker\backend\go.sum" ubuntu@140.245.8.153:~/snookit-backend/
```

Then on the VM:

```bash
cd ~/snookit-backend/deploy
docker compose up -d --build
docker compose logs api --tail 10
```

Expected: the build runs `[build 5/6] COPY . .` and `[build 6/6] RUN ... go build` without
`CACHED` in front (a rebuild takes a couple of minutes). If both say `CACHED`, the new code did
not reach the VM. The logs end with `"msg":"listening"`.

Database changes apply by themselves when the API starts. Then run Step 7, and Step 8 if the
change touched the database code (`pgrepo.go`, migrations, `internal/sync`, `internal/auth`).
