# WebView 메시지와 출처

경로는 apps/mobile 기준이다. 계약은 이 프로젝트의 packages/bridge이며 피식 계약을 가져오지 않는다.

## 현재 경계

- index.ts의 strict WebMessageSchema/NativeMessageSchema와 routes.ts의 WebPathSchema가 메시지·경로를 검증한다. 모르는 필드는 전체 메시지 폐기로 이어지므로 설치된 구버전과의 호환·fallback을 확인한다.
- 웹은 native-bridge-channel과 NativeBridge, 앱은 features/bridge/lib/native-host.ts와 _pages/web-shell/model/use-web-shell.ts가 조합한다. NativeHost와 테스트 하네스의 순수 코드에 RN/Expo import를 넣지 않는다.
- 현재 앱은 NativeHost에 login 구현을 연결하지 않는다. auth-request/auth-result·PKCE 호환 계약/테스트가 남아 있어도 네이티브 인증이 동작하는 것은 아니다. login 없는 auth-request는 failed이며 제거된 native-login·소셜 로그인 세션·App Link 배포를 복원하지 않는다.
- WebView의 쿠키가 세션을 소유한다. 세션 토큰·쿠키·OAuth 코드·verifier·S3 서명 URL은 영구 상태·로그·분석에 기록하지 않는다.

## 메시지 변경

1. bridge 스키마·경로와 관련 테스트를 바꾼다. ready·location·navigation-state·back/back-result·state·open과 push-*의 방향·필드·요청 ID를 유지한다.
2. 웹 채널의 수신·전송과 NativeBridge 연결, 앱 NativeHost 분기와 useWebShell의 실제 옵션을 함께 확인한다.
3. onMessage는 nativeEvent.url과 data를 NativeHost.receive에 전달한다. origin 검증은 파싱보다 먼저 하며 다른 frame·유사 호스트·다른 scheme/port를 거부한다.
4. 준비 전 open/state/back은 기존 문서 열기·생략 fallback을 따른다. 문서 교체·dispose 뒤의 늦은 요청 결과는 generation·취소 경계로 버린다.
5. 앱 e2e/support/native-host.ts 하네스에도 실제 계약을 반영하고 bridge unit → NativeHost unit → WebShellPage UI → 필요한 실제 웹 왕복 E2E를 실행한다.

## 푸시

push-request/result·push-badge·push-settings·push-received는 OS 권한·등록/탭을 웹의 현재 쿠키 세션과 연결한다. 설치 UUID만 로컬에 보존하고 Expo token·서비스 비밀값은 로그에 남기지 않는다. 공통 푸시 도구의 운영 준비는 packages/toolkit/src/push-notifications/README.md를 따른다.

origin·잘못된 메시지·웹 미준비·800ms back·문서 교체 후 결과 폐기는 unit/UI로, 실제 탭/딥링크는 E2E로 확인한다. OS 권한·알림 탭·하드웨어 back은 실기기 확인 여부를 구분한다.
