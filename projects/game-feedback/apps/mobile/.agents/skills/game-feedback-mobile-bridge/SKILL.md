---
name: game-feedback-mobile-bridge
description: Game Feedback 앱과 웹 사이의 `@game-feedback/bridge` 메시지(ready·location·navigation-state·back·back-result·state·open·auth-request·auth-result)를 추가·변경하거나, 메시지 출처(`nativeEvent.url`) 검증, 시스템 브라우저 소셜 로그인과 PKCE 일회용 코드 인계, 브리지가 다루는 값의 저장·로그 규칙을 바꿀 때 사용한다.
---

쿠키 세션·저장 금지 원칙은 `apps/mobile/AGENTS.md`, 메시지를 보내고 받는 시점은 `game-feedback-mobile-webview-shell`, API 계약 생성 순서는 프로젝트 `AGENTS.md`를 따른다. Photo Contest의 bridge 패키지를 참조하지 않는다.

## 계약 (`packages/bridge/src`)

- `index.ts`: `BRIDGE_EVENT`(`'game-feedback:native'`), `APP_SCHEME`(`'gamefeedback'`, 로그인 밖 딥링크), `APP_AUTH_CALLBACK_PATH`(`/app-auth/callback`)·`buildAppAuthCallbackUrl(origin)`, `LoginProviderSchema`, `WebMessageSchema`(웹 → 앱), `NativeMessageSchema`(앱 → 웹), `parseWebMessage(data: string)`, `parseNativeMessage(data: unknown)`(실패 시 둘 다 `null`), `buildBootstrapScript(version)`(`window.__GAME_FEEDBACK_APP__ = { version, protocol: 1 }` + `game-feedback:bootstrap` 이벤트), `buildDispatchScript(message)`(`BRIDGE_EVENT` CustomEvent).
- `routes.ts`: `appRoutes`, `resolveAppRoute`, `WebPathSchema`, `RouteIdSchema`, `GameSlugSchema`. 메시지의 경로 값(`location`·`open`)은 항상 `WebPathSchema`를 거친다.
- 모든 메시지 객체는 `.strict()`다. 모르는 type이나 필드가 하나라도 있으면 받는 쪽은 메시지 전체를 조용히 버린다. 기존 메시지에 필드를 더하면 그 필드를 모르는 쪽(설치된 이전 앱 바이너리 포함)이 메시지를 잃는다. 예: `back-result`가 버려지면 800ms 뒤 history·종료 대체 동작으로 넘어간다. 새 동작은 새 type으로 더하고 상대가 모를 때의 동작을 남긴다.
- 웹의 앱 판별은 `apps/web/src/shared/native/native-client.ts` `isNativeApp()`(`protocol === 1` && `window.ReactNativeWebView`)이다. `protocol`을 바꾸면 그 값을 모르는 앱은 브라우저로 취급된다. `'game-feedback:bootstrap'` 문자열은 bridge `buildBootstrapScript`와 웹 `NATIVE_BOOTSTRAP_EVENT`에 따로 적혀 있다.

## 메시지 추가 순서

1. `packages/bridge/src/index.ts` 스키마에 새 strict 객체를 더한다. 요청 ID는 기존 `id`(1–100자), 경로는 `WebPathSchema`. 경로 규칙을 바꾸면 `routes.ts`·`routes.spec.ts`와 웹에 실제 화면이 있는지 확인한다.
2. 웹: 보내기는 `postToNative`, 받기는 `apps/web/src/shared/native/native-bridge-channel.ts` `handleMessage`의 `match` 분기(`.otherwise(() => undefined)` 유지). 화면 연결은 `apps/web/src/_app/providers/NativeBridge.tsx`의 `bind({...})`. 테스트는 같은 폴더 `native-bridge-channel.spec.tsx`.
3. 앱: `src/features/bridge/lib/native-host.ts` `NativeHost.receive`에 분기를 더하거나 보내는 arrow 메서드를 더하고, 콜백은 `INativeHostOptions`로 받아 `src/_pages/web-shell/model/use-web-shell.ts`에서 채널·OS에 잇는다. `native-host.ts`·`social-login.ts`는 react-native·expo를 import하지 않는다(Playwright 하네스가 Node에서 쓴다).
4. 같은 옵션을 `e2e/support/native-host.ts` `NativeHostHarness`에도 채운다. 테스트: `native-host.spec.ts`(unit) → `WebShellPage.spec.tsx`(ui) → 실제 웹과 왕복하면 e2e.
- 앱 → 웹 메시지는 웹 준비 전에 보내지 않는다: `open`은 `false`를 돌려 문서 열기로 넘기고, `state`는 생략, `back`은 `false`.

## 출처 검증

- `onMessage`는 `host.receive(event.nativeEvent.data, event.nativeEvent.url)`만 호출한다. `receive`는 파싱 전에 `url === origin` 또는 `${origin}/` 접두만 받는다(`about:blank`, `origin.evil`, 다른 frame 거부). 새 메시지도 이 검사 뒤에서 처리하고 핸들러에 별도 판단을 두지 않는다.
- 경로는 양쪽에서 검증한다: 웹 → 앱 `location`은 스키마, 앱 → 웹 `open`은 `host.open`의 `WebPathSchema.safeParse`와 웹 `parseNativeMessage`.

## 시스템 브라우저 로그인·PKCE

