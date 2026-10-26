---
name: game-feedback-mobile-test
description: Game Feedback 모바일 앱의 Vitest unit·ui 테스트나 Playwright `android-webview`·`ios-webview` native host e2e를 작성·실행·디버깅하고, 무엇을 어느 레인에서 검증하며 무엇을 실기기 확인으로 남길지 정할 때 사용한다.
---

테스트 DB·가짜 제공자·보고 원칙은 프로젝트 `game-feedback-test` 스킬, 접미사(`*.spec`·`*.test`)와 배치는 루트 `AGENTS.md`를 따른다. 여기는 `apps/mobile`에서만 통하는 규칙이다.

## Vitest 레인 (`vitest.config.mts`, `maxWorkers: 2`)

| 파일 | 프로젝트 | 규칙 |
| --- | --- | --- |
| `src/**/*.{spec,test}.ts`, `app.config.spec.ts` | `unit`(node) | 순수 함수·class와 `app.config.ts`(운영·개발 빌드 설정). react-native·expo는 `import type`만 |
| `src/**/*.{spec,test}.tsx` | `ui`(jsdom) | `react-native` → `react-native-web` alias, `__DEV__` = true, `EXPO_PUBLIC_WEB_ORIGIN=https://feedback.example`, `vitest.setup.ts` |

- unit에는 `__DEV__` define과 origin env가 없다. `@/shared/config/env`(import 때 `parseWebOrigin` 실행)를 거치는 코드는 ui에서 검사하거나, `parseWebOrigin(value, development)`처럼 값을 인자로 받는 함수로 빼서 unit에서 검사한다.
- RN·expo를 런타임 import하는 테스트는 JSX가 없어도 `.tsx`로 만든다. 앱에는 integration 레인이 없다.

## ui 대역

- `vitest.setup.ts`: `react-native-webview` → `src/test/ui/fake-web-view.tsx` `FakeWebView`, `react-native-safe-area-context` → `View`, `expo-linking`(`getInitialURL` → null, `addEventListener` → `{ remove }`), `expo-web-browser`(`openAuthSessionAsync` → `{ type: 'cancel' }`), `expo-crypto`(0으로 채운 32바이트, `'a'`×43 digest). 테스트마다 `cleanup()`·`resetFakeWebView()`·`vi.clearAllMocks()`·`vi.restoreAllMocks()`. 새 네이티브 모듈 대역은 여기에 더한다. `expo-status-bar`는 전역 대역이 없어 `App`을 그리는 테스트가 직접 `vi.mock`한다(`src/_app/App.spec.tsx`).
- `fake-web-view.tsx`: `currentWebViewProps()`로 최신 prop을 읽고 핸들러(`onMessage`·`onShouldStartLoadWithRequest`·`onOpenWindow`·`onError`·`onHttpError`·`onLoadStart`·`onNavigationStateChange`·`onRenderProcessGone`·`onContentProcessDidTerminate`)를 `act` 안에서 직접 부른다. `fakeWebView.mounts`는 재생성 횟수, `fakeWebView.handle`의 `injectJavaScript`·`goBack`·`reload`는 명령 기록이다.
- 웹 → 앱은 `onMessage`에 `nativeEvent: { url, data: JSON.stringify(message) }`, 앱 → 웹은 `injectJavaScript` 인자를 `expect.stringContaining('"path":"/ko/settings"')`처럼 본다. 이벤트 모양은 `src/_pages/web-shell/ui/WebShellPage.spec.tsx`의 `event()` helper(기본 url `https://feedback.example/ko`)를 따른다.
- react-native-web의 `Platform.OS`는 `'web'`이다. 그대로면 BackHandler 구독과 iOS `onLoadStart` 해제가 꺼진다. 렌더 전에 `Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })`(또는 `'android'`), `afterEach`에서 `'web'`으로 되돌린다.
- OS 이벤트: `vi.spyOn(AppState, 'addEventListener')`·`vi.spyOn(BackHandler, 'addEventListener')`로 listener를 잡아 직접 부른다. 딥링크는 `vi.mocked(ExpoLinking.getInitialURL).mockResolvedValueOnce(...)`와 `vi.mocked(ExpoLinking.addEventListener).mock.calls`, 외부 열기는 react-native `Linking.openURL` spy, 종료는 `BackHandler.exitApp` spy.
- 구독 안정성은 listener 설치 횟수(`toHaveBeenCalledOnce`)와 unmount 뒤 `remove` 호출로 단언한다.

## Playwright (`playwright.config.ts`)

