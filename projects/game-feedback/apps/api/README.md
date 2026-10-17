# Game Feedback API

NestJS REST API이며 입력과 응답 계약은 `@game-feedback/contracts`의 Zod가 소유한다. API 테스트는 **Vitest + Supertest**로 실행한다. `vitest.config.mts`가 Node 환경과 API 소유 테스트 파일을 지정하고 통합 테스트는 `createApp()`의 HTTP 서버에 Supertest 요청을 보낸다.

## 테스트

저장소 루트에서 Node.js 24와 설치된 의존성을 사용한다.

```sh
corepack yarn workspace @game-feedback/api test
# 특정 HTTP 통합 테스트만 실행
corepack yarn workspace @game-feedback/api test src/community.integration.test.ts
```

API 명령은 계약 빌드 → 전용 Prisma 생성 → 소유 테스트 PostgreSQL 시작 → Vitest 실행을 준비한다. 별도 환경변수 없이 전용 loopback 55444의 `game_feedback_test`를 사용하며 각 통합 테스트가 고유 `gf_test_` 스키마에 Migration을 적용하고 종료 후 해당 스키마만 정리한다. DB를 준비하지 못하면 실패하며 통합 테스트를 건너뛴 성공으로 처리하지 않는다. Vitest를 직접 호출하며 TEST_DATABASE_URL을 누락한 경우도 설정 단계에서 실패한다.

개발 DB 55442는 사용하지 않는다. 외부 Google/Supercell 인증정보를 비우고 가짜 제공자로 검증한다. 로그인·Origin/권한·글/댓글/답변·채팅/SSE/미디어·테스트 계정/인증·모바일 인증 인계와 친추판매/코칭 메타데이터를 검사한다. 개발 서버에서 외부 API를 실제 검증한 결과와 구분한다.

루트 `yarn workspace @side/game-feedback test`와 CI도 같은 API 명령을 호출한다. 테스트 DB는 재사용할 수 있도록 유지되며 작업 후 소유 DB만 종료한다.

```sh
corepack yarn workspace @side/game-feedback db:test:stop
```

`openapi.json`은 Git에 포함하지 않는 중간 생성 파일이다. 프로젝트 개발/검사/테스트/빌드의 준비 단계 또는 `yarn workspace @side/game-feedback codegen`이 Zod/경로 정의에서 생성한다. Orval이 이 규격으로 REST SDK와 응답 검증 코드를 생성한다.

## 본문 미디어와 운영 API

- POST /api/post-media는 인증된 multipart 파일을 검증하고 /api/post-media/:id 주소를 돌려준다. GET은 본문 등록 전 업로더에게만 허용하고 등록 후 글의 공개/차단/숨김/삭제 정책을 적용한다. DELETE는 아직 글에 연결하지 않은 본인 파일만 삭제한다. 저장/수정과 파일 연결은 같은 DB 트랜잭션이다.
- 코칭 pricing은 HOURLY/MONTHLY/GOAL과 amount로 저장한다. GOAL에는 targetScore가 필요하다. 기존 hourlyRate는 Migration 202610170008로 금액과 역할을 보존해 변환한다.
- POST /api/me/game-accounts는 사용자에게 계정을 등록한다. 글쓰기/PATCH에는 playerTag를 받지 않는다. 대표 태그가 바뀌면 사용자 인증을 해제한다.
- POST /api/support/conversations는 GENERAL/VERIFICATION 문의를 실제 관리자와 기존 1:1 대화로 시작/재사용한다. 담당자가 없는 환경은 503이다. GET /api/admin/support와 PATCH /api/admin/support/:id는 담당 관리자 자신의 문의만 관리한다.
- USER 신고는 기존 POST /api/reports를 사용한다. 관리자만 GET /api/admin/users/:id, PATCH /api/admin/users/:id/ban, PATCH /api/admin/reports/:id와 기존 인증/숨김 API를 사용할 수 있다. 밴은 기존 세션의 일반 활동에도 적용하되 관리자 문의는 유지한다. 변경 사유와 조치는 AuditLog에 기록한다.

Migration 202610170009는 이 API 전용 DB에 제재 필드와 PostMedia/SupportConversation을 추가한다. 원래 사용자/게시글은 삭제하지 않는다. 공개 운영의 파일 저장소/백업/악성 파일 정밀 검사와 실제 기기 권한은 별도 운영 검증 항목이다.
