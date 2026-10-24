---
name: webview-shell
description: 모바일 앱의 WebView 동작(필수 prop, 탐색 정책, 딥링크 파서, 웹 준비 상태와 첫 URL, 오프라인·5xx·프로세스 종료, 안전 영역, Android 뒤로 가기·AppState 알림)을 바꾸거나 고칠 때 사용한다.
---

얇은 셸·쿠키 세션·메시지 origin 검사 같은 기본 규칙은 프로젝트 `mobile` 스킬, 메시지 계약은 `bridge` 스킬을 먼저 읽는다.

## 위치 (`src/_pages/web-shell`)

- `@page/WebShellPageTemplate.tsx`: `SafeAreaView` + 고정 WebView prop + `OfflineView`/`LoadingOverlay` 전환만 둔다.
- `model/use-web-shell.ts`의 `useWebShell`: 상태와 모든 WebView 핸들러. 화면은 `webViewProps`를 그대로 펼치므로 새 핸들러도 여기에 둔다.
- `model/use-web-shell-bridge.ts`는 라우터를 화면당 한 번(`useState`) 만든다 — 다시 만들면 기다리던 `navigation.back` 응답을 잃는다. WebView 명령은 `model/web-view-channel.ts`의 `channel`(callback ref, 키가 바뀌면 새 WebView에 붙는다)로만 보낸다.
- 판단은 순수 함수로: `lib/document-load.ts`, `lib/load-error.ts`, `lib/app-state.ts`, `src/features/navigation/lib/{navigation-policy,deep-link,back-press}.ts`. `lib/`는 react-native·expo를 런타임 import하지 않는다(unit 레인은 Node이고, `e2e/support/native-host.ts`도 `deep-link.ts`를 Node에서 쓴다).

## 필수 WebView prop

- `originWhitelist={['*']}`: 기본값은 http(s)가 아닌 링크를 판단 없이 OS로 넘긴다. 모든 URL이 `decideNavigation`을 거치게 한다.
- `setSupportMultipleWindows={false}` + `onOpenWindow` → `decideOpenWindow`: 창은 하나다. 같은 origin 새 창은 지금 WebView의 웹 이동으로 바꾼다.
- `sharedCookiesEnabled={false}`(iOS): 세션 쿠키(운영 `__Host-contest_session`, 개발 http `contest_session`)는 WebView 쿠키 저장소에만 산다. 로그인은 웹이 WebView 안에서 `/auth/app/exchange`로 교환해 Set-Cookie를 받고, Max-Age 쿠키는 WKWebView 기본 영속 저장소(`cacheEnabled` 기본값)에 남아 앱을 다시 열어도 유지된다. 켜면 react-native-webview가 WebView 쿠키 전체(HttpOnly 포함)를 `NSHTTPCookieStorage`로 복사해 앱의 네이티브 fetch(`/app/config` 등)에도 세션이 실리므로 켜지 않는다. 네이티브가 쿠키를 심어야 하는 기능을 만들지 않는다.
- `thirdPartyCookiesEnabled`(Android, 기본값 true): 그대로 둔다.
- `allowsInlineMediaPlayback`(iOS): 기본값 false면 `<video>`·유튜브 iframe이 항상 전체 화면으로 열린다. 피드에서 제자리 재생한다.
- `applicationNameForUserAgent={buildAppUserAgent(appVersion)}`: 웹 서버가 `PhotoContestApp/x.y.z`로 앱을 알아본다. `userAgent` prop을 쓰면 이 토큰이 사라진다.
- `injectedJavaScriptBeforeContentLoaded={buildBootstrapScript(...)}`: 웹은 브리지를 만들 때 앱 정보를 한 번만 읽는다. 나중에 `injectJavaScript`로 넣지 않는다.
- `contentInsetAdjustmentBehavior="never"`: 여백은 `SafeAreaView`가 준다. iOS 스크롤 뷰가 안전 영역을 한 번 더 더하지 않게 한다.
- `webviewDebuggingEnabled={__DEV__}`(운영 빌드는 원격 디버깅 금지), `allowsBackForwardNavigationGestures`·`pullToRefreshEnabled`(iOS), `key={webViewKey}`(올리면 새 WebView).

## 탐색 정책·딥링크

