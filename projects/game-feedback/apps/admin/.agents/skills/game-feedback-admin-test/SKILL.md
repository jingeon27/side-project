---
name: game-feedback-admin-test
description: Admin(apps/admin)의 Vitest 단위 테스트(`scripts/test.mjs`)나 Playwright E2E(Admin 3304·API 4304, 55444 테스트 DB의 `gf_test_admin_*` 스키마, `e2e/teardown.ts`)를 작성·실행하거나, 선택자·포트·스키마 정리 실패를 고치거나, 한 테스트만 실행할 때 사용한다.
---

검증 범위와 완료 기록은 프로젝트 `game-feedback-test` 스킬, 테스트 접미사(새 사양 `*.spec.ts`, 확인한 버그 회귀 `*.test.ts`)는 저장소 `AGENTS.md`를 따른다.

## Vitest (단위)

- `vitest.config.ts`는 `src/**/*.{spec,test}.ts`와 앱 루트의 `*.{spec,test}.ts`(설정 파일 옆, 예: `vite.config.spec.ts`)를 `environment: 'node'`로 수집한다. `.tsx`·DOM 테스트는 수집되지 않고 jsdom 의존성도 없다. 컴포넌트 동작은 E2E로, 순수 함수와 options·mutation-options는 대상 파일 옆 Vitest로 검증한다.
- `scripts/test.mjs`는 `vitest/package.json`을 Node로 찾아 `vitest run <인자>`를 실행한다(Yarn의 workspace bin 누락 회피). 파일 경로·`-t` 같은 인자는 그대로 전달된다.
- mutation 본보기 `src/features/auth/model/auth.mutation-options.spec.ts`: `vi.hoisted` + `vi.mock('../api/auth.api')`로 REST 경계만 바꾸고, 실제 `QueryClient`에서 `new MutationObserver(client, xMutationOptions(client)).mutate()`를 실행해 캐시 결과를 단언한다. 응답 fixture는 `@game-feedback/contracts` 스키마(`SessionSchema.parse`)로 만든다. React 훅을 렌더링하지 않는다.
- 바꾼 곳에 따라 고칠 테스트
  - hash 경로·딥링크: `src/shared/lib/admin-route.spec.ts`. 잘못된 hash가 API ID가 되지 않는 사례를 유지한다.
  - 로그인·로그아웃·캐시 정리: `src/features/auth/model/auth.mutation-options.spec.ts`
  - Vite 프록시 Origin 가드·운영 토큰 주입·설정 검증·`define`: `vite.config.spec.ts`(`localAdminGuard`·`adminServerSettings`를 실제 `IncomingMessage`/`ServerResponse`로 호출)
  - 화면 문구·흐름: `e2e/admin.spec.ts`

## Playwright 구성 (`playwright.config.ts`)

- 설정을 읽을 때 `gf_test_admin_<uuid 32자>` 스키마 이름을 만들고, `127.0.0.1:55444/game_feedback_test?schema=<이름>` URL과 함께 `GF_ADMIN_E2E_SCHEMA`·`GF_ADMIN_E2E_DATABASE_URL`로 teardown에 넘긴다. 실행마다 새 스키마다.
- webServer 1(API): side 루트에서 `@side/game-feedback db:test:sync` → `@game-feedback/api db:seed` → `@game-feedback/api test:server`를 실행한다. env는 `NODE_ENV=test`, `PORT=4304`, `WEB_ORIGIN=http://127.0.0.1:3304`, `GF_DEMO_MODE=true`, `GF_TEST_AUTH_ENABLED=true`이고, OAuth·`SUPERCELL_API_TOKEN`은 빈 값이다. 준비 확인 URL은 `http://127.0.0.1:4304/api/session`이다.
- webServer 2(Admin): `@game-feedback/admin dev`에 `GF_ADMIN_PORT=3304`, `GF_ADMIN_API_ORIGIN=http://127.0.0.1:4304`, `GF_ADMIN_WEB_ORIGIN=http://127.0.0.1:3304`를 준다. 프록시 Origin과 API `WEB_ORIGIN`이 같아야 쓰기 요청이 통과한다.
- 두 서버 모두 `reuseExistingServer: false`라서 3304·4304가 사용 중이면 실패한다. 다른 worktree의 실행일 수 있으니 그 프로세스를 종료하지 말고 끝나기를 기다린다.
- 포트를 바꾸면 `../api/src/testing/e2e-server.ts`의 허용 포트(`4301, 4302, 4304, 4353`)와 `WEB_ORIGIN === http://127.0.0.1:<port-1000>` 조건, `../../scripts/database-guard.mjs`의 `gf_test_` 스키마 규칙을 함께 확인한다.
- `workers: 1`, timeout 45초, `reporter: 'list'`, `trace: 'retain-on-failure'`, project는 `chromium`(Desktop Chrome) 하나다.

