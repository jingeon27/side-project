#!/usr/bin/env bash
set -euo pipefail
umask 077
# GitHub ubuntu-latest(x86_64)에서만 사용한다. 공식 버전과 해시를 함께 고정한다.
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]]
: "${GITHUB_PATH:?Set GitHub PATH file}"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
  https://s3.amazonaws.com/session-manager-downloads/plugin/1.2.896.0/ubuntu_64bit/session-manager-plugin.deb \
  -o "$temporary/plugin.deb"
printf '%s  %s\n' 53f51fcc67314a4bf85888a38a3967cd41f8d0f28a60a9469a63acf935ba713e "$temporary/plugin.deb" | sha256sum --check --status
directory="${RUNNER_TEMP:?Set runner temp}/side-session-manager"
mkdir -p "$directory"
dpkg-deb --extract "$temporary/plugin.deb" "$directory"
binary="$directory/usr/local/sessionmanagerplugin/bin/session-manager-plugin"
"$binary" --version
printf '%s\n' "$(dirname "$binary")" >>"$GITHUB_PATH"
