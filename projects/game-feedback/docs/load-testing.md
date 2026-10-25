# 부하테스트

API 앱이 소유하는 `apps/api/scripts/public-read.k6.js`는 공개 게시물 목록을 읽는다. 계정·글을 만들거나 외부 Supercell을 호출하지 않는다. `BASE_URL`은 `/api`를 붙이지 않은 API origin이다. 웹 프록시까지 측정하려면 웹 origin을 지정한다. 개발 모드 결과에는 Next 컴파일 시간이 섞이므로 처리량 판단은 별도 스테이징의 production 빌드에서 한다.

## 실행

macOS에서는 [공식 설치 안내](https://grafana.com/docs/k6/latest/set-up/install-k6/)에 따라 `brew install k6`로 설치한다. 저장소 루트에서 다음을 실행한다.

```sh
k6 run -e BASE_URL=http://127.0.0.1:4300 -e RATE=1 -e DURATION=30s \
  projects/game-feedback/apps/api/scripts/public-read.k6.js
```

`RATE`는 초당 요청 수이며 가상 사용자 수가 아니다. 이 예제는 초당 1회씩 30초 동안 목록을 읽는다. 기존 개발 서버에 큰 부하를 주지 말고 전용 서버·테스트 데이터로 1 → 2 → 3 RPS를 확인한다. 예상 피크를 정한 뒤 전용 스테이징에서 단계별로 시간을 늘린다.

## 읽을 지표

- `http_req_duration`: p95 500ms 미만, p99 1000ms 미만을 예제 기준으로 둔다. 서비스 목표에 맞게 조정한다.
- `http_req_failed`: HTTP 실패율 1% 미만. `checks`도 99%를 넘어야 하므로 HTML 오류나 잘못된 JSON을 200 성공으로 세지 않는다.
- `rate_limited`: 429가 있으면 실패한다. 처리량 한계와 요청 제한을 구분한다.
- `dropped_iterations`: 0이어야 설정한 RPS를 실제로 보낸 것이다. 값이 크면 부하 생성기의 VU·CPU 부족도 확인한다.

[k6 threshold](https://grafana.com/docs/k6/latest/using-k6/thresholds/)를 넘으면 명령이 실패 코드로 끝난다. 평균만 보지 말고 p95/p99·실패율과 같은 시간대의 EC2 CPU·메모리, RDS 연결 수·지연·잠금, 웹/API 로그를 함께 기록한다. 현재 Sentry는 오류 수집용이며 성능 추적은 켜져 있지 않다.

## 현재 요청 제한

`src/rate-limit.ts` 기준 일반 읽기는 사용자 또는 비로그인 IP당 분당 240회이며, 주소의 전체 요청은 분당 1000회다. 단일 IP의 익명 테스트로 4 RPS를 오래 넘기면 정상적으로 429가 나온다. 로그인 사용자 여러 명을 써도 같은 주소의 1000회 한도는 공유한다. 전달 IP나 내부 호출 서명을 위조해서 우회하지 않는다. 서버 용량을 측정할 때는 운영과 분리한 스테이징에서만 제한 정책을 별도 설계한다.

로그인·글쓰기·채팅·업로드는 별도 시나리오로 측정한다. 로그인은 setup에서 계정별 한 번만 하고 VU별 독립 세션을 사용하며, 반복마다 OAuth를 호출하지 않는다. 쓰기 분당 60회, 업로드 발급·완료 각각 분당 20회, 게임 프로필 분당 10회 한도가 있다. 업로드는 S3 직접 전송과 API 티켓 발급·완료를 각각 측정한다. SSE는 동시 연결 수·메시지 전달 지연·재연결을 별도로 본다.

실제 대규모 부하테스트는 이 문서 작성 과정에서 실행하지 않았다. 로컬 smoke 결과를 운영 수용량으로 해석하지 않는다.
