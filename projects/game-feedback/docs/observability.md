# 오류와 이용 흐름 관측

웹은 Sentry 오류와 Amplitude 이벤트를 수집한다. API는 500 오류만 수집한다. 모바일 SDK, 성능 span, Web Vitals, Replay와 소스맵 업로드는 포함하지 않는다. 빈 키는 SDK 전송을 비활성화하며 일반 테스트는 키를 강제로 비운다.

## 운영자가 설정할 값

- 사용 중인 Sentry 조직 아래 Web/API 프로젝트를 만든다. Spike Protection, DSN rate limit, Inbound Filters와 알림 주소를 설정한다.
- Amplitude production/dev 프로젝트를 분리한다. 현재 웹은 US endpoint를 사용한다. 실제 프로젝트 저장 국가와 보유 기간을 확인하고 개인정보 안내 ko/en/ja를 확정한 뒤 공개 환경에서 키를 켠다. 해당 콘솔 값은 코드 검사로 확인할 수 없다.
- GitHub Variables `GF_WEB_SENTRY_DSN`, `GF_AMPLITUDE_API_KEY`는 shared-instance 워크플로의 웹 빌드 인자다. 변경하면 웹 이미지를 다시 빌드한다.
- 서버 서비스 `.env`의 `SENTRY_DSN`은 API용이다. 환경 구분은 공통 `ENVIRONMENT` 하나를 사용하고 release는 `SENTRY_RELEASE`로 지정한다. DSN과 공개 API key는 인증 토큰과 다르며 Sentry Auth Token은 사용하지 않는다.

## 로컬에서 먼저 확인하기

저장소 루트에서 `projects/game-feedback/.env.example`을 `projects/game-feedback/.env`로 복사한 뒤 다음 값을 채운다. 이미 `.env`가 있으면 필요한 값만 추가한다. 실제 키를 Git에 올리지 않는다.

```dotenv
NEXT_PUBLIC_AMPLITUDE_API_KEY=<Amplitude development 프로젝트 API key>
NEXT_PUBLIC_SENTRY_DSN=<Sentry 브라우저 DSN>
SENTRY_DSN=<Sentry 서버 DSN>
ENVIRONMENT=development
SENTRY_RELEASE=local-development
```

Sentry 프로젝트의 Settings → Client Keys (DSN), Amplitude 프로젝트의 Settings → Projects → API Keys에서 값을 확인한다. Amplitude는 현재 US endpoint를 사용하므로 US 개발 프로젝트를 사용한다. Sentry는 로컬 확인용 프로젝트 하나의 DSN을 두 변수에 넣어도 된다. 집계 실행은 `SENTRY_DSN`을 API와 Next 서버에 함께 전달한다. Next 서버는 이 값이 없으면 `NEXT_PUBLIC_SENTRY_DSN`을 사용한다. API와 Next 서버를 별도 Sentry 프로젝트로 나누려면 프로세스별 환경변수를 따로 전달해야 한다.

```sh
nvm use
corepack yarn workspace @side/game-feedback dev:test
```

`ENVIRONMENT`는 development/test/production 중 하나다. 집계 실행기가 Node·Next 프레임워크용 `NODE_ENV`를 같은 값으로 맞추므로 .env에 별도로 넣지 않는다. Sentry 전용 환경 설정도 없다. Next 빌드는 `ENVIRONMENT`와 `SENTRY_RELEASE`를 공개 번들에 정적으로 전달한다. `NEXT_PUBLIC_ENVIRONMENT`·`NEXT_PUBLIC_SENTRY_RELEASE`를 따로 설정할 필요는 없다. 운영 이미지의 release는 GitHub commit SHA이며 API·Next 서버·브라우저에 같은 값을 사용한다.

변경 전에 실행 중이던 Web/API는 종료 후 다시 시작한다. `NEXT_PUBLIC_*`는 브라우저 번들에 반영되므로 화면도 새로고침한다. `@game-feedback/web dev`처럼 앱만 직접 시작하면 프로젝트 루트 `.env`를 읽는 집계 로더를 거치지 않는다. 이 경우 Next의 `apps/web/.env.local`과 API 프로세스 환경을 별도로 관리해야 한다.

1. <http://localhost:3300/ko>에서 화면 이동과 로그인 열기를 실행한다. 개발자 도구 Network에서 Amplitude 수집 요청의 성공 응답을 확인하고, Amplitude의 이벤트 수신 화면에서 페이지뷰와 `login_opened`, `login_provider_selected`를 확인한다. 글쓰기와 채팅 성공 이벤트는 해당 API가 성공한 뒤에만 발생한다.
2. Sentry 브라우저 초기화 확인은 개발자 도구 Console에서 `setTimeout(() => { throw new Error('local-sentry-check'); }, 0)`을 실행한다. 수집 요청의 성공 여부와 Issues의 최근 이벤트를 확인한다. 개인정보 제거 정책으로 오류 메시지는 일반 문구로 바뀔 수 있으므로 발생 시간과 환경으로 찾는다.
3. API는 처리하지 못한 500 오류만 전송한다. 입력 오류·권한 거부 같은 4xx는 Sentry 확인용 오류가 아니다. API 단위 검사는 가짜 transport로 500 수집과 정보 제거를 검증하며 실제 콘솔 수신을 대신하지 않는다.

