---
name: bridge
description: 웹과 모바일 앱 사이 메시지 계약(packages/bridge)에 요청·알림을 추가하거나 바꿀 때, 또는 웹·앱의 브리지 연동을 고칠 때 사용한다.
---

`@photo-contest/bridge`가 웹 ↔ 앱 메시지의 유일한 계약이다. 웹과 앱이 같은 zod 스키마로 양쪽 메시지를 검증한다.

| 진입점 | 내용 | 쓰는 곳 |
| --- | --- | --- |
| `.` | 프로토콜 상수·스키마·타입(`WEB_REQUEST`, `NATIVE_REQUEST`, `WEB_EVENT`, `NATIVE_EVENT`), decode, User-Agent 토큰, `originOf` | 웹·앱 |
| `./web` | `createWebBridge(window)`, `readNativeAppInfo`, `BridgeError` | 웹 |
| `./native` | `createNativeRouter`, `NativeCapabilityError`, `buildBootstrapScript`, `buildNativeDispatchScript` (React Native를 import하지 않는다) | 앱, 앱 e2e |
| `./test` | `installFakeNativeApp` — 테스트 전용, 프로덕션 코드에서 import 금지 | 웹·앱 테스트 |

## 전송

- 웹 → 앱: `window.ReactNativeWebView.postMessage(JSON 문자열)`.
- 앱 → 웹: `injectJavaScript(buildNativeDispatchScript(message))`가 `window`에 `photo-contest:native` CustomEvent(detail = JSON 문자열)를 보낸다. 문자열은 ` `·`<`까지 이스케이프된다.
- 앱 정보(플랫폼, 앱 버전, 프로토콜 버전, 지원 기능 목록, 분석 기기 ID)는 `injectedJavaScriptBeforeContentLoaded`(`buildBootstrapScript`)로 문서보다 먼저 심는다.
- 요청은 id로 응답을 짝짓고 종류별 타임아웃이 있다(소셜 로그인 10분, 공유 5분, 그 밖 5~10초). 오류 코드: UNSUPPORTED·CANCELLED·FAILED·INVALID·TIMEOUT.

## 바꾸는 순서

1. `packages/bridge/src/protocol.ts`에 payload·result zod 스키마를 추가한다. URL은 정규식 검사(`URL` 생성자는 구형 WKWebView·React Native에서 불완전하다), 경로는 같은 origin 상대 경로만.
2. 이미 배포된 앱이 있으므로 하위 호환을 지킨다: 필드는 선택으로만 추가하고, 의미를 바꾸면 `PROTOCOL_VERSION`을 올린다. 웹은 `bridge.supports(type)`로 앱이 지원할 때만 보내고, 아니면 웹 기능으로 대신한다.
3. 앱: `features/bridge/lib/create-capabilities.ts`(순수, 플랫폼 기능 주입)에 구현하고 `model/native-capabilities.ts`에서 expo 모듈과 잇는다. 사용자가 취소하면 `CANCELLED`, 그 밖 실패는 내부 메시지 없이 `FAILED`.
4. 웹: `src/shared/model/bridge`의 훅에서 쓰고, 앱 밖 대체 동작을 같이 만든다.
5. 테스트: 패키지 spec(형식·거부 케이스), 앱 unit(기능 매핑), 웹 ui(`installFakeNativeApp`으로 앱 경로·대체 경로), 앱 e2e(native-host 픽스처로 실제 웹과 왕복).

## 하지 않는 것

- 세션 토큰·쿠키를 브리지로 보내지 않는다(`auth.changed`의 `userId`는 분석 식별용 ID일 뿐이다).
- 앱은 허용한 origin 밖에서 온 메시지를 처리하지 않는다.
- 앱 감지 결과로 권한을 판단하지 않는다(화면 모양에만 쓴다).
