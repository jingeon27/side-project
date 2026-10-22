#!/usr/bin/env bash
# CI polls a detached deployment with this script: it prints the log bytes after OFFSET and reports the state in
# its exit code (0 succeeded, 3 still running, 4 failed). Any other code means the poll itself failed.
set -euo pipefail
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
[[ $# == 4 && "$1" =~ ^(game-feedback|photo-contest)$ && "$2" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "$3" =~ ^run-[A-Za-z0-9]{8}$ && "$4" =~ ^[0-9]{1,12}$ ]] || exit 2
job="$ROOT/services/$1/releases/$2/.deploy/$3"
[[ -f "$job/log" ]] || exit 2
state=$(cat "$job/status" 2>/dev/null || true)
pid=$(cat "$job/pid" 2>/dev/null || true)
if [[ -z "$state" ]] && ! { [[ "$pid" =~ ^[1-9][0-9]*$ ]] && kill -0 "$pid" 2>/dev/null; }; then
  # The worker may have written its status between the two reads.
  state=$(cat "$job/status" 2>/dev/null || true)
  [[ -n "$state" ]] || state=lost
fi
tail -c "+$(($4 + 1))" "$job/log"
case "$state" in
  '') exit 3 ;;
  0) exit 0 ;;
  lost)
    echo 'The deployment worker stopped without recording a status.' >&2
    exit 4
    ;;
  *) exit 4 ;;
esac
