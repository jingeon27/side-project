#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"
mkdir -p projects/photo-contest/apps/web/.data
directory=$(mktemp -d "$repo_root/projects/photo-contest/apps/web/.data/containers-XXXXXX")
project="pc-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
revision=${GITHUB_SHA:-local}
cp projects/photo-contest/deploy/compose.yaml "$directory/compose.yaml"
# 운영 라우팅은 그대로 검사하고 인증서 발급만 로컬 CA로 대체한다.
sed '/encode zstd gzip/a\
\ttls internal
' projects/photo-contest/deploy/Caddyfile >"$directory/Caddyfile"
cat >"$directory/.env" <<EOF
DOMAIN=localhost
WEB_ORIGIN=https://localhost:3382
ACME_EMAIL=smoke@example.test
POSTGRES_PASSWORD=$(openssl rand -hex 32)
STORAGE_BACKEND=local
HTTP_PORT=3381
HTTPS_PORT=3382
API_IMAGE=photo-contest-api:$revision
WEB_IMAGE=photo-contest-web:$revision
EOF
compose() { docker compose --project-name "$project" --env-file "$directory/.env" -f "$directory/compose.yaml" "$@"; }
cleanup() {
  local status=$?
  if [[ $status != 0 ]]; then compose logs --tail 80 api web caddy >&2 || true; fi
  # 이 검증이 만든 프로젝트의 볼륨만 지운다.
  compose down --volumes --remove-orphans || true
  rm -rf "$directory"
  exit "$status"
}
trap cleanup EXIT
compose pull db caddy
compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose up -d --wait --wait-timeout 120 db
compose run --rm --no-deps migrate
compose up -d --wait --wait-timeout 180 api web caddy
DEPLOY_SMOKE_ORIGIN=https://localhost:3382 SMOKE_COMPOSE_DIR="$directory" SMOKE_COMPOSE_PROJECT="$project" \
  corepack yarn workspace @photo-contest/web test:deploy

# 실제 custom-format 백업을 별도 DB에 복원해 댓글까지 읽는다.
# shellcheck disable=SC2016
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$directory/backup.dump"
compose exec -T db createdb -U photo_contest restore_check
compose exec -T db pg_restore -U photo_contest -d restore_check --no-owner --no-acl <"$directory/backup.dump"
count=$(compose exec -T db psql -U photo_contest -d restore_check -Atc 'SELECT count(*) FROM "PostComment"')
[[ "$count" == 1 ]] || { printf '%s\n' '백업 복원 뒤 댓글이 일치하지 않습니다.' >&2; exit 1; }
