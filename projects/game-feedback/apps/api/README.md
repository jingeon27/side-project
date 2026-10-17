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
