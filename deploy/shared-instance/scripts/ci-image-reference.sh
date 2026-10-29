#!/usr/bin/env bash
set -euo pipefail

image=${1:-}
[[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+:[a-f0-9]{40}$ ]] || {
  echo 'Expected a GHCR image tagged with the release commit.' >&2
  exit 2
}
repository=${image%:*}
digests=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image")
reference=''
while IFS= read -r candidate; do
  [[ "$candidate" == "$repository@sha256:"* ]] || continue
  digest=${candidate#"$repository@sha256:"}
  [[ "$digest" =~ ^[a-f0-9]{64}$ ]] || continue
  [[ -z "$reference" || "$reference" == "$candidate" ]] || {
    echo 'More than one digest matches the published GHCR repository.' >&2
    exit 2
  }
  reference=$candidate
done <<<"$digests"
[[ -n "$reference" ]] || {
  echo 'No digest matches the published GHCR repository.' >&2
  exit 2
}
printf '%s\n' "$reference"
