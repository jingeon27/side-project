---
name: game-feedback-mobile-webview-shell
description: Game Feedback 모바일 셸의 WebView prop, 탐색 정책·딥링크 경로, WebViewChannel snapshot·ShellLifecycle 경합, 오프라인·5xx·프로세스 종료 복구, 안전 영역·LaunchScreen, Android 뒤로 가기 800ms, foreground 세션 확인을 바꾸거나 고칠 때 사용한다.
---

셸의 책임과 slice 경계는 `apps/mobile/AGENTS.md`, 메시지 계약은 `game-feedback-mobile-bridge`, 테스트 작성법은 `game-feedback-mobile-test` 스킬을 먼저 본다. 경로는 `apps/mobile` 기준이다.

## 위치

- `src/_app/App.tsx`: `SafeAreaProvider` → `StatusBar style="dark"` → `ServiceErrorBoundary`(`src/shared/ui`) → `WebShellPage`.
- `src/_pages/web-shell/ui/WebShellPage.tsx`: `SafeAreaView edges={['top', 'bottom']}` 안에 `<WebView key ref={attachWebView} {...webViewProps} />`와 `LaunchScreen`(loading)·`OfflineView`(offline) 덮개만 둔다.
- `model/use-web-shell.ts` `useWebShell`: 채널·호스트 생성, 모든 WebView 핸들러, `webViewProps = {...} satisfies WebViewProps`. 새 핸들러도 여기에 둔다.
- 판단·상태는 class와 순수 함수로: `model/web-view-channel.ts` `WebViewChannel`, `model/shell-lifecycle.ts` `ShellLifecycle`, `lib/load-error.ts` `isLoadFailure`, `src/features/navigation/lib/navigation-policy.ts`(`isSameOrigin`·`toWebPath`·`decideNavigation`). 이 파일들은 react-native를 `import type`으로만 쓴다(unit 레인은 Node이고 `e2e/support/native-host.ts`가 `navigation-policy.ts`를 Node에서 import한다).

## WebViewChannel snapshot

- 렌더 상태는 frozen snapshot `{ sourceUrl, webViewKey, loading, offline, overlayOpen }` 하나다. `useWebShell`이 `useSyncExternalStore(channel.subscribe, channel.getSnapshot)`로 읽는다. `private update`는 다섯 필드가 모두 같으면 기존 객체를 유지하고 알리지 않는다. 필드를 더하면 이 비교에도 넣는다.
- 렌더와 무관한 값은 snapshot 밖에 둔다: 복구 주소(`rememberUrl`·`currentUrl`), history(`rememberHistory`·`canGoBack`), iOS 문서 판별(`startsDocument`), WebView 참조(`attach` callback ref). 준비된 문서의 경로 변경은 `rememberUrl`만 하고 `source`를 바꾸지 않는다.
- 전환: `loadCurrentDocument`(source만 교체), `recreate`(복구 주소·key+1·history 초기화를 한 번에), `reload`(같은 WebView), `fail`(OfflineView), `finishLoading`, `setOverlayOpen`.
- 채널과 `NativeHost`는 `useState(() => new …)`로 셸 인스턴스마다 만든다. `ServiceErrorBoundary`의 "서비스 다시 열기"는 셸을 다시 마운트해 새 채널·호스트·OS 구독으로 `${WEB_ORIGIN}/`을 연다. 쿠키 저장소는 유지된다.

## ShellLifecycle

- `model/use-shell-lifecycle.ts`의 effect 하나가 expo-linking `getInitialURL`·`url` 이벤트, `AppState` `change`, Android에서만 `BackHandler` `hardwareBackPress`를 구독하고 cleanup에서 `dispose()` 뒤 모두 해제한다.
- OS 구독은 셸 마운트 수명이다. `openLink`·`onState`·`onBack`·`onFallbackBack`은 `useEffectEvent`로 최신 구현을 읽으며 콜백 교체로 `ShellLifecycle`을 폐기하지 않는다. 진행 중 back·background·초기/후속 링크 경합 상태는 같은 class 인스턴스에 보존한다. snapshot은 `useSyncExternalStore`, WebView prop 콜백은 일반 함수/`useCallback`을 유지한다. 훅에 let/ref 플래그를 두지 않는다.
- 경합: 후속 `url` 이벤트가 온 뒤 늦게 끝난 `getInitialURL`은 무시한다(`receivedLink`). `dispose` 뒤의 링크·상태·back 응답은 버린다(`AbortController`). `background`는 한 번, `active`는 background를 거친 뒤에만 알린다(`inactive` 무시).

