#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
[[ "$ROOT" == /* && "$ROOT" != / ]]
[[ -d "$ROOT" && -w "$ROOT" ]]
mkdir -p "$ROOT/proxy" "$ROOT/database" "$ROOT/services/game-feedback/releases" "$ROOT/services/photo-contest/releases"
directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 실행 중인 Caddy는 Caddyfile을 재시작할 때 다시 읽는다. DB 구성 때문에 다시 실행해도 검증·백업·reload 없이
# 덮어쓰지 않도록 프록시 파일은 처음 한 번만 복사한다. 이미 있는 파일이 이 checkout과 다르면 반영 방법만 알린다.
for file in compose.yaml Caddyfile; do
  if [[ ! -f "$ROOT/proxy/$file" ]]; then cp "$directory/$file" "$ROOT/proxy/"; fi
done
if [[ "$(<"$directory/Caddyfile")" != "$(<"$ROOT/proxy/Caddyfile")" ]]; then
  echo 'Kept the host proxy Caddyfile, which differs from this checkout. Validate and apply it with:' >&2
  printf '  bash %q sync %q\n' "$directory/scripts/proxy.sh" "$directory/Caddyfile" >&2
fi
if [[ "$(<"$directory/compose.yaml")" != "$(<"$ROOT/proxy/compose.yaml")" ]]; then
  echo 'Kept the host proxy compose.yaml, which differs from this checkout. Review and copy it, then run proxy.sh validate and proxy.sh start.' >&2
fi
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
echo 'Host files prepared. Start and bootstrap the database (database.sh), configure the shared private S3 bucket folders and both service environments before starting the proxy.'
