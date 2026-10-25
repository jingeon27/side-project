# Sentry·Amplitude 수신 검증

설정은 `projects/photo-contest/.env` 하나에서 읽는다. API는 SENTRY_DSN, 웹은 NEXT_PUBLIC_SENTRY_DSN·NEXT_PUBLIC_AMPLITUDE_API_KEY를 사용한다. Expo 앱도 같은 공개 키를 설정에 담으며 별도 모바일 env 키를 쓰지 않는다. 환경은 기존 NODE_ENV를 사용한다.

프로젝트 집계 명령뿐 아니라 `@photo-contest/web dev/build/start`도 실행 전에 루트 .env를 읽는다. 명시한 프로세스 값(빈 키 포함)이 우선한다. build/start는 프레임워크 NODE_ENV를 production으로 고정한다. 공개 키는 빌드 전에 반영해야 한다.

## 실제 전송 확인

전용 테스트 PostgreSQL과 루트 TEST_DATABASE_URL을 준비한다. 다른 개발 서버는 종료하거나 재사용하지 않는다. 처음 만든 worktree에서는 Prisma와 GraphQL 문서를 생성한다.

```sh
corepack yarn workspace @photo-contest/api db:generate
corepack yarn workspace @photo-contest/web codegen
corepack yarn workspace @side/photo-contest sentry:check
corepack yarn workspace @photo-contest/web monitoring:check
```

`sentry:check`는 DB 없이 실제 API DSN으로 확인 오류 1건을 보낸다. 수집 응답과 eventId를 출력한다. `verification:configuration-check`, `service:photo-contest`, `layer:api`로 찾는다.

`monitoring:check`는 3336/4336 포트, 실행마다 만든 web_e2e DB 스키마, S3 대역과 **운영 빌드 웹**을 사용한다. 브라우저에서 실제 Sentry·Amplitude로 전송하며 가짜 쿠키·검색어·오류 메시지가 전송 본문에서 사라지는지 확인한다. 페이지뷰는 한 번만 기록돼야 하고 원본 URL 대신 path_template이 있어야 한다. Sentry에는 service와 layer가 있어야 한다. 기본 unit/E2E에서는 이 별도 디렉터리를 수집하지 않으며 실제 키를 켜지 않는다.

확인용 오류 종류는 MonitoringVerificationError다. trace·캡처·영상은 남기지 않는다. 프로젝트 `.data/monitoring-web-verification.json`에는 상태·eventId·이벤트 이름만 저장하고 키·쿠키는 넣지 않는다. 종료 시 이번 DB 스키마와 S3 대역을 정리한다. 포트가 사용 중이면 검사만 실패한다.

## 데이터와 구분

Sentry는 API·Next 서버·브라우저에 각각 layer=api/next-server/browser와 service=photo-contest를 붙인다. 브라우저는 기존 client=web/app도 유지한다. 웹 오류의 메시지·extra·request·user·breadcrumbs·문맥과 스택 쿼리·지역 변수·소스 문맥은 제거한다. Next SDK의 contexts.nextjs.request_path도 제거 대상이다. 오류 종류, React 오류 번호와 호출 위치는 유지한다. 수집 서비스 자체의 IP/지역 보관 설정은 별도로 관리한다.

Amplitude는 SDK 원격 설정·자동 URL 보강을 끈다. 자동 페이지뷰를 끄는 것만으로는 URL 보강이 꺼지지 않는다. 페이지뷰는 경로 템플릿으로 직접 보내고 StrictMode의 effect 재실행에서는 중복 집계하지 않는다. 원본 ID가 다른 그룹으로 이동하면 같은 템플릿이어도 새 방문을 기록한다.

2026-10-25 실제 전송 검사에서 자동 URL 보강의 검색어 전송과 개발 모드 페이지뷰 중복을 재현하고 수정했다. API·브라우저 Sentry 이벤트를 MCP로 재조회했고 개발 Amplitude 프로젝트의 페이지뷰 집계도 확인했다. Next 서버 오류는 실제 SDK와 격리 transport로 추가 검증한다. 운영 트래픽·실기기·배포 검증은 포함하지 않는다. MCP 연결 방법은 [공통 흐름 안내](../../game-feedback/docs/observability.md#mcp로-수신-재확인)를 참고한다.
