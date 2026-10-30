#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
SERVICE=${1:-}
[[ "$SERVICE" == game-feedback || "$SERVICE" == photo-contest ]]
: "${DEPLOY_HOST:?Set deploy host}"
: "${DEPLOY_USER:?Set deploy user}"
: "${DEPLOY_SSH_KEY:?Set deploy SSH key}"
: "${DEPLOY_KNOWN_HOSTS:?Set verified known_hosts}"
: "${REGISTRY_TOKEN:?Set short-lived registry token}"
: "${REGISTRY_USER:?Set registry user}"
: "${SERVICE_ENV:?Set the SERVICE_ENV Environment Secret}"
[[ "$SERVICE_ENV" =~ [^[:space:]] ]] || { echo 'SERVICE_ENV must not be blank.' >&2; exit 2; }
# 기존 DB·스토리지 Secret을 읽거나 교체하지 않고 OAuth·모니터링 설정만 추가한다.
if [[ "${SERVICE_ENV_OVERRIDES:-}" =~ [^[:space:]] ]]; then
  SERVICE_ENV="${SERVICE_ENV}"$'\n'"${SERVICE_ENV_OVERRIDES}"
fi
unset SERVICE_ENV_OVERRIDES
environment_bytes=$(printf '%s' "$SERVICE_ENV" | wc -c | tr -d '[:space:]')
((environment_bytes <= 65536)) || { echo 'SERVICE_ENV exceeds the transfer limit.' >&2; exit 2; }
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ && "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ && "${DEPLOY_PORT:-22}" =~ ^[0-9]{1,5}$ ]]
[[ "$API_IMAGE" =~ ^ghcr\.io/[a-z0-9._/-]+-$SERVICE-api@sha256:[a-f0-9]{64}$ ]] || { echo "API_IMAGE must be a fully qualified GHCR digest for $SERVICE." >&2; exit 2; }
[[ "$WEB_IMAGE" =~ ^ghcr\.io/[a-z0-9._/-]+-$SERVICE-web@sha256:[a-f0-9]{64}$ ]] || { echo "WEB_IMAGE must be a fully qualified GHCR digest for $SERVICE." >&2; exit 2; }
[[ "$REGISTRY_USER" =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]]
# The remote deployment runs detached; these only bound how long this job follows it.
WAIT=${DEPLOY_WAIT_SECONDS:-2400}
POLL=${DEPLOY_POLL_SECONDS:-5}
[[ "$WAIT" =~ ^[1-9][0-9]{0,4}$ && "$POLL" =~ ^[0-9]{1,2}(\.[0-9])?$ ]]
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" >"$temporary/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >"$temporary/known_hosts"
mkdir "$temporary/release"
cp "projects/$SERVICE/deploy/shared-instance/compose.yaml" "$temporary/release/compose.yaml"
# service.sh compares this with the host proxy and refuses to deploy against a drifted shared Caddyfile.
cp deploy/shared-instance/Caddyfile "$temporary/release/Caddyfile"
cp -R deploy/shared-instance/scripts "$temporary/release/host"
tar -czf "$temporary/release.tar.gz" -C "$temporary/release" compose.yaml Caddyfile host
options=(-i "$temporary/key" -p "${DEPLOY_PORT:-22}" -o BatchMode=yes -o ConnectTimeout=15 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temporary/known_hosts")
if [[ -n "${DEPLOY_SSM_INSTANCE_ID:-}" ]]; then
  # 터널 대상은 검증한 인스턴스 하나로 고정하고 SSH 인증·호스트 키 검사는 그대로 유지한다.
  [[ "$DEPLOY_SSM_INSTANCE_ID" =~ ^i-([a-f0-9]{8}|[a-f0-9]{17})$ ]] || { echo 'Invalid SSM instance ID.' >&2; exit 2; }
  [[ "${DEPLOY_AWS_REGION:-}" =~ ^[a-z]{2}(-[a-z]+)+-[0-9]$ ]] || { echo 'Invalid SSM region.' >&2; exit 2; }
  command -v aws >/dev/null
  command -v session-manager-plugin >/dev/null
  options+=(-o "ProxyCommand=aws ssm start-session --region $DEPLOY_AWS_REGION --target $DEPLOY_SSM_INSTANCE_ID --document-name AWS-StartSSHSession --parameters portNumber=%p")
fi
destination="$DEPLOY_USER@$DEPLOY_HOST"
remote_dir="/srv/side-project/services/$SERVICE/releases/$RELEASE_SHA"
printf -v remote_command 'install -d -m 700 %q && tar -xzf - -C %q' "$remote_dir" "$remote_dir"
# shellcheck disable=SC2029
ssh "${options[@]}" "$destination" "$remote_command" <"$temporary/release.tar.gz"
printf -v remote_command 'bash %q %q %q %q %q %q' "$remote_dir/host/receive.sh" "$SERVICE" "$RELEASE_SHA" "$API_IMAGE" "$WEB_IMAGE" "$REGISTRY_USER"
# shellcheck disable=SC2029
job=$({ printf '%s\n%s\n' "$REGISTRY_TOKEN" "$environment_bytes"; printf '%s' "$SERVICE_ENV"; } | ssh "${options[@]}" "$destination" "$remote_command")
unset SERVICE_ENV
[[ "$job" =~ ^run-[A-Za-z0-9]{8}$ ]] || {
  echo 'The remote deployment did not start.' >&2
  exit 1
}
log="$remote_dir/.deploy/$job/log"
echo "Deployment $job runs detached on the host. Following $log"
printf -v status_command 'bash %q %q %q %q' "$remote_dir/host/job-status.sh" "$SERVICE" "$RELEASE_SHA" "$job"
offset=0
misses=0
deadline=$((SECONDS + WAIT))
while true; do
  set +e
  # shellcheck disable=SC2029
  ssh "${options[@]}" "$destination" "$status_command $offset" >"$temporary/chunk"
  state=$?
  set -e
  cat "$temporary/chunk"
  offset=$((offset + $(wc -c <"$temporary/chunk")))
  case "$state" in
    0)
      echo "Deployment $job succeeded."
      exit 0
      ;;
    3) misses=0 ;;
    4)
      echo "Deployment $job failed. The full log stays on the host: $log" >&2
      exit 1
      ;;
    *)
      misses=$((misses + 1))
      if ((misses >= 12)); then
        echo "Lost contact with the host. The deployment may still be running there: $log" >&2
        exit 1
      fi
      ;;
  esac
  if ((SECONDS >= deadline)); then
    echo "Stopped following after ${WAIT}s. The deployment keeps running on the host: $log" >&2
    exit 1
  fi
  sleep "$POLL"
done
