#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"
mkdir -p projects/photo-contest/apps/web/.data
directory=$(mktemp -d "$repo_root/projects/photo-contest/apps/web/.data/containers-XXXXXX")
project="pc-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
revision=${GITHUB_SHA:-local}
# 이전 단독 배포 구성(로컬 PostgreSQL·자체 Caddy)으로 운영 이미지와 pg_dump 복원을 검사한다.
# 현재 운영(shared-instance)은 GF shared-instance-smoke.ts가 검사한다.
cp projects/photo-contest/deploy/compose.yaml "$directory/compose.yaml"
# 이전 구성의 라우팅은 그대로 검사하고 인증서 발급만 로컬 CA로 대체한다.
python3 - projects/photo-contest/deploy/Caddyfile "$directory/Caddyfile" <<'PY'
import pathlib, sys
source, destination = map(pathlib.Path, sys.argv[1:])
destination.write_text(source.read_text().replace('encode zstd gzip', 'encode zstd gzip\n\ttls internal', 1))
PY
node --env-file-if-exists=projects/photo-contest/.env --input-type=module - "$directory" "$revision" <<'JS'
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { s3TestEnvironment, verifyS3TestAccess } from './projects/photo-contest/packages/test-kit/src/s3.ts';
const [, , directory, revision] = process.argv;
const values = {
  ...s3TestEnvironment(),
  DOMAIN: 'localhost',
  WEB_ORIGIN: 'https://localhost:3382',
  ACME_EMAIL: 'smoke@example.test',
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  HTTP_PORT: '3381',
  HTTPS_PORT: '3382',
  API_IMAGE: `photo-contest-api:${revision}`,
  WEB_IMAGE: `photo-contest-web:${revision}`,
};
await verifyS3TestAccess(values);
writeFileSync(`${directory}/.env`, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', {mode: 0o600});
JS
compose() {
  docker compose --project-name "$project" --env-file "$directory/.env" \
    -f "$directory/compose.yaml" "$@"
}
cleanup() {
  local status=$?
  if [[ $status != 0 ]]; then compose logs --tail 80 api web caddy >&2 || true; fi
  node --input-type=module - "$directory/.env" <<'JS' || status=1
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { cleanupS3TestObjects } from './projects/photo-contest/packages/test-kit/src/s3.ts';
await cleanupS3TestObjects(parseEnv(readFileSync(process.argv[2], 'utf8')));
JS
  # 이 검증이 만든 프로젝트의 볼륨만 지운다.
  compose down --volumes --remove-orphans || true
  rm -f projects/photo-contest/apps/web/.data/deployment-smoke.json
  rm -rf "$directory"
  exit "$status"
}
trap cleanup EXIT
compose pull db caddy
compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose up -d --wait --wait-timeout 120 db
compose run --rm --no-deps migrate
compose up -d --wait --wait-timeout 180 api web caddy
node --input-type=module - "$directory" "$project" <<'JS'
import { writeFileSync } from 'node:fs';
const [, , directory, project] = process.argv;
writeFileSync('projects/photo-contest/apps/web/.data/deployment-smoke.json', JSON.stringify({directory, project}), {flag:'wx', mode:0o600});
JS
WEB_ORIGIN=https://localhost:3382 \
  yarn workspace @photo-contest/web test:deploy

# 실제 custom-format 백업을 별도 DB에 복원해 댓글까지 읽는다.
# shellcheck disable=SC2016
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$directory/backup.dump"
compose exec -T db createdb -U photo_contest restore_check
compose exec -T db pg_restore -U photo_contest -d restore_check --no-owner --no-acl <"$directory/backup.dump"
count=$(compose exec -T db psql -U photo_contest -d restore_check -Atc 'SELECT count(*) FROM "PostComment"')
[[ "$count" == 1 ]] || { printf '%s\n' '백업 복원 뒤 댓글이 일치하지 않습니다.' >&2; exit 1; }
