# API (NestJS 12 · schema-first GraphQL · Prisma 7)

도메인 규칙과 인증 흐름은 `../../.agents/skills/contest-api/SKILL.md`, 테스트 레인은 `../../.agents/skills/testing/SKILL.md`를 먼저 읽는다.

## 모듈 지도 (`src`)

| 위치 | 맡는 것 |
| --- | --- |
| `main.ts` · `bootstrap.ts` · `app.module.ts` · `instrumentation.ts` | listen, `createApp()`(미들웨어·필터·body parser 연결만, listen 안 함), 모듈 조립, Sentry 초기화(main의 첫 import) |
| `config/` | `env.ts`(호출할 때마다 읽는 getter), `limits.ts`(모든 숫자 한도), `paths.ts`(package.json 기준 API·프로젝트 루트) |
| `common/` | `errors.ts`(fail·ERROR_CODE·HTTP 매핑), `validation.ts`, `crypto.ts`, `http/`(cookie-header 파서, Origin 검사, no-store, 예외 필터), `graphql/`(DateTime, context, Apollo 옵션) |
| `database/` · `storage/` | 전역 모듈. `Database.atomic()`(Serializable 재시도), 비공개 S3 미디어 저장소(서명 POST·서명 GET·HEAD·DELETE만, 파일 바이트를 다루지 않는다) |
| `auth/` | `me`, 아이디·비밀번호 가입/로그인(scrypt)·익명 세션·로그아웃, `session.service`(쿠키 헤더 → 조회자, 요청당 한 번), `profile/`은 개인 사진 S3 업로드·프로필 편집·가입 설정 완료, `@Viewer()`/`@OptionalViewer()` |
| `group/` · `contest/` · `submission/` · `like/` · `vote/` · `moderation/` | 각 `.graphql`이 계약. `group`은 멤버십 권한(`membership.service`)과 그룹 순위, `contest`는 단계·결과 순위, `submission`은 목록·정렬·presigned 대회 업로드 발급·완료·사진 조회(`GET /photos/:id` 307) |
| `media-upload/` | 게시물·대회·대표 사진의 최종 키 서명 발급, 소유권·만료·용도 확인, HEAD로 크기·형식을 본 뒤 완료 |
| `post/` | 상시 그룹 사진·동영상 게시물, 공개 범위에 따른 댓글 조회·멤버 전용 작성·실제 개수·작성자/관리자 삭제, KST 이달의 인기, 좋아요·작성자/관리자 삭제, presigned POST 업로드 발급·완료, 공개 범위를 확인한 뒤 60초 서명 GET으로 보내는 `/media/:id` 307 |
| `feed/` | `myPhotoFeed`: 가입한 모든 그룹의 공개 사진을 전체 최신순(createdAt·id desc)으로 offset 조회. 홈에는 관리자도 숨긴 사진·신고 정보를 받지 않는다 |
| `analytics/` · `maintenance/` | 도메인 이벤트 DB 기록과 대회 종료 기록, 겹치지 않는 주기 정리(업로드·세션·OAuth 시도·앱 로그인 티켓) — 테스트는 `SchedulerService.runOnce()` |
| `testing/` | NODE_ENV=test에서 createApp({ testFixtures: true })로 등록한 경우에만 사용자·세션·단계 fixture를 만든다 |
| `health/` | `GET /health`(DB), `GET /app/config`(모바일 최소·최신 버전) |
| `monitoring/` | Sentry 옵션(DSN 없으면 init 안 함, PII 제거 `beforeSend`)과 `reportUnexpectedError()`(원문 대신 오류 종류·code·호출 위치 + 태그) |

## 규칙

