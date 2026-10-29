#!/usr/bin/env bash
# Dumps one service database onto the PostgreSQL volume and uploads it to the private backup bucket with the EC2
# role. service.sh runs it before every migration and database.sh backup runs it on demand; both hold the host lock.
set -euo pipefail
umask 077
ROOT=${SIDE_DEPLOY_ROOT:-/srv/side-project}
DATA=${SIDE_POSTGRES_ROOT:-/srv/side-postgres}
# Docker Hub publishes exact aws-cli versions only (there is no `2` tag); pin the reviewed multi-arch index.
AWSCLI_IMAGE=${SIDE_AWSCLI_IMAGE:-amazon/aws-cli:2.38.1@sha256:733d5be1015825e4038c6016f3fa9954868ddee1f611b73be795a9cc2e706bfd}
SERVICE=${1:-}
LABEL=${2:-}
RECEIPT=${3:-}
[[ "$SERVICE" =~ ^(game-feedback|photo-contest)$ && "$LABEL" =~ ^[a-z0-9-]{1,64}$ ]] || {
  echo 'Usage: pg-backup.sh <game-feedback|photo-contest> <label> [receipt]' >&2
  exit 2
}
[[ "$ROOT" == /* && "$ROOT" != / && "$DATA" == /* && "$DATA" != / ]] || exit 2
[[ -f "$DATA/.side-postgres-volume" ]] || {
  echo "The PostgreSQL volume is not mounted at $DATA." >&2
  exit 1
}
settings=$(python3 - "$ROOT/.env" <<'PY'
import pathlib, re, sys
e = dict(line.strip().split('=', 1) for line in pathlib.Path(sys.argv[1]).read_text().splitlines()
         if line.strip() and not line.lstrip().startswith('#'))
bucket, region = e.get('BACKUP_BUCKET', ''), e.get('BACKUP_REGION', '')
if (not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', bucket) or not re.fullmatch(r'[a-z]{2}(-[a-z]+)+-[0-9]', region)
        or bucket in (e.get('GAME_FEEDBACK_S3_BUCKET'), e.get('PHOTO_CONTEST_S3_BUCKET'))):
    raise SystemExit('Configure a dedicated BACKUP_BUCKET and its BACKUP_REGION for database dumps.')
print(bucket, region)
PY
)
read -r bucket region <<<"$settings"
directory="$DATA/dumps/$SERVICE"
mkdir -p "$directory"
name="$(date -u +%Y%m%dT%H%M%SZ)-$LABEL.dump"
partial="$directory/.$name.partial"
trap 'rm -f "$partial"' EXIT
docker compose --project-name "${SIDE_PROJECT_PREFIX:-side}-database" --env-file "$ROOT/database/.env" \
  -f "$ROOT/database/compose.yaml" exec -T postgres \
  pg_dump --username postgres --dbname "${SERVICE//-/_}" --format custom >"$partial"
# A custom-format archive starts with PGDMP; anything else is an empty stream or an error message.
[[ "$(head -c 5 "$partial")" == PGDMP ]] || {
  echo 'pg_dump did not produce a custom-format archive.' >&2
  exit 1
}
mv "$partial" "$directory/$name"
object="s3://$bucket/postgres/$SERVICE/$name"
# Host networking reaches IMDS with hop limit 1, which keeps bridge-network app containers away from the role.
# The role may only put objects under postgres/; it cannot read, list or delete earlier dumps.
docker run --rm --network host --cap-drop ALL --security-opt no-new-privileges:true \
  --user "$(id -u):$(id -g)" --env HOME=/tmp --volume "$directory/$name:/backup/$name:ro" \
  "$AWSCLI_IMAGE" s3 cp "/backup/$name" "$object" --region "$region" --only-show-errors
if [[ -n "$RECEIPT" ]]; then
  python3 - "$directory/$name" "$object" "$RECEIPT" <<'PY'
import datetime, hashlib, json, pathlib, sys
dump, location, destination = sys.argv[1:]
digest = hashlib.sha256()
with open(dump, 'rb') as stream:
    for chunk in iter(lambda: stream.read(1 << 20), b''):
        digest.update(chunk)
receipt = {'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'object': location,
           'bytes': pathlib.Path(dump).stat().st_size, 'sha256': digest.hexdigest()}
path = pathlib.Path(destination)
path.write_text(json.dumps(receipt, indent=2) + '\n')
path.chmod(0o600)
PY
fi
# S3 keeps the history (lifecycle on the bucket); the volume keeps a week for quick local restores.
find "$directory" -maxdepth 1 -name '*.dump' -mtime +7 -delete
printf 'Uploaded %s before changing %s. This is not a restore drill.\n' "$object" "$SERVICE"
