# 오류와 이용 흐름 관측

웹은 Sentry 오류와 Amplitude 이벤트를 수집한다. API는 500 오류만 수집한다. 모바일 SDK, 성능 span, Web Vitals, Replay와 소스맵 업로드는 포함하지 않는다. 빈 키는 SDK 전송을 비활성화하며 일반 테스트는 키를 강제로 비운다.

## 운영자가 설정할 값

- Sentry 조직 `game-feedback` 아래 Web/API 프로젝트를 만든다. Spike Protection, DSN rate limit, Inbound Filters와 알림 주소를 설정한다.
- Amplitude production/dev 프로젝트를 분리한다. 현재 웹은 US endpoint를 사용한다. 실제 프로젝트 저장 국가와 보유 기간을 확인하고 개인정보 안내 ko/en/ja를 확정한 뒤 공개 환경에서 키를 켠다. 해당 콘솔 값은 코드 검사로 확인할 수 없다.
- GitHub Variables `GF_WEB_SENTRY_DSN`, `GF_AMPLITUDE_API_KEY`는 shared-instance 워크플로의 웹 빌드 인자다. 변경하면 웹 이미지를 다시 빌드한다.
- 서버 서비스 `.env`의 `SENTRY_DSN`은 API용이다. 선택 값은 `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`다. DSN과 공개 API key는 인증 토큰과 다르며 Sentry Auth Token은 사용하지 않는다.

웹 오류는 요청, 사용자, breadcrumb, 오류 메시지 원문을 제거하고 React 오류 번호와 종류·스택만 보존한다. API도 SQL 인자 유출을 피하려고 메시지 원문을 버린다. Amplitude는 IP, 클릭, 다운로드, 네트워크와 Web Vitals 수집을 끄고 URL 검색어·fragment·제목을 제거한다. 자동 페이지뷰도 viewport_bucket/client/locale/screen enrichment를 거친다. #418은 무시하지 않으며 댓글의 서버/클라이언트 최초 시간 표시를 일치시켰다.

## 이벤트와 차트

타입 카탈로그는 login_opened, login_provider_selected(provider), login_succeeded(provider), signup_completed(provider), post_created(board, game), chat_started(source), message_sent(has_attachment)를 정의한다. 로그인 성공은 같은 탭의 30분 유효 표시가 있을 때만 센다. mutation 이벤트는 서버 성공 후 기록하며 본문·상대 ID는 담지 않는다. 계정 전환과 로그아웃은 식별자를 초기화한다.

Amplitude에서 7일 전환 기간으로 가입→글쓰기와 가입→게시글 페이지뷰→게시글 채팅→메시지 퍼널을 만든다. 기존 사용자는 login_succeeded로 시작한다. 로그인 앞단은 제공자별 login_opened→login_provider_selected→성공으로, 기기는 client×viewport_bucket, 유입/이탈은 screen 또는 Page Path로 확인한다. 배포 후 실제 수신을 확인하고 일주일 뒤 Usage의 쿼터를 검토한다. EU 대상 공개 여부와 분석 동의 정책은 운영자가 공개 전에 결정한다.

## 검증

API와 웹 단위 테스트는 SDK 경계에서 이벤트와 개인정보 제거를 검사한다. `yarn workspace @game-feedback/web test:observability`는 별도 격리 API·웹을 띄우고 가짜 키로 실제 SDK의 네트워크 요청만 가로챈다. 일반 E2E는 빈 키에서 요청이 없음을 검사한다. 이 결과는 실제 Sentry Issues/Amplitude 콘솔 수신 확인을 대신하지 않는다.

프로덕션 조건은 `GF_OBSERVABILITY_PRODUCTION=true yarn workspace @game-feedback/web test:observability`로 별도 빌드/start와 가짜 키를 사용해 검증한다. 오류만 수집하는 설정에서 서버 시작과 SDK 전송 검사가 3개 모두 통과했다.
