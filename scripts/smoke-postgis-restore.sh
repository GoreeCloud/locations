#!/usr/bin/env bash
# Synthetic-only SQL schema/backup/restore acceptance. Never connect to live workloads.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
engine="${CONTAINER_ENGINE:-}"
if [[ -z "$engine" ]]; then
  if command -v podman >/dev/null 2>&1; then engine=podman
  elif command -v docker >/dev/null 2>&1; then engine=docker
  else echo 'Podman or Docker required' >&2; exit 2; fi
fi
[[ "$engine" == docker || "$engine" == podman ]] || { echo 'Unsupported engine' >&2; exit 2; }
umask 077
container="gclocations-restore-smoke-$$"
dir="$(mktemp -d)"
cleanup() {
  "$engine" rm -f "$container" >/dev/null 2>&1 || true
  rm -rf -- "$dir"
}
trap cleanup EXIT
trap 'echo "Synthetic recovery validation failed; disposable data will be deleted" >&2' ERR
"$engine" run -d --name "$container" --network none --memory 1g \
  --tmpfs /var/lib/postgresql/data:rw,size=640m \
  -e POSTGRES_USER=locations -e POSTGRES_DB=locations_test \
  -e POSTGRES_PASSWORD=synthetic-recovery-only-not-a-real-secret \
  docker.io/postgis/postgis:17-3.5 >/dev/null
ready=0
for _ in $(seq 1 50); do
  if "$engine" exec "$container" pg_isready -h 127.0.0.1 -U locations -d locations_test >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'No TCP-ready synthetic PostGIS' >&2; exit 1; }
"$engine" exec -i "$container" psql -U locations -d locations_test -v ON_ERROR_STOP=1 -f - < migrations/001_init.sql >/dev/null
"$engine" exec "$container" psql -U locations -d locations_test -v ON_ERROR_STOP=1 -c \
  "INSERT INTO accounts(email,password_hash) VALUES ('synthetic-recovery@example.invalid','synthetic-not-a-real-hash');
   INSERT INTO positions(account_id,latitude,longitude,captured_at,source)
     SELECT id,33.1,-86.9,now(),'restore_smoke' FROM accounts WHERE email='synthetic-recovery@example.invalid';" >/dev/null
dump="$dir/locations_test.dump"
"$engine" exec "$container" pg_dump -U locations -d locations_test --format=custom --no-owner --no-acl > "$dump"
[[ -s "$dump" ]] || { echo 'No synthetic database archive' >&2; exit 1; }
"$engine" exec "$container" createdb -U locations locations_restore_test
"$engine" exec -i "$container" pg_restore -U locations -d locations_restore_test --no-owner --no-acl < "$dump"
src="$("$engine" exec "$container" psql -U locations -d locations_test -tAc "SELECT COUNT(*) FROM positions WHERE source='restore_smoke'")"
restored="$("$engine" exec "$container" psql -U locations -d locations_restore_test -tAc "SELECT COUNT(*) FROM positions WHERE source='restore_smoke'")"
geo="$("$engine" exec "$container" psql -U locations -d locations_restore_test -tAc "SELECT COUNT(*) FROM pg_extension WHERE extname='postgis'")"
[[ "$src" == 1 && "$restored" == 1 && "$geo" == 1 ]] || { echo "Restore mismatch synthetic source=$src restored=$restored postgis=$geo" >&2; exit 1; }
echo "SYNTHETIC_POSTGIS_RESTORE_PASSED source_positions=1 restored_positions=1 postgis_extension=1 archive_bytes=$(wc -c < "$dump")"
