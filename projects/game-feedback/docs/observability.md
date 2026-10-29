# 오류와 이용 흐름 관측

API는 예상하지 못한 오류와 수동으로 계측한 HTTP·채팅 성능을 Sentry로 보낸다. Next 서버와 브라우저도 같은 오류 정리 정책을 적용한다. 브라우저는 Web Vitals도 수집하고, Amplitude는 웹의 제품 이벤트를 수집한다. SDK 키가 비어 있으면 전송하지 않는다.

## 설정과 실행

설정은 `projects/game-feedback/.env` 하나에서 읽는다. 웹은 `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_AMPLITUDE_API_KEY`, API는 `SENTRY_DSN`을 사용한다. 환경은 `ENVIRONMENT`, 배포 버전은 `SENTRY_RELEASE`다. 모바일 셸도 이 루트 파일의 공개 키를 Expo 설정으로 전달하며 별도 모바일 env 키를 만들지 않는다.

`@side/game-feedback dev`와 `@game-feedback/web dev` 모두 루트 설정을 읽는다. 웹의 build/start도 같은 실행기를 거친다. 프로세스에서 명시한 값(빈 키 포함)이 파일보다 우선하고 build/start의 프레임워크 `NODE_ENV`는 production이다. 공개 키·환경·release는 빌드에 고정되므로 운영 값을 바꾸면 다시 빌드한다. 로컬에서 이미 실행 중인 서버에는 이후 수정한 값이 자동 반영되지 않는다.

Sentry에서 `service:game-feedback`과 `layer:api`, `layer:next-server`, `layer:browser`로 발생 위치를 구분한다. API와 Next 서버가 같은 DSN을 사용해도 이 태그로 나눌 수 있다. 브라우저·WebView는 기존 `client` 태그로 구분한다. Amplitude는 US 데이터 센터와 개발/운영 별도 프로젝트를 사용한다.

## API와 채팅 성능

API DSN이 있으면 HTTP 요청을 10% 샘플링하고, 선택한 요청의 자식 span도 같은 추적에 남긴다. 별도 환경변수나 자동 HTTP·SQL integration을 추가하지 않는다. `defaultIntegrations: false`와 `enableRuntimeChannelInjection: false`를 유지하므로 현재 초기화 순서에서 수동 span만 기록한다. 자동 계측을 도입할 때는 SDK 초기화·모듈 로딩 순서를 별도로 검토해야 한다.

| span                                      | 측정 범위                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `METHOD /api/.../:id/...` (`http.server`) | JSON 파싱·세션·권한·요청 제한·controller 처리부터 응답 쓰기 완료까지. 클라이언트 네트워크 시간과 웹 프록시 시간은 포함하지 않는다. 응답 전에 연결이 끊어지면 aborted로 종료한다. |
| `chat.persist` (`db.transaction`)         | 대화 잠금·트랜잭션 안 권한 조회·멱등 확인·메시지/알림/푸시 큐 쓰기·커밋. 트랜잭션 앞의 접근 확인은 HTTP에만 포함된다.                                                            |
| `chat.insert` (`db.query`)                | Prisma `chatMessage.create`와 반환 관계 조회. 단일 SQL INSERT 시간이나 전체 SQL 실행 횟수를 뜻하지 않는다. 멱등 재전송에는 새 INSERT span이 없다.                                |
| `chat.lock` (`db.query`)                  | 전송 트랜잭션의 대화 행 `FOR UPDATE` 호출부터 반환까지. DB 왕복과 잠금 대기를 포함하며 순수 잠금 대기만의 시간은 아니다.                                                         |
| `chat.messages` (`db.query`)              | 메시지 목록 Prisma 조회와 관계 데이터 반환. API 전체 조회 시간은 HTTP 지표에서 본다.                                                                                             |
| `chat.publish` (`messaging.publish`)      | 커밋 뒤 수신 연결의 세션·접근 확인과 `subscriber.next()` 호출까지. 상대 브라우저 수신·REST 재조회·화면 반영은 포함하지 않는다.                                                   |
| `chat.heartbeat` (`function`)             | 열린 연결의 세션 일괄 조회와 heartbeat 전달 한 주기.                                                                                                                             |

