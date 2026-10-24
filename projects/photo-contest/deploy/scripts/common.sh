#!/usr/bin/env bash
set -euo pipefail
umask 077

DEPLOY_ROOT=${PHOTO_CONTEST_DEPLOY_ROOT:-/opt/photo-contest}
COMPOSE_PROJECT=${PHOTO_CONTEST_COMPOSE_PROJECT:-photo-contest}

fail() { printf '%s\n' "$*" >&2; exit 1; }

require_root() {
  [[ -f "$DEPLOY_ROOT/.env" ]] || fail '운영 .env를 먼저 준비하세요.'
  mkdir -p "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/backups"
}

lock_deployment() {
  exec 9>"$DEPLOY_ROOT/.deploy.lock"
  flock -n 9 || fail '다른 배포·백업·복구 작업이 실행 중입니다.'
}

setting() {
  sed -n "s/^${1}=//p" "$DEPLOY_ROOT/.env" | tail -n 1
}

validate_settings() {
  local domain origin password endpoint key
  domain=$(setting DOMAIN)
  origin=$(setting WEB_ORIGIN)
  password=$(setting POSTGRES_PASSWORD)
  endpoint=$(setting S3_ENDPOINT)
  [[ "$domain" =~ ^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$ ]] || fail 'DOMAIN에 공개 도메인을 지정하세요.'
  [[ "$origin" == "https://$domain" ]] || fail 'WEB_ORIGIN은 https://DOMAIN과 같아야 합니다.'
  [[ "$password" =~ ^[a-f0-9]{64}$ ]] || fail 'POSTGRES_PASSWORD는 openssl rand -hex 32로 생성하세요.'
  [[ -n "$(setting ACME_EMAIL)" ]] || fail 'ACME_EMAIL이 필요합니다.'
  # 미디어는 비공개 버킷에만 있고 브라우저가 서명 URL로 직접 접속한다.
  for key in S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
    [[ -n "$(setting "$key")" ]] || fail "$key 설정이 필요합니다."
  done
  [[ -z "$endpoint" || "$endpoint" == https://* ]] || fail 'S3_ENDPOINT는 비우거나 https:// 주소여야 합니다.'
}

validate_release() {
  local revision=$1
  [[ "$revision" =~ ^[a-f0-9]{40}$ ]] || fail '릴리스에는 전체 커밋 SHA가 필요합니다.'
  [[ -f "$DEPLOY_ROOT/releases/$revision/compose.yaml" ]] || fail '릴리스 Compose가 없습니다.'
}

compose_at() {
  local release_dir=$1
  shift
  docker compose --project-name "$COMPOSE_PROJECT" \
    --env-file "$DEPLOY_ROOT/.env" --env-file "$release_dir/.release.env" \
    --project-directory "$release_dir" -f "$release_dir/compose.yaml" "$@"
}

current_release() {
  [[ -L "$DEPLOY_ROOT/current" ]] || return 0
  readlink "$DEPLOY_ROOT/current"
}

wait_public_health() {
  local attempt origin
  origin=$(setting WEB_ORIGIN)
  for ((attempt=0; attempt<30; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "$origin/backend/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  printf '%s\n' '공개 HTTPS 헬스 체크에 실패했습니다.' >&2
  return 1
}

activate_release() {
  local release_dir=$1
  compose_at "$release_dir" up -d --no-deps --pull never --wait --wait-timeout 120 api web caddy || return 1
  wait_public_health || return 1
}

backup_database() {
  local release_dir=$1 destination=$2
  mkdir -p "$destination"
  # 비밀번호를 호스트 명령 인자에 넣지 않고 컨테이너의 DB 설정을 읽는다.
  # shellcheck disable=SC2016
  compose_at "$release_dir" exec -T db sh -c \
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
    >"$destination/database.dump.partial"
  [[ -s "$destination/database.dump.partial" ]] || fail '빈 DB 백업입니다.'
  mv "$destination/database.dump.partial" "$destination/database.dump"
  openssl dgst -sha256 "$destination/database.dump" >"$destination/database.sha256"
}
