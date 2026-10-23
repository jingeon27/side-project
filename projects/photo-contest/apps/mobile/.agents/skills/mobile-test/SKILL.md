---
name: mobile-test
description: 모바일 앱의 Vitest unit·ui·api 테스트나 Playwright native-host e2e를 작성·실행·디버깅하고, 테스트로 대신할 수 없는 실기기 확인을 정할 때 사용한다.
---

레인·포트·BDD 이름 규칙의 큰 그림은 프로젝트 `testing` 스킬이다. 여기는 `apps/mobile`에서만 통하는 규칙이다.

## Vitest 레인 (`vitest.config.mts`)

| 파일 | 프로젝트 | 규칙 |
| --- | --- | --- |
| `src/**/*.{spec,test}.ts`, 루트 `*.{spec,test}.ts`(`app.config.spec.ts`·`app.config.test.ts`) | `unit`(node) | 순수 함수와 `app.config.ts`(운영·개발 빌드 설정)만. react-native·expo를 런타임으로 import하면 깨진다 |
| `src/**/*.{spec,test}.tsx` | `ui`(jsdom) | 훅·화면. `react-native` → `react-native-web` alias, `__DEV__` true, `EXPO_PUBLIC_WEB_ORIGIN=https://contest.example` 고정(`env.ts`가 import 때 읽는다) |
| `src/**/*.api.{spec,test}.ts` | `api`(node) | 앱이 직접 부르는 엔드포인트만, 격리 API :4331 |

- RN·expo를 간접으로라도 import하는 테스트는 JSX가 없어도 `.tsx`로 만든다. `env.ts`처럼 `__DEV__`를 읽는 모듈도 ui 레인에서만 import한다(판단은 `web-origin.ts` 같은 순수 함수로 떼어 unit에서 본다).
- 새 동작은 `*.spec.*`, 확인한 버그의 회귀는 `*.test.*`다. 두 접미사 모두 unit·ui·api 레인이 수집한다.

## ui 대역 (`vitest.setup.ts`, `src/test/ui`)

- `vitest.setup.ts`가 react-native-webview(→ `FakeWebView`), safe-area-context, expo-status-bar·splash-screen·linking·clipboard·haptics·web-browser·crypto(Node crypto로 실제 계산)·application(버전 1.0.0)·constants를 `vi.mock`으로 바꾸고, 테스트마다 `resetFakeWebView()`·`vi.resetAllMocks()`·`vi.restoreAllMocks()`를 부른다. 새 네이티브 모듈 대역은 여기에 더한다.
- `fake-web-view.tsx`: `currentWebViewProps()`로 넘긴 prop을 읽고 콜백(`onMessage`·`onShouldStartLoadWithRequest`·`onError`·`onLoadStart`…)을 직접 부른다. `fakeWebView.mounts`는 재생성 횟수, `fakeWebView.handle`은 `injectJavaScript`·`goBack`·`reload` 기록이다.
- `bridge-messages.ts`: `webRequest`·`webEvent`·`webResponse`로 웹 메시지를 만들고, `dispatchedMessages()`가 앱이 주입한 스크립트를 jsdom에서 실행해 웹이 받을 메시지를 돌려준다. `nativeEvent()`·`navigationState()`는 WebView 이벤트 모양이다.
- react-native-web의 `Platform.OS`는 `'web'`이라 앱 코드는 android로 보고 뒤로 가기 훅은 꺼진다. 플랫폼 분기는 렌더 전에 `Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'ios' })`로 바꾸고 `afterEach`에서 `'web'`으로 되돌린다.
- `AppState`·`BackHandler`는 `vi.spyOn(…, 'addEventListener')`로 리스너를 잡아 직접 부르고, fetch는 `vi.stubGlobal('fetch', …)` + `vi.unstubAllGlobals()`.

## api 레인

- `vitest.api-setup.ts`가 test-kit `startIsolatedApi({ port: 4331, webOrigin: 'http://localhost:3331', prefix: 'mobile_api', env })`로 API를 한 번 띄우고 `inject('apiUrl')`·`inject('webOrigin')`을 준다. 앱이 보는 API 설정(`MOBILE_MINIMUM_VERSION` 1.0.0, `MOBILE_LATEST_VERSION` 1.2.0, 가짜 Google client)은 이 `env`에서 바꾼다. 첫 실행은 API 빌드·마이그레이션 때문에 오래 걸린다.
- `apiUrl`은 API 루트라 `/backend` 없이 부른다. POST에는 `Origin: webOrigin`, 302는 `redirect: 'manual'`로 본다. API 자체 규칙은 API 테스트 몫이다.

## e2e (Playwright `android-webview`·`ios-webview`)

- `playwright.config.ts`가 격리 API :4330(`prepareE2eDatabase('mobile_e2e')`)과 웹 dev :3330(`NEXT_DIST_DIR=.next/e2e-mobile`)을 새로 띄운다(`reuseExistingServer: false`). 포트·origin·앱 버전·스킴은 `e2e/support/e2e-env.ts`에서만 고친다.
- spec은 `./support/fixtures`의 `test`·`expect`를 쓴다. `nativeHost`가 `page.goto` 전에 앱의 실제 `createCapabilities`·`createNativeRouter`·`buildBootstrapScript`를 붙이고 플랫폼 기능만 기록용 가짜로 바꾼다.
- 조작 전에 `await nativeHost.waitForEvent('app.ready')`. 단언은 `nativeHost.calls`(웹 요청)·`nativeHost.platform`(공유·복사·진동·브라우저·인증 세션)·`nativeHost.events`로 한다. 앱 → 웹은 `emit`·`requestBack()`·`openDeepLink(url)`, 결과는 `setShareAction`·`setCopySucceeds`·`setAuthSession`으로 조절한다.
- 데이터는 `e2e/support/seed.ts`(`signUp`·`signInBrowser`·`seedGroup`·`seedContestWithMemberPhoto`·`issueAppLoginTicket`), 닉네임은 `uniqueNickname`. 사용자·단계·로그인 티켓은 test-kit의 테스트 API helper로 만들고 DB를 직접 수정하지 않는다. 웹 선택자는 `e2e/support/web-screens.ts`의 `webScreens`에만 역할·이름으로 둔다.
- Android 전용은 `test.skip(testInfo.project.name !== 'android-webview', …)`.
- e2e는 `useWebShell`의 WebView prop·핸들러, 탐색 정책 적용(브라우저 페이지라 `onShouldStartLoadWithRequest`가 없다), BackHandler·AppState·스플래시·오프라인 화면을 보지 않는다 — ui 레인에서 검증한다.

```sh
corepack yarn workspace @photo-contest/mobile test src/_pages/web-shell                 # unit·ui를 경로로 거른다
corepack yarn workspace @photo-contest/mobile test:e2e --project android-webview social-login
corepack yarn workspace @photo-contest/mobile exec playwright install chromium webkit   # 브라우저가 없을 때
```

## 실기기로만 확인한다

dev client에서: 키보드가 입력창을 가리는지, 사진 선택·카메라 권한과 업로드, 소셜 로그인 뒤 https 앱 링크 복귀(iOS 17.4+ 세션 콜백, Android App Link 검증 상태 `adb shell pm get-app-links <패키지>`, 앱 미설치·검증 실패 때 웹 안내 페이지), 공유 시트·햅틱, Android 하드웨어 뒤로 가기·iOS 스와이프, 노치 여백, 비행기 모드 → 다시 시도, Android에서 웹이 앱 정보를 받는지(문서 전 주입은 Android에서 보장되지 않는다). 보고할 때 테스트 통과와 실기기 확인을 따로 적는다.
