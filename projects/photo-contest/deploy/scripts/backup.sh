#!/usr/bin/env bash
set -euo pipefail
# shellcheck source-path=SCRIPTDIR
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ $# == 0 || ( $# == 1 && "$1" == --with-media ) ]] || fail '사용법: backup.sh [--with-media]'
require_root
lock_deployment
release_dir=$(current_release)
[[ -n "$release_dir" ]] || fail '배포된 릴리스가 없습니다.'
destination="$DEPLOY_ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-$(basename "$release_dir")-$$"

if [[ "${1:-}" == --with-media ]]; then
  [[ "$(setting STORAGE_BACKEND)" == local ]] || fail 'S3/R2 미디어는 버킷에서 별도로 백업합니다.'
  # DB와 로컬 파일 사이에 작성·삭제가 끼지 않도록 API만 잠깐 멈춘다.
  compose_at "$release_dir" stop -t 30 api
  trap 'compose_at "$release_dir" up -d --wait --wait-timeout 120 api >&2' EXIT
fi
backup_database "$release_dir" "$destination"
if [[ "${1:-}" == --with-media ]]; then
  compose_at "$release_dir" run --rm --no-deps --entrypoint tar api \
    -C /var/lib/photo-contest/media -czf - . >"$destination/media.tar.gz.partial"
  mv "$destination/media.tar.gz.partial" "$destination/media.tar.gz"
  openssl dgst -sha256 "$destination/media.tar.gz" >"$destination/media.sha256"
fi
printf '%s\n' "백업 완료: $destination"
