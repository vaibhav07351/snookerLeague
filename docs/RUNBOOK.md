# Snookit server runbook

What to do when something breaks, or when routine server work is due. Every command runs
in the **SSH session on the VM** (bash) unless it says **PC** (PowerShell 5.1).

Connect from the PC:

```powershell
ssh -i "D:\Project Apps\ironcoach\Resources\ssh-key-2026-09-22.key" ubuntu@140.245.8.153
```

The setup itself is in `docs/DEPLOY_BACKEND.md`. Never paste `deploy/.env` anywhere.

---

## Quick health check

```bash
cd ~/snookit-backend/deploy
docker compose ps
docker compose logs api --tail 30
curl -s https://snookit.duckdns.org/healthz
df -h /
free -h
```

Healthy: both containers `Up` (postgres `healthy`), `{"status":"ok"}`, disk under 80% full.

| Symptom                                  | First thing to try                                                   |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `/healthz` says `db_down`                | `docker compose restart postgres`, then check its logs               |
| API restarting in a loop                 | `docker compose logs api --tail 50`: usually a missing `.env` value  |
| `password authentication failed (28P01)` | "Password out of sync" in `DEPLOY_BACKEND.md`                        |
| Disk nearly full                         | `docker system prune -f` (removes stopped containers and old images) |
| Site down, API fine                      | IronCoach's Caddy: `docker logs ironcoach-backend-caddy-1 --tail 50` |

## Deploy a new version

From the PC, copy the changed code (never the `deploy` folder, never `.env`):

```powershell
scp -i "D:\Project Apps\ironcoach\Resources\ssh-key-2026-09-22.key" -r "D:\Project Apps\snooker\backend\internal" "D:\Project Apps\snooker\backend\cmd" ubuntu@140.245.8.153:~/snookit-backend/
```

On the VM, keep the running image as a rollback point, then rebuild:

```bash
cd ~/snookit-backend/deploy
docker tag snookit-api:local snookit-api:previous
docker compose up -d --build
docker compose logs api --tail 10
```

Database migrations run by themselves when the API starts.

## Roll back a deploy

```bash
cd ~/snookit-backend/deploy
docker tag snookit-api:previous snookit-api:local
docker compose up -d --no-build api
docker compose logs api --tail 10
```

Migrations are expand/contract (a column is only dropped a release after nothing uses it),
so the previous image still works with the newer database.

## Restore a backup

Backups: `~/backups/snookit-YYYY-MM-DD.sql.gz.gpg` (encrypted), nightly at 03:00 UTC, 7 days
kept, and the same files on the off-VM remote (`BACKUP_REMOTE` in `deploy/backup.env`).
`restore.sh` decrypts with the passphrase file named in `backup.env`; older plain `.sql.gz`
files work too.

**Practise first** (once a month): restore into a scratch database. It prints the number of
users and documents and the newest change, then removes the scratch copy. The live database
is not touched.

```bash
cd ~/snookit-backend/deploy
./restore.sh ~/backups/snookit-YYYY-MM-DD.sql.gz.gpg
./restore.sh offsite:snookit-backups/snookit-YYYY-MM-DD.sql.gz.gpg
```

The second line proves the off-VM copy opens too (use your own remote name).

**For real** (this replaces the live database; every change since the backup is lost). It asks
you to type RESTORE, saves the current database as `~/backups/pre-restore-<time>.sql.gz.gpg`,
stops the API, restores, and starts the API again:

```bash
cd ~/snookit-backend/deploy
./restore.sh ~/backups/snookit-YYYY-MM-DD.sql.gz.gpg --into-live
```

Phones keep their own copies and re-send anything newer when they next sync.

## Rotate secrets

**JWT signing key** (everyone has to sign in again):

```bash
cd ~/snookit-backend/deploy
sed -i "s|^JWT_SIGNING_KEY=.*|JWT_SIGNING_KEY=$(openssl rand -base64 48 | tr -d '\n')|" .env
docker compose up -d api
```

