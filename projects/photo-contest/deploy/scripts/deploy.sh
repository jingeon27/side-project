#!/usr/bin/env bash
set -euo pipefail
# shellcheck source-path=SCRIPTDIR
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ $# == 3 ]] || fail '사용법: deploy.sh COMMIT_SHA API_IMAGE@sha256:DIGEST WEB_IMAGE@sha256:DIGEST'
revision=$1
api_image=$2
web_image=$3
[[ "$api_image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*-photo-contest-api@sha256:[a-f0-9]{64}$ ]] || fail 'API 이미지는 GHCR digest로 고정해야 합니다.'
[[ "$web_image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*-photo-contest-web@sha256:[a-f0-9]{64}$ ]] || fail '웹 이미지는 GHCR digest로 고정해야 합니다.'
[[ "${api_image%-api@*}" == "${web_image%-web@*}" ]] || fail '웹과 API는 같은 저장소의 이미지여야 합니다.'
require_root
lock_deployment
validate_settings
validate_release "$revision"
release_dir="$DEPLOY_ROOT/releases/$revision"
previous=$(current_release)
if [[ "$previous" == "$release_dir" ]]; then
  wait_public_health
  printf '%s\n' "이미 배포된 릴리스입니다: $revision"
  exit 0
fi
printf 'RELEASE_SHA=%s\nAPI_IMAGE=%s\nWEB_IMAGE=%s\n' "$revision" "$api_image" "$web_image" >"$release_dir/.release.env"
compose_at "$release_dir" config --quiet
# 새 이미지를 먼저 모두 받아 기존 앱이 실행 중인 시간을 유지한다.
compose_at "$release_dir" pull db api web caddy
compose_at "$release_dir" up -d --wait --wait-timeout 120 db
snapshot="$DEPLOY_ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-before-$revision-$$"
backup_database "$release_dir" "$snapshot"
# 실패한 마이그레이션은 앱을 교체하지 않는다. DB를 자동으로 되돌리지는 않는다.
compose_at "$release_dir" run --rm --no-deps migrate

if ! activate_release "$release_dir"; then
  if [[ -n "$previous" ]]; then
    if activate_release "$previous"; then
      printf '%s\n' '새 릴리스가 실패해 이전 앱 이미지로 복구했습니다.' >&2
      exit 1
    fi
    fail '이전 앱 복구도 실패했습니다. DB·미디어·백업은 보존했습니다.'
  fi
  compose_at "$release_dir" stop api web caddy
  fail '첫 배포에 실패했습니다. DB·미디어·백업은 보존했습니다.'
fi
if [[ -n "$previous" ]]; then
  ln -sfn "$previous" "$DEPLOY_ROOT/previous"
fi
ln -sfn "$release_dir" "$DEPLOY_ROOT/current"
printf '%s\n' "배포 완료: $revision"