- 상시 게시물은 Post 도메인에 둔다. Contest.format=POST는 그룹의 선택 참여 대회이고 format=LEGACY·Submission은 기존 호환 계약이다. 새 기능은 모듈 하나(`<name>.graphql` + module + resolver + service)로 추가하고 `app.module.ts`에 등록한다. resolver·controller는 얇게, 권한은 `membership.service`로만. 공개 Post·미디어·댓글 읽기는 `readableGroup`·`readablePost`, 쓰기·좋아요·삭제는 `requireMember`·`accessiblePost`를 쓴다. 게시물·그룹 대회·기존 대회·기존 사진처럼 하위 리소스 ID로 묻는 접근은 비멤버(비로그인 포함)에게 없는 ID와 같은 NOT_FOUND를 준다(비공개 그룹의 하위 리소스, 그리고 공개 그룹이어도 멤버 전용인 기존 대회·사진). 그룹 메타데이터는 공개이므로 그룹 ID로 묻는 조회는 UNAUTHENTICATED·FORBIDDEN으로 가입을 안내하고, 공개 그룹 게시물에 대한 비멤버의 쓰기는 FORBIDDEN이다. 새 하위 리소스 접근에는 `requireMemberOf`·`readableGroup(…, concealAs)`를 쓴다. 기존 Contest·Submission은 공개 그룹이어도 멤버 전용이다. 그룹 메타데이터는 탐색 가능하지만 비멤버의 role·inviteToken은 null, members는 빈 배열이다. 가입 신청은 `(groupId,userId)` unique + Serializable이며 수락·거절은 OWNER·MODERATOR가 한다.
- GraphQL을 바꾸면 웹 `codegen`과 웹 계약 테스트를 같이 돌린다. 오류 메시지를 바꾸면 웹·테스트도 바꾼다.
- 세션 쿠키는 `cookie-header.ts`로만 읽는다(cookie-parser 없음). GET·HEAD·OPTIONS 밖의 요청은 인증보다 먼저 Origin을 검사한다.
- 요청 스키마는 strict Zod 객체로 정의하고 DTO 타입은 z.output으로 추론한다. REST는 @Body({ schema })와 전역 StandardSchemaValidationPipe, GraphQL은 @Args(createInputValidationPipe(schema))로 같은 스키마를 명시한다. GraphQL Args는 Nest의 schema 메타데이터를 전달하지 않으므로 파이프에 스키마를 직접 결합한다. 인증 반복 시도는 검증보다 먼저 guard에서 센다. 도메인 규칙과 권한 검사는 서비스에 둔다.
- 환경변수는 `config/env.ts` getter로만 읽는다. 숫자 한도는 `config/limits.ts`에만 둔다.
- 닫힌 집합 분기는 ts-pattern `exhaustive()`, 일반 유틸은 es-toolkit.
- GraphQL 검증 규칙은 depth 8, 조각을 펼친 연산당 필드 300개·alias 10개(`query-cost.rule.ts`)를 넘는 요청을 실행 전에 거절한다. 웹 문서를 늘려 상한에 가까워지면 상한과 근거를 함께 고친다.
- 사진 목록은 offset/limit(`pageRange`, offset 최대 10,000)이고 정렬 마지막 기준은 id다. 좋아요 수는 읽을 때 `_count`로 센다 — 카운터 컬럼이나 커서를 두지 않는다.
- Amplitude로 보내지 않는다. 이벤트는 같은 트랜잭션에서 `AnalyticsEvent`에 기록만 하고 개인정보(닉네임·캡션·토큰)를 넣지 않는다.
- Sentry는 예상하지 못한 오류만: GraphQL `INTERNAL_SERVER_ERROR`는 `internal-error.plugin`이 operationName 태그로, REST 5xx는 `ApiExceptionFilter`가 라우트 패턴 태그로 보낸다. 업무 오류는 `fail()`로 던져 4xx로 끝나게 하고, 직접 보고할 때도 `captureException` 대신 `reportUnexpectedError()`를 쓴다.
- Prisma 스키마를 바꾸면 마이그레이션을 추가하고 `db:generate`. 파괴적 변경은 피한다. 개발 DB에는 사용자가 `db:migrate`로 적용한다.

## 빌드·실행

- `build`·`dev`는 `tsconfig.build.json`(src만, `*.spec.ts`·`*.test.ts` 제외)으로 `dist`에 낸다. `tsconfig.json`은 타입 검사 전용(noEmit, 테스트 포함).
- 사용자의 개발 서버는 `dist/main.js`를 본다(`node --watch`). 검증용 빌드는 다른 outDir로 하고, 테스트 API는 test-kit이 `.e2e-build`로 빌드한다.
- 운영 이미지는 Dockerfile로 빌드한다. prisma CLI는 migrate deploy를 위해 production dependency이며 GraphQL src·Prisma schema/client도 포함한다. 미디어 처리 런타임(sharp·MediaInfo)은 없다. TRUST_PROXY_HOPS는 기본 0, 비공개 API 앞의 Caddy 한 단계만 있을 때 1이다. 전달 헤더를 무조건 신뢰하거나 API·DB 포트를 외부에 열지 않는다.
- 운영(NODE_ENV=production)에서만 GraphQL을 주소별 분당 600회로 제한한다(`graphql-rate-limit.middleware.ts`, 프로세스 메모리). 주소는 Express가 TRUST_PROXY_HOPS로 확인한 `req.ip`를 `rateLimitAddress()`로 묶은 값(IPv6 /64)이다. 브라우저 GraphQL은 Caddy → 웹 `/backend/graphql` 프록시 → API로 오며 프록시가 Caddy의 X-Forwarded-For를 그대로 넘기고(Next는 없을 때만 채운다), 웹 SSR도 들어온 X-Forwarded-For를 넘긴다. 프록시를 신뢰하는데 X-Forwarded-For가 없는 요청은 웹 서버의 공개 캐시 조회·헬스 체크이므로 제한하지 않는다(웹 컨테이너 주소 하나로 묶으면 한 사용자가 사이트 전체 SSR을 막는다).
- 운영에서 그룹 생성·게시물·댓글·가입 신청(초대 가입 포함)·신고·OAuth 시작은 `RateLimitService.consume()`이 사용자·주소마다 DB 고정 창 버킷(`RateLimitBucket`)으로 센다. 한도는 `limits.ts`의 `WRITE_RATE_LIMIT`, 주소는 리졸버·컨트롤러의 `@ClientAddress()`가 넘긴다. 업로드 발급은 사용자가 맡긴 원본 합계를 `USER_STORAGE_QUOTA_BYTES`(5GB)까지 허용한다(모든 환경).