## 탐색 정책·딥링크

- `onShouldStartLoadWithRequest`와 `onOpenWindow`는 같은 `navigate(url, newWindow)`를 쓴다. 단 `isTopFrame`이 거짓인 요청(iOS의 iframe 이동, Android는 항상 참)은 `decideSubframeNavigation`으로 같은 origin·`about:blank`만 허용하고 나머지는 외부 열기·앱 화면 이동 없이 막는다. 동기로 boolean을 돌려주고 외부 열기는 react-native `Linking.openURL(...).catch(() => undefined)`로 던져 둔다. `originWhitelist: ['*']`·`setSupportMultipleWindows: false`를 유지해야 모든 URL이 이 판단을 거친다.
- `decideNavigation` 순서: `about:blank`·같은 origin → allow / `toWebPath` 성공 → navigate(`handleOpenLink`) / 공백·`\` 없는 `http(s)`·`mailto:`·`tel:` → external / 나머지(`javascript:`·`data:`·`file:`·`content:`·`intent:`·`//`) → block. 같은 origin 새 창은 알려진 경로일 때만 현재 WebView로 연다.
- `isSameOrigin`은 origin 문자열 바로 뒤가 끝·`/`·`?`·`#`일 때만 참이다. 스킴·포트가 다르거나 `origin.evil`·`origin@evil`이면 외부다. 같은 origin 이동은 경로를 검증하지 않는다.
- `toWebPath`: 2048자 초과와 소셜 로그인 콜백 경로(`APP_AUTH_CALLBACK_PATH`, 같은 origin이나 스킴 뒤)는 `null`이다(인증 세션 밖에서 들어온 콜백의 코드를 웹에 넘기지 않는다). 같은 origin 또는 `gamefeedback://` 뒤를 경로로 만들고 `''`·`/` → `/ko`, `/?…` → `/ko?…`로 바꾼 뒤 bridge `WebPathSchema`(`resolveAppRoute`)로 정규화한다. locale `ko|en|ja`, ID `[A-Za-z0-9_-]{1,100}`, `messages?conversation=`은 중첩 경로로 바꾸고, 경로가 소유하지 않는 query는 버리며 중복 key·제어문자·잘못된 인코딩·`admin`은 거부한다.
- `handleOpenLink`: 복구 주소를 먼저 기억하고 `host.open(path)`가 `false`(웹 미준비)면 `channel.loadCurrentDocument()`로 문서를 연다. 준비 뒤에는 `open` 메시지 → 웹 `router.push`(현재 경로와 같으면 웹이 무시).
- `onNavigationStateChange`는 history를 기억하고 origin 루트(`WEB_ORIGIN`, `WEB_ORIGIN/`)는 복구 주소로 삼지 않는다. 언어 리다이렉트 전에 재생성돼도 `/ko`로 덮지 않고 서버 언어 감지를 다시 타게 하는 규칙이다.
- 앱이 받는 HTTPS 링크는 소셜 로그인 콜백 하나다(`app.config.ts` associated domains·intent filter, 웹 AASA `components`). 게시글 등 다른 https 경로를 앱으로 열려면 AASA·intent filter와 웹 검증 파일을 함께 바꾼다. 경로 추가 절차는 `game-feedback-mobile-bridge`.

## 준비 상태·foreground

- `NativeHost`는 웹 `ready` 메시지로 준비된다. `injectedJavaScriptBeforeContentLoaded`와 `injectedJavaScript`에 같은 `buildBootstrapScript(APP_VERSION)`를 넣고, 웹은 `game-feedback:bootstrap` 이벤트마다 `ready`를 다시 보낸다. 한쪽만 남기지 않는다.
- 준비 해제 `host.reset()`: iOS `onLoadStart`에서 `startsDocument`가 참일 때(해시만 바뀌면 거짓, 같은 URL 재로드는 참), 그리고 재생성·실패·iOS content 종료 직전. Android `onLoadStart`는 pushState에도 오므로 해제하지 않는다. `reset`은 overlay를 닫힘으로 알리고, 대기 중 back을 handled로 끝내고, 진행 중 인증 결과를 버린다.
- `LaunchScreen`은 `ready`·`onLoadEnd` 중 먼저 온 `finishLoading`으로 닫힌다.
- foreground: 네이티브는 `{ type: 'state', state: 'active' }`만 보낸다(미준비면 생략). 세션 확인과 계정·온보딩 변경 시 private cache 삭제는 웹 `apps/web/src/features/auth/model/session-cache.ts` `refreshSession` → `replaceSession`이 한다. 네이티브에 캐시 정리를 두지 않는다.

