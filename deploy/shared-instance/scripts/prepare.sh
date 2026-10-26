#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
[[ "$ROOT" == /* && "$ROOT" != / ]]
[[ -d "$ROOT" && -w "$ROOT" ]]
mkdir -p "$ROOT/proxy" "$ROOT/database" "$ROOT/services/game-feedback/releases" "$ROOT/services/photo-contest/releases"
directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp "$directory/compose.yaml" "$directory/Caddyfile" "$ROOT/proxy/"
cp "$directory/database/compose.yaml" "$directory/database/pg_hba.conf" "$directory/database/bootstrap.sql" "$ROOT/database/"
# The postgres user in the container reads these through read-only bind mounts.
chmod 644 "$ROOT/database/pg_hba.conf" "$ROOT/database/bootstrap.sql"
if [[ ! -f "$ROOT/.env" ]]; then cp "$directory/host.env.example" "$ROOT/.env"; fi
if [[ ! -f "$ROOT/database/.env" ]]; then
  # Only initdb uses it; pg_hba.conf rejects superuser logins from any network.
  printf 'POSTGRES_SUPERUSER_PASSWORD=%s\n' "$(openssl rand -hex 32)" >"$ROOT/database/.env"
fi
for service in game-feedback photo-contest; do
  if [[ ! -f "$ROOT/services/$service/.env" ]]; then
    cp "$directory/../../projects/$service/deploy/shared-instance/service.env.example" "$ROOT/services/$service/.env"
  fi
done
echo 'Host files prepared. Start and bootstrap the database (database.sh), configure private S3 buckets and both service environments before starting the proxy.'
