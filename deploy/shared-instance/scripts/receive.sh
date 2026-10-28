#!/usr/bin/env bash
# Runs over SSH. Pulls the verified digests while the short-lived registry token is still valid, then hands the
# deployment to a detached worker so a cancelled runner or a dropped connection cannot stop it halfway.
set +x
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
[[ $# == 5 && "$1" =~ ^(game-feedback|photo-contest)$ && "$2" =~ ^[a-f0-9]{40}$ ]]
[[ "$3" =~ ^ghcr\.io/[a-z0-9._/-]+-$1-api@sha256:[a-f0-9]{64}$ ]]
[[ "$4" =~ ^ghcr\.io/[a-z0-9._/-]+-$1-web@sha256:[a-f0-9]{64}$ ]]
[[ "$5" =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]]
[[ "$ROOT" == /* && "$ROOT" != / ]]
host=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
release="$ROOT/services/$1/releases/$2"
[[ "$host" == "$release/host" ]]
command -v setsid >/dev/null
IFS= read -r registry_token
[[ -n "$registry_token" ]]
IFS= read -r environment_bytes
[[ "$environment_bytes" =~ ^[1-9][0-9]{0,5}$ && "$environment_bytes" -le 65536 ]] || { echo 'Invalid SERVICE_ENV transfer length.' >&2; exit 2; }
mkdir -p "$ROOT/services/$1/.env-requests"
configuration=$(mktemp "$ROOT/services/$1/.env-requests/request-XXXXXXXX")
handed_off=0
docker_configuration=''
cleanup() {
  [[ -z "$docker_configuration" ]] || rm -rf "$docker_configuration"
  if [[ "$handed_off" != 1 ]]; then rm -f "$configuration"; fi
}
trap cleanup EXIT
# 바이트 길이를 검사해 중간에 끊긴 전송을 설정으로 적용하지 않는다.
head -c "$((environment_bytes + 1))" >"$configuration"
[[ "$(wc -c <"$configuration" | tr -d '[:space:]')" == "$environment_bytes" ]] || { echo 'Incomplete SERVICE_ENV transfer.' >&2; exit 2; }
if ! python3 -c 'import pathlib, re, sys; b=pathlib.Path(sys.argv[1]).read_bytes(); s=b.decode("utf-8"); assert b"\x00" not in b and re.search(r"(?m)^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=", s)' "$configuration" >/dev/null 2>&1; then
  echo 'SERVICE_ENV must be a UTF-8 dotenv file.' >&2
  exit 2
fi
export DOCKER_CONFIG
docker_configuration=$(mktemp -d)
DOCKER_CONFIG=$docker_configuration
printf '%s\n' "$registry_token" | docker login ghcr.io --username "$5" --password-stdin >&2
unset registry_token
docker pull --quiet "$3" >&2
docker pull --quiet "$4" >&2
rm -rf "$DOCKER_CONFIG"

mkdir -p "$release/.deploy"
job=$(mktemp -d "$release/.deploy/run-XXXXXXXX")
# The newest request wins if an older worker is still waiting for the host lock.
printf '%s\n' "${job##*/}" >"$ROOT/services/$1/.deploy-request.tmp"
mv "$ROOT/services/$1/.deploy-request.tmp" "$ROOT/services/$1/.deploy-request"
setsid nohup bash "$host/deploy-job.sh" "$1" "$2" "$3" "$4" "$job" "$configuration" >"$job/log" 2>&1 </dev/null &
handed_off=1
for _ in {1..50}; do
  [[ -s "$job/pid" ]] && break
  sleep 0.2
done
[[ -s "$job/pid" ]] || {
  echo 'The detached deployment worker did not start.' >&2
  cat "$job/log" >&2
  exit 1
}
printf '%s\n' "${job##*/}"
