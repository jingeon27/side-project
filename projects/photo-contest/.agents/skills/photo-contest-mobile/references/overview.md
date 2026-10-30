# 피식 모바일 셸

제품 화면·폼은 웹이, 네이티브는 WebView·안전 영역·OS 기능·탐색·복구가 소유한다. 세션은 WebView의 HttpOnly 쿠키이며 토큰을 브리지에 싣지 않는다.

- _app은 시작·Provider, _pages/web-shell은 WebView UI/이벤트, features/navigation은 URL 판단, features/bridge는 플랫폼 기능 조합을 소유한다. 실제 경로와 공개 barrel은 앱 AGENTS.md를 따른다.
- WebView에는 같은 origin·about:blank만 허용하고 다른 안전한 외부 URL은 OS로 연다. javascript/data/file은 차단한다. 기존 동기 탐색 정책과 출처 검사를 유지한다.
- 웹 기록과 overlay가 뒤로 가기를 먼저 처리한다. 네이티브는 800ms 뒤 WebView history·종료 fallback으로 이어지고 중복 처리를 막는다.
- 최초 링크·후속 링크·background/active·문서 교체·dispose 경합은 기존 채널과 수명 객체가 소유한다. effect 구독만 Effect Event로 최신 콜백을 읽고 WebView prop·메시지 채널에는 일반 콜백을 쓴다.
- OS 동작은 설치된 RN·Expo·WebView API에 맡긴다. Base UI의 DOM primitive로 네이티브 제스처·BackHandler·메시지 전송을 대체하지 않는다.
- 네이티브 SafeAreaView가 안전 영역을 소유한다. 웹이 같은 inset을 다시 적용해 여백을 두 배로 만들지 않는다.
- 메인 문서 연결 오류·5xx는 재시도 화면, 4xx는 웹 화면을 유지한다. 버전 조회 실패는 앱을 막지 않고 실제 최소 버전 미달일 때만 업데이트 화면을 쓴다.
- 루트 .env 설정·dev client와 두 플랫폼 번들은 [빌드](release.md), 셸·URL 상세는 [WebView](webview-shell.md), 네이티브 기능은 [기능](native-capability.md), 검증은 [테스트](mobile-test.md)를 읽는다.
