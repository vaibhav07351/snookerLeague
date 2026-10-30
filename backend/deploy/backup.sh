#!/bin/bash
# Nightly Snookit database dump, run by snookit-backup.timer. Keeps 7 days on the VM.
# A copy off the VM is still to do: a backup on the same disk does not survive losing the VM.
set -euo pipefail

dir=/home/ubuntu/backups
file="$dir/snookit-$(date +%F).sql.gz"
mkdir -p "$dir"

# pipefail makes a failed pg_dump fail the job, and the temp name keeps a half-written dump
# from ever looking like a finished backup.
docker exec snookit-postgres-1 pg_dump -U snookit snookit | gzip > "$file.tmp"
mv "$file.tmp" "$file"

find "$dir" -name 'snookit-*.sql.gz' -mtime +7 -delete
echo "backup written: $file ($(stat -c %s "$file") bytes)"
