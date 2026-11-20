#!/bin/bash
# Nightly Snookit database backup, run by snookit-backup.timer.
#
#   1. Dump the database, compress it and encrypt it (gpg, AES-256, passphrase from a file).
#   2. Keep BACKUP_KEEP_DAYS days of encrypted files on the VM.
#   3. Copy the file off the VM with rclone (BACKUP_REMOTE) and delete remote copies older than
#      BACKUP_KEEP_DAYS days, so deleted accounts leave the backups within that time.
#
# Settings come from backup.env next to this script (see backup.env.example). Restore with
# restore.sh. A failed dump, encryption or upload fails the job, which shows in the journal.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$here/backup.env" ]]; then
  # shellcheck source=/dev/null
  source "$here/backup.env"
fi
dir="${BACKUP_DIR:-/home/ubuntu/backups}"
keep_days="${BACKUP_KEEP_DAYS:-7}"
pass_file="${BACKUP_PASSPHRASE_FILE:-}"
remote="${BACKUP_REMOTE:-}"
container="${POSTGRES_CONTAINER:-snookit-postgres-1}"

if [[ -z "$pass_file" || ! -r "$pass_file" ]]; then
  echo "BACKUP_PASSPHRASE_FILE is not set or not readable: refusing to write an unencrypted backup" >&2
  exit 1
fi

mkdir -p "$dir"
chmod 700 "$dir"
file="$dir/snookit-$(date -u +%F).sql.gz.gpg"

# pipefail makes a failed pg_dump fail the job, and the temp name keeps a half-written dump
# from ever looking like a finished backup.
docker exec "$container" pg_dump -U snookit snookit \
  | gzip \
  | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$pass_file" -o "$file.tmp"
mv "$file.tmp" "$file"
chmod 600 "$file"
echo "backup written: $file ($(stat -c %s "$file") bytes)"

# Older plain .sql.gz files from before encryption, and restore.sh's safety copies, age out
# the same way.
find "$dir" -maxdepth 1 \( -name 'snookit-*.sql.gz.gpg' -o -name 'snookit-*.sql.gz' -o -name 'pre-restore-*.sql.gz.gpg' \) \
  -mtime +"$keep_days" -delete

if [[ -z "$remote" ]]; then
  echo "WARNING: BACKUP_REMOTE is not set, so there is no copy off the VM" >&2
  exit 0
fi
rclone copy "$file" "$remote" --timeout 5m --retries 3
rclone delete "$remote" --min-age "${keep_days}d" --include 'snookit-*.sql.gz.gpg'
echo "copied off the VM: $remote/$(basename "$file")"
