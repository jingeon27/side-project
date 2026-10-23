# Game Feedback 모바일

Expo 57 + React Native WebView 셸이다. 제품 화면·폼·게시글·댓글·채팅·디자인 시스템은 Web이 소유한다. 네이티브는 안전 영역, 탐색·뒤로 가기·딥링크, 연결 복구, 시스템 브라우저 인증만 담당한다.

- `_app/App.tsx`는 Provider 조합만 둔다. `_pages/web-shell`은 WebView UI·이벤트, `features/bridge`는 네이티브 메시지·Google 인증, `features/navigation`은 URL 정책, `shared/config`는 origin·색을 소유한다. slice 간 import는 named export `index.ts`를 통한다. 공유 Expo/FSD lint를 유지한다.
- `@game-feedback/bridge`는 앱·웹이 함께 쓰는 메시지 계약이다. Photo Contest 전용 bridge를 참조하거나 변경하지 않는다. API는 REST `/api`이고 앱에 별도 API origin·인증 토큰을 두지 않는다.
- 쿠키는 WebView의 HttpOnly 세션이다. 네이티브에는 일회용 OAuth 코드와 PKCE verifier만 잠시 존재한다. 세션·코드·verifier를 저장하거나 로그에 남기지 않는다.
- Expo Go 대신 dev client를 사용한다. Metro 8082, 개발 Web 3300/API 4300이다. Android는 `adb reverse tcp:3300 tcp:3300`으로 같은 localhost origin을 유지한다.
- `APP_VARIANT=development`만 Android HTTP를 허용한다. `APP_VARIANT=development`가 아닌 빌드는 운영 빌드이며 https `EXPO_PUBLIC_WEB_ORIGIN`(포트 없음)과 `MOBILE_APPLE_TEAM_ID`·`MOBILE_IOS_BUNDLE_ID`·`MOBILE_ANDROID_PACKAGE`가 없으면 `app.config.ts`가 멈춘다. `app.config.ts`가 네이티브 설정의 원본이며 생성 android/ios는 커밋하지 않는다.
- 소셜 로그인 코드는 검증된 https 앱 링크 `<WEB_ORIGIN>/app-auth/callback`으로만 받는다(iOS associated domains `applinks`·`webcredentials`, Android `autoVerify` intent filter, 웹 AASA·assetlinks). 최소 iOS는 17.4(`ASWebAuthenticationSession` https 콜백)이고 `openAuthSessionAsync(…, { preferUniversalLinks: true })`로 연다. 딥링크 처리기는 콜백 경로를 열지 않는다. `gamefeedback://`는 로그인 밖 딥링크용이다.
- `originWhitelist=['*']`와 동기 탐색 정책, 모든 메시지의 `nativeEvent.url` 검증을 유지한다. 새 창도 같은 정책을 사용한다. 딥링크는 알려진 locale·화면·안전한 ID만 받는다.
- Android 뒤로 가기는 웹 overlay를 먼저 닫고, 800ms 내 미처리면 WebView history/종료로 이어진다. 응답을 기다리는 중 중복 누름은 무시한다. foreground는 세션을 먼저 확인하고 계정 변경 시 private cache를 지운다.
- `WebViewChannel`은 화면 snapshot을 소유하고 `useWebShell`이 useSyncExternalStore로 구독한다. `ShellLifecycle`은 OS 전환·back 중복·초기/후속 링크 경합과 폐기를 관리한다. lifecycle 훅에 가변 let/ref 플래그를 두지 않으며 useCallback과 개별 의존성으로 OS 구독을 안정화한다. WebView props는 `satisfies WebViewProps`로 검증해 타입 추론을 유지한다.
- 테스트 설정·파일은 이 앱이 소유한다. Vitest unit은 순수 함수, UI는 RN Web과 OS 모듈 대역, Playwright는 실제 웹/API + 실제 native host 로직을 쓴다. Web 3302/API 4302, `.next/e2e-mobile`, 전용 55444 DB의 `gf_test_mobile_*`만 사용한다. DB를 reset하지 않는다.
- `bundle:check`는 Metro Android/iOS export를 검사한다. Playwright 통과를 dev client·실기기 또는 스토어 빌드 검증으로 표현하지 않는다.

## 앱 스킬

- `.agents/skills/game-feedback-mobile-webview-shell/SKILL.md`: WebView prop·탐색 정책·딥링크·채널 snapshot·복구·뒤로 가기.
- `.agents/skills/game-feedback-mobile-bridge/SKILL.md`: 브리지 메시지 계약·출처 검증·시스템 브라우저 로그인과 PKCE 인계.
- `.agents/skills/game-feedback-mobile-test/SKILL.md`: unit/ui 레인·FakeWebView·Playwright native host·실기기 확인 범위.
- `.agents/skills/game-feedback-mobile-build/SKILL.md`: dev client 실행·`app.config.ts`·`APP_VARIANT`와 `__DEV__`·버전·`bundle:check`.
