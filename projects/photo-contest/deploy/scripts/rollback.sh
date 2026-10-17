#!/usr/bin/env bash
set -euo pipefail
# shellcheck source-path=SCRIPTDIR
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_root
lock_deployment
validate_settings
[[ -L "$DEPLOY_ROOT/previous" ]] || fail '복구할 이전 릴리스가 없습니다.'
target=$(readlink "$DEPLOY_ROOT/previous")
current=$(current_release)
[[ -n "$current" ]] || fail '현재 릴리스가 없습니다.'
validate_release "$(basename "$target")"
if ! activate_release "$target"; then
  activate_release "$current" || fail '이전 릴리스와 현재 릴리스 모두 기동하지 못했습니다.'
  fail '복구 대상이 정상 기동하지 않아 현재 릴리스를 유지했습니다.'
fi
ln -sfn "$current" "$DEPLOY_ROOT/previous"
ln -sfn "$target" "$DEPLOY_ROOT/current"
printf '%s\n' "앱 이미지 복구 완료: $(basename "$target"). DB 스키마는 변경하지 않았습니다."
