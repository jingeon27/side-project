#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
export SIDE_DEPLOY_ROOT="$ROOT"
[[ "$ROOT" == /* && "$ROOT" != / && -f "$ROOT/.env" ]]
[[ -f "$ROOT/proxy/compose.yaml" && -f "$ROOT/proxy/Caddyfile" ]]
exec 9>"$ROOT/.host-operations.lock"
flock -x 9
compose() { docker compose --project-name "${SIDE_PROJECT_PREFIX:-side}-proxy" --env-file "$ROOT/.env" -f "$ROOT/proxy/compose.yaml" "$@"; }
compose config --quiet
python3 - "$ROOT/.env" <<'PY'
import pathlib, re, sys
e = dict(line.strip().split('=', 1) for line in pathlib.Path(sys.argv[1]).read_text().splitlines()
         if line.strip() and not line.lstrip().startswith('#'))
for key in ['GAME_FEEDBACK_DOMAIN', 'PHOTO_CONTEST_DOMAIN']:
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]+\.[a-z]{2,}', e.get(key, '')):
        raise SystemExit('Configure distinct public service domains.')
if e['GAME_FEEDBACK_DOMAIN'] == e['PHOTO_CONTEST_DOMAIN']:
    raise SystemExit('Services must use distinct domains.')
if e.get('GAME_FEEDBACK_S3_BUCKET') == e.get('PHOTO_CONTEST_S3_BUCKET'):
    raise SystemExit('Services must use distinct private S3 buckets.')
PY
for service in game-feedback photo-contest; do
  network="${SIDE_NETWORK_PREFIX:-side}-$service-edge"
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    docker network create --label dev.side.shared-instance="$ROOT" "$network" >/dev/null
  fi
  [[ "$(docker network inspect "$network" --format '{{index .Labels "dev.side.shared-instance"}}')" == "$ROOT" ]]
done
case "${1:-}" in
  start) compose up -d proxy ;;
  reload) compose exec -T proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile ;;
  validate) compose run --rm --no-deps -T proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile ;;
  *) echo 'Usage: proxy.sh start | reload | validate' >&2; exit 2 ;;
esac
