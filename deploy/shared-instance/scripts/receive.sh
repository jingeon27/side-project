#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# == 5 && "$1" =~ ^(game-feedback|photo-contest)$ && "$2" =~ ^[a-f0-9]{40}$ ]]
[[ "$5" =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]]
IFS= read -r registry_token
[[ -n "$registry_token" ]]
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s\n' "$registry_token" | docker login ghcr.io --username "$5" --password-stdin
unset registry_token
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/service.sh" "$1" deploy "$2" "$3" "$4"
