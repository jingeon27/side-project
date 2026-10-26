---
name: api-test
description: API(apps/api)의 구현 파일 옆 unit 테스트나 실제 PostgreSQL 격리 스키마 + supertest로 도는 integration 테스트를 추가·수정·실행하거나 테스트 하네스(test/support)를 고칠 때 사용한다.
---

레인 소유·이름 규칙·목 원칙은 `testing` 스킬. 여기서는 apps/api의 실제 모양만 다룬다. 헬퍼는 `test/support/`에 있는 것을 먼저 찾아 쓴다.

## 어느 레인인가

- `unit`(`src/**/*.{spec,test}.ts` 중 `*.integration.{spec,test}.ts` 제외, 대상 옆): DB·Nest 앱 없이 도는 순수 함수(단계·순위, 쿠키 파서, PKCE 벡터, 입력 검증, env getter, 저장소 서명 — 네트워크 없이 실제 AWS SDK로 서명 정책만 확인). env는 `vi.stubEnv` + `afterEach(vi.unstubAllEnvs)`(`src/config/env.spec.ts`).
- `integration`(`src/**/<대상 구현 파일>.integration.spec.ts`, 대상 옆): 권한, DB 제약, 상태 코드·헤더·쿠키·Origin·CSRF, 동시성, 주기 작업. 확인된 버그의 재발 방지는 `*.integration.test.ts`. 여러 모듈을 함께 검증하면 주 대상 옆에 둔다(`src/database/unit-of-work.integration.spec.ts`, `src/bootstrap.integration.spec.ts`).

## 레인 설정

- `vitest.config.mts`: unplugin-swc가 데코레이터 메타데이터를 살리므로 테스트는 대상 TS 소스를 상대 경로로 바로 import한다(`dist`·`.e2e-build`를 import하지 않는다). integration 프로젝트는 `globalSetup: test/support/global-setup.ts`, `setupFiles: test/support/setup.ts`, `fileParallelism: false`, 타임아웃 30초. 공용 하네스는 계속 `test/support/`에 둔다.
- `test/support/global-setup.ts`: `loadProjectEnv()` → 테스트 DB(test-kit `resolveTestDatabaseUrl()` 규칙: loopback 전용 포트의 `TEST_DATABASE_URL`만, 개발 DB로 대신하지 않음) → `isolatedSchemaName('api_test')` → `createIsolatedDatabase(…)`(마이그레이션 적용) → `project.provide('databaseUrl', …)`, teardown에서 `dropIsolatedDatabase`. 실행 전체가 이 스키마 하나를 쓰고 테스트는 `inject('databaseUrl')`로 받는다. `.env`는 열거나 출력하지 않는다.

## 하네스 (`test/support/`)

