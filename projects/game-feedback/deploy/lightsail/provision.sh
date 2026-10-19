#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 ]] || { echo 'Usage: provision.sh <existing-lightsail-ssh-key-pair-name>' >&2; exit 2; }
directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
blueprint="$(aws lightsail get-blueprints --region ap-northeast-2 --output json | python3 -c '
import json, sys
items=[b["blueprintId"] for b in json.load(sys.stdin)["blueprints"]
       if b.get("isActive") and b["blueprintId"].startswith("ubuntu_24")]
if len(items) != 1: raise SystemExit("Select an active Ubuntu 24.04 blueprint in the AWS console.")
print(items[0])
')"
# This command creates billed AWS resources. Run explicitly after selecting the account and SSH key.
aws cloudformation deploy --region ap-northeast-2 --stack-name game-feedback-production \
  --template-file "$directory/stack.yaml" \
  --parameter-overrides "KeyPairName=$1" "BlueprintId=$blueprint" "BudgetEmail=${GF_BUDGET_EMAIL:-}" \
  --no-fail-on-empty-changeset
aws cloudformation describe-stacks --region ap-northeast-2 --stack-name game-feedback-production \
  --query 'Stacks[0].Outputs' --output table
