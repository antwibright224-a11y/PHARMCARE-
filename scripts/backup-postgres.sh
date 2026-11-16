#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a PostgreSQL connection string}"
: "${BACKUP_ENCRYPTION_KEY:?Set BACKUP_ENCRYPTION_KEY to a strong private passphrase}"

backup_dir="${BACKUP_OUTPUT_DIR:-backups}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
work_dir="$(mktemp -d)"
chmod 700 "$work_dir"
trap 'rm -rf "$work_dir"' EXIT

umask 077
printf '%s' "$BACKUP_ENCRYPTION_KEY" > "$work_dir/passphrase"
plain="$work_dir/pharmacare.dump"
encrypted="$backup_dir/pharmacare-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"

pg_dump --format=custom --no-owner --no-acl --file="$plain" "$DATABASE_URL"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$work_dir/passphrase" \
  --symmetric --cipher-algo AES256 --output "$encrypted" "$plain"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$work_dir/passphrase" \
  --decrypt --output "$work_dir/verified.dump" "$encrypted"
pg_restore --list "$work_dir/verified.dump" >/dev/null
printf 'Encrypted, verified database backup: %s\n' "$encrypted"