Sentry의 Traces에서 `service=game-feedback`, `layer=api`를 선택하고 HTTP 라우트 패턴·span 이름별 duration의 p50/p95/p99와 HTTP 상태를 비교한다. 추적 ID로 같은 요청의 HTTP·persist·insert·publish를 연결한다. HTTP와 비동기 publish 시간은 겹칠 수 있고, 구간별 p95를 더해 전체 p95를 계산하지 않는다. 샘플링된 span 개수로 전체 메시지 수나 정확한 요청·SQL 실행 횟수를 주장하지 않는다.

`chat.publish.recipients`는 대상 사용자 수가 아니라 확인한 열린 연결 수다. `sent`는 서버 구독자에 넘긴 연결, `unavailable`은 세션 만료·이미 닫힌 연결, `denied`는 접근 확인이 false를 반환한 연결, `failed`는 전달 과정에서 예외가 난 연결 수다. failed가 하나라도 있으면 publish span을 오류 상태로 표시한다. 접근 확인 자체가 false로 흡수한 오류와 실제 권한 거부는 이 수치만으로 구분하지 않는다. 이 값들도 샘플링된 publish 단위 측정이며 누적 운영 카운터가 아니다.

오래 열린 `GET /api/chat/events`와 health probe는 HTTP span을 만들지 않는다. SSE의 연결 시간은 메시지 지연이 아니다. heartbeat는 기존처럼 5초마다 세션 일괄 조회 한 번으로 동작한다.

### 샘플링과 독립인 채팅 메트릭

Sentry Application Metrics는 추적 샘플링 10%와 별개로 모든 계측 호출을 기록한다. `game-feedback-server`의 Metrics에서 `service:game-feedback layer:api`와 대상 환경·release를 선택한다. 운영 지표는 `sentry.environment:production`으로 검증용 test 데이터를 제외한다.