## 스키마 정리 (`e2e/teardown.ts`)

- `globalTeardown`은 스키마가 `^gf_test_[a-z0-9_]+$`이고 URL이 loopback·포트 55444·`/game_feedback_test`·사용자 `game_feedback`·같은 `schema` 파라미터일 때만 `DROP SCHEMA IF EXISTS "<schema>" CASCADE`를 실행한다. 그 외에는 throw한다. 이번 실행의 스키마만 지우며, 중단으로 남은 스키마를 지우려고 조건을 넓히지 않는다.
- Prisma Client는 `createRequire`로 `../api/src/generated/prisma`에서 읽는다. 생성되지 않았으면 teardown이 실패하므로 처음에는 `codegen`을 실행한다.

## spec 작성 (`e2e/admin.spec.ts`)

- 한 실행의 테스트는 같은 스키마와 seed를 공유한다. 본문·닉네임은 `randomUUID()`로 고유하게 만든다. seed 계정(`sample-user-0` 새벽의호그, `sample-user-3`, `sample-test-admin`)의 상태를 바꿨다면 같은 테스트에서 되돌린다(인증 승인→해제, 밴→해제).
- 관리자 로그인은 화면의 "로컬 관리자 로그인" 버튼으로 한다. 다른 사용자의 데이터는 `browser.newContext({ baseURL: origin })`의 `request`로 제품 API(`/api/auth/test-login`, `/api/auth/demo`, `/api/support/conversations`, `/api/conversations/:id/messages`, `/api/reports`)를 호출해 준비한다. 이 요청도 3304 프록시를 지나므로 쓰기 요청에는 `headers: { Origin: 'http://127.0.0.1:3304' }`가 필요하다. DB를 직접 수정하지 않는다.
- 실패와 재시도는 `page.route`로 만든다. 일시 실패는 첫 요청만 `route.abort('failed')`하고 이후 `route.continue()`, 조회 실패는 `route.fulfill({ status: 503, … })`로 만든 뒤 메뉴가 남는지 단언한다.
- 선택자는 `getByRole(…, { name, exact: true })`를 쓰고 영역으로 범위를 좁힌다: `navigation '관리자 메뉴'`, `region '문의 대화'`, `article '사용자 관리'`, `log`, 오류 `alert`, 밴 상태 `status`. 같은 모양의 카드는 `locator('[data-thread-id]')`·`locator('[data-report-id]')`에 `.filter({ hasText })`를 붙인다. class로 찾지 않고 `waitForTimeout` 대신 기다리는 단언을 쓴다.
- 버튼·라벨·`aria-label` 문구를 바꾸면 이 spec의 이름 선택자를 함께 고친다. `e2e/`와 설정 파일도 Admin `typecheck`·`lint` 대상이다.

## 실행 (side 루트)

```sh
corepack yarn workspace @side/game-feedback codegen        # 처음, 또는 contracts·Prisma 변경 뒤
corepack yarn workspace @side/game-feedback db:test:start
corepack yarn workspace @game-feedback/admin test
corepack yarn workspace @game-feedback/admin test src/shared/lib/admin-route.spec.ts
corepack yarn workspace @game-feedback/admin test:e2e
corepack yarn workspace @game-feedback/admin test:e2e -g "<테스트 이름 일부>"
corepack yarn workspace @side/game-feedback db:test:stop   # 필요할 때만. 이 프로젝트가 띄운 DB만 멈춘다
```

- 실패한 테스트의 trace는 `test-results/`(Git 제외)에 남는다.
- 이 앱의 `.env.local`에 운영 토큰이 남아 있으면 Admin webServer가 시작하지 못한다(`game-feedback-admin-session`).
