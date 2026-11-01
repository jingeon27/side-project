# Game Feedback 모바일

사용자가 루트 `.env`만 사용하도록 지정했다. 모바일은 루트 WEB_ORIGIN·공개 관측 키를 읽고 ENVIRONMENT=production이면 HTTPS를 요구한다. 별도 모바일 env 템플릿·App Link/Universal Link 배포 설정·시스템 브라우저 소셜 로그인은 제거했다. 관련 스킬의 이전 모바일 환경변수·인증서 설정 지침은 적용하지 않는다. 서버 자격 증명은 Expo extra에 넣지 않는다.

Expo 58 + React Native WebView 셸이다. 제품 화면·폼·게시글·댓글·채팅·디자인 시스템은 Web이 소유한다. 네이티브는 안전 영역, 탐색·뒤로 가기·딥링크, 연결 복구와 OS 푸시 권한·토큰·배지·알림 탭을 담당한다.

- `_app/App.tsx`는 Provider 조합만 둔다. `_pages/web-shell`은 WebView UI·이벤트, `features/bridge`는 네이티브 메시지·OS 푸시, `features/navigation`은 URL 정책, `shared/config`는 origin·색을 소유한다. slice 간 import는 named export `index.ts`를 통한다. 공유 Expo/FSD lint를 유지한다.
- `@game-feedback/bridge`는 앱·웹이 함께 쓰는 메시지 계약이다. Photo Contest 전용 bridge를 참조하거나 변경하지 않는다. API는 REST `/api`이고 앱에 별도 API origin·인증 토큰을 두지 않는다.
- 푸시 설치 UUID만 AsyncStorage에 보존한다. Expo token은 브리지로 웹에 전달해 현재 쿠키 세션에 등록하며, 제공자 비밀키·로그인 토큰을 네이티브에 저장하지 않는다. 기능과 운영 준비는 루트 `packages/toolkit/src/push-notifications/README.md`를 따른다.
- 쿠키는 WebView의 HttpOnly 세션이다. 네이티브는 로그인 코드·verifier를 발급·교환하지 않으며 세션·쿠키·토큰을 저장하거나 로그에 남기지 않는다.
- Expo Go 대신 dev client를 사용한다. Metro 8082, 개발 Web 3300/API 4300이다. Android는 `adb reverse tcp:3300 tcp:3300`으로 같은 localhost origin을 유지한다.
- NativeHost의 auth-request/auth-result 호환 계약은 남아 있지만 앱은 login 구현을 연결하지 않는다. 제거한 native-login·App Link 설정을 다시 도입하지 않으며 /app-auth/callback은 일반 딥링크로도 열지 않는다.
- `originWhitelist=['*']`와 동기 탐색 정책, 모든 메시지의 `nativeEvent.url` 검증을 유지한다. 새 창도 같은 정책을 사용한다. 딥링크는 알려진 locale·화면·안전한 ID만 받는다.
- Android 뒤로 가기는 웹 overlay를 먼저 닫고, 800ms 내 미처리면 WebView history/종료로 이어진다. 응답을 기다리는 중 중복 누름은 무시한다. foreground는 세션을 먼저 확인하고 계정 변경 시 private cache를 지운다.
- `WebViewChannel`은 화면 snapshot을 소유하고 `useWebShell`이 useSyncExternalStore로 구독한다. `ShellLifecycle`은 OS 전환·back 중복·초기/후속 링크 경합과 폐기를 관리한다. lifecycle 훅에 가변 let/ref 플래그를 두지 않으며 OS 구독은 셸 마운트 수명으로 유지하고 useEffectEvent로 최신 처리 콜백을 읽는다. 구독 대상이 바뀌는 effect의 reactive 의존성은 유지한다. WebView props는 `satisfies WebViewProps`로 검증해 타입 추론을 유지한다.
- 테스트 설정·파일은 이 앱이 소유한다. Vitest unit은 순수 함수, UI는 RN Web과 OS 모듈 대역, Playwright는 실제 웹/API + 실제 native host 로직을 쓴다. Web 3302/API 4302, `.next/e2e-mobile`, 전용 55444 DB의 `gf_test_mobile_*`만 사용한다. DB를 reset하지 않는다.
- `bundle:check`는 Metro Android/iOS export를 검사한다. Playwright 통과를 dev client·실기기 또는 스토어 빌드 검증으로 표현하지 않는다.

## 앱 스킬

[game-feedback-mobile](../../.agents/skills/game-feedback-mobile/SKILL.md)에서 필요한 주제만 읽는다. 공통 TypeScript·React·UI·커밋 규칙은 루트가 소유한다.