- env를 먼저 맞추고 앱을 만든다: `DATABASE_URL=inject('databaseUrl')`, `NODE_ENV=development`, `ENABLE_DEV_LOGIN=true`, `WEB_ORIGIN`, globalSetup이 기존 AWS 버킷의 tests/<격리 스키마>/로 객체 경로를 분리한 `inject('s3Env')`. `loadProjectEnv()`가 읽어 온 개발자 관측 키는 지우고 S3·AWS 값은 해당 격리 설정으로 적용하며, 필요한 테스트만 `vi.stubEnv`로 넣는다. 브라우저 역할의 저장소 POST는 `uploadToStorage`, 고정 경로의 307 확인과 서명 GET은 `openStorageRedirect`, 객체 확인은 `api.storage.head`를 쓴다.
- `createApp({ logger: false })`(`src/bootstrap.ts`)만 하고 `listen()`하지 않는다. 파일마다 `beforeAll`에서 만들고 `afterAll`에서 `app.close()`. 요청은 `request(app.getHttpServer())`.
- `app.get(SchedulerService).stop()`으로 주기 실행을 끄고, 정리·대회 종료 기록은 `runOnce()`를 직접 await 한다.
- `login(nickname)`은 `POST /auth/dev`로 받은 `contest_session=…` Cookie 문자열(운영 모드로 만든 앱의 세션 쿠키는 `__Host-contest_session`이고 개발 로그인이 닫혀 있다), `gql(cookie, query, variables)`는 `Origin`·`Apollo-Require-Preflight: true`를 붙여 `{ data, errors }`를 돌려준다. 그룹·대회·사진 준비와 GraphQL 문자열은 공용 헬퍼에 모으고 파일마다 복사하지 않는다.
- supertest로 직접 보내는 POST에는 하네스의 `WEB_ORIGIN`을 `Origin`으로 붙인다(없으면 403). 쿠키를 이어 써야 하는 흐름(OAuth state 쿠키 → 콜백)은 `request.agent(app.getHttpServer())`를 쓰거나 받은 `Set-Cookie`의 `name=value`를 다음 `Cookie`로 넘긴다.
- API가 돌려준 `/backend/…` 경로(업로드 URL, `imageUrl`)는 웹 프록시 경로다 — 접두사를 떼고 부른다.
- 업로드는 test-kit `createTestImage()`(실제 PNG)를 `Content-Type: image/png`로 보낸다(raw 파서는 jpeg·png·webp에만 붙는다). 성공은 201.
- 시각: 단계는 서버 시각으로 계산하므로 기다리거나 fake timer를 쓰지 않는다. 대회는 API로 지금 시작하게 만든 뒤(`createContest`는 지난 시작 시각을 거부한다) `createDatabaseClient(inject('databaseUrl'))`로 `startsAt`·`submissionEndsAt`·`endsAt`을 시간 단위로 옮긴다. 정렬·순위는 `createdAt`을 같은 방법으로 고정한다.
- 바깥 경계: OAuth provider의 token·profile 요청만 `vi.stubGlobal('fetch', …)`로 대체하고 등록하지 않은 URL은 throw해 실제 네트워크로 나가지 않게 한다. Sentry 보고는 `@sentry/node`를 spy로 지켜본다(구현은 그대로).
- 앱 내부는 대체하지 않는다. 예외는 `vi.spyOn(app.get(<서비스>), '<메서드>')`로 (1) 일괄 조회가 목록당 한 번인지(N+1) 세거나 (2) `mockRejectedValueOnce`로 예상하지 못한 오류(5xx·INTERNAL)를 만들 때뿐이다.
- 테스트 안의 env 변경은 `vi.stubEnv`(getter가 호출마다 읽어 바로 반영되고, `test/support/setup.ts`가 테스트마다 되돌린다). 앱을 만들 때 읽는 값(GraphQL introspection, `assertProductionConfig()`)은 앱을 새로 만들어야 반영되고, 운영 모드로 만드는 앱은 https `WEB_ORIGIN`·`S3_BUCKET`이 있어야 뜬다.

## 쓰는 법

- 파일들이 한 스키마를 공유하고 순서는 보장되지 않는다: 닉네임·그룹 이름에 파일별 접두사를 붙인다. 개발 로그인은 닉네임으로 upsert하므로 같은 닉네임은 다른 파일과 같은 사용자다. 테이블 전체 개수 단언이나 전체 `deleteMany()` 정리를 하지 않고 만든 ID로만 확인한다.
- 동시성: `Promise.all(Array.from({ length: 8 }, () => gql(…)))` → 성공 정확히 1건, 나머지 `CONFLICT`, DB 행 1개를 함께 단언한다. 멱등 요청(좋아요)은 모두 성공 + 행 1개 + `likeCount` = 행 수.
- 목록: 세 정렬의 순서(같은 `createdAt`이면 `id` — `createdAt`을 같은 값으로 고정해 확인), offset·limit 경계와 잘못된 값(BAD_USER_INPUT), 이어 받은 페이지에 겹침·빠짐이 없는지, 관리자가 아니면 숨긴 사진이 빠지는지 본다.
- GraphQL은 `errors[0].extensions.code`와 한국어 메시지를, REST는 상태 코드·`{ message }`·`Cache-Control: private, no-store`·`Set-Cookie` 속성을 단언한다. 이벤트는 격리 스키마의 `analyticsEvent`를 id로 찾아 1건인지, `properties`에 닉네임·캡션·토큰이 없는지 본다.

## 명령 (side 루트)

```sh
yarn workspace @photo-contest/api test                     # unit
yarn workspace @photo-contest/api test:integration         # 격리 스키마 + supertest
yarn workspace @photo-contest/api test:integration <파일 이름 일부> -t '<it 이름>'
yarn workspace @photo-contest/api typecheck                # test/ 포함
yarn workspace @side/photo-contest exec eslint apps/api
```

- `test:integration`은 포트를 열지 않으므로 개발 서버(:4200)가 떠 있어도 그대로 돌린다. 기존 `test:e2e` 명령도 같은 integration 레인을 실행한다. DB가 응답하지 않으면 띄우거나 재시작하지 말고 사용자에게 알린다.