| 메트릭                                                | 용도·차원                                                                                                                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.http.duration` / `chat.http.requests`           | 목록·메시지 전송/조회·읽음·기록 삭제 HTTP의 지연(ms)과 요청 수. 라우트 템플릿·메서드·상태·`outcome=ok/client_error/server_error/aborted`로 구분한다. 인증·Origin·본문 파싱 전에 거절된 요청도 집계한다.     |
| `chat.operation.duration` / `chat.operation.failures` | `operation=chat.persist/chat.lock/chat.insert/chat.messages/chat.publish/chat.heartbeat`별 지연과 예외 수. 실패는 `rejected`(4xx 업무 오류), `failed`(내부 실패)를 나눈다.                                  |
| `chat.send.results`                                   | 커밋된 신규 메시지 `created`와 동일 요청의 멱등 반환 `duplicate`. 신규 메시지 수는 created만 센다.                                                                                                          |
| `chat.publish.recipients` / `chat.publish.deliveries` | publish마다 열린 대상 연결 수와 `result=sent/unavailable/denied/failed` 연결별 결과. 수신 기기의 실제 표시 성공 수를 뜻하지 않는다.                                                                         |
| `chat.sse.opened` / `chat.sse.closed`                 | 연결 생성과 종료 수. 종료 이유는 `client_disconnect/session_invalid/session_limit/user_limit/session_closed/user_closed/server_shutdown/heartbeat_failed/delivery_failed`.                                  |
| `chat.sse.active` / `chat.sse.connection.duration`    | 프로세스의 현재 열린 연결 수와 종료 시 연결 수명(ms). 연결 변화와 5초 heartbeat에서 gauge를 갱신한다. 열림 빈도와 종료 이유를 함께 보고 재연결 이상을 진단하며 같은 사용자의 재연결 횟수로 단정하지 않는다. |

전송 API p95: `metric.name:chat.http.duration http.route:/api/conversations/:id/messages http.request.method:POST outcome:ok`에 `p95(value)`를 조회한다. p99·요청 수와 함께 보고, 느린 구간은 `metric.name:chat.operation.duration`을 operation별로 나눠 찾는다. 5xx 비율은 `chat.http.requests`의 server_error 합계를 전체 합계와 비교한다. HTTP 200 뒤 비동기 전달 실패는 `chat.publish.deliveries result:failed`로 따로 확인한다.

본문·파일명·원본 URL·사용자/대화/메시지 ID는 메트릭 차원에 없다. `beforeSendMetric`과 최종 envelope 정리를 함께 적용해 SDK가 나중에 합치는 scope·사용자·호스트 속성도 제거한다. DB/접근 조회 장애는 정상적인 권한 거부 denied로 숨기지 않고 failed와 정리한 오류 이벤트로 기록한다.

성능 전송은 오류용 `beforeSend`와 별도로 `beforeSendSpan`에서 작업명·라우트 템플릿·상태·유한한 숫자 측정값·추적 ID·SDK/환경/release만 남긴다. 원본 URL·쿼리·메시지·대화/사용자 ID·세션·쿠키·헤더·SQL·span link는 제거한다. span 바깥 envelope의 sampling metadata에도 원래 작업명이 남지 않도록 `createDsc`에서 transaction 이름을 제거한다. 라우트가 결정되기 전 거부된 요청과 알 수 없는 경로는 `unmatched`로 집계한다.

`src/monitoring/sentry.spec.ts`는 실제 SDK의 메모리 transport로 정리 정책을 검사한다. `src/monitoring/chat-performance.database.integration.spec.ts`는 실제 격리 PostgreSQL·Nest HTTP·SSE를 통해 추적 관계와 커밋 뒤 전달을 검사한다. 실제 Sentry 수신 확인이나 운영 성능 측정을 대신하지 않는다. 두 브라우저의 전달 시간과 실제 REST 요청 횟수를 측정하는 opt-in 벤치마크는 [부하테스트 안내](load-testing.md)를 따른다.

## Web Vitals

공개 DSN이 있으면 Sentry의 BrowserTracing으로 LCP·CLS·INP와 FCP·TTFB를 수집한다. 브라우저 성능 span 수집률은 100%이며 fetch·XHR·긴 작업의 추가 계측은 끈다. Sentry 11의 기본 span streaming과 `beforeSendSpan`을 사용한다. 화면 이름과 segment 이름의 ID·검색어는 제거하며, 원본 URL·DOM 선택자·사용자 정보·쿠키를 span 속성에 남기지 않는다. 지표 숫자, 추적 ID, 환경·release와 성능 점수 계산에 필요한 브라우저 User-Agent는 유지한다.

Sentry의 Insights → Frontend → Web Vitals에서 프로젝트 `game-feedback`을 선택한다. 성능 span의 `service=game-feedback`, `layer=browser`, `client=browser|webview`로 구분할 수 있다. 지표는 브라우저 지원 여부에 따라 달라지며, INP는 실제 상호작용 뒤, LCP·CLS는 화면을 떠나거나 숨길 때 최종 보고될 수 있다.

`test:observability`는 실제 Chromium의 측정값 5종과 개인정보 제거를 검사한다. 실제 수신만 다시 확인할 때는 `monitoring:check --grep LCP`를 사용한다. 측정값·응답 상태·trace ID만 담은 `web-vitals-receipt` 첨부가 테스트 결과에 남으며 MCP에서 해당 trace를 조회할 수 있다.

2026-10-26 격리한 로컬 운영 빌드에서 실제 수집 응답 200과 [LCP·CLS·INP span 수신](https://jingeons-side-project.sentry.io/explore/traces/trace/1fa4ad3550e2498d8b2a39e2cbed439c)을 MCP로 확인했다. 테스트용 클릭을 사용한 수집 검증이며 운영 배포는 별도다.

## 자동 검사와 실제 전송 검사

일반 unit/E2E는 빈 키 또는 가짜 수집 서버를 사용한다. `test:observability`는 운영 빌드와 실제 SDK의 전송 본문을 외부 경계에서 가로채 검사한다. 이 결과만으로 실제 서비스 수신을 주장하지 않는다.

다음 명령은 **설정한 실제 수집 서버에 이벤트를 전송한다**. 전용 테스트 PostgreSQL(55444의 game_feedback_test)이 실행 중이어야 한다. 처음 만든 worktree에서는 contracts 빌드와 Prisma 생성을 먼저 한다.

```sh
yarn workspace @game-feedback/contracts build
yarn workspace @game-feedback/api db:generate
yarn workspace @side/game-feedback sentry:check
yarn workspace @game-feedback/web monitoring:check
```

`sentry:check`는 개발 서버·DB 없이 API 확인 오류 1건을 보낸다. `verification:configuration-check`, `service:game-feedback`, `layer:api`와 출력된 eventId로 찾는다.

`monitoring:check`는 3354/4354 포트에 전용 API와 **운영 빌드 웹**을 띄운다. DB는 실행마다 만든 gf_test_web 스키마만 쓰고 종료 시 지운다. API의 OAuth·게임 제공자는 대역이고 S3는 실제 버킷의 실행별 격리 경로를 사용하며 실제 Sentry·Amplitude 전송은 브라우저에서만 켠다. 다른 서버가 포트를 쓰고 있으면 실패하며 재사용하거나 종료하지 않는다. 재시도는 하지 않는다.

검사는 쿠키·검색어·오류에 무해한 확인 문자열을 넣어 실제 전송 본문에 남지 않는지, Sentry의 서비스/실행 위치, Amplitude 페이지뷰의 screen/client, 양쪽 수집 응답을 확인한다. trace·영상·화면 캡처를 남기지 않는다. 결과는 프로젝트 `.data/monitoring-web-verification.json`에 상태·eventId·이벤트 이름만 저장한다. 키나 쿠키는 보고서에 쓰지 않는다.

## 전송 데이터

웹 Sentry는 요청·사용자·breadcrumbs·문맥·extra·오류 메시지 원문을 제거한다. 오류 종류, React 오류 번호, 스택 위치, 환경·release와 코드에서 정한 태그를 남긴다. API도 SQL 인자 대신 오류 종류·코드·호출 위치만 보낸다. 이는 SDK가 보내는 본문의 정책이며 수집 서비스 자체의 IP/지역 보관 설정과는 별개다.

Amplitude는 IP·페이지 제목·검색어·fragment를 보내지 않고 화면 이름, client, locale, viewport_bucket을 기록한다. 로그인 성공, 가입, 글쓰기, 채팅 시작, 메시지 성공은 타입 카탈로그에 있고 서버 성공 뒤 집계한다. 입력 원문은 보내지 않는다. 계정 전환과 로그아웃 때 식별자를 초기화한다. 자동 수집한 URL은 enrichment에서 검색어·fragment를 제거한다.

## MCP로 수신 재확인

```sh
codex mcp add sentry --url https://mcp.sentry.dev/mcp
codex mcp add amplitude --url https://mcp.amplitude.com/mcp
```

OAuth 연결은 앱 DSN/API key 설정과 별개다. 기존 인증을 재사용하고 인증 토큰을 저장소에 넣지 않는다. Sentry MCP에서 출력된 eventId를 다시 조회해 environment/release/service/layer를 확인한다. 웹 확인 오류 종류는 MonitoringVerificationError다. Amplitude MCP는 프로젝트 목록 → 이벤트 목록 → 해당 프로젝트의 실제 집계 순으로 조회한다. HTTP 성공과 서비스 내 재조회 성공을 구분해 기록한다.

2026-10-25 검증에서 두 프로젝트의 API·브라우저 Sentry 이벤트를 실제 수집 후 MCP로 조회했고, 개발 Amplitude 프로젝트의 페이지뷰 집계도 조회했다. 운영 계정의 트래픽·모바일 실기기·배포 완료를 뜻하지 않는다. Photo Contest의 별도 검증은 [모니터링 안내](../../photo-contest/docs/observability.md)를 따른다.
