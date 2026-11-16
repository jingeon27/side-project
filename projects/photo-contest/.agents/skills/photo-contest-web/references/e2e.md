# e2e

레인·포트·DB 격리·테스트 이름 규칙은 [testing](../../photo-contest-testing/SKILL.md) 스킬이 정한다. 여기는 웹 e2e의 구성 관례와 쓰는 법이다. `playwright.config.ts`·`e2e/`가 아직 없으면 이 관례대로 만든다.

## 구성 (apps/web 소유)

- `playwright.config.ts`: testDir `./e2e`, workers 1, fullyParallel false, timeout 90s, expect 15s, retries 0, reporter list + html(`open: 'never'`), `baseURL: 'http://localhost:3320'`, locale `ko-KR`, timezoneId `Asia/Seoul`, trace `retain-on-failure`, screenshot `only-on-failure`.

| project | 기기 | 도는 spec |
| --- | --- | --- |
| `mobile-chrome` | `devices['Pixel 7']` | 기본 spec(`webview.spec.ts`·`desktop-*.spec.ts` 제외) |
| `mobile-safari` | `devices['iPhone 15']`(WebKit) | `@ios` 태그 |
| `desktop-chrome` | `devices['Desktop Chrome']` | `@desktop` 태그(반응형·그룹·업로드·댓글 흐름) |
| `webview` | Pixel 7, UA 끝에 ` PhotoContestApp/1.0.0`(`buildAppUserAgent('1.0.0')`) | `webview.spec.ts`만(다른 프로젝트는 `testIgnore`) |

- webServer는 두 개다: `apiWebServer({ port: 4320, webOrigin: 'http://localhost:3320', database: prepareE2eDatabase('web_e2e') })`(`@photo-contest/test-kit`)와 이 앱의 production build 뒤 `scripts/serve-cache-build.ts`(standalone 서버). Next는 env `NODE_ENV=production`, `API_URL=http://127.0.0.1:4320`, `WEB_ORIGIN=http://localhost:3320`, `PORT=3320`, url `http://localhost:3320/health-check/live`, `reuseExistingServer: false`, timeout 180s. 빌드 폴더는 `next.config.ts`가 `WEB_ORIGIN`의 loopback 포트(3300~3399)로 정하는 `.next/test-3320`이라 사용자 개발 서버의 `.next`와 겹치지 않는다.
- 설정이 test-kit `loadProjectEnv()`로 프로젝트 `.env`를 읽어 webServer에 물려주므로 `NEXT_PUBLIC_SENTRY_DSN`·`NEXT_PUBLIC_AMPLITUDE_API_KEY`는 env에서 빈 값으로 덮는다. 아니면 e2e가 Sentry·Amplitude로 보낸다.
- `e2e/support/env.ts`는 포트·URL의 단일 출처다. `e2e/support/test.ts`는 Next 개발 오버레이(`nextjs-portal`)를 숨기고, `pageerror`를 모아 테스트 끝에 빈 배열을 단언하고, `signIn(nickname)` fixture를 준다. 모든 spec은 `@playwright/test` 대신 여기서 `test`·`expect`를 import한다.

## 쓰는 법

- `signIn`은 `e2e/support/test.ts`의 authenticate를 통해 test-kit createTestUser(`/testing/users`)로 세션을 만들고 브라우저 컨텍스트의 HttpOnly 쿠키로 넣는다. 테스트 API의 Origin은 e2e WEB_ORIGIN이다.
- 준비용 그룹·대회·사진은 제품 GraphQL·업로드 API, 단계는 moveTestContest(`/testing/contests/:id/phase`)를 쓴다. DB를 직접 수정하지 않는다.
- 단계 이동 후에는 page.reload 또는 대회 상태 새로고침으로 서버 상태를 다시 읽는다. 자동 단계 전환 테스트는 페이지를 그대로 두고 30초 주기 갱신에 따른 화면 변화를 기다리는 단언으로 확인한다.

- 사진은 `page.getByLabel('사진 선택').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await createTestImage() })`로 올린다.
- 선택자는 역할·접근성 이름으로 쓴다(`getByRole('button', { name: '사진 제출하기' })`, `getByLabel('사진 설명')`). 클래스·DOM 구조로 찾지 않고, `waitForTimeout` 대신 `await expect(locator).toBeVisible()` 같은 기다리는 단언을 쓴다.
- 웹의 버튼·레이블 이름을 바꾸면 웹 spec과 함께 `apps/mobile/e2e/support/web-screens.ts`도 고친다(모바일 e2e가 실제 웹 화면을 연다). 커밋은 앱별로 나눈다([commit](../../../../../../.agents/skills/commit/SKILL.md) 스킬).
- 화면 단위 접근성은 `e2e/accessibility.spec.ts`가 `page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') })`로 axe-core를 넣어 WCAG 2.x A·AA 태그만 돌리고 serious·critical 위반이면 실패한다. 새 주요 화면은 같은 파일에 더하고, 내용이 다 그려진 뒤(시트는 열리는 전환이 끝난 뒤) 검사한다. 빼야 하는 결과는 파일 안의 허용 목록에 규칙, 조건, 이유, 발견 ID를 함께 적는다.
- `webview` 프로젝트의 가짜 앱: `page.addInitScript`로 `window.ReactNativeWebView`와 앱 정보(`buildBootstrapScript`)를 문서보다 먼저 심고, `page.exposeBinding`으로 받은 요청을 기록·응답한다(`createNativeRouter`·`buildNativeDispatchScript`, `@photo-contest/bridge/native`; 본보기 `apps/mobile/e2e/support/native-host.ts`). 메시지 계약은 [bridge](../../photo-contest-bridge/SKILL.md) 스킬.

## 실행 (side 루트)

```sh
yarn workspace @photo-contest/web exec playwright install chromium webkit   # 처음 한 번
yarn workspace @photo-contest/web test:e2e                                  # 모든 프로젝트
yarn workspace @photo-contest/web test:e2e e2e/<이름>.spec.ts --project=mobile-chrome
yarn workspace @photo-contest/web test:e2e --project=mobile-chrome -g "<테스트 이름 일부>"
yarn workspace @photo-contest/web exec playwright show-report
```

- test-kit이 `TEST_DATABASE_URL`(loopback 전용 테스트 DB, 기본 55434)에 실행마다 격리 스키마를 만들고 끝나면 지운다. 테스트 API는 실행마다 `apps/api/.e2e-build`로 다시 빌드하며 건너뛰는 옵션은 없다.
- 실패한 테스트의 trace는 `test-results/`에 남는다(`playwright show-trace <trace.zip>`).
