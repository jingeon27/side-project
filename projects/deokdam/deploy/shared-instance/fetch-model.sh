#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  echo 'Usage: fetch-model.sh <model directory>' >&2
  exit 2
fi

directory=$1
name=Qwen3.5-0.8B-Q4_0.gguf
revision=1c0b5292de5ccd62235595d1557c0d70d46c3d9d
checksum=57d1997790d1744fba5b40a7317df71ea5e2acee28c47e78f0cce39c0703f8cf
model="$directory/$name"

verified() {
  local actual
  actual=$(openssl dgst -sha256 -r "$1") || return 1
  [[ "${actual%% *}" == "$checksum" ]]
}

mkdir -p "$directory"
if [[ -f "$model" ]] && verified "$model"; then
  printf 'Verified %s\n' "$model"
  exit 0
fi

download=$(mktemp "$directory/.$name.XXXXXX")
trap 'rm -f -- "$download"' EXIT
curl --proto '=https' --fail --location --silent --show-error --retry 3 --max-time 300 \
  --output "$download" "https://huggingface.co/ggml-org/Qwen3.5-0.8B-GGUF/resolve/$revision/$name?download=true"
if ! verified "$download"; then
  echo "Checksum mismatch for $name" >&2
  exit 1
fi
chmod 644 "$download"
mv -f -- "$download" "$model"
printf 'Verified %s\n' "$model"