1. 웹 `apps/web/src/widgets/authentication/ui/social-login/SocialLoginForm.tsx`: 앱이면 `useNativeLogin` → `nativeLoginMutationOptions` → `requestNativeLogin(provider)`(UUID id, 180_000ms 대기)로 `auth-request`를 보낸다. 브라우저면 `/api/auth/social/<provider>` form을 제출한다.
2. `NativeHost`: 진행 중이면 두 번째 요청에 즉시 `cancelled`. 시작할 때 `generation`을 잡고 `reset()`으로 문서가 바뀌었으면 결과를 보내지 않는다. `login` 예외는 `failed`, provider 생략은 `google`.
3. `src/features/bridge/model/native-login.ts`: verifier = `Crypto.getRandomBytes(32)`의 base64url(43자), challenge = `Crypto.digestStringAsync(SHA256, …, BASE64)`를 base64url로. `lib/social-login.ts` `socialLogin`이 `${origin}/api/auth/social/${provider}?app_challenge=${challenge}`를 콜백 `buildAppAuthCallbackUrl(origin)`(검증된 https 앱 링크)로 연다. `native-login.ts`는 `openAuthSessionAsync(url, callback, { preferUniversalLinks: true })` — 옵션이 없으면 iOS가 이전 `callbackURLScheme` API로 열어 https 콜백이 돌아오지 않는다(설치된 expo-web-browser `ios/WebAuthSession.swift`). Android 폴리필은 Custom Tabs + `Linking` `url` 이벤트로 받는다. Google도 이 경로다(`/api/auth/google` 아님). verifier는 URL에 넣지 않는다.
4. API `apps/api/src/auth/auth.service.ts` `social`: `app_challenge`를 `^[A-Za-z0-9_-]{43}$`로 검사해 OAuthAttempt에 둔다. 제공자 콜백은 Google `/api/auth/google/callback`, 나머지 `/api/auth/social/<provider>/callback`(`apps/api/src/auth/oauth/identity-providers.factory.ts`). `socialCallback`은 성공 시 `AppAuthService.issueTicket`(120000ms) 후 `AppConfig.appAuthCallbackUrl?code=<43자>`(`<WEB_ORIGIN>/app-auth/callback`), 실패 시 같은 콜백 `?error=login_failed`로 보낸다. 커스텀 스킴으로는 보내지 않는다(감사 M3).
5. 앱 `parseLoginCallback(url, verifier, callbackUrl)`: 콜백의 scheme·host·port는 대소문자 무시로 같고 경로는 정확히 같으며 쿼리가 `?code=<43자>` 하나일 때만 성공이다(추가 query·`error=`·커스텀 스킴은 `failed`, 해시는 무시). 세션 결과 `cancel`·`dismiss` → `cancelled`, 그 밖 → `failed`. 성공이면 `{ code, verifier }`만 `auth-result`로 보낸다(bridge `ticket` 스키마도 43자).
6. 웹이 WebView 안에서 `postAppExchange` → `POST /api/auth/app/exchange`로 교환한다. `AppAuthService.exchange`가 SHA-256(verifier)·만료·1회 소비를 확인하고 HttpOnly 세션 쿠키를 WebView에 심는다. 앱은 직접 교환하지 않는다 — 쿠키가 WebView 저장소에 남아야 한다.

## 저장·로그 금지

- code·verifier·세션 쿠키·토큰을 저장소·`console`·오류 문구·분석 이벤트에 남기지 않는다. 지금 `src`에는 저장소·로그 호출이 없다. 세션 토큰 필드를 브리지 스키마에 더하지 않는다.
- 제공자 추가: bridge `LoginProviderSchema`와 `packages/contracts` `SocialProviderSchema`(둘 다 kakao·discord·google)를 함께 바꾸고 API identity provider를 더한다.
- 콜백 경로 변경: bridge `APP_AUTH_CALLBACK_PATH`, `app.config.ts` `AUTH_CALLBACK_PATH`, 웹 `src/app/app-auth/callback`·`_app/app-links`(AASA), API `src/config/app-auth-callback.ts`를 함께 바꾸고 dev client를 다시 빌드한다. 딥링크 스킴 변경은 `app.config.ts` `scheme`과 bridge `APP_SCHEME`.

## 확인

| 바꾼 것 | 테스트 |
| --- | --- |
| 스키마·경로 | bridge `routes.spec.ts`, 앱 `src/features/navigation/lib/navigation-policy.spec.ts` |
| 수신·출처·back id·인증 직렬화·문서 교체 후 폐기 | `src/features/bridge/lib/native-host.spec.ts` |
| PKCE·콜백 위조 | `src/features/bridge/lib/social-login.spec.ts`, `src/features/bridge/model/native-login.test.tsx`(https 콜백·`preferUniversalLinks`) |
| 앱 링크 설정(associated domains·intent filter·17.4·운영 값 누락) | `app.config.spec.ts`(unit) |
| 셸 연결·외부 frame 거부·인증 취소 응답 | `src/_pages/web-shell/ui/WebShellPage.spec.tsx` |
| 웹 채널 | `apps/web/src/shared/native/native-bridge-channel.spec.tsx` |
| 실제 웹 왕복·Google 취소 | `e2e/app-shell.spec.ts` |
| 교환·만료·재사용·Origin | API `src/auth/app-auth.service.integration.test.ts`, `src/auth/auth.controller.integration.test.ts` |
| 실제 제공자 인증 뒤 https 앱 링크 복귀 | dev client·TestFlight/내부 테스트 실기기 |

```sh
yarn workspace @game-feedback/bridge test
yarn workspace @game-feedback/mobile test src/features/bridge src/_pages/web-shell
yarn workspace @game-feedback/web test src/shared/native
```