## 테스트

| 스크립트 | 내용 |
| --- | --- |
| `test` · `test:unit` | Vitest `unit`: 대상 구현 파일 옆 `src/**/*.{spec,test}.ts` 중 `*.integration.{spec,test}.ts` 제외(순수 규칙, 쿠키 파서, PKCE 벡터, 네트워크 없는 S3 서명 정책 등) |
| `test:integration` · `test:e2e` | Vitest `integration`: 대상 구현 파일 옆 `src/**/*.integration.spec.ts`(확인된 버그 회귀는 `*.integration.test.ts`). globalSetup이 격리 스키마(`api_test_*`)와 기존 AWS S3 버킷의 실행별 tests/ 객체 경로를 준비하고 끝나면 해당 스키마·객체만 지운다. 하네스가 `createApp()`만 하고 supertest(`request(app.getHttpServer())`)로 요청한다 — 포트를 열지 않는다. 파일끼리 스키마를 공유하므로 닉네임·그룹 이름을 고유하게 만든다. |

Vitest는 unplugin-swc로 데코레이터 메타데이터를 살려 TS 소스를 직접 테스트한다. API에는 Playwright가 없다.

## 앱 스킬

- `.agents/skills/module/SKILL.md`: 모듈·resolver·권한·schema/codegen 계약.
- `.agents/skills/auth/SKILL.md`: Cookie·Origin·OAuth·앱 PKCE 교환.
- `.agents/skills/prisma/SKILL.md`: 스키마·마이그레이션·Serializable.
- `.agents/skills/api-test/SKILL.md`: unit·실제 DB/supertest integration·하네스.

테스트용 /testing API는 NODE_ENV=test·ENABLE_TEST_API=true에서만 동작한다. 개발·운영에서 true이면 createApp이 시작을 거부한다. 사용자+세션·대회 단계·외부 성공 콜백 티켓을 준비하며 운영 제품 API에 fixture 분기를 넣지 않는다.

`test:integration`은 실제 PostgreSQL·Supertest 통합 레인이다. 기존 `test:e2e`는 같은 명령으로 위임하는 호환 스크립트이며 API에는 브라우저 e2e가 없다. 새 기능 사양은 단위·통합 모두 `.spec.ts`를 쓴다.

그룹 대회는 `contest/group-contest.*`가 맡고 공개 읽기는 readableGroup으로 검사한다. 접수 중 같은 그룹의 Post만 참여하며 투표는 멤버 전용·본인/숨긴 글 제외·대회당 한 표다. PostContestVote의 복합 FK와 unique, UnitOfWork의 Serializable이 동시 요청을 막는다. 결과는 종료 후 공개하고 동률은 공동 우승, 0표는 우승 없음이다. winners는 siblingLoader로 묶어 읽는다. 운영 역할은 `group-administration.*`가 맡고 OWNER만 MODERATOR 임명/해제·소유권 양도를 한다. 양도 시 기존 OWNER는 MEMBER가 된다. `removeGroupMember`는 OWNER·MODERATOR가 실행하며 OWNER는 내보낼 수 없고 MODERATOR는 MEMBER만, OWNER는 MODERATOR도 내보낸다. `leaveGroup`은 본인 탈퇴이며 OWNER는 양도한 뒤에만 나간다. 내보내거나 나간 멤버의 게시물·댓글은 남기고, 다시 가입하면 공개·비공개 가입 규칙을 그대로 따른다. 가입 이벤트는 다시 가입할 수 있으므로 가입마다 새 id를 쓴다.

publicQueryCachePlugin은 Next의 쿠키 없는 공개 캐시 요청(x-photo-contest-public-query:true)에서 실행 오류만 HTTP 400으로 구분한다. 일반 GraphQL 실행 오류는 HTTP 200이다. Nest의 자동 상태 복원은 끄고 같은 플러그인에서 정상 계약을 유지하므로 공개 오류 응답을 성공 데이터로 캐시하지 않는다. 이 헤더로 권한을 넓히지 않는다.

