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
python3 - projects/photo-contest/deploy/Caddyfile "$directory/Caddyfile" <<'PY'
import pathlib, sys
source, destination = map(pathlib.Path, sys.argv[1:])
destination.write_text(source.read_text().replace('encode zstd gzip', 'encode zstd gzip\n\ttls internal', 1))
PY
# 운영 Compose는 미디어 volume 없이 S3 호환 버킷만 쓴다. 검증은 test-kit S3 대역을 같은 네트워크에 붙인다.
# 브라우저(호스트)와 API 컨테이너가 같은 서명 host로 접속하도록 storage.localhost를 쓴다.
cat >"$directory/.env" <<EOF
DOMAIN=localhost
WEB_ORIGIN=https://localhost:3382
ACME_EMAIL=smoke@example.test
POSTGRES_PASSWORD=$(openssl rand -hex 32)
S3_BUCKET=photo-contest-smoke
S3_ENDPOINT=http://storage.localhost:3383
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=photo-contest-smoke
AWS_SECRET_ACCESS_KEY=$(openssl rand -hex 32)
HTTP_PORT=3381
HTTPS_PORT=3382
API_IMAGE=photo-contest-api:$revision
WEB_IMAGE=photo-contest-web:$revision
EOF
cat >"$directory/storage.yaml" <<EOF
services:
  storage:
    image: node:24-bookworm-slim
    command: ['node', '--disable-warning=ExperimentalWarning', '/fixture/bin/fake-s3.mjs']
    environment:
      S3_FAKE_HOST: 0.0.0.0
      S3_FAKE_PORT: '3383'
      S3_FAKE_DIR: /data
      S3_FAKE_CORS_ORIGINS: https://localhost:3382
      S3_BUCKET: \${S3_BUCKET}
      S3_REGION: \${S3_REGION}
      AWS_ACCESS_KEY_ID: \${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: \${AWS_SECRET_ACCESS_KEY}
    volumes:
      - $repo_root/projects/photo-contest/packages/test-kit:/fixture:ro
    tmpfs: ['/data']
    ports: ['127.0.0.1:3383:3383']
    networks:
      app:
        aliases: [storage.localhost]
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3383/').then(()=>process.exit(0)).catch(()=>process.exit(1))"]
      interval: 2s
      timeout: 5s
      retries: 30
  api:
    depends_on:
      storage: { condition: service_healthy }
EOF
compose() {
  docker compose --project-name "$project" --env-file "$directory/.env" \
    -f "$directory/compose.yaml" -f "$directory/storage.yaml" "$@"
}
cleanup() {
  local status=$?
  if [[ $status != 0 ]]; then compose logs --tail 80 api web caddy storage >&2 || true; fi
  # 이 검증이 만든 프로젝트의 볼륨만 지운다.
  compose down --volumes --remove-orphans || true
  rm -rf "$directory"
  exit "$status"
}
trap cleanup EXIT
compose pull db caddy storage
compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose up -d --wait --wait-timeout 120 db storage
compose run --rm --no-deps migrate
compose up -d --wait --wait-timeout 180 api web caddy
DEPLOY_SMOKE_ORIGIN=https://localhost:3382 DEPLOY_SMOKE_STORAGE=http://storage.localhost:3383 \
  SMOKE_COMPOSE_DIR="$directory" SMOKE_COMPOSE_PROJECT="$project" SMOKE_COMPOSE_OVERRIDE="$directory/storage.yaml" \
  corepack yarn workspace @photo-contest/web test:deploy

# 실제 custom-format 백업을 별도 DB에 복원해 댓글까지 읽는다.
# shellcheck disable=SC2016
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$directory/backup.dump"
compose exec -T db createdb -U photo_contest restore_check
compose exec -T db pg_restore -U photo_contest -d restore_check --no-owner --no-acl <"$directory/backup.dump"
count=$(compose exec -T db psql -U photo_contest -d restore_check -Atc 'SELECT count(*) FROM "PostComment"')
[[ "$count" == 1 ]] || { printf '%s\n' '백업 복원 뒤 댓글이 일치하지 않습니다.' >&2; exit 1; }