- 프로젝트 `android-webview`(Pixel 7, chromium)·`ios-webview`(iPhone 13, webkit), `workers: 1`, 직렬, 테스트당 45초, `trace: 'retain-on-failure'`.
- `webServer` 두 개를 항상 새로 띄운다(`reuseExistingServer: false`). API 4302: `@side/game-feedback db:test:sync` → `@game-feedback/api db:seed` → `test:server`(`GF_DEMO_MODE`·`GF_TEST_AUTH_ENABLED` true, OAuth·Supercell 키 빈 값, 공개 상세 캐시 무효화 콜백은 `http://127.0.0.1:3302/internal/cache/revalidate`). Web 3302: web `build` 뒤 `next start`(`NEXT_DIST_DIR=.next/e2e-mobile`, `GAME_FEEDBACK_API_URL=http://127.0.0.1:4302`). 3302·4302가 비어 있어야 한다.
- DB: `TEST_DATABASE_URL`(기본 `127.0.0.1:55444/game_feedback_test`, user `game_feedback`)이 아니면 설정 로드에서 throw. 스키마는 `GF_MOBILE_E2E_SCHEMA` 또는 `gf_test_mobile_<uuid>`이고 `^gf_test_[a-z0-9_]+$`만 허용한다. `e2e/teardown.ts`가 URL·스키마를 다시 검사하고 그 스키마만 DROP한다.
- 하네스: spec은 `./support/fixtures`의 `test`·`expect`와 `nativeHost`를 쓴다. `e2e/support/native-host.ts`가 앱의 실제 `NativeHost`·`socialLogin`·`toWebPath`를 Node에서 돌리고, `addInitScript`로 bootstrap과 `ReactNativeWebView.postMessage` → `exposeBinding('__gfNativePost', data, location.href)`를 심는다. 출처 검사도 실제로 탄다.
  - 읽기: `isReady`, `currentPath`, `hasOverlay`, `rootBacks`, `messages`, `authSessions`. 조작: `requestBack()`(실제 800ms), `state('background' | 'active')`, `openDeepLink(url)`(준비된 문서로만, 아니면 `false`), `setLoginResult(result)`.
  - 조작 전에 `await expect.poll(nativeHost.isReady).toBe(true)`나 `currentPath` 폴링으로 준비를 기다린다.
  - 로그인은 `page.request.post('/api/auth/test-login' | '/api/auth/test-token', { headers: { Origin: ORIGIN }, data: { accountId } })`(`ORIGIN`은 `native-host.ts`). `sample-user-0`·`sample-user-3`·`sample-conversation-0-3`·`sample-post-0`은 `db:seed` 데이터다.
  - 인증 세션 대역은 연 URL을 `authSessions`에 남기고 `cancel`을 돌려준다. 테스트 API에 OAuth 키가 없으므로 Google 버튼 테스트는 `page.route('**/api/session')`로 `googleConfigured`·`socialProviders`만 켠다.
- e2e가 보지 않는 것: `useWebShell` prop·핸들러, `decideNavigation` 적용(브라우저 페이지에는 `onShouldStartLoadWithRequest`가 없다), cold 딥링크의 source 교체, `ShellLifecycle`의 AppState·BackHandler 처리(`state()`는 host를 바로 부른다), LaunchScreen·OfflineView·재생성. 모두 ui 레인 몫이다.

## 어디서 검증하나

| 대상 | 레인 |
| --- | --- |
| URL 정책·경로 정규화·PKCE·콜백·origin·오류 분류 | unit |
| `WebViewChannel` snapshot, `ShellLifecycle` 경합, `NativeHost` | unit |
| WebView prop·핸들러·플랫폼 분기·OS 구독·렌더 오류 복구 | ui |
| 실제 웹과의 back·딥링크·foreground 세션·언어·채팅 입력과 스크롤 | e2e |
| 일회용 코드 교환·쿠키·만료·재사용 | API Vitest+Supertest |

## 명령 (side 루트)

```sh
yarn workspace @game-feedback/mobile test                                      # unit + ui
yarn workspace @game-feedback/mobile test --project unit src/features         # 레인·경로로 거른다
yarn workspace @game-feedback/mobile exec playwright install chromium webkit  # 브라우저가 없을 때
yarn workspace @side/game-feedback test:mobile:e2e                            # codegen·테스트 DB 시작 후 e2e
yarn workspace @game-feedback/mobile test:e2e --project ios-webview app-shell # 준비된 상태에서 단독 실행
yarn workspace @side/game-feedback db:test:stop
```

- 단독 `test:e2e`는 55444 테스트 DB(`@side/game-feedback db:test:start`)와 codegen 산출물(`@side/game-feedback codegen` — API Prisma client는 teardown도 쓴다)이 있어야 한다. 프로젝트 `test:mobile:e2e`는 둘 다 준비한다.
- reporter는 `list`뿐이다. 실패 trace와 `app-shell.spec.ts`의 스크린샷은 `test-results/`(gitignore)에 남는다.

## 실기기로만 확인한다

dev client에서: 키보드와 입력창, 노치·하단 여백, Android 하드웨어 뒤로 가기, iOS 스와이프, 각 소셜 제공자의 시스템 인증 뒤 https 앱 링크 복귀(iOS 17.4+ 세션 콜백, Android App Link verified 상태, 앱 미설치·검증 실패 때 웹 안내 페이지), 비행기 모드 → 다시 시도, 파일 선택과 사진·카메라·마이크 권한. 보고할 때 Playwright·`bundle:check` 통과와 실기기 확인을 따로 적는다.
