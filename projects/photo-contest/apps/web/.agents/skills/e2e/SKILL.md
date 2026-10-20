---
name: e2e
description: 웹(apps/web)의 Playwright e2e를 작성·실행할 때(휴대폰 Chrome·iOS WebKit·데스크톱 스모크·가짜 앱 WebView 프로젝트 구성, 로그인 픽스처, 마감 시각 옮기기, 한 spec만 실행) 사용한다.
---

레인·포트·DB 격리·테스트 이름 규칙은 `testing` 스킬이 정한다. 여기는 웹 e2e의 구성 관례와 쓰는 법이다. `playwright.config.ts`·`e2e/`가 아직 없으면 이 관례대로 만든다.

## 구성 (apps/web 소유)

- `playwright.config.ts`: testDir `./e2e`, workers 1, fullyParallel false, timeout 90s, expect 15s, retries 0, reporter list + html(`open: 'never'`), `baseURL: 'http://localhost:3320'`, locale `ko-KR`, timezoneId `Asia/Seoul`, trace `retain-on-failure`, screenshot `only-on-failure`.

| project | 기기 | 도는 spec |
| --- | --- | --- |
| `mobile-chrome` | `devices['Pixel 7']` | 기본 spec(`webview.spec.ts`·`desktop-*.spec.ts` 제외) |
| `mobile-safari` | `devices['iPhone 15']`(WebKit) | `@ios` 태그 |
| `desktop-chrome` | `devices['Desktop Chrome']` | `@desktop` 태그(반응형·그룹·업로드·댓글 흐름) |
| `webview` | Pixel 7, UA 끝에 ` PhotoContestApp/1.0.0`(`buildAppUserAgent('1.0.0')`) | `webview.spec.ts`만(다른 프로젝트는 `testIgnore`) |

- webServer는 두 개다: `apiWebServer({ port: 4320, webOrigin: 'http://localhost:3320', database: prepareE2eDatabase('web_e2e') })`(`@photo-contest/test-kit`)와 이 앱의 `next dev -p 3320`. Next는 env `NEXT_DIST_DIR=.next/e2e`(사용자 개발 서버의 `.next` 잠금과 겹치지 않게), `API_URL=http://127.0.0.1:4320`, `WEB_ORIGIN=http://localhost:3320`, url `http://localhost:3320/backend/health`(rewrite까지 확인), `reuseExistingServer: false`, timeout 180s.
- 설정이 test-kit `loadProjectEnv()`로 프로젝트 `.env`를 읽어 webServer에 물려주므로 `NEXT_PUBLIC_SENTRY_DSN`·`NEXT_PUBLIC_AMPLITUDE_API_KEY`는 env에서 빈 값으로 덮는다. 아니면 e2e가 Sentry·Amplitude로 보낸다.
- `e2e/support/env.ts`는 포트·URL의 단일 출처다. `e2e/support/test.ts`는 Next 개발 오버레이(`nextjs-portal`)를 숨기고, `pageerror`를 모아 테스트 끝에 빈 배열을 단언하고, `signIn(nickname)` fixture를 준다. 모든 spec은 `@playwright/test` 대신 여기서 `test`·`expect`를 import한다.

## 쓰는 법

- `signIn`은 `e2e/support/test.ts`의 authenticate를 통해 test-kit createTestUser(`/testing/users`)로 세션을 만들고 브라우저 컨텍스트의 HttpOnly 쿠키로 넣는다. 테스트 API의 Origin은 e2e WEB_ORIGIN이다.
- 준비용 그룹·대회·사진은 제품 GraphQL·업로드 API, 단계는 moveTestContest(`/testing/contests/:id/phase`), 외부 로그인 성공 콜백은 createTestAppLoginTicket을 쓴다. DB를 직접 수정하지 않는다.
- 단계 이동 후에는 page.reload 또는 대회 상태 새로고침으로 서버 상태를 다시 읽는다. 자동 단계 전환 테스트는 페이지를 그대로 두고 30초 주기 갱신에 따른 화면 변화를 기다리는 단언으로 확인한다.

- 사진은 `page.getByLabel('사진 선택').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await createTestImage() })`로 올린다.
- 선택자는 역할·접근성 이름으로 쓴다(`getByRole('button', { name: '사진 제출하기' })`, `getByLabel('사진 설명')`). 클래스·DOM 구조로 찾지 않고, `waitForTimeout` 대신 `await expect(locator).toBeVisible()` 같은 기다리는 단언을 쓴다.
- 웹의 버튼·레이블 이름을 바꾸면 웹 spec과 함께 `apps/mobile/e2e/support/web-screens.ts`도 고친다(모바일 e2e가 실제 웹 화면을 연다). 커밋은 앱별로 나눈다(`commit` 스킬).
- `webview` 프로젝트의 가짜 앱: `page.addInitScript`로 `window.ReactNativeWebView`와 앱 정보(`buildBootstrapScript`)를 문서보다 먼저 심고, `page.exposeBinding`으로 받은 요청을 기록·응답한다(`createNativeRouter`·`buildNativeDispatchScript`, `@photo-contest/bridge/native`; 본보기 `apps/mobile/e2e/support/native-host.ts`). 메시지 계약은 `bridge` 스킬.

## 실행 (side 루트)

```sh
corepack yarn workspace @photo-contest/web exec playwright install chromium webkit   # 처음 한 번
corepack yarn workspace @photo-contest/web test:e2e                                  # 모든 프로젝트
corepack yarn workspace @photo-contest/web test:e2e e2e/<이름>.spec.ts --project=mobile-chrome
corepack yarn workspace @photo-contest/web test:e2e --project=mobile-chrome -g "<테스트 이름 일부>"
corepack yarn workspace @photo-contest/web exec playwright show-report
```

- test-kit이 `TEST_DATABASE_URL`(없으면 로컬 `DATABASE_URL`)에 실행마다 격리 스키마를 만들고 끝나면 지운다. API 코드를 바꾸지 않았고 이전 `apps/api/.e2e-build`가 있으면 명령 앞에 `PC_E2E_SKIP_API_BUILD=true`를 붙여 API 빌드를 건너뛴다.
- 실패한 테스트의 trace는 `test-results/`에 남는다(`playwright show-trace <trace.zip>`).
