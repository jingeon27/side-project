#!/usr/bin/env bash
set -euo pipefail
umask 077

GF_DEPLOY_ROOT="${GF_DEPLOY_ROOT:-/srv/game-feedback}"
export GF_DEPLOY_ROOT
STACK_NAME="${GF_STACK_NAME:-game-feedback}"
RELEASE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
WAIT_SECONDS="${GF_WAIT_SECONDS:-180}"
[[ "$GF_DEPLOY_ROOT" == /* && "$GF_DEPLOY_ROOT" != / && "$STACK_NAME" =~ ^game-feedback[a-z0-9-]*$ ]]
[[ "$WAIT_SECONDS" =~ ^[0-9]{1,3}$ ]]
[[ -f "$GF_DEPLOY_ROOT/.env" ]]
chmod 600 "$GF_DEPLOY_ROOT/.env"
exec 9>"$GF_DEPLOY_ROOT/.operator.lock"
flock -x 9

compose() {
  docker compose --project-name "$STACK_NAME" --env-file "$GF_DEPLOY_ROOT/.env" --file "$RELEASE_DIR/compose.yaml" "$@"
}

valid_tag() { [[ "$1" =~ ^[a-f0-9]{40}$ ]]; }
load_tag() {
  [[ -f "$GF_DEPLOY_ROOT/.deployed-tag" ]]
  GF_IMAGE_TAG="$(cat "$GF_DEPLOY_ROOT/.deployed-tag")"
  valid_tag "$GF_IMAGE_TAG"
  export GF_IMAGE_TAG
}

check_ownership() {
  local volume owner
  for volume in database media; do
    if docker volume inspect "${STACK_NAME}_${volume}" >/dev/null 2>&1; then
      owner="$(docker volume inspect "${STACK_NAME}_${volume}" --format '{{ index .Labels "dev.side.game-feedback.root" }}')"
      [[ "$owner" == "$GF_DEPLOY_ROOT" ]] || { echo 'Refusing a volume owned by another deployment.' >&2; return 1; }
    fi
  done
}

validate() {
  check_ownership
  compose config --quiet
  # Parse only in memory; never print compose config, which contains credentials.
  compose config --format json | python3 -c '
import json, re, sys
c = json.load(sys.stdin)
e = c["services"]["db"]["environment"]
if not all(re.fullmatch(r"[a-f0-9]{64}", e.get(k, "")) for k in ["POSTGRES_PASSWORD", "GF_DB_PASSWORD"]):
    raise SystemExit("Generate independent 64-character hexadecimal database passwords.")
if e["POSTGRES_PASSWORD"] == e["GF_DB_PASSWORD"]:
    raise SystemExit("Database application and bootstrap passwords must differ.")
'
  compose run --rm --no-deps -T ops scripts/validate-production.mjs
  compose run --rm --no-deps -T --entrypoint caddy proxy validate --config /etc/caddy/Caddyfile --adapter caddyfile
}

backup() (
  local name temp_dir
  name="$(date -u +%Y%m%dT%H%M%SZ)-$(python3 -c 'import secrets; print(secrets.token_hex(4))')-${1:-$GF_IMAGE_TAG}"
  mkdir -p "$GF_DEPLOY_ROOT/backups"
  temp_dir="$(mktemp -d "$GF_DEPLOY_ROOT/backups/.incomplete-XXXXXXXX")"
  trap 'rm -rf -- "$temp_dir"' EXIT
  compose exec -T db pg_dump -U postgres -d game_feedback --no-owner --no-acl -Fc >"$temp_dir/database.dump"
  compose run --rm --no-deps -T --entrypoint tar ops -C /var/lib/game-feedback/media -czf - . >"$temp_dir/media.tar.gz"
  compose exec -T db pg_restore --list <"$temp_dir/database.dump" >/dev/null
  gzip -t "$temp_dir/media.tar.gz"
  chmod 700 "$temp_dir"
  chmod 600 "$temp_dir/database.dump" "$temp_dir/media.tar.gz"
  mv "$temp_dir" "$GF_DEPLOY_ROOT/backups/$name"
  compose run --rm --no-deps -T --user "$(id -u):$(id -g)" --volume "$GF_DEPLOY_ROOT/backups:/backups:ro" ops scripts/backup-upload.mjs "$name"
  printf 'Backup complete: %s\n' "$name"
  # Operator backups retain seven days; object GC retains deleted content for fourteen days.
  find "$GF_DEPLOY_ROOT/backups" -mindepth 2 -maxdepth 2 -type f -mtime +7 \( -name database.dump -o -name media.tar.gz \) -delete
  find "$GF_DEPLOY_ROOT/backups" -mindepth 1 -maxdepth 1 -type d -empty -name '20*T*Z-*' -delete
)

write_state() {
  printf '%s\n' "$GF_IMAGE_TAG" >"$GF_DEPLOY_ROOT/.deployed-tag.next"
  mv "$GF_DEPLOY_ROOT/.deployed-tag.next" "$GF_DEPLOY_ROOT/.deployed-tag"
  ln -sfn "$RELEASE_DIR" "$GF_DEPLOY_ROOT/current"
}

deploy() {
  local previous_tag previous_release
  GF_IMAGE_TAG="$1"
  valid_tag "$GF_IMAGE_TAG"
  export GF_IMAGE_TAG
  previous_tag="$(cat "$GF_DEPLOY_ROOT/.deployed-tag" 2>/dev/null || true)"
  previous_release="$(readlink -f "$GF_DEPLOY_ROOT/current" 2>/dev/null || true)"
  if [[ "${GF_DEPLOY_LOCAL_IMAGES:-0}" != 1 ]]; then compose pull api web ops proxy db; fi
  validate
  compose up -d --wait --wait-timeout "$WAIT_SECONDS" db
  if [[ -n "$previous_tag" ]]; then backup "$previous_tag"; fi
  # Keep the old application running if a migration fails. Never force a schema reset.
  compose run --rm --no-deps -T ops scripts/migrate.mjs
  if compose up -d --wait --wait-timeout "$WAIT_SECONDS" api web proxy; then
    if compose exec -T api node -e "fetch('http://127.0.0.1:4300/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      write_state
      echo "Deployment complete: $GF_IMAGE_TAG"
      return
    fi
  fi
  echo 'Deployment health check failed.' >&2
  if valid_tag "$previous_tag" && [[ -d "$previous_release" ]]; then
    GF_IMAGE_TAG="$previous_tag"
    RELEASE_DIR="$previous_release"
    export GF_IMAGE_TAG
    compose up -d --wait --wait-timeout "$WAIT_SECONDS" api web proxy
    echo 'Previous application images restored; database migrations remain forward-only.' >&2
  else
    compose stop api web proxy
  fi
  return 1
}

restore() {
  local directory
  directory="$1"
  GF_IMAGE_TAG="$2"
  valid_tag "$GF_IMAGE_TAG"
  export GF_IMAGE_TAG
  [[ ! -e "$GF_DEPLOY_ROOT/.deployed-tag" ]]
  if docker volume inspect "${STACK_NAME}_database" >/dev/null 2>&1; then
    echo 'Restore requires a new deployment with no existing database volume.' >&2
    return 1
  fi
  [[ -f "$directory/database.dump" && -f "$directory/media.tar.gz" ]]
  python3 - "$directory/media.tar.gz" <<'PY'
import re, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    if any(not ((m.isdir() and m.name in ['.', './objects', 'objects']) or
                (m.isfile() and re.fullmatch(r'(\./)?objects/[a-f0-9-]{36}', m.name))) for m in archive):
        raise SystemExit('Invalid media backup entries.')
PY
  validate
  compose up -d --wait --wait-timeout "$WAIT_SECONDS" db
  compose exec -T db pg_restore -U game_feedback -d game_feedback --no-owner --no-acl --single-transaction <"$directory/database.dump"
  compose run --rm --no-deps -T --entrypoint tar ops -C /var/lib/game-feedback/media --no-same-owner --no-same-permissions -xzf - <"$directory/media.tar.gz"
  echo 'Restored into the new stack. Deploy the matching image before accepting traffic.'
}

case "${1:-}" in
  deploy) [[ $# == 2 ]]; deploy "$2" ;;
  restore) [[ $# == 4 && "$4" == --new-stack ]]; restore "$2" "$3" ;;
  validate) [[ $# == 2 ]]; GF_IMAGE_TAG="$2"; export GF_IMAGE_TAG; valid_tag "$GF_IMAGE_TAG"; validate ;;
  backup) load_tag; backup ;;
  prune) load_tag; check_ownership; compose run --rm --no-deps -T ops scripts/maintenance.mjs ;;
  status) load_tag; check_ownership; compose ps ;;
  operator) load_tag; check_ownership; shift; compose run --rm --no-deps -T ops scripts/operator.mjs "$@" ;;
  *) echo 'Usage: ops.sh deploy <sha> | validate <sha> | backup | prune | status | operator <args> | restore <backup-directory> <sha> --new-stack' >&2; exit 2 ;;
esac
