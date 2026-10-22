---
name: game-feedback-web-e2e
description: Game Feedback 웹(apps/web)의 Playwright e2e를 작성·실행할 때(test:e2e·test:test-auth·test:prefetch·test:observability 설정 차이, 3301/4301·3353/4353 포트와 gf_test_ 격리 스키마, test-login·test-token·demo 로그인과 시드 계정, 선택자·route 가로채기·instant() 사용, 한 spec만 실행) 사용한다.
---

테스트 DB(55444, `game_feedback_test`, `gf_test_` 스키마)와 검증 범위는 프로젝트 `game-feedback-test` 스킬, 테스트 위치·접미사는 루트 `AGENTS.md`를 따른다. Playwright 설정·spec·러너 의존성은 이 앱이 소유한다.

## 설정

| 스크립트 | 설정 파일 | 대상 | Web/API | Web 서버 |
| --- | --- | --- | --- | --- |
| `test:e2e` | `playwright.config.ts` | `e2e/**`(test-token-chat·observability 제외) | 3301/4301 | `next build` + `next start`, `.next/e2e`, demo 켬 |
| `test:test-auth` | `playwright.test-auth.config.ts` | `e2e/test-token-chat.spec.ts` | 3301/4301 | 기본과 같고 `GF_DEMO_MODE=false` |
| `test:prefetch` | `playwright.prefetch.config.ts` | `e2e-production/**` | 3353/4353 | production build, `GF_PREFETCH_TESTING=true`, `.next/prefetch-e2e` |
| `test:observability` | `playwright.observability.config.ts` | `e2e/observability.spec.ts` | 3301/4301 | `next dev --webpack`(`.next/observability`), `GF_OBSERVABILITY_PRODUCTION=true`면 production |

- 공통: chromium(Desktop Chrome) 프로젝트 하나, workers 1, timeout 45초, `trace: 'retain-on-failure'`, `reuseExistingServer: false`. 결과는 `test-results/`(기본) 또는 `.e2e-build/<이름>-results/`다.
- API 서버 명령은 `@side/game-feedback db:test:sync` → `@game-feedback/api db:seed` → `@game-feedback/api test:server`다. `test:server`는 PORT 4301·4302·4304·4353과 `WEB_ORIGIN=http://127.0.0.1:<PORT-1000>`만 받고, Google·Supercell 키가 있으면 시작하지 않는다. 새 설정은 이 포트 중 하나를 쓴다(3302/4302는 mobile, 3304/4304는 admin e2e).
- DB URL은 `TEST_DATABASE_URL`(기본 `postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test`)만 허용하며 실행마다 `gf_test_web_<uuid>` 스키마를 만든다(`GF_E2E_SCHEMA`로 지정 가능, `gf_test_` 접두 필수). `e2e/teardown.ts`가 그 스키마만 DROP한다.
- 기본 설정은 Sentry·Amplitude 키를 빈 값으로 덮는다(`telemetry-disabled.spec.ts`). observability 설정만 가짜 키(`observability-test-key`, `https://test@sentry.invalid/1`)를 넣고 `context.route`로 가로챈다. `GAME_FEEDBACK_SITE_URL=https://feedback.example`, `GAME_FEEDBACK_INDEXING=false`.
- `GF_PREFETCH_TESTING=true`는 `next.config.mjs`의 `exposeTestingApiInProductionBuild`를 켠다. 일반 build에 넣지 않는다.
- 모든 설정이 실행마다 web production build를 한다(observability dev 모드 제외). 개발 오버레이 같은 dev 동작은 기본 e2e에 없다.

## 실행 전

- 앱 스크립트만 돌리면 준비 단계가 없다. 처음이거나 계약·Prisma가 바뀌었으면 프로젝트 `codegen`, 테스트 DB는 `db:test:start`가 필요하다. 프로젝트 `test:e2e`는 둘을 하고 web `test:e2e` → `test:test-auth` → `test:prefetch` → admin → mobile 순으로 돈다. observability는 CI가 production 모드로 따로 돌린다.
- 3301·4301·3353·4353이 사용 중이면 실패한다. 사용자 개발 서버(3300/4300)나 다른 프로세스를 끄거나 재사용하지 않는다.

## 쓰는 법

