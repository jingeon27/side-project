# 오류와 이용 흐름 관측

API는 예상하지 못한 오류만 Sentry로 보낸다. Next 서버와 브라우저도 같은 오류 정리 정책을 적용한다. 브라우저는 Web Vitals도 수집하고, Amplitude는 웹의 제품 이벤트를 수집한다. SDK 키가 비어 있으면 전송하지 않는다.

## 설정과 실행

설정은 `projects/game-feedback/.env` 하나에서 읽는다. 웹은 `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_AMPLITUDE_API_KEY`, API는 `SENTRY_DSN`을 사용한다. 환경은 `ENVIRONMENT`, 배포 버전은 `SENTRY_RELEASE`다. 모바일 셸도 이 루트 파일의 공개 키를 Expo 설정으로 전달하며 별도 모바일 env 키를 만들지 않는다.

`@side/game-feedback dev`와 `@game-feedback/web dev` 모두 루트 설정을 읽는다. 웹의 build/start도 같은 실행기를 거친다. 프로세스에서 명시한 값(빈 키 포함)이 파일보다 우선하고 build/start의 프레임워크 `NODE_ENV`는 production이다. 공개 키·환경·release는 빌드에 고정되므로 운영 값을 바꾸면 다시 빌드한다. 로컬에서 이미 실행 중인 서버에는 이후 수정한 값이 자동 반영되지 않는다.

Sentry에서 `service:game-feedback`과 `layer:api`, `layer:next-server`, `layer:browser`로 발생 위치를 구분한다. API와 Next 서버가 같은 DSN을 사용해도 이 태그로 나눌 수 있다. 브라우저·WebView는 기존 `client` 태그로 구분한다. Amplitude는 US 데이터 센터와 개발/운영 별도 프로젝트를 사용한다.

## Web Vitals

공개 DSN이 있으면 Sentry의 BrowserTracing으로 LCP·CLS·INP와 FCP·TTFB를 수집한다. 브라우저 성능 span 수집률은 100%이며 fetch·XHR·긴 작업의 추가 계측은 끈다. Sentry 11의 기본 span streaming과 `beforeSendSpan`을 사용한다. 화면 이름과 segment 이름의 ID·검색어는 제거하며, 원본 URL·DOM 선택자·사용자 정보·쿠키를 span 속성에 남기지 않는다. 지표 숫자, 추적 ID, 환경·release와 성능 점수 계산에 필요한 브라우저 User-Agent는 유지한다.

Sentry의 Insights → Frontend → Web Vitals에서 프로젝트 `game-feedback`을 선택한다. 성능 span의 `service=game-feedback`, `layer=browser`, `client=browser|webview`로 구분할 수 있다. 지표는 브라우저 지원 여부에 따라 달라지며, INP는 실제 상호작용 뒤, LCP·CLS는 화면을 떠나거나 숨길 때 최종 보고될 수 있다.

`test:observability`는 실제 Chromium의 측정값 5종과 개인정보 제거를 검사한다. 실제 수신만 다시 확인할 때는 `monitoring:check --grep LCP`를 사용한다. 측정값·응답 상태·trace ID만 담은 `web-vitals-receipt` 첨부가 테스트 결과에 남으며 MCP에서 해당 trace를 조회할 수 있다.

2026-10-26 격리한 로컬 운영 빌드에서 실제 수집 응답 200과 [LCP·CLS·INP span 수신](https://jingeons-side-project.sentry.io/explore/traces/trace/1fa4ad3550e2498d8b2a39e2cbed439c)을 MCP로 확인했다. 테스트용 클릭을 사용한 수집 검증이며 운영 배포는 별도다.

## 자동 검사와 실제 전송 검사

일반 unit/E2E는 빈 키 또는 가짜 수집 서버를 사용한다. `test:observability`는 운영 빌드와 실제 SDK의 전송 본문을 외부 경계에서 가로채 검사한다. 이 결과만으로 실제 서비스 수신을 주장하지 않는다.

다음 명령은 **설정한 실제 수집 서버에 이벤트를 전송한다**. 전용 테스트 PostgreSQL(55444의 game_feedback_test)이 실행 중이어야 한다. 처음 만든 worktree에서는 contracts 빌드와 Prisma 생성을 먼저 한다.

```sh
corepack yarn workspace @game-feedback/contracts build
corepack yarn workspace @game-feedback/api db:generate
corepack yarn workspace @side/game-feedback sentry:check
corepack yarn workspace @game-feedback/web monitoring:check
```

`sentry:check`는 개발 서버·DB 없이 API 확인 오류 1건을 보낸다. `verification:configuration-check`, `service:game-feedback`, `layer:api`와 출력된 eventId로 찾는다.

`monitoring:check`는 3354/4354 포트에 전용 API와 **운영 빌드 웹**을 띄운다. DB는 실행마다 만든 gf_test_web 스키마만 쓰고 종료 시 지운다. API의 OAuth·S3·게임 제공자는 대역이며 실제 Sentry·Amplitude 전송은 브라우저에서만 켠다. 다른 서버가 포트를 쓰고 있으면 실패하며 재사용하거나 종료하지 않는다. 재시도는 하지 않는다.

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
