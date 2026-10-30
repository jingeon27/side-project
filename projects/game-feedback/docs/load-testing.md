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

[k6 threshold](https://grafana.com/docs/k6/latest/using-k6/thresholds/)를 넘으면 명령이 실패 코드로 끝난다. 평균만 보지 말고 p95/p99·실패율과 같은 시간대의 EC2 CPU·메모리, 같은 인스턴스의 PostgreSQL 연결 수·지연·잠금, 웹/API 로그를 함께 기록한다. API의 선택적 성능 계측은 HTTP·채팅 트랜잭션·SSE publish 구간을 구분한다. 활성화·샘플링·개인정보 제거 정책은 [observability.md](./observability.md)를 따른다. 서버 publish 완료와 상대방 화면 표시 시간은 서로 다른 지표다.

## 현재 요청 제한

`src/rate-limit.ts` 기준 일반 읽기는 사용자 또는 비로그인 IP당 분당 240회이며, 주소의 전체 요청은 분당 1000회다. 단일 IP의 익명 테스트로 4 RPS를 오래 넘기면 정상적으로 429가 나온다. 로그인 사용자 여러 명을 써도 같은 주소의 1000회 한도는 공유한다. 전달 IP나 내부 호출 서명을 위조해서 우회하지 않는다. 서버 용량을 측정할 때는 운영과 분리한 스테이징에서만 제한 정책을 별도 설계한다.

로그인·글쓰기·채팅·업로드는 별도 시나리오로 측정한다. 로그인은 setup에서 계정별 한 번만 하고 VU별 독립 세션을 사용하며, 반복마다 OAuth를 호출하지 않는다. 쓰기 분당 60회, 업로드 발급·완료 각각 분당 20회, 게임 프로필 분당 10회 한도가 있다. 업로드는 S3 직접 전송과 API 티켓 발급·완료를 각각 측정한다. SSE는 동시 연결 수·메시지 전달 지연·재연결을 별도로 본다.

실제 대규모 부하테스트는 이 문서 작성 과정에서 실행하지 않았다. 로컬 smoke 결과를 운영 수용량으로 해석하지 않는다.

## 두 브라우저의 채팅 전달 벤치마크

GitHub Actions의 `Chat benchmark` workflow를 수동으로 실행할 수도 있다. 같은 격리 하네스와 실제 테스트 S3를 사용하고 표본 수는 1~20개만 받는다. 이미지 게시·운영 배포는 실행하지 않는다. `chat-delivery-<sha>` artifact에는 원문 진단 없이 `chat-delivery.json`만 보관한다. GitHub runner의 loopback 측정값이며 운영 수용량이나 SLO 달성률로 해석하지 않는다.

Web 소유 `apps/web/e2e-benchmark/chat-delivery.spec.ts`는 독립 브라우저 context의 새 테스트 사용자 두 명으로 실제 REST + SSE 전달을 측정한다. `benchmark:chat`으로만 실행하며 일반 CI와 일반 E2E에서는 수집하지 않는다. 지연 목표를 넘으면 실패하는 성능 threshold나 자동 재시도는 추가하지 않는다. 연결 실패·전송 실패·잘못된 전송 식별자 등 측정 전제의 실패는 명령을 실패시킨다.

기존 `playwright.config.ts`의 격리 하네스를 재사용한다. Web은 production build의 loopback 3301, API는 loopback 4301, PostgreSQL은 55444의 `game_feedback_test`와 실행별 `gf_test_web_<uuid>` 스키마다. 이미 실행 중인 서버를 재사용하지 않으며 해당 포트가 사용 중이면 실패한다. 다른 개발 서버를 종료하지 않는다. 외부 origin이나 운영 DB를 입력받는 옵션은 없다.

실행 전 Node.js 24와 Yarn 4.17.0, 설치된 Chromium, 생성한 계약/Prisma client, 프로젝트 전용 테스트 PostgreSQL이 필요하다. 기존 API E2E 하네스는 시작할 때 실제 테스트 S3 접근을 확인하므로 프로젝트의 S3 버킷·인증 설정과 테스트 prefix 권한도 필요하다. 이 벤치마크는 첨부를 업로드하지 않지만 그 필수조건을 우회하는 fake storage나 특수 서버는 만들지 않는다.

```sh
# 저장소 루트. 준비된 전용 테스트 DB와 S3 설정이 필요하다.
yarn workspace @side/game-feedback codegen
yarn workspace @side/game-feedback db:test:start
yarn workspace @game-feedback/web exec playwright install chromium
yarn workspace @game-feedback/web benchmark:chat

# 기본 5개. 허용 범위는 1~20개, 표시 후 관찰/간격은 5000~15000ms다.
GF_CHAT_BENCHMARK_SAMPLES=10 GF_CHAT_BENCHMARK_INTERVAL_MS=5000 \
  yarn workspace @game-feedback/web benchmark:chat
```

이 명령의 Playwright 설정이 API와 Web을 시작하고 소유한 실행별 스키마를 정리한다. 테스트 DB 종료는 이번 실행에서 자신이 시작한 경우에만 프로젝트의 `db:test:stop`을 사용한다. S3 설정이 없으면 fullstack 벤치마크를 실행할 수 없으며 타입·분류·분위수 검증 성공을 실제 전달 측정 성공으로 기록하지 않는다.

측정 순서는 다음과 같다.

1. 두 사용자로 새 대화를 만들고 두 화면 모두 실제 `text/event-stream` 응답·연결 완료·활성 visibility를 확인한다. 메시지 전송 1회를 워밍업해 초기 조회와 읽음 흐름을 준비하고 결과 분포에서 제외한다.
2. 전송 없이 31초 동안 수신자의 기준 요청 수와 활성 SSE 연결 수를 기록한다. SSE heartbeat는 5초, 알림 summary의 REST polling은 30초다. 정상 SSE 연결 중 메시지의 10초 fallback polling은 비활성이다. 기준 구간에서 진행 중 SSE는 신규 REST 요청으로 세지 않으며 polling을 끄거나 기준 요청 수를 샘플에서 빼지 않는다.
3. 샘플마다 고유한 메시지 내용을 입력하고 보내기 버튼이 준비된 뒤, 클릭 직전에 Node 프로세스의 monotonic `performance.now()`를 시작한다. 상대방 대화 로그에 해당 메시지가 보이면 `deliveryMs`를 확정한다. 이 시간과 별개로 브라우저 요청 timing의 `responseEnd - requestStart`를 `postResponseMs`로 기록한다. POST 요청마다 앱이 만든 UUID `clientMessageId`가 고유한지도 확인하되 저장하지 않는다.
4. 수신자의 메시지 표시까지의 요청과 표시 이후의 읽음 처리·후속 갱신 요청을 나눈다. 후속 구간은 발신 화면의 읽음 표시와 전송 폼 초기화를 확인하고 지정한 간격만큼 관찰한 시점까지다. 마지막 샘플에도 같은 관찰 구간을 적용한다. 따라서 `intervalMs`는 고정 전송 주기가 아니라 표시·검증 이후의 최소 대기 시간이다.

JSON attachment `chat-delivery.json`은 `.e2e-build/chat-benchmark-results/` 아래에 생성한다. 완료한 샘플별 두 시간, 수신자 요청 분류별 개수, 활성 SSE 수, 완료 샘플의 p50/p95/p99를 담는다. 실패하면 `status: incomplete`와 완료한 샘플만 남기며 결과가 없을 때 분포는 `null`이다. 분위수는 오름차순에서 `ceil(p × n)`번째 값을 선택하는 nearest-rank다. 기본 5개에서 p95와 p99는 모두 최댓값이므로 꼬리 지연을 신뢰성 있게 추정할 표본이 아니다.

요청 분류는 메시지 GET·대화 목록 GET·알림 GET·세션 GET·읽음 POST·기타 REST 읽기/쓰기·신규 SSE 연결이다. 수신 Page에서 **구간 안에 시작한 실제 같은 origin의 API 요청**만 센다. 로그인·대화 생성 APIRequestContext 요청, 발신자 요청, 문서/RSC/prefetch, 기존 연결의 SSE heartbeat, 초기 로딩·워밍업, 샘플 사이 입력 준비는 샘플 요청 개수에 포함하지 않는다. 응답의 429·5xx·전송 실패는 별도 관찰 시점 기준 카운터여서 시작 요청과 경계가 다를 수 있다. Query 무효화 호출 수·DB 쿼리 수·SSE 이벤트 수와 같지 않으며, 주기적 polling과 읽음 publish의 갱신도 포함하므로 전부 전송 메시지 하나의 직접 비용이라고 해석하지 않는다.

trace·video·screenshot·자동 실패 DOM snapshot·Git diff 수집을 끈다. 전용 reporter는 실패 오류 원문·stdout/stderr를 출력하지 않고, Playwright의 자동 `error-context` 같은 JSON 이외 attachment 파일을 제거한다. JSON에는 메시지 본문·message/conversation/user ID·clientMessageId·실제 URL·요청/응답 본문·쿠키·헤더를 넣지 않는다. 원문을 남기는 다른 reporter나 `--trace`, `--debug` 옵션을 덧붙이지 않는다.

이 결과는 loopback에서 Playwright 클릭·locator 관찰·IPC·브라우저 렌더링과 REST 재조회가 포함된 실험값이다. 순수 SSE 네트워크 지연이나 운영 RUM이 아니며 입력·초기 접속 시간은 제외한다. 구간별 p95를 더해 전체 p95를 만들지 않는다. 기존 E2E API 하네스는 `rateLimit: false`이므로 운영 요청 제한이나 최대 수용량을 검증하지 않는다. 그래도 기본값은 5개 + 워밍업 1개, 샘플 간 최소 5초로 작게 두고, 사용자당 쓰기 60회/분·읽기 240회/분·동일 주소 1000회/분을 고려해 표본과 다른 트래픽을 계획한다. 이 벤치마크를 수백 연결의 부하 테스트로 확장하지 않는다.
