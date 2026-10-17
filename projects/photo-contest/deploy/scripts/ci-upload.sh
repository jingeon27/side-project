#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DEPLOY_HOST:?Set PHOTO_CONTEST_DEPLOY_HOST}"
: "${DEPLOY_USER:?Set PHOTO_CONTEST_DEPLOY_SSH_USER}"
: "${DEPLOY_SSH_KEY:?Set PHOTO_CONTEST_DEPLOY_SSH_KEY}"
: "${DEPLOY_KNOWN_HOSTS:?Set PHOTO_CONTEST_DEPLOY_SSH_KNOWN_HOSTS}"
: "${REGISTRY_TOKEN:?GitHub job token is required}"
: "${REGISTRY_USER:?GitHub actor is required}"
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.:-]*$ ]] || exit 1
[[ "$DEPLOY_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || exit 1
[[ "${DEPLOY_PORT:-22}" =~ ^[0-9]+$ ]] || exit 1
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" >"$temporary/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >"$temporary/known_hosts"
options=(-i "$temporary/key" -p "${DEPLOY_PORT:-22}" -o BatchMode=yes -o ConnectTimeout=15 \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temporary/known_hosts")
destination="$DEPLOY_USER@$DEPLOY_HOST"
tar -czf "$temporary/release.tar.gz" -C projects/photo-contest/deploy compose.yaml Caddyfile scripts
remote_dir="/opt/photo-contest/releases/$RELEASE_SHA"
printf -v remote_command 'mkdir -p %q && tar -xzf - -C %q' "$remote_dir" "$remote_dir"
# printf %q로 원격 인자를 이스케이프한 명령을 전달한다.
# shellcheck disable=SC2029
ssh "${options[@]}" "$destination" "$remote_command" <"$temporary/release.tar.gz"
# 이미지 주소도 remote shell에 전달되므로 허용한 문자·digest만 받는다.
[[ "$API_IMAGE" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || exit 1
[[ "$WEB_IMAGE" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || exit 1
[[ "$REGISTRY_USER" =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]] || exit 1
printf -v remote_command 'bash %q %q %q %q %q' "$remote_dir/scripts/receive.sh" "$RELEASE_SHA" "$API_IMAGE" "$WEB_IMAGE" "$REGISTRY_USER"
# shellcheck disable=SC2029
printf '%s\n' "$REGISTRY_TOKEN" | ssh "${options[@]}" "$destination" "$remote_command"