- 공용 fixture 파일은 없다. spec이 `@playwright/test`에서 직접 import하고 필요한 로그인 helper를 파일 안에 둔다.
- 로그인: `page.request.post('/api/auth/test-login', { headers: { Origin: 'http://127.0.0.1:3301' }, data: { accountId } })`(쿠키 전환) 또는 `/api/auth/test-token`(Bearer 토큰 + 쿠키). 새 닉네임 사용자는 `/api/auth/demo`(`{ nickname }`)이며 demo가 켜진 기본 설정에서만 된다. 쓰기 요청에는 Origin 헤더를 붙인다(`playwright.request.newContext({ extraHTTPHeaders: { Origin } })`).
- 시드(`apps/api/src/seed.ts`): `sample-user-0`(새벽의호그), `sample-user-3`(덱연구소, 인증), `sample-test-admin`(운영테스터), 게시글 `sample-post-0`, 대화 `sample-conversation-0-3`. 다른 계정은 `browser.newContext({ baseURL })`로 나눈다. 한 실행의 spec이 같은 스키마를 공유하므로 만든 데이터 이름에 `Date.now().toString(36)` 같은 접미사를 붙인다.
- 경로는 `/ko/...`처럼 locale을 명시한다. `/`는 Accept-Language로 리다이렉트된다(`language.spec.ts`는 `locale: 'ja-JP'` 컨텍스트). 프로젝트가 Desktop Chrome 하나이므로 모바일 배치는 `page.setViewportSize({ width: 400, height: 844 })`나 컨텍스트 `viewport`로 본다(`compose.spec.ts`, `test-token-chat.spec.ts`).
- 선택자는 역할·한국어 접근성 이름 + `exact: true`가 기본이다(`getByRole('button', { name: '보내기', exact: true })`, `getByRole('form', { name: '글쓰기', exact: true })`, `getByRole('status', { name: '게시글 불러오는 중' })`). 기존 spec은 표시 확인에 앱 클래스(`.post-card`, `.ql-editor img`)도 쓴다. `waitForTimeout` 대신 기다리는 단언과 `page.waitForResponse`를 쓴다.
- SSE는 `/api/chat/events`가 `text/event-stream`으로 열린 것을 `waitForResponse`로 확인한 뒤 진행한다(`chat.spec.ts`의 `openRealtime`).
- 응답 조작은 `page.route('**/api/...')` + `route.fetch()`/`route.fulfill()`이고 `test.afterEach`에서 `page.unrouteAll({ behavior: 'wait' })`한다. 렌더 실패는 `page.addInitScript`로 브라우저에서 주입한다. 앱에 테스트 전용 스위치를 넣지 않는다(`error-boundary.spec.ts`).
- 계약 확인은 `../../../packages/sdk/src/generated/validation`의 응답 스키마나 `@game-feedback/contracts` 스키마로 파싱한다(`feedback.spec.ts`, `test-token-chat.spec.ts`).
- `e2e-production`은 `instant(page, async () => …)`(`@next/playwright`) 안에서 클릭 뒤 제목·검색·글쓰기·스켈레톤 같은 이동 셸이 바로 보이는지 단언한다.
- 접미사: 새 사양 `*.spec.ts`, 확인한 버그 회귀 `*.test.ts`(`block-user.test.ts`). Playwright는 둘 다 수집한다.
- 웹 접근성 이름을 바꾸면 `apps/mobile/e2e/*.spec.ts`도 고친다(모바일 e2e가 3302에서 같은 웹 화면을 연다). 커밋은 앱별로 나눈다(`game-feedback-commit` 스킬).

## 실행 (side 루트)

```sh
corepack yarn workspace @game-feedback/web exec playwright install chromium   # 처음 한 번
corepack yarn workspace @side/game-feedback codegen
corepack yarn workspace @side/game-feedback db:test:start
corepack yarn workspace @game-feedback/web test:e2e e2e/compose.spec.ts
corepack yarn workspace @game-feedback/web test:e2e e2e/chat.spec.ts -g "<테스트 이름 일부>"
corepack yarn workspace @game-feedback/web test:test-auth
corepack yarn workspace @game-feedback/web test:prefetch
GF_OBSERVABILITY_PRODUCTION=true corepack yarn workspace @game-feedback/web test:observability
corepack yarn workspace @side/game-feedback db:test:stop
```

- 실패한 테스트의 trace는 `test-results/` 또는 `.e2e-build/*-results/`에 남는다(`corepack yarn workspace @game-feedback/web exec playwright show-trace <trace.zip>`).
