#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
[[ "$ROOT" == /* && "$ROOT" != / ]]
[[ -d "$ROOT" && -w "$ROOT" ]]
mkdir -p "$ROOT/certs" "$ROOT/proxy" "$ROOT/services/game-feedback/releases" "$ROOT/services/photo-contest/releases"
directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp "$directory/compose.yaml" "$directory/Caddyfile" "$ROOT/proxy/"
if [[ ! -f "$ROOT/.env" ]]; then cp "$directory/host.env.example" "$ROOT/.env"; fi
for service in game-feedback photo-contest; do
  if [[ ! -f "$ROOT/services/$service/.env" ]]; then
    cp "$directory/../../projects/$service/deploy/shared-instance/service.env.example" "$ROOT/services/$service/.env"
  fi
done
temporary=$(mktemp "$ROOT/certs/.rds-ca-XXXXXXXX")
trap 'rm -f "$temporary"' EXIT
curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem >"$temporary"
openssl crl2pkcs7 -nocrl -certfile "$temporary" | openssl pkcs7 -print_certs -noout >/dev/null
chmod 644 "$temporary"
mv "$temporary" "$ROOT/certs/rds-ca.pem"
echo 'Host files prepared. Configure RDS, private S3 buckets and both service environments before starting the proxy.'
