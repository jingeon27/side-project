---
name: game-feedback-api-test
description: Game Feedback API(apps/api)의 대상 옆 unit 테스트나 격리 PostgreSQL(gf_test_ 스키마) + Supertest integration 테스트를 추가·수정·실행할 때, 가짜 OAuth·게임 프로필·S3 제공자나 SSE·연결 풀 검증을 꾸밀 때, 또는 scripts/test.ts·vitest.config.mts 레인 설정을 고칠 때 사용한다.
---

실행 범위와 완료 보고는 프로젝트 `game-feedback-test` 스킬, 접미사(`*.spec.ts` 새 사양, `*.test.ts` 확인된 버그 회귀)와 배치는 루트·프로젝트 `AGENTS.md`를 따른다. 경로는 apps/api 기준이다.

## 레인 (`vitest.config.mts`)

- `unit`: `src/**/*.{spec,test}.ts` + 프로젝트 `../../scripts/**/*.{spec,test}.ts`(`database-guard.test.ts`)에서 integration 파일을 뺀 것. DB·Nest 앱 없이 도는 정책·검증이다(`src/common/http/request-validation.spec.ts`, `src/rate-limit.*`, `src/chat/chat-history.spec.ts`, `src/admin/reports/report.policy.spec.ts`, `src/common/pagination.spec.ts`, `src/config/production.config.spec.ts`).
- `integration`: `src/**/*.integration.{spec,test}.ts`, `globalSetup: ./scripts/integration-setup.ts`(`TEST_DATABASE_URL`이 없거나 가드를 못 넘으면 실패). 파일은 병렬로 돌고 각자 스키마를 만든다. 새 파일은 `describe.skipIf`를 두지 않는다 — DB가 없으면 건너뛴 성공이 아니라 실패여야 한다.
- SWC 플러그인이 없어 데코레이터 메타데이터가 없다. 테스트에서 만드는 provider·서비스도 `@Inject(Token)`을 명시해야 주입된다.
- `typecheck`는 테스트를 포함한 `tsconfig.json`(Vitest처럼 `module: Preserve`·Bundler, `import.meta` 허용)과 빌드 전용 `tsconfig.build.json`(NodeNext의 CJS 출력, Node 24의 require(ESM) 지원, 테스트·`src/testing/**` 제외)을 모두 검사한다. 공통 하네스는 `src/testing/`에 두고 운영 코드에서 import하지 않는다. 테스트의 `Location`·`Set-Cookie`는 `src/testing/http-response.ts`의 `responseLocation`·`responseCookies`로 읽는다.

## 실행기 (`scripts/test.ts`)

- `NODE_ENV=test`, `DATABASE_URL=TEST_DATABASE_URL`, 데모·테스트 인증·OAuth·Supercell·관측 키를 비운 env로 contracts build → `db:generate` → (unit만이 아니면) `../../scripts/db.ts start --test` → `vitest run <인자>`.

- Vitest를 직접 부르지 않는다(위 env가 빠진다). 테스트 DB는 loopback 55444에 남아 다음 실행이 재사용한다. 띄우지 못하면 실패로 보고하고 포트 사용자를 종료하지 않는다.

## integration 파일 골격

기존 파일을 복사해 시작한다. 최근 형식은 `src/posts/post-media-upload.service.integration.spec.ts`, `src/database/unit-of-work.integration.spec.ts`.

1. 스키마 이름 `gf_test_<영역>_${randomBytes(8).toString('hex')}`를 `TEST_DATABASE_URL`의 `schema`에 넣고 `assertDatabaseUrl(url, 'test')`(`src/database/database-url.ts`: 55444·`game_feedback_test`·`gf_test_*`·`game_feedback` 역할·`options` 금지). 영역 접두사는 파일마다 다르게 한다.
2. 구조: `spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL } })`. 모든 통합 테스트에 같은 migration 경로를 쓴다.
3. `db = new PrismaClient({ adapter: createPrismaAdapter(url) })`, `seed(db, false)`(카테고리 `clash-royale`) 또는 `seed(db, true)`(테스트 계정·예시 글).
4. `app = await createApp({ databaseUrl, webOrigin: origin, demoMode, testAuthEnabled, rateLimit: false, prisma: db, … })` — `listen()`하지 않고 `supertest(app.getHttpServer())`. `prisma`를 넘기면 `app.close()`가 그 연결을 끊지 않는다. `beforeAll` 타임아웃은 30000.
5. `afterAll`: `app.close()` → 스키마 이름을 파일의 정규식(`/^gf_test_<영역>_[a-f0-9]{16}$/`)으로 다시 확인 → `DROP SCHEMA "<schema>" CASCADE` → `$disconnect()`. 만들지 않은 스키마는 지우지 않는다.