**Database password** (change it in Postgres and `.env` together, or the API can't connect):

```bash
cd ~/snookit-backend/deploy
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)
echo "ALTER USER snookit WITH PASSWORD '$PW';" | docker compose exec -T postgres psql -U snookit -d snookit
unset PW
docker compose up -d api
```

**Force an app update:** set `MIN_APP_VERSION=` in `.env` to the oldest app version you still
support (for example `4.1.0`), then `docker compose up -d api`. Older apps show "Update required".

## Rebuild the server from nothing

If the VM is lost: create an Ubuntu Arm VM (Always Free shape), install Docker, then follow
`docs/DEPLOY_BACKEND.md` from Step 2. Restore the newest backup copy you have off the VM
(see "Backups off the VM" below) with "Restore a backup / For real": first install rclone
and gpg, put back `backup.env`, the passphrase file and the rclone config (`rclone config`). Point DuckDNS at the new IP.

## VM security (one-time, needs sudo)

**Automatic security updates:**

```bash
sudo apt-get update
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Choose "Yes". Reboots are not automatic; when the login banner says "System restart required",
run `sudo reboot` at a quiet time (all containers and the backup timer come back by themselves).

**SSH by key only, plus fail2ban:**

```bash
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
sudo apt-get install -y fail2ban
sudo systemctl enable --now fail2ban
```

Keep your current SSH session open while you test a new one, so a mistake can't lock you out.

**Firewall check:** in the Oracle Cloud console (Networking > Virtual Cloud Networks > your VCN >
Security Lists), only ports 22, 80 and 443 should be open. Postgres publishes no port at all.

## Backups off the VM

`backup.sh` copies each night's encrypted file to `BACKUP_REMOTE` with rclone and deletes remote
files older than 7 days (setup: `docs/DEPLOY_BACKEND.md` Step 11). Check it now and then:

```bash
journalctl -u snookit-backup.service --no-pager -n 5
rclone ls offsite:snookit-backups
```

The journal should end with `copied off the VM: ...`. A line `WARNING: BACKUP_REMOTE is not set`
means there is no copy off the VM. The passphrase lives in `~/.snookit-backup-pass` and in your
password manager; without it no backup can be opened, so never keep it only on the VM.

## Review reports and removal requests

People can report posts, listings and profiles in the app, and anyone can ask for a name to be
removed from a public match page. Check both now and then:

```bash
cd ~/snookit-backend/deploy
docker compose exec postgres psql -U snookit -d snookit -c "SELECT id, data->>'targetKind' AS kind, data->>'targetId' AS target, data->>'reason' AS reason, updated_at FROM community_docs WHERE kind = 'report' ORDER BY updated_at DESC LIMIT 50;"
docker compose exec postgres psql -U snookit -d snookit -c "SELECT id, target, message, created_at FROM removal_requests WHERE handled_at IS NULL ORDER BY created_at;"
```

After dealing with a removal request (for example renaming the guest card in that league), mark
it handled:

```bash
docker compose exec postgres psql -U snookit -d snookit -c "UPDATE removal_requests SET handled_at = now() WHERE id = 123;"
```

## Turn on the optional services

All of these are off until you add the value to `deploy/.env` (then `docker compose up -d api`)
or to EAS for the app:

| Setting                                                      | Where             | What it turns on                                           |
| ------------------------------------------------------------ | ----------------- | ---------------------------------------------------------- |
| `SENTRY_DSN`                                                 | server `.env`     | Server error reports                                       |
| `EXPO_PUBLIC_SENTRY_DSN`                                     | EAS env           | App crash and error reports                                |
| `SUPPORT_EMAIL`                                              | server `.env`     | Contact line on /privacy, /terms and /delete-account       |
| `ANDROID_CERT_SHA256`                                        | server `.env`     | Shared links open the app (Android App Links)              |
| FCM V1 service account key                                   | `eas credentials` | Push notifications on Android                              |
| `EXPO_PUSH_ACCESS_TOKEN`                                     | server `.env`     | Only if "enhanced push security" is on in the Expo project |
| `VM_SSH_KEY`, `VM_HOST`                                      | GitHub secrets    | Automatic deploys after CI passes                          |
| UptimeRobot monitor on `https://snookit.duckdns.org/healthz` | uptimerobot.com   | Email when the server is down                              |
