# API (NestJS 12 · schema-first GraphQL · Prisma 6)

도메인 규칙과 인증 흐름은 `../../.claude/skills/contest-api/SKILL.md`, 테스트 레인은 `../../.claude/skills/testing/SKILL.md`를 먼저 읽는다.

## 모듈 지도 (`src`)

| 위치 | 맡는 것 |
| --- | --- |
| `main.ts` · `bootstrap.ts` · `app.module.ts` · `instrumentation.ts` | listen, `createApp()`(미들웨어·필터·body parser 연결만, listen 안 함), 모듈 조립, Sentry 초기화(main의 첫 import) |
| `config/` | `env.ts`(호출할 때마다 읽는 getter), `limits.ts`(모든 숫자 한도), `paths.ts`(package.json 기준 API·프로젝트 루트) |
| `common/` | `errors.ts`(fail·ERROR_CODE·HTTP 매핑), `validation.ts`, `crypto.ts`, `http/`(cookie-header 파서, Origin 검사, no-store, 예외 필터), `graphql/`(DateTime, context, Apollo 옵션) |
| `database/` · `storage/` | 전역 모듈. `Database.atomic()`(Serializable 재시도), 비공개 사진 저장소(local·S3) |
| `auth/` | `me`, 아이디·비밀번호 가입/로그인(scrypt)·개발 로그인·로그아웃·OAuth·앱 로그인 교환, `session.service`(쿠키 헤더 → 조회자, 요청당 한 번), `@Viewer()`/`@OptionalViewer()` |
| `group/` · `contest/` · `submission/` · `like/` · `vote/` · `moderation/` | 각 `.graphql`이 계약. `group`은 멤버십 권한(`membership.service`)과 그룹 순위, `contest`는 단계·결과 순위, `submission`은 목록·정렬·업로드(`POST /uploads/:token`)·사진 조회(`GET /photos/:id`)·sharp 변환 |
| `post/` | 상시 그룹 사진·동영상 게시물, 멤버 전용 댓글·실제 개수·작성자/관리자 삭제, KST 이달의 인기, 좋아요·작성자/관리자 삭제, GraphQL multipart 일회용 업로드·비공개 byte Range 스트리밍 |
| `feed/` | `myPhotoFeed`: 가입한 모든 그룹의 공개 사진을 전체 최신순(createdAt·id desc)으로 offset 조회. 홈에는 관리자도 숨긴 사진·신고 정보를 받지 않는다 |
| `analytics/` · `maintenance/` | 도메인 이벤트 DB 기록과 대회 종료 기록, 겹치지 않는 주기 정리(업로드·세션·OAuth 시도·앱 로그인 티켓) — 테스트는 `SchedulerService.runOnce()` |
| `testing/` | NODE_ENV=test와 ENABLE_TEST_API=true에서만 사용자·세션·단계·외부 콜백 티켓 fixture를 만든다 |
| `health/` | `GET /health`(DB), `GET /app/config`(모바일 최소·최신 버전) |
| `monitoring/` | Sentry 옵션(DSN 없으면 init 안 함, PII 제거 `beforeSend`)과 `reportUnexpectedError()`(원문 대신 오류 종류·code·호출 위치 + 태그) |

## 규칙

- 상시 게시물은 Post 도메인에 둔다. Contest·Submission은 기존 호환 계약이다. 새 기능은 모듈 하나(`<name>.graphql` + module + resolver + service)로 추가하고 `app.module.ts`에 등록한다. resolver·controller는 얇게, 권한은 `membership.service`로만.
- GraphQL을 바꾸면 웹 `codegen`과 웹 계약 테스트를 같이 돌린다. 오류 메시지를 바꾸면 웹·테스트도 바꾼다.
- 세션 쿠키는 `cookie-header.ts`로만 읽는다(cookie-parser 없음). GET·HEAD·OPTIONS 밖의 요청은 인증보다 먼저 Origin을 검사한다.
- 환경변수는 `config/env.ts` getter로만 읽는다. 숫자 한도는 `config/limits.ts`에만 둔다.
- 닫힌 집합 분기는 ts-pattern `exhaustive()`, 일반 유틸은 es-toolkit.
- 사진 목록은 offset/limit(`pageRange`)이고 정렬 마지막 기준은 id다. 좋아요 수는 읽을 때 `_count`로 센다 — 카운터 컬럼이나 커서를 두지 않는다.
- Amplitude로 보내지 않는다. 이벤트는 같은 트랜잭션에서 `AnalyticsEvent`에 기록만 하고 개인정보(닉네임·캡션·토큰)를 넣지 않는다.
- Sentry는 예상하지 못한 오류만: GraphQL `INTERNAL_SERVER_ERROR`는 `internal-error.plugin`이 operationName 태그로, REST 5xx는 `ApiExceptionFilter`가 라우트 패턴 태그로 보낸다. 업무 오류는 `fail()`로 던져 4xx로 끝나게 하고, 직접 보고할 때도 `captureException` 대신 `reportUnexpectedError()`를 쓴다.
- Prisma 스키마를 바꾸면 마이그레이션을 추가하고 `db:generate`. 파괴적 변경은 피한다. 개발 DB에는 사용자가 `db:migrate`로 적용한다.

## 빌드·실행

- `build`·`dev`는 `tsconfig.build.json`(src만, spec 제외)으로 `dist`에 낸다. `tsconfig.json`은 타입 검사 전용(noEmit, 테스트 포함).
- 사용자의 개발 서버는 `dist/main.js`를 본다(`node --watch`). 검증용 빌드는 다른 outDir로 하고, 테스트 API는 test-kit이 `.e2e-build`로 빌드한다.

## 테스트

| 스크립트 | 내용 |
| --- | --- |
| `test` · `test:unit` | Vitest `unit`: `src/**/*.spec.ts`(순수 규칙, 쿠키 파서, PKCE 벡터, sharp 변환 등) |
| `test:e2e` | Vitest `e2e`: `test/e2e/**/*.spec.ts`(확인된 버그 회귀는 `*.test.ts`). globalSetup이 격리 스키마를 하나 만들고(`api_test_*`) 끝나면 지운다. 하네스가 `createApp()`만 하고 supertest(`request(app.getHttpServer())`)로 요청한다 — 포트를 열지 않는다. 파일끼리 스키마를 공유하므로 닉네임·그룹 이름을 고유하게 만든다. |

Vitest는 unplugin-swc로 데코레이터 메타데이터를 살려 TS 소스를 직접 테스트한다. API에는 Playwright가 없다.

## 앱 스킬

- `.claude/skills/module/SKILL.md`: 모듈·resolver·권한·schema/codegen 계약.
- `.claude/skills/auth/SKILL.md`: Cookie·Origin·OAuth·앱 PKCE 교환.
- `.claude/skills/prisma/SKILL.md`: 스키마·마이그레이션·Serializable.
- `.claude/skills/api-test/SKILL.md`: unit·실제 DB/supertest e2e·하네스.

테스트용 /testing API는 NODE_ENV=test·ENABLE_TEST_API=true에서만 동작한다. 개발·운영에서 true이면 createApp이 시작을 거부한다. 사용자+세션·대회 단계·외부 성공 콜백 티켓을 준비하며 운영 제품 API에 fixture 분기를 넣지 않는다.
