#!/usr/bin/env bash
# CI only. Skip a deployment when a newer commit on the deploy branch changed this service's paths: that commit's
# own workflow run verifies and deploys the newer release. Unrelated commits never skip a verified release.
# Keep each list equal to the workflow's on.push.paths (test/deployment/ci-superseded.spec.ts checks this).
set -euo pipefail
SERVICE=${1:-}
case "$SERVICE" in
  photo-contest | game-feedback)
    paths=("projects/$SERVICE/**" 'packages/**' 'package.json' 'yarn.lock' 'scripts/check-migrations.mjs'
      '.yarnrc.yml' '.nvmrc' '.prettierrc.json' '.prettierignore' '.dockerignore'
      ".github/workflows/$SERVICE.yml" '.github/workflows/shared-instance.yml' 'deploy/shared-instance/**')
    ;;
  *)
    echo 'Usage: ci-superseded.sh <photo-contest|game-feedback> <branch | --paths>' >&2
    exit 2
    ;;
esac
if [[ "${2:-}" == --paths ]]; then
  printf '%s\n' "${paths[@]}"
  exit 0
fi
BRANCH=${2:-}
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ && "$BRANCH" != *..* ]]
[[ "${RELEASE_SHA:-}" =~ ^[a-f0-9]{40}$ ]]
: "${GITHUB_OUTPUT:?Run inside GitHub Actions}"
# actions/checkout with fetch-depth 0 fetched the branch after this job left the concurrency queue.
head=$(git rev-parse --verify "refs/remotes/origin/$BRANCH^{commit}")
reason=
if ! git merge-base --is-ancestor "$RELEASE_SHA" "$head"; then
  reason="$RELEASE_SHA is no longer on $BRANCH (now $head)."
else
  newer=$(git log --format=%H "$RELEASE_SHA..$head" -- "${paths[@]/#/:(glob)}")
  if [[ -n "$newer" ]]; then
    reason="$(wc -l <<<"$newer" | tr -d ' ') newer commit(s) on $BRANCH changed $SERVICE paths (newest ${newer%%$'\n'*}). That workflow run deploys the newer release."
  fi
fi
if [[ -z "$reason" ]]; then
  echo 'deploy=true' >>"$GITHUB_OUTPUT"
  echo "No newer $SERVICE change on $BRANCH; deploying $RELEASE_SHA."
  exit 0
fi
echo 'deploy=false' >>"$GITHUB_OUTPUT"
echo "::notice title=$SERVICE deployment skipped::$reason"
printf '### %s deployment skipped\n\n%s\n' "$SERVICE" "$reason" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