API 설정으로 실제 수집 서버에 확인용 이벤트 1건을 보내려면 다음 명령을 실행한다. DB·개발 서버를 시작하지 않고 정상 오류 보고와 같은 개인정보 제거 함수를 사용한다. 값은 출력하지 않으며 수집 응답이 2xx인 경우에만 성공한다. Sentry Issues에서 `verification:configuration-check`, `service:game-feedback` 태그와 출력된 eventId로 찾는다.

```sh
corepack yarn workspace @side/game-feedback sentry:check
corepack yarn workspace @side/photo-contest sentry:check
```

이 검사는 API DSN 연결을 확인한다. 브라우저 번들 반영과 Sentry UI의 이슈 생성은 별도로 확인한다. 운영 웹의 공개 키는 로컬 `.env`가 아니라 GitHub 빌드 Variables에서 들어가므로 값 변경 후 웹 이미지를 다시 빌드해야 한다. 부하 측정은 [부하테스트 안내](load-testing.md)를 따른다.

로컬 오류 수집에는 `SENTRY_AUTH_TOKEN`이 필요하지 않다. 소스맵 업로드는 CI용 인증 토큰을 사용하는 별도 작업이며 현재 자동 업로드는 구현되지 않았다. 현재 tracing은 꺼져 있어 키를 넣어도 Web Vitals나 성능 span은 수집되지 않는다. Game Feedback 네이티브 셸에 별도 관측 SDK는 없으며 WebView 안의 웹 이벤트가 위 웹 키로 전송된다.

Photo Contest는 `projects/photo-contest/.env`에 해당 웹/API 키를 넣고 `corepack yarn workspace @side/photo-contest dev`로 시작한다. 그 서비스의 Expo 앱은 `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_AMPLITUDE_API_KEY`를 `projects/photo-contest/apps/mobile/.env` 또는 모바일 실행/빌드 환경에서 별도로 전달한다. Game Feedback 키와 프로젝트를 혼용하지 않는다.

웹 오류는 요청, 사용자, breadcrumb, 오류 메시지 원문을 제거하고 React 오류 번호와 종류·스택만 보존한다. API도 SQL 인자 유출을 피하려고 메시지 원문을 버린다. Amplitude는 IP, 클릭, 다운로드, 네트워크와 Web Vitals 수집을 끄고 URL 검색어·fragment·제목을 제거한다. 자동 페이지뷰도 viewport_bucket/client/locale/screen enrichment를 거친다. #418은 무시하지 않으며 댓글의 서버/클라이언트 최초 시간 표시를 일치시켰다.

## 이벤트와 차트

타입 카탈로그는 login_opened, login_provider_selected(provider), login_succeeded(provider), signup_completed(provider), post_created(board, game), chat_started(source), message_sent(has_attachment)를 정의한다. 로그인 성공은 같은 탭의 30분 유효 표시가 있을 때만 센다. mutation 이벤트는 서버 성공 후 기록하며 본문·상대 ID는 담지 않는다. 계정 전환과 로그아웃은 식별자를 초기화한다.

Amplitude에서 7일 전환 기간으로 가입→글쓰기와 가입→게시글 페이지뷰→게시글 채팅→메시지 퍼널을 만든다. 기존 사용자는 login_succeeded로 시작한다. 로그인 앞단은 제공자별 login_opened→login_provider_selected→성공으로, 기기는 client×viewport_bucket, 유입/이탈은 screen 또는 Page Path로 확인한다. 배포 후 실제 수신을 확인하고 일주일 뒤 Usage의 쿼터를 검토한다. EU 대상 공개 여부와 분석 동의 정책은 운영자가 공개 전에 결정한다.

## 검증

API와 웹 단위 테스트는 SDK 경계에서 이벤트와 개인정보 제거를 검사한다. `yarn workspace @game-feedback/web test:observability`는 별도 격리 API·웹을 띄우고 가짜 키로 실제 SDK의 네트워크 요청만 가로챈다. 일반 E2E는 빈 키에서 요청이 없음을 검사한다. 이 결과는 실제 Sentry Issues/Amplitude 콘솔 수신 확인을 대신하지 않는다.

프로덕션 조건은 `GF_OBSERVABILITY_PRODUCTION=true yarn workspace @game-feedback/web test:observability`로 별도 빌드/start와 가짜 키를 사용해 검증한다. 오류만 수집하는 설정에서 서버 시작과 SDK 전송 검사가 3개 모두 통과했다.

서버 DSN fallback은 NEXT_PUBLIC 값을 정적 속성으로 읽어 이미지 빌드 시 포함한다. production 관측 검사는 시작 프로세스에서 공개 키 환경변수를 비워도 빌드에 들어간 키로 동작하는지 확인한다.

## Sentry MCP 연결

Codex에서는 `codex mcp add sentry --url https://mcp.sentry.dev/mcp`로 등록하고 브라우저의 OAuth 인증을 완료한다. 이미 등록했으면 `codex mcp login sentry`로 인증한다. `codex mcp list`에서 연결을 확인한 뒤 조직·프로젝트와 실제 이벤트의 environment/release를 조회한다. MCP 계정 인증은 DSN을 넣는 오류 수집 설정과 별개이며 인증 토큰을 저장소에 기록하지 않는다.
