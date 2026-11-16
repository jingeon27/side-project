---
name: game-feedback-mobile
description: Game Mate Expo WebView 셸의 탐색·브리지·OS 푸시·복구·dev client/번들·테스트를 변경할 때 사용한다. 제품 UI는 웹 스킬을 쓴다.
---

# Game Mate 모바일

앱 AGENTS.md와 루트 TypeScript 규칙을 따른다. 경로는 `apps/mobile` 기준이다. 프로젝트 루트 .env와 WebView 쿠키 세션을 사용한다. 제거된 네이티브 소셜 로그인·PKCE 메시지·App Link 배포 설정을 복원하지 않는다.

- WebViewChannel·ShellLifecycle·탐색·뒤로 가기·복구: [셸](references/webview-shell.md).
- 메시지·출처 검증·경로 계약·푸시: [브리지](references/bridge.md).
- 루트 환경·dev client·버전·번들·스토어: [빌드](references/build.md).
- Vitest·FakeWebView·Playwright native host·실기기 범위: [테스트](references/test.md).

앱은 별도 API origin·세션 토큰을 저장하지 않는다. Playwright/Metro 성공을 실기기나 서명된 스토어 빌드 성공으로 보고하지 않는다.
