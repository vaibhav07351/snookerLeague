#!/bin/bash
# Restore a Snookit backup made by backup.sh.
#
#   ./restore.sh <backup>              Check a backup: restore it into a scratch database
#                                      (restore_check), print row counts, then remove it.
#                                      The live database is not touched.
#   ./restore.sh <backup> --into-live  Replace the LIVE database with the backup. Asks you to
#                                      type RESTORE first, and saves the current database to
#                                      the backup folder before replacing it.
#
# <backup> is a file on the VM (~/backups/snookit-2026-11-14.sql.gz.gpg) or a file on the
# off-VM remote (offsite:snookit-backups/snookit-2026-11-14.sql.gz.gpg). Encrypted (.gpg) and
# older plain (.sql.gz) backups both work. Settings come from backup.env, like backup.sh.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$here/backup.env" ]]; then
  # shellcheck source=/dev/null
  source "$here/backup.env"
fi
dir="${BACKUP_DIR:-/home/ubuntu/backups}"
pass_file="${BACKUP_PASSPHRASE_FILE:-}"
container="${POSTGRES_CONTAINER:-snookit-postgres-1}"
compose=(docker compose -f "$here/docker-compose.yml")

source_arg="${1:-}"
mode="${2:-check}"
if [[ -z "$source_arg" || ( "$mode" != "check" && "$mode" != "--into-live" ) ]]; then
  sed -n '2,15p' "$0"
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Fetch from the remote when the name is not a local file.
backup="$source_arg"
if [[ ! -f "$backup" ]]; then
  echo "fetching $source_arg"
  rclone copyto "$source_arg" "$work/$(basename "$source_arg")" --timeout 5m
  backup="$work/$(basename "$source_arg")"
fi

# Prints the plain SQL of the backup on stdout.
plain_sql() {
  case "$backup" in
    *.gpg)
      if [[ -z "$pass_file" || ! -r "$pass_file" ]]; then
        echo "BACKUP_PASSPHRASE_FILE is needed to decrypt $backup" >&2
        return 1
      fi
      gpg --batch --quiet --decrypt --passphrase-file "$pass_file" "$backup" | gunzip -c
      ;;
    *.gz) gunzip -c "$backup" ;;
    *)
      echo "unknown backup type: $backup" >&2
      return 1
      ;;
  esac
}

psql_into() {
  docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U snookit -d "$1"
}

if [[ "$mode" == "check" ]]; then
  docker exec "$container" dropdb -U snookit --if-exists restore_check
  docker exec "$container" createdb -U snookit restore_check
  plain_sql | psql_into restore_check
  docker exec "$container" psql -U snookit -d restore_check -c \
    "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM docs) AS docs, (SELECT max(updated_at) FROM docs) AS newest_change;"
  docker exec "$container" dropdb -U snookit restore_check
  echo "backup is readable: $source_arg"
  exit 0
fi

echo "This REPLACES the live Snookit database with $source_arg."
echo "Every change made after that backup is lost (phones re-send what they still hold)."
read -r -p "Type RESTORE to continue: " answer
if [[ "$answer" != "RESTORE" ]]; then
  echo "nothing changed"
  exit 1
fi

# Prove the backup decrypts before anything is stopped or dropped.
plain_sql > "$work/restore.sql"

if [[ -n "$pass_file" && -r "$pass_file" ]]; then
  safety="$dir/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).sql.gz.gpg"
  docker exec "$container" pg_dump -U snookit snookit \
    | gzip \
    | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$pass_file" -o "$safety"
  chmod 600 "$safety"
  echo "current database saved to $safety"
else
  echo "WARNING: no passphrase file, so the current database was not saved first" >&2
fi

"${compose[@]}" stop api
docker exec "$container" dropdb -U snookit snookit
docker exec "$container" createdb -U snookit snookit
psql_into snookit < "$work/restore.sql"
"${compose[@]}" start api
echo "restored $source_arg into the live database"
"${compose[@]}" logs api --tail 10
