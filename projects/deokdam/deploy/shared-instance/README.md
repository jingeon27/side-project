# 덕담집 공용 EC2 배포

[공용 EC2](../../../../deploy/shared-instance/README.md)의 기존 Caddy 뒤에서 덕담집 웹을 운영한다. 서버 안의 llama.cpp가 Qwen3.5 0.8B 양자화 모델을 CPU로 실행한다. 웹과 모델 사이에는 전용 내부 Docker 네트워크를 쓰고, 모델 포트를 호스트에 게시하지 않는다. 참고 자료와 주문은 서로 다른 SQLite 볼륨에 둔다. [llama.cpp 서버](https://github.com/ggml-org/llama.cpp/blob/v1.1.0/tools/server/README.md) · [Qwen3.5 모델 파일](https://huggingface.co/ggml-org/Qwen3.5-0.8B-GGUF/blob/1c0b5292de5ccd62235595d1557c0d70d46c3d9d/Qwen3.5-0.8B-Q4_0.gguf)

추론은 EC2 안에서 처리하므로 모델 API의 호출별 요금은 없다. 모델 파일은 약 563MB다. 모델 컨테이너는 CPU 0.65개와 메모리 640MiB로 한 번에 한 건을 처리한다. CPU 가중치 재배치에 필요한 메모리를 줄이기 위해 모델 서버를 `--no-repack`으로 실행한다. CPU가 경합할 때는 모델에 기존 서비스보다 낮은 CPU 가중치를 적용한다. 2분간 요청이 없으면 모델을 RAM에서 내린다. 기존 EC2 비용은 AWS 설정에 따르며 T3 Unlimited에서 평균 사용률이 기준을 넘으면 CPU 크레딧 요금이 생길 수 있다. [AWS CPU 크레딧 안내](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode.html)

## 첫 배포

1. `develop`에서 `main`으로 릴리스한다. `Services`의 `Deokdam image publish` 결과에서 `ghcr.io/jingeon27/side-project-deokdam-web@sha256:…` 값을 확인한다.
2. 기존 EC2에서 `free -m`, `df -h`, `docker stats --no-stream`으로 웹과 모델에 필요한 여유를 확인한다. T3 계열이라면 CloudWatch의 `CPUCreditBalance`와 `CPUSurplusCreditsCharged`도 본다. 운영 도메인의 DNS 레코드를 같은 EC2로 연결한다. 기본 사이트 주소는 `deokdam.bambyul.com`이다.
3. EC2의 릴리스 체크아웃 루트에서 서비스 디렉터리와 설정을 준비한다.

```bash
export SIDE_DEPLOY_ROOT=/srv/side-project
deokdam_dir="$SIDE_DEPLOY_ROOT/services/deokdam"
deokdam_release=projects/deokdam/deploy/shared-instance
mkdir -p "$deokdam_dir"
install -m 644 "$deokdam_release/compose.yaml" "$deokdam_dir/compose.yaml"
if [[ ! -e "$deokdam_dir/.env" ]]; then
  install -m 600 "$deokdam_release/service.env.example" "$deokdam_dir/.env"
fi
bash "$deokdam_release/fetch-model.sh" "$deokdam_dir/models"
```

`.env`의 `DEOKDAM_WEB_IMAGE`에 검증 다이제스트를 지정한다. 모델은 체크섬을 확인한 파일을 읽기 전용으로 사용한다. 같은 파일에 YouTube 공개 목록의 ID를 `DEOKDAM_SHORTS_PLAYLIST_ID`로 제공한다. 결제를 운영할 때는 `DEOKDAM_ORDER_DB=/var/lib/deokdam/orders/orders.sqlite`와 포트원 상점 설정을 입력한다.

```bash
network="${SIDE_NETWORK_PREFIX:-side}-deokdam-edge"
if ! docker network inspect "$network" >/dev/null 2>&1; then
  docker network create --label "dev.side.shared-instance=$SIDE_DEPLOY_ROOT" "$network"
fi
test "$(docker network inspect "$network" \
  --format '{{index .Labels "dev.side.shared-instance"}}')" = "$SIDE_DEPLOY_ROOT"
deokdam_compose() {
  docker compose --env-file "$deokdam_dir/.env" -f "$deokdam_dir/compose.yaml" "$@"
}
deokdam_compose config --quiet
deokdam_compose pull
deokdam_compose up -d --wait --wait-timeout 120
```

GHCR 이미지가 비공개라면 EC2의 기존 레지스트리 인증 절차로 덕담집 패키지 읽기 권한을 제공한다.

## HTTPS 연결

공용 Caddy의 기존 `/config` 볼륨 아래에 덕담집 사이트 파일을 둔다. `proxy.sh sync`는 출시본의 Caddyfile을 검증하고, 실행 중인 프록시를 덕담집 네트워크에 연결한 뒤 설정을 다시 읽는다.

```bash
proxy_compose() {
  docker compose --project-name "${SIDE_PROJECT_PREFIX:-side}-proxy" \
    --env-file "$SIDE_DEPLOY_ROOT/.env" -f "$SIDE_DEPLOY_ROOT/proxy/compose.yaml" "$@"
}
proxy_compose exec -T proxy sh -eu -c '
  mkdir -p /config/deokdam
  cat > /config/deokdam/site.tmp
  mv /config/deokdam/site.tmp /config/deokdam/site.caddy
' < "$deokdam_release/Caddyfile.deokdam"
bash deploy/shared-instance/scripts/proxy.sh sync deploy/shared-instance/Caddyfile
curl -fsS -o /dev/null https://deokdam.bambyul.com/reading
curl -fsS -o /dev/null https://contest.bambyul.com/
```

홈에서 공개 쇼츠를 재생하고, `/reading`에서 세 가지 고민으로 AI 풀이와 출처가 나오는지 확인한다. 모델이 사용 중이거나 응답하지 않으면 화면에서 다시 시도하거나 기본 풀이를 열 수 있다. 첫 풀이 응답 시간과 피식의 응답, 메모리·CPU 크레딧을 확인한다. YouTube에 쇼츠를 추가할 때는 동일한 재생목록을 사용한다.

## 업데이트와 복구

`DEOKDAM_WEB_IMAGE`를 새 다이제스트로 바꾼 후 `pull`과 `up -d --wait`를 실행한다. 응답 확인에 실패하면 직전 다이제스트로 같은 명령을 실행한다. 자료 DB는 이미지의 벡터 스냅샷을 기준으로 초기화된다. 결제를 열면 주문 볼륨을 백업하고 복구를 점검한다.

덕담집 주소를 내릴 때는 `/config/deokdam/site.caddy`를 `/config/deokdam/site.disabled`로 옮긴 뒤 `proxy.sh reload`를 실행한다. `deokdam_compose stop`으로 웹과 모델을 정지할 수 있다.