## 오류·복구

- `onError`: 먼저 `event.preventDefault()`. 같은 origin이고 `isLoadFailure`(`-999`, `WebKitErrorDomain` 101·102 제외)일 때만 `handleFailure` = `host.reset()` + `channel.fail()`.
- `onHttpError`: 같은 origin 5xx만 실패 화면. 4xx는 웹이 표시한다.
- OfflineView "다시 시도"·Android `onRenderProcessGone` → `handleRecreate`(reset + `recreate`). iOS `onContentProcessDidTerminate` → reset + `channel.reload()`.

## Android 뒤로 가기·iOS 스와이프

1. `ShellLifecycle.back`은 항상 `true`를 돌려주고 응답 대기 중 누름은 무시한다.
2. `NativeHost.back`: 미준비·대기 중이면 즉시 `false`. 아니면 `{ type: 'back', id: 'back-N' }`을 보내고 800ms 타이머(만료 = 미처리)를 건다.
3. 웹 `apps/web/src/shared/native/native-bridge-channel.ts` `handleBack`: 열린 select·dropdown → overlay → `backNavigation()` 순으로 처리해 `back-result`를 보낸다.
4. id가 맞는 `back-result`가 `atRoot && !handled`면 `BackHandler.exitApp()`. 미처리·오류·타임아웃이면 `handleFallbackBack`: `canGoBack()`이면 `goBack()`, 아니면 종료.
- `app.config.ts`의 `android.predictiveBackGestureEnabled: false`를 유지한다. iOS는 `allowsBackForwardNavigationGestures: !overlayOpen`이고 overlay 값은 웹 `navigation-state` 메시지에서 온다.

## 안전 영역·고정 prop

- 여백은 `SafeAreaView`(WebShellPage·ServiceErrorBoundary)가 주고 `contentInsetAdjustmentBehavior: 'never'`로 중복을 막는다. 네이티브 색은 `src/shared/config/theme.ts` `COLORS`와 `app.config.ts` `backgroundColor`를 함께 바꾼다. `LaunchScreen`은 `useColorScheme()`로 자체 색을 고른다.
- 세션은 `WEB_ORIGIN`의 1st-party HttpOnly 쿠키다. WebView가 그 origin 문서를 열고 `/api`도 같은 origin rewrite로 부르므로 세션에는 3rd-party 쿠키 허용이 필요 없다. `thirdPartyCookiesEnabled`(Android)는 다른 사이트 frame·요청의 쿠키만 허용하고, `sharedCookiesEnabled`(iOS)는 앱의 `NSHTTPCookieStorage`를 WebView 요청에 함께 쓴다. 둘 다 현재 켜져 있고 `WebShellPage.spec.tsx`가 값을 고정하지만 세션 유지의 근거는 아니다. 끄려면 실기기에서 로그인 유지·앱 복귀·소셜 로그인 교환을 확인한다.
- 유지할 prop: `applicationNameForUserAgent: GameFeedbackApp/<APP_VERSION>`, `webviewDebuggingEnabled: __DEV__`, `pullToRefreshEnabled`, `allowsInlineMediaPlayback: true` + `mediaPlaybackRequiresUserAction: true`.

## 확인

| 바꾼 것 | 테스트 |
| --- | --- |
| `navigation-policy.ts`·경로 정규화 | `navigation-policy.spec.ts`(unit), 악성 입력 포함 |
| snapshot·복구 주소·문서 판별 | `model/web-view-channel.spec.ts`(unit) |
| 링크·OS 전환·back 경합 | `model/shell-lifecycle.spec.ts`(unit) |
| prop·핸들러·오프라인·재생성·cold/warm 딥링크·back·AppState | `ui/WebShellPage.spec.tsx`(ui) |
| 렌더 오류 복구 | `src/_app/App.spec.tsx`, `src/shared/ui/ServiceErrorBoundary.spec.tsx`(ui) |
| 실제 웹과의 back·딥링크·foreground·언어 | `e2e/app-shell.spec.ts`, `e2e/navigation.spec.ts`, `e2e/language.spec.ts` |
| 하드웨어 back, iOS 스와이프, 노치, 비행기 모드 | dev client 실기기 |
