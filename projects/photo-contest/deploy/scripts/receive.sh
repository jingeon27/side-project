#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ $# == 4 ]] || { printf '%s\n' '릴리스·이미지·레지스트리 사용자 정보가 필요합니다.' >&2; exit 1; }
# CI 작업 토큰은 stdin으로만 받고 임시 Docker 설정은 배포가 끝나면 지운다.
IFS= read -r registry_token
[[ -n "$registry_token" ]] || { printf '%s\n' 'GHCR 읽기 토큰이 없습니다.' >&2; exit 1; }
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s\n' "$registry_token" | docker login ghcr.io --username "$4" --password-stdin
unset registry_token
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy.sh" "$1" "$2" "$3"
