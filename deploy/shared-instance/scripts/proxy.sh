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
keys = ['GAME_FEEDBACK_DOMAIN', 'GAME_FEEDBACK_API_DOMAIN', 'PHOTO_CONTEST_DOMAIN', 'PHOTO_CONTEST_API_DOMAIN']
for key in keys:
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]+\.[a-z]{2,}', e.get(key, '')):
        raise SystemExit('Configure distinct public service domains.')
if len({e[key] for key in keys}) != len(keys):
    raise SystemExit('Services and APIs must use distinct domains.')
for service in ['GAME_FEEDBACK', 'PHOTO_CONTEST']:
    if e[f'{service}_API_DOMAIN'] != f"api.{e[f'{service}_DOMAIN']}":
        raise SystemExit('API domains must use the api.<service-domain> form.')
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
validate() { compose run --rm --no-deps -T proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; }
reload() { compose exec -T proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; }
case "${1:-}" in
  start) compose up -d proxy ;;
  reload) reload ;;
  validate) validate ;;
  sync)
    # Apply a release's Caddyfile in place: the running container's bind mount keeps the original inode.
    [[ $# == 2 && -f "$2" ]] || { echo 'Usage: proxy.sh sync <release Caddyfile>' >&2; exit 2; }
    cp "$ROOT/proxy/Caddyfile" "$ROOT/proxy/Caddyfile.previous"
    cat "$2" >"$ROOT/proxy/Caddyfile"
    if ! validate; then
      cat "$ROOT/proxy/Caddyfile.previous" >"$ROOT/proxy/Caddyfile"
      echo 'The new Caddyfile is invalid; the previous file was restored.' >&2
      exit 1
    fi
    reload
    ;;
  *) echo 'Usage: proxy.sh start | reload | validate | sync <release Caddyfile>' >&2; exit 2 ;;
esac
