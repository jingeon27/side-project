# Game Feedback API

NestJS REST API이며 입력과 응답 계약은 `@game-feedback/contracts`의 Zod가 소유한다. API 테스트는 **Vitest + Supertest**로 실행한다. `vitest.config.mts`가 Node 환경과 API 소유 테스트 파일을 지정하고 통합 테스트는 `createApp()`의 HTTP 서버에 Supertest 요청을 보낸다.

## 테스트

저장소 루트에서 Node.js 24와 설치된 의존성을 사용한다.

```sh
yarn workspace @game-feedback/api test
# DB 없이 순수 정책·검증 단위 테스트
yarn workspace @game-feedback/api test:unit
# S3를 사용하지 않는 사용자 경합·DB 제약 통합 테스트
yarn workspace @game-feedback/api test:database
# 격리 PostgreSQL + Supertest 통합 테스트
yarn workspace @game-feedback/api test:integration
# 특정 HTTP 통합 테스트만 실행
yarn workspace @game-feedback/api test src/posts/posts.controller.integration.test.ts
```

모든 API 명령은 계약 빌드와 전용 Prisma 생성을 준비한다. `test:unit`은 DB를 시작하거나 연결하지 않는다. `test:integration`과 전체 `test`는 소유 테스트 PostgreSQL을 준비한다. 별도 환경변수 없이 전용 loopback 55444의 `game_feedback_test`를 사용하며 각 통합 테스트가 고유 `gf_test_` 스키마를 만들고 종료 후 해당 스키마만 정리한다. DB를 준비하지 못하면 실패하며 통합 테스트를 건너뛴 성공으로 처리하지 않는다. 통합 레인을 Vitest로 직접 호출할 때도 `TEST_DATABASE_URL` 검증을 통과해야 한다.

단위·통합 테스트는 주 대상 구현 파일과 같은 디렉터리에 둔다. 단위 레인은 `*.spec.ts`와 `*.test.ts`에서 통합 파일을 제외하고 프로젝트의 `scripts/database-guard.test.ts`도 수집한다. 통합 레인은 `*.integration.spec.ts`·`*.integration.test.ts`를 수집한다. `app.integration.test.ts`는 전체 API 흐름을, `app.module.integration.test.ts`는 모듈 구성과 종료를 검증한다. `database/unit-of-work.integration.spec.ts`의 Repository 테스트는 실제 DB로 도메인 간 커밋·배열/콜백 롤백·단일 연결 가시성·동일 시각 페이지네이션을 검사한다. 관리자 숨김의 세 분기와 신고의 네 분기를 HTTP로 검증하고, 실제 감사 테이블 제약 위반으로 알림 삭제까지 롤백되는지 확인한다. 단위 테스트는 커서·채팅 삭제 경계·콘텐츠별 알림 정리 정책을 검증한다.

개발 DB 55442는 사용하지 않는다. 외부 카카오·Discord·Google/Supercell 인증정보를 비우고 가짜 제공자로 검증한다. 로그인·Origin/권한·글/댓글/답변·채팅/SSE/미디어·테스트 계정/인증·모바일 인증 인계와 친추판매/코칭 메타데이터를 검사한다. 개발 서버에서 외부 API를 실제 검증한 결과와 구분한다.

`test:database`는 탈퇴 경합과 `*.database.integration.*` 테스트만 실제 PostgreSQL에서 실행한다. S3에는 연결하지 않으며 파일 전송·삭제 검증은 전체 integration 레인에서 수행한다. 이 테스트들은 전체 integration 레인에도 포함된다.

루트 `yarn workspace @side/game-feedback test`와 CI도 같은 API 명령을 호출한다. 테스트 DB는 재사용할 수 있도록 유지되며 작업 후 소유 DB만 종료한다.

```sh
yarn workspace @side/game-feedback db:test:stop
```

`openapi.json`은 Git에 포함하지 않는 중간 생성 파일이다. 프로젝트 개발/검사/테스트/빌드의 준비 단계 또는 `yarn workspace @side/game-feedback codegen`이 Zod/경로 정의에서 생성한다. Orval이 이 규격으로 REST SDK와 응답 검증 코드를 생성한다.

## 본문 미디어와 운영 API

