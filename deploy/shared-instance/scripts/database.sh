#!/usr/bin/env bash
# Shared PostgreSQL container on the dedicated EBS volume. Services reach it only on their internal
# <prefix>-<service>-db networks; the superuser is reachable only through docker compose exec.
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
DATA=${SIDE_POSTGRES_ROOT:-/srv/side-postgres}
export SIDE_DEPLOY_ROOT="$ROOT" SIDE_POSTGRES_ROOT="$DATA"
[[ "$ROOT" == /* && "$ROOT" != / && "$DATA" == /* && "$DATA" != / ]]
[[ -f "$ROOT/.env" && -f "$ROOT/database/compose.yaml" && -f "$ROOT/database/.env" ]]
# The volume is formatted with this marker. Without it the mount is missing and the root disk must not get a new cluster.
[[ -f "$DATA/.side-postgres-volume" && -d "$DATA/data" ]] || {
  echo "The PostgreSQL volume is not mounted at $DATA." >&2
  exit 1
}
host=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
exec 9>"$ROOT/.host-operations.lock"
flock -x 9
compose() {
  docker compose --project-name "${SIDE_PROJECT_PREFIX:-side}-database" --env-file "$ROOT/database/.env" \
    -f "$ROOT/database/compose.yaml" "$@"
}
case "${1:-}" in
  start)
    for service in game-feedback photo-contest; do
      network="${SIDE_NETWORK_PREFIX:-side}-$service-db"
      if ! docker network inspect "$network" >/dev/null 2>&1; then
        # Internal: the database and the service's DB traffic have no route off the host.
        docker network create --internal --label dev.side.shared-instance="$ROOT" "$network" >/dev/null
      fi
      [[ "$(docker network inspect "$network" --format '{{index .Labels "dev.side.shared-instance"}}')" == "$ROOT" ]]
    done
    compose up -d --wait --wait-timeout 120 postgres ;;
  # Prompts for the four service passwords without echoing them.
  bootstrap) compose exec postgres psql -U postgres -d postgres -X -f /etc/side-postgres/bootstrap.sql ;;
  psql)
    shift
    if [[ -t 0 ]]; then compose exec postgres psql -U postgres -X "$@"; else compose exec -T postgres psql -U postgres -X "$@"; fi ;;
  backup)
    [[ $# == 2 ]]
    bash "$host/pg-backup.sh" "$2" manual ;;
  status) compose ps ;;
  *) echo 'Usage: database.sh start | bootstrap | psql [args] | backup <game-feedback|photo-contest> | status' >&2; exit 2 ;;
esac
