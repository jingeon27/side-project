# 덕담집 공용 EC2 배포

[공용 EC2](../../../../deploy/shared-instance/README.md)의 기존 Caddy 뒤에서 덕담집 Next.js 컨테이너 하나를 운영한다. 웹 포트 3460은 덕담집 네트워크에서만 사용한다. 참고 자료와 주문은 서로 다른 SQLite 볼륨에 둔다.

## 첫 배포

1. `develop`에서 `main`으로 릴리스한다. `Services`의 `Deokdam image publish` 결과에서 `ghcr.io/jingeon27/side-project-deokdam-web@sha256:…` 값을 확인한다.
2. 기존 EC2에 접속해 메모리와 디스크 여유를 확인한다. 같은 EC2를 가리키도록 `deokdam.bambyul.com`의 DNS 레코드를 연결한다. 변경된 호스트명을 사용하려면 `Caddyfile.deokdam`의 사이트 주소도 맞춘다.
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
```

`.env`의 `DEOKDAM_WEB_IMAGE`에 검증 다이제스트를 지정한다. AI 풀이를 켤 때는 `DEOKDAM_AI_MODEL`과 `DEOKDAM_AI_API_KEY`에 덕담집의 모델과 서버 키를 넣는다. 같은 파일에 YouTube 공개 목록의 ID를 `DEOKDAM_SHORTS_PLAYLIST_ID`로 제공한다. 결제를 운영할 때는 `DEOKDAM_ORDER_DB=/var/lib/deokdam/orders/orders.sqlite`와 포트원 상점 설정을 입력한다.

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

홈에서 공개 쇼츠를 재생하고, `/reading`에서 세 가지 고민으로 AI 풀이와 출처가 나오는지 확인한다. YouTube에 쇼츠를 추가할 때는 동일한 재생목록을 사용한다.

## 업데이트와 복구

`DEOKDAM_WEB_IMAGE`를 새 다이제스트로 바꾼 후 `pull`과 `up -d --wait`를 실행한다. 응답 확인에 실패하면 직전 다이제스트로 같은 명령을 실행한다. 자료 DB는 이미지의 벡터 스냅샷을 기준으로 초기화된다. 결제를 열면 주문 볼륨을 백업하고 복구를 점검한다.

덕담집 주소를 내릴 때는 `/config/deokdam/site.caddy`를 `/config/deokdam/site.disabled`로 옮긴 뒤 `proxy.sh reload`를 실행한다. `deokdam_compose stop`으로 웹 프로세스를 정지할 수 있다.
