#!/usr/bin/env bash
# Fully synthetic, isolated container smoke; never attach to a production volume.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
engine="${CONTAINER_ENGINE:-}"
if [[ -z "$engine" ]]; then
  if command -v podman >/dev/null 2>&1; then engine=podman
  elif command -v docker >/dev/null 2>&1; then engine=docker
  else echo 'Container engine (podman or docker) required' >&2; exit 2; fi
fi
[[ "$engine" == podman || "$engine" == docker ]] || { echo 'Unsupported container engine' >&2; exit 2; }
command -v curl >/dev/null || { echo 'curl required' >&2; exit 2; }
id="gclocations-smoke-$$"
db="$id-db"
api="$id-api"
web="$id-web"
network="$id-net"
password='synthetic-smoke-only-no-real-data-2026'
bootstrap='synthetic-bootstrap-for-disposable-runtime-2026'
portfile="$(mktemp)"
cleanup() {
  "$engine" rm -f "$web" "$api" "$db" >/dev/null 2>&1 || true
  "$engine" network rm "$network" >/dev/null 2>&1 || true
  rm -f "$portfile"
}
trap cleanup EXIT
trap 'echo "Synthetic runtime smoke failed; all temporary test containers will be removed" >&2' ERR

if [[ "${SMOKE_SKIP_BUILD:-}" != 1 ]]; then
  "$engine" build -t localhost/gclocations-smoke-api:local -f apps/api/Dockerfile .
  "$engine" build -t localhost/gclocations-smoke-web:local -f apps/web/Dockerfile .
fi
apiImage="${SMOKE_API_IMAGE:-localhost/gclocations-smoke-api:local}"
webImage="${SMOKE_WEB_IMAGE:-localhost/gclocations-smoke-web:local}"
"$engine" network create "$network" >/dev/null
"$engine" run -d --name "$db" --network "$network" --network-alias database \
  --memory 1g --tmpfs /var/lib/postgresql/data:rw,size=512m \
  -e POSTGRES_USER=locations -e POSTGRES_DB=locations \
  -e "POSTGRES_PASSWORD=$password" docker.io/postgis/postgis:17-3.5 >/dev/null
dbReady=0
for _ in $(seq 1 45); do
  if "$engine" exec "$db" pg_isready -h 127.0.0.1 -U locations -d locations >/dev/null 2>&1; then dbReady=1; break; fi
  sleep 1
done
[[ "$dbReady" -eq 1 ]] || { echo 'Disposable PostGIS was not healthy' >&2; exit 1; }
# Older Podman CNI networks lack container-alias DNS. Explicit hosts are test-only;
# Docker Engine still exercises service discovery through its normal network DNS.
apiHosts=()
if [[ "$engine" == podman ]]; then
  dbIp="$("$engine" inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$db")"
  [[ "$dbIp" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'No disposable DB bridge IP for Podman CNI' >&2; exit 1; }
  apiHosts=(--add-host "database:$dbIp")
fi
"$engine" run -d --name "$api" --network "$network" --network-alias api "${apiHosts[@]}" \
  --read-only --tmpfs /tmp:rw,size=32m --security-opt no-new-privileges \
  -e "DATABASE_URL=postgresql://locations:$password@database:5432/locations" \
  -e "BOOTSTRAP_TOKEN=$bootstrap" -e PORT=8787 "$apiImage" >/dev/null
webHosts=()
if [[ "$engine" == podman ]]; then
  apiIp="$("$engine" inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$api")"
  [[ "$apiIp" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'No disposable API bridge IP for Podman CNI' >&2; exit 1; }
  webHosts=(--add-host "api:$apiIp")
fi
"$engine" run -d --name "$web" --network "$network" "${webHosts[@]}" -p 127.0.0.1::80 \
  --read-only --tmpfs /tmp:rw,size=16m --tmpfs /var/cache/nginx:rw,size=16m \
  --tmpfs /var/run:rw,size=16m --security-opt no-new-privileges "$webImage" >/dev/null
"$engine" port "$web" 80/tcp > "$portfile"
endpoint="$(cat "$portfile")"
# Podman returns "127.0.0.1:NNNN"; Docker may return multiple host bindings.
port="$(sed -nE 's/.*:([0-9]+)$/\1/p' "$portfile" | head -1)"
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'No loopback-only port exposed' >&2; exit 1; }
url="http://127.0.0.1:$port"
healthy=0
for _ in $(seq 1 50); do
  code="$(curl -sS --max-time 2 --output /dev/null --write-out '%{http_code}' "$url/api/healthz" 2>/dev/null || true)"
  if [[ "$code" == 200 ]]; then healthy=1; break; fi
  if [[ "$("$engine" inspect --format '{{.State.Running}}' "$api" 2>/dev/null)" != true ]]; then
    echo 'API container exited during startup; inspect test logs locally' >&2
    "$engine" logs --tail 8 "$api" 2>&1 | sed -E 's#postgresql://[^ ]+#postgresql://[redacted]#g' >&2
    exit 1
  fi
  sleep 1
done
[[ "$healthy" -eq 1 ]] || { echo 'API proxy health did not become ready' >&2; exit 1; }
home="$(curl -sS --max-time 4 --output /dev/null --write-out '%{http_code}' "$url/")"
private="$(curl -sS --max-time 4 --output /dev/null --write-out '%{http_code}' "$url/api/v1/me")"
[[ "$home" == 200 && "$private" == 401 ]] || { echo "HTTP boundary failure web=$home private=$private" >&2; exit 1; }
echo "SYNTHETIC_CONTAINER_SMOKE_PASSED web=200 api_health=200 private_without_token=401"