- POST /api/post-media/uploads는 인증된 메타데이터로 S3 presigned POST를 발급하고, 브라우저 직접 전송 후 POST /api/post-media/:id/complete가 검증·확정한다. 파일 주소는 /api/post-media/:id다. GET은 본문 등록 전 업로더에게만 허용하고 등록 후 글의 공개/차단/숨김/삭제 정책을 적용한다. DELETE는 아직 글에 연결하지 않은 본인 파일만 삭제한다. 저장/수정과 파일 연결은 같은 DB 트랜잭션이다.
- 코칭 pricing은 HOURLY/MONTHLY/GOAL과 amount로 저장한다. GOAL에는 targetScore가 필요하다. 배포 전에는 기존 hourlyRate 형식의 운영 데이터 변환을 제공하지 않으며 현재 pricing 계약을 사용한다.
- POST /api/me/game-accounts는 사용자에게 계정을 등록한다. 글쓰기/PATCH에는 playerTag를 받지 않는다. 대표 태그가 바뀌면 사용자 인증을 해제한다.
- POST /api/support/conversations는 GENERAL/VERIFICATION 문의를 실제 관리자와 기존 1:1 대화로 시작/재사용한다. 담당자가 없는 환경은 503이다. GET /api/admin/support와 PATCH /api/admin/support/:id는 담당 관리자 자신의 문의만 관리한다.
- USER 신고는 기존 POST /api/reports를 사용한다. 관리자만 GET /api/admin/users/:id, PATCH /api/admin/users/:id/ban, PATCH /api/admin/reports/:id와 기존 인증/숨김 API를 사용할 수 있다. 밴은 기존 세션의 일반 활동에도 적용하되 관리자 문의는 유지한다. 변경 사유와 조치는 AuditLog에 기록한다.

DB 구조와 최초 운영 migration을 함께 관리한다. 로컬 db:sync는 데이터 손실을 강제하지 않고 운영은 scripts/migrate.ts의 migrate deploy를 사용한다. 운영 파일 저장소/백업과 복구 명령은 [공통 EC2·RDS·S3 가이드](../../../../deploy/shared-instance/README.md)를 따른다. 외부 저장소 자격 증명, 악성 파일 정밀 검사와 실제 기기 권한은 별도 운영 검증 항목이다.

서버 테스트 계정은 명시적 `dev:test` 또는 `GF_TEST_AUTH_ENABLED=true`에서 `POST /api/auth/test-token`으로 발급한다. `{ "accountId": "sample-user-0" }`를 보내면 1시간 `accessToken`, `tokenType: "Bearer"`, `expiresAt`, 사용자 정보를 받는다. 같은 origin의 HttpOnly 쿠키도 설정하며 Bearer로 보호 API를 호출할 수 있다. 일반 실행에서는 404이고 production에서는 테스트 인증을 활성화할 수 없다.

관리자 HTTP 업무는 `src/admin/{categories,users,reports,support}`의 독립 controller/service와 AdminModule이 소유한다. 공개 카테고리 조회와 관리자 생성은 같은 테이블을 쓰되 service를 공유하지 않는다. NestJS 12.2의 StandardSchemaValidationPipe가 요청에 지정한 Zod 스키마를 검증하고 Service에는 파싱된 입력을 전달한다. DTO 타입은 z.output으로 추론하며 데코레이터로 검증 규칙을 중복 선언하지 않는다. Guard가 먼저 권한을 확인하며 Zod 계약의 정규화/중첩 JSON 규칙은 HTTP 파이프에서 보존한다. 응답 Zod 검증과 OpenAPI/Orval 생성 방식은 유지한다.

### Prisma 7

Prisma CLI·Client·PostgreSQL 어댑터는 7.10.1로 맞춘다. 앱의 `prisma.config.ts`가 프로젝트 `.env`를 명시적으로 읽고 CLI 연결 URL을 전달한다. `db:generate`는 DB URL 없이 실행할 수 있으며 `db push`는 Client를 자동 생성하지 않는다.

기존 CommonJS 빌드·운영 스크립트·생성 경로와 호환되도록 `prisma-client-js` 생성기를 유지한다. 런타임은 `createPrismaAdapter`를 통해 Rust 쿼리 엔진 없이 pg를 사용한다. URL의 `schema`는 ORM과 raw SQL 양쪽에, `connection_limit`은 pg 풀의 최대 연결 수에 전달한다. pg는 풀 대기와 연결에 같은 timeout을 쓰므로 `pool_timeout`을 우선하고 없으면 `connect_timeout`(기본 5초)을 쓴다. 운영 URL의 `sslcert`는 서버 CA로 읽고 인증서 검증을 유지한다.

게시글·채팅·프로필 파일은 로컬·통합 테스트까지 모두 실제 S3 직접 업로드를 사용한다. AWS 자격 증명, 테스트 객체 격리·정리와 기존 파일 이행은 [파일 업로드 가이드](../../docs/media-upload.md)를 따른다. 이미 다른 worktree가 테스트 DB를 실행 중이면 `test:integration --use-running-database`로 DB를 시작/종료하지 않고 격리 스키마만 사용한다.
