#!/usr/bin/env bash
# Detached deployment worker started by receive.sh. Output goes to the job log; the exit status is written last.
set +x
set -uo pipefail
umask 077
trap '' HUP PIPE
[[ $# == 6 && "$1" =~ ^(game-feedback|photo-contest)$ && "$2" =~ ^[a-f0-9]{40}$ && -d "$5" ]] || exit 2
configuration=$6
[[ "$configuration" == "${SIDE_DEPLOY_ROOT:-/srv/side-project}/services/$1/.env-requests/"* && "$(basename "$configuration")" =~ ^request-[A-Za-z0-9]{8}$ ]] || exit 2
trap 'rm -f "$configuration"' EXIT
job=$5
printf '%s\n' "$$" >"$job/pid"
printf 'Deployment %s started at %s\n' "${job##*/}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIDE_LOCAL_IMAGES=1 SIDE_DEPLOY_REQUEST=${job##*/} \
  bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/service.sh" "$1" deploy "$2" "$3" "$4" "$configuration"
status=$?
printf 'Deployment %s finished at %s with status %s\n' "${job##*/}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status"
printf '%s\n' "$status" >"$job/status.tmp"
mv "$job/status.tmp" "$job/status"
exit "$status"
