#!/usr/bin/env bash
set -euo pipefail
# shellcheck source-path=SCRIPTDIR
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# 사진·동영상은 서버가 아니라 비공개 버킷에 있으므로 버킷의 버전 관리·수명 주기로 따로 보존한다.
[[ $# == 0 ]] || fail '사용법: backup.sh'
require_root
lock_deployment
release_dir=$(current_release)
[[ -n "$release_dir" ]] || fail '배포된 릴리스가 없습니다.'
destination="$DEPLOY_ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-$(basename "$release_dir")-$$"

backup_database "$release_dir" "$destination"
printf '%s\n' "백업 완료: $destination"
