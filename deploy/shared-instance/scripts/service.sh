#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
SERVICE=${1:-}
ACTION=${2:-}
[[ "$ROOT" == /* && "$ROOT" != / ]]
[[ "$SERVICE" == game-feedback || "$SERVICE" == photo-contest ]]
shift 2
export SIDE_DEPLOY_ROOT="$ROOT"
SERVICE_ROOT="$ROOT/services/$SERVICE"
[[ -f "$ROOT/.env" && -f "$SERVICE_ROOT/.env" && -s "$ROOT/certs/rds-ca.pem" ]]
chmod 600 "$ROOT/.env" "$SERVICE_ROOT/.env"
exec 9>"$ROOT/.host-operations.lock"
flock -x 9
PROJECT="${SIDE_PROJECT_PREFIX:-side}-$SERVICE"
WAIT=${SIDE_WAIT_SECONDS:-180}
[[ "$WAIT" =~ ^[1-9][0-9]{0,2}$ && "$PROJECT" =~ ^[a-z0-9-]+$ ]]

release() {
  [[ "$1" =~ ^[a-f0-9]{40}$ && -f "$SERVICE_ROOT/releases/$1/compose.yaml" ]]
  printf '%s/releases/%s' "$SERVICE_ROOT" "$1"
}
compose() {
  local directory=$1
  shift
  docker compose --project-name "$PROJECT" --env-file "$ROOT/.env" --env-file "$SERVICE_ROOT/.env" \
    --env-file "$directory/.release.env" -f "$directory/compose.yaml" "$@"
}
activate() {
  local directory=$1
  compose "$directory" up -d --no-deps --pull never --wait --wait-timeout "$WAIT" api web || return 1
  compose "$directory" exec -T web node -e \
    "fetch('http://127.0.0.1:'+process.env.PORT+'/_health/live',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}
previous() {
  local path
  path=$(readlink "$SERVICE_ROOT/$1" 2>/dev/null || true)
  [[ -z "$path" ]] && return 0
  [[ "$path" == "$SERVICE_ROOT/releases/"* && "$(release "$(basename "$path")")" == "$path" ]]
  printf '%s' "$path"
}
mark() {
  local next=$1 old=$2
  if [[ -n "$old" && "$old" != "$next" ]]; then ln -sfn "$old" "$SERVICE_ROOT/previous"; fi
  ln -sfn "$next" "$SERVICE_ROOT/current"
}

if [[ "$ACTION" == deploy ]]; then
  [[ $# == 3 ]]
  directory=$(release "$1")
  api=$2 web=$3
  [[ "$api" =~ ^ghcr\.io/[a-z0-9._/-]+-$SERVICE-api@sha256:[a-f0-9]{64}$ ]]
  [[ "$web" =~ ^ghcr\.io/[a-z0-9._/-]+-$SERVICE-web@sha256:[a-f0-9]{64}$ ]]
  [[ "${api%-api@*}" == "${web%-web@*}" ]]
  old=$(previous current)
  prior=$(previous previous)
  if [[ "$directory" == "$old" || "$directory" == "$prior" ]]; then
    expected=$(printf 'RELEASE_SHA=%s\nAPI_IMAGE=%s\nWEB_IMAGE=%s\n' "$1" "$api" "$web")
    [[ -f "$directory/.release.env" && "$(cat "$directory/.release.env")" == "$expected" ]] || {
      echo 'Refusing to overwrite image metadata for a protected release.' >&2
      exit 1
    }
  fi
  printf 'RELEASE_SHA=%s\nAPI_IMAGE=%s\nWEB_IMAGE=%s\n' "$1" "$api" "$web" >"$directory/.release.env"
  compose "$directory" config --quiet
  if [[ "${SIDE_LOCAL_IMAGES:-0}" != 1 ]]; then compose "$directory" pull api web ops migrate; fi
  # Runtime checks never receive the DDL credential. The migration container is one-shot.
  compose "$directory" run --rm --no-deps -T ops scripts/verify-services.mjs
  python3 "$directory/host/rds-receipt.py" "$ROOT" "$directory/rds-pitr.json"
  compose "$directory" run --rm --no-deps -T migrate
  if activate "$directory"; then
    mark "$directory" "$old"
    printf 'Deployment complete: %s %s\n' "$SERVICE" "$1"
    exit 0
  fi
  if [[ -n "$old" ]]; then
    activate "$old"
    echo 'Previous application images restored. Database migrations remain forward-only.' >&2
    exit 1
  fi
  compose "$directory" stop api web
  echo 'First deployment failed; external RDS/S3 and the shared proxy are preserved.' >&2
  exit 1
fi
current=$(previous current)
[[ -n "$current" ]]
case "$ACTION" in
  rollback)
    [[ $# == 0 ]]
    target=$(previous previous)
    [[ -n "$target" ]]
    if activate "$target"; then mark "$target" "$current"; exit 0; fi
    activate "$current"
    exit 1 ;;
  status) compose "$current" ps ;;
  operator)
    [[ "$SERVICE" == game-feedback ]]
    compose "$current" run --rm --no-deps -T ops scripts/operator.mjs "$@" ;;
  prune)
    [[ "$SERVICE" == game-feedback ]]
    compose "$current" run --rm --no-deps -T ops scripts/maintenance.mjs ;;
  *) echo 'Usage: service.sh <game-feedback|photo-contest> deploy <sha> <api-digest> <web-digest> | rollback | status | operator <args> | prune' >&2; exit 2 ;;
esac
