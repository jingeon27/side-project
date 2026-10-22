#!/usr/bin/env bash
# Runs over SSH. Pulls the verified digests while the short-lived registry token is still valid, then hands the
# deployment to a detached worker so a cancelled runner or a dropped connection cannot stop it halfway.
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
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
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
setsid nohup bash "$host/deploy-job.sh" "$1" "$2" "$3" "$4" "$job" >"$job/log" 2>&1 </dev/null &
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