## 요청과 로그인

- 쓰기 요청에는 `.set('Origin', 'http://localhost:3300')`(= `webOrigin`). 빠지면 403 `INVALID_ORIGIN`. 쿠키를 이어 쓰려면 `supertest.agent(app.getHttpServer())`.
- 로그인 세 가지: `demoMode: true` + `POST /api/auth/demo { nickname }`, `testAuthEnabled: true` + `POST /api/auth/test-token { accountId: 'sample-user-0' }`(Bearer + 쿠키), DB 직접 `session.create({ data: { tokenHash: hash(raw), userId, expiresAt } })` + `Authorization: Bearer <raw>`(`raw = token()`). `hash`·`token`·`COOKIE`는 `src/security.ts`에서 가져온다.
- 데모 닉네임은 `demo:<소문자>`로 upsert되므로 파일 안에서 역할마다 다른 닉네임을 쓴다.
- 데모·테스트 사용자는 두 모드가 모두 꺼진 앱에서 보이지 않는다. 모드 차이는 같은 `prisma`로 앱을 하나 더 만들어 비교한다(`src/auth/auth.controller.integration.test.ts`의 `state.normal`). production 거부는 `process.env.NODE_ENV`를 바꿔 `createApp`이 reject하는지 보고 `finally`에서 되돌린다.

## 바깥 경계만 가짜로

- OAuth: `createApp({ identityProviders })`에 `authorizationUrl`·`exchange`만 가진 객체를 넘긴다(`SocialProviderSchema.options`로 네 개를 만드는 예: `auth.controller.integration.test.ts`). 어댑터 unit 테스트는 `vi.stubGlobal('fetch', …)` + `afterEach(() => vi.unstubAllGlobals())`.
- 게임 프로필: `profileProvider: new DemoProfileProvider()`. 실제 `SupercellProfileProvider`를 부르지 않는다.
- S3: `new S3TestStorage()`(`src/testing/s3.ts`)와 `mediaStorage: s3.config`로 프로젝트 `.env`의 실제 AWS 버킷을 쓴다. 객체는 `<GF_S3_KEY_PREFIX>/tests/<실행 ID>/`에만 만들고 `afterAll`의 `s3.close()`로 해당 경로만 정리한다. 버킷 생성·삭제와 로컬 대역 서버는 없다. 단위 테스트의 설정·서명 검사는 오프라인이며 실제 전송은 integration 레인이다. 정리에는 테스트 prefix로 제한한 ListBucket 권한도 필요하다.
- 앱 내부 서비스는 바꾸지 않는다. 시각은 DB 행을 직접 고친다(세션 만료 `session.updateMany({ data: { expiresAt: 과거 } })`).

## 특수 검증

- 트랜잭션 연결: 앱 URL에 `connection_limit=1`·`pool_timeout=2`를 붙여 트랜잭션 밖 쿼리를 잡는다(`unit-of-work.integration.spec.ts`, `app.integration.test.ts`의 one pooled connection 테스트).
- SSE: supertest 대신 `app.listen(0, '127.0.0.1')` + ``fetch(`${baseUrl}/api/chat/events`, { headers: { Cookie } })``로 프레임을 읽고 `AbortController`는 `afterAll`에서 끊는다. 재인증 주기가 5초라 종료 확인은 약 7.5초 대기와 12초 테스트 타임아웃을 쓴다(`src/chat/chat.controller.integration.test.ts`).
- 요청 제한은 `rateLimit: false`로 끄고, 제한 자체는 `src/app.module.integration.test.ts`와 `src/rate-limit.*`에서만 본다.
- 응답 계약: 모양이 중요하면 계약 스키마로 parse한다(`MediaUploadPlanSchema.parse(response.body)`).
- 동시성: `Promise.all`로 같은 요청을 보내 성공 수와 DB 행 수를 함께 단언한다(대화 쌍 생성, `clientMessageId` 재시도, 앱 로그인 교환, 조회수).

## 명령 (side 루트)

```sh
yarn workspace @game-feedback/api test:unit
yarn workspace @game-feedback/api test:integration
yarn workspace @game-feedback/api test:integration src/chat/chat.controller.integration.test.ts -t '<it 이름>'
yarn workspace @game-feedback/api test            # 두 레인
yarn workspace @side/game-feedback db:test:stop   # 끝난 뒤 필요할 때만
```

- integration은 포트를 열지 않는다(SSE 테스트의 임시 포트 제외). 개발 서버(4300)·개발 DB(55442)와 겹치지 않으니 그대로 돌린다. 단 `db:generate`가 개발 서버가 쓰는 client를 다시 쓴다.