- `onShouldStartLoadWithRequest`는 동기로 바로 `true`/`false`를 돌려준다. Android는 250ms 안에 답이 없으면 그냥 연다(react-native-webview `SHOULD_OVERRIDE_URL_LOADING_TIMEOUT`). 밖에서 열기는 `void openExternalUrl(url, fallbackUrl)`로 던져 둔다.
- Android는 첫 로드에 이 판단을 부르지 않는다. `sourceUrl`에는 웹 origin 주소(`toWebUrl(검증된 경로)`나 `currentUrlRef`)만 넣는다.
- `decideNavigation` 세부: 웹 origin은 스킴·호스트·포트까지 같아야 한다(http/https가 다르면 밖). `about:srcdoc`과 iOS의 다른 origin iframe(`isTopFrame === false`)의 http(s) 이동도 허용한다. 하위 프레임이 http(s)가 아닌 스킴(앱 스킴·intent·카카오톡·전화 등)으로 이동하면 사용자 동작 없이도 외부 앱이 열릴 수 있으므로 막는다. 앱 스킴을 가리키는 `intent:`는 웹 이동, 그 밖 `intent:`는 대상 스킴 URL로 열고 대체 주소는 http(s) `S.browser_fallback_url` → `market://details?id=` 순. 막을 스킴은 `BLOCKED_SCHEMES` 한 곳에서 고친다.
- `toWebPath`: route는 `LINK_ROUTES`(대소문자 구분), id는 `^[A-Za-z0-9_-]{1,128}$`, 끝 슬래시 하나 허용, 쿼리·해시는 버림, 2048자 이하, `WEB_ORIGIN` 자체는 `/`. 소셜 로그인 콜백(`<웹 origin>/app-auth/callback`, `isAuthCallbackPath`)과 모르는 링크는 `null` — 첫 링크면 홈을 열고 실행 중이면 무시한다. 인증 세션 밖에서 들어온 콜백(다른 앱이 시작한 흐름, 끝난 세션)의 코드는 웹에 넘기지 않는다. URL은 정규식으로만 나눈다(RN `URL` 생성자 금지).
- route를 더하면 웹에 그 화면이 있는지 확인하고 `deep-link.spec.ts`에 `..`·`%2F`·공백·한글·129자·`contest.example@evil.example`·비슷한 도메인 케이스를 함께 넣는다. 탐색 분기를 바꾸면 `navigation-policy.spec.ts`도 같은 식으로 채운다.
- 앱이 직접 받는 https 링크는 소셜 로그인 콜백 경로 하나다: `app.config.ts`의 iOS associated domains(`applinks:`·`webcredentials:`, 개발 빌드는 `?mode=developer`)와 Android intent filter(`autoVerify`, https·host·`/app-auth/callback`), 웹의 `/.well-known/apple-app-site-association`·`assetlinks.json`. `/invite`·`/groups`·`/contests` https 링크는 파서만 있다. 앱으로 열려면 AASA `components`·intent filter에 경로를 더하고 웹 검증 파일을 함께 바꾼다.

## 웹 준비 상태와 첫 URL

- `isWebReadyRef`는 `app.ready`로만 켜진다. `openPath`는 이 값으로 `router.emit('navigation.open', { path })`(문서 유지)와 `sourceUrl` 교체(문서 새로 열기)를 고른다.
- 준비 해제: iOS 새 문서 `onLoadStart`(`startsNewDocument` — 해시만 바뀌면 같은 문서), 오프라인 화면, 재생성, iOS 콘텐츠 프로세스 종료. Android `onLoadStart`는 pushState에도 오므로 해제하지 않는다.
- `app.state`·`navigation.back`은 준비됐을 때만 보낸다. 준비 전 뒤로 가기는 웹이 처리하지 않은 것으로 본다. `app.state`는 `nextBridgeAppState`가 고른 것만 — iOS `inactive`(알림 센터·로그인 확인 창)는 무시하고 background를 거친 뒤에만 `active`를 보낸다(웹이 active마다 활성 쿼리를 다시 부른다).
- 로딩 오버레이와 스플래시(`onReady`)는 `app.ready`·`onLoadEnd`·오프라인 중 먼저 온 것으로 닫는다. 스플래시 상한은 `src/_app/model/use-splash-screen.ts`의 `SPLASH_MAX_MS`.
- 재생성 주소 `currentUrlRef`에는 웹 origin URL이나 `isRelativeWebPath`를 통과한 경로만 넣는다.

## 오류·여백·뒤로 가기

- `onError`는 먼저 `event.preventDefault()`(영문 기본 오류 화면 차단). 웹 origin 문서이고 이동 취소(`NSURLErrorDomain -999`, `WebKitErrorDomain 101`·`102`)가 아닐 때만 오프라인 화면. `onHttpError`는 웹 origin 5xx만. 다시 시도와 Android `onRenderProcessGone`은 `recreateWebView`(키 +1, 보던 주소), iOS `onContentProcessDidTerminate`는 같은 WebView `reload()`.
- `SafeAreaView edges={['top', 'bottom']}`가 웹 셸·업데이트 화면·오류 화면을 감싼다. 화면은 웹에 만드는 것이 원칙이고, 네이티브 화면(`src/_pages/*`)을 꼭 더하면 같은 `SafeAreaView`로 감싸고 그려질 때 스플래시를 닫는다(`UpdateRequiredPageTemplate`의 `onShown`). `COLORS`(`src/shared/config/theme.ts`)와 `app.config.ts`의 `BACKGROUND_COLOR`는 웹 `theme.css` 토큰과 같은 값으로 둔다.
- 뒤로 가기는 응답을 기다리는 동안 다시 누른 것을 무시하고(`isPending`), `canGoBack`은 웹 응답 뒤에 읽는다(`resolveBackPress`). BackHandler로 받아 웹에 먼저 묻기 위해 `app.config.ts`의 `android.predictiveBackGestureEnabled: false`를 유지한다.

## 확인

| 바꾼 것 | 테스트 |
| --- | --- |
| `lib/` 판단 | 옆 `*.spec.ts`(unit), 악성 입력 포함 |
| prop·핸들러·준비 상태·오프라인·재생성·뒤로 가기 | `@page/WebShellPageTemplate.spec.tsx`(ui) |
| 실제 웹과의 왕복 | `e2e/app-shell.spec.ts`, `e2e/back-navigation.spec.ts` |
| 키보드, 노치 여백, iOS 스와이프, 외부 앱 열기, 비행기 모드 | 실기기(dev client) |

테스트 작성법은 `mobile-test` 스킬.