Post.uploadId·upload은 nullable이며 파일 또는 linkUrl 중 하나는 필수다. kind=LINK의 mediaUrl은 null이다. 링크는 HTTP·HTTPS 절대 주소만 허용하고 서버 메타데이터 fetch를 하지 않는다. postDownload query는 readablePost로 권한·숨김·파일 유무를 검사한 후 60초 presigned GET을 반환한다. `/media/:id`·`/media/:id/download`·`/photos/:id`·대표 사진 경로도 권한 확인 뒤 `private, no-store` 307로 같은 서명 GET에 보낸다. attachment·UTF-8 파일명·응답 형식·no-store를 서명에 넣고 이미 발급한 URL은 만료 전까지 읽기 권한이 있음을 docs/post-attachments.md에 명시한다. API는 항상 S3 설정을 쓰며 로컬·통합 테스트도 실제 AWS S3를 사용하며 테스트 객체는 tests/<실행 ID>/로 격리한다.

GroupCategory는 그룹 모듈이 관리한다. 활성 카테고리는 그룹당 20개·이름 20자, 이름은 그룹 안에서 대소문자 무시 unique다. 관리 권한은 같은 Serializable tx에서 다시 확인한다. Post.categoryId는 선택이며 같은 그룹 복합 FK·NoAction을 유지한다. 보관은 기존 글의 라벨을 보존하고 새 선택에서 제외한다. 대회 참여 글도 분류를 선택할 수 있으며 작성자·관리자가 변경한다. 새 통합 사양은 대상 옆의 *.integration.spec.ts에 둔다.

PostComment.parentId는 한 단계 답글이다. createPostComment는 accessiblePost와 같은 tx에서 원댓글·게시물 일치·깊이를 검증하며 복합 FK(id,postId)가 다른 게시물 연결을 막는다. postComments/postCommentCount는 parentId가 없으면 원댓글만, 있으면 해당 답글만 읽는다. 원댓글 최신순·답글 오래된 순에 id를 마지막 기준으로 둔다. PostComment.replyCount는 _count.replies로 구하며 원댓글 삭제는 답글·좋아요를 cascade한다. updatePost는 작성자·관리자만 제목·내용·분류를 변경하고 기존 첨부·작성자·대회는 유지한다. 기존 보관 분류 유지는 허용하되 새로 지정하는 분류는 활성·같은 그룹이어야 한다.

그룹 프로필은 GroupProfileService가 관리한다. requestGroupAvatarUpload는 관리자에게만 5분짜리 presigned POST를 발급한다. completeGroupAvatarUpload는 소유권·관리 권한을 다시 검사하고 HEAD로 크기·형식만 확인한다(서버 변환 없음, 원본 그대로). GroupAvatar.mediaUploadId는 nullable unique FK(ON DELETE SET NULL: 올린 사용자를 지워도 대표 사진은 자기 storageKey로 남는다)이며 updateGroupProfile은 같은 그룹의 완료된 만료 전 자산만 지정한다. MembershipModule을 GroupModule과 MediaUploadModule이 공유해 모듈 순환을 피한다. Group.avatarId와 GroupAvatar(id,groupId)의 복합 FK로 다른 그룹 연결을 막는다. Group 생성 시 nullable 복합 FK의 Prisma 기본값 처리 때문에 id를 명시한다. 대표 사진은 공개 메타데이터이며 현재 지정된 자산만 익명 GET에 no-store 307 서명 이동으로 준다. 버리거나 교체한 자산은 유지보수에서 재시도하며 현재 사용 중인 자산은 보존한다. 그룹 소개 상한은 500자다.

Contest.likeLimit은 기본 1이며 그룹 대회 개최 시 관리자만 1~100으로 설정한다. PostService.like는 같은 Serializable tx에서 권한·기존 반응·대회별 해당 사용자 반응 수를 검사한다. 이미 누른 작품은 재요청에 성공하고 취소하면 한도를 돌려준다. 숨긴 작품은 목록에 없어 취소할 수 없으므로 그 좋아요는 한도에서 뺀다(숨김을 해제하면 한도를 넘을 수 있고 새 좋아요만 막는다). 일반 게시물·댓글·별도 PostContestVote에는 이 한도를 적용하지 않는다. 숨긴 작품에 던진 대회 투표도 결과에서 빠지므로 그 투표자는 다시 투표할 수 있고, 새 표를 던지면 숨긴 작품의 표를 지워 대회당 한 표를 유지한다. 기존 반응은 마이그레이션에서 지우지 않는다.
