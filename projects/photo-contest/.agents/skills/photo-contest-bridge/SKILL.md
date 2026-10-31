---
name: photo-contest-bridge
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
- 요청은 id로 응답을 짝짓고 종류별 타임아웃이 있다(공유 5분, 그 밖 5~10초). 오류 코드: UNSUPPORTED·CANCELLED·FAILED·INVALID·TIMEOUT.

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

link.open의 HTTP·HTTPS URL은 S3 서명의 임시 자격 증명·한글 파일명을 위해 최대 8192자를 허용한다. 일반 share.open URL의 2048자 제한과 쿠키·사용자 세션을 보내지 않는 규칙은 유지한다. 서명 URL은 파일을 잠시 읽는 권한이며 이벤트·로그·영구 상태에 기록하지 않는다.

## React 경계와 수명

- 이 패키지는 React 밖에서도 쓰이는 전송·검증·요청/응답 채널이다. React Hook이나 `useEffectEvent`를 넣지 않는다. 웹의 Effect가 설치한 구독만 그 훅 안에서 Effect Event로 최신 콜백을 읽고 구독 대상 교체/cleanup은 유지한다.
- 네이티브 라우터는 WebView `onMessage`에서도 호출되므로 Effect Event를 주입하지 않는다. 패키지 자체의 dispose·타임아웃·origin 검증과 최신 ref 연결을 유지한다.
- DOM outside-click·focus·Escape·ARIA는 웹 primitive가 맡으며 브리지에는 `navigation.back` 계약만 둔다.

- 생성자 인자를 같은 이름의 필드에 그대로 저장하면 별도 필드 선언과 `this.x = x` 대신 TypeScript parameter property(`private readonly x: T`, `readonly code: T`)로 합친다. 기존 접근 범위·readonly·인자 순서를 보존하고 단순 초기값은 매개변수 기본값을 검토한다. 변환·검증·자원 생성까지 억지로 기본 인자로 옮겨 API를 늘리지 않는다. 기본 인자에서는 아직 초기화되지 않은 인스턴스 필드·화살표 핸들러를 참조하지 않으며, 필드 초기화 순서와 상속 클래스의 `super()` 순서를 확인한다.

- 단순 전달 래퍼는 인자 개수·변환/차단, `this`, 반환값/Promise, 호출 시점과 최신 값 조회가 같은 경우에만 직접 함수 참조로 바꾼다. 메서드 receiver·인자 어댑터·최신 ref 조회·동기 이벤트 반환·Effect 경계를 지키는 래퍼는 유지한다.
- Promise 체인은 `async`/`await`와 `try`/`catch`/`finally`를 우선한다. `Promise.all`·`race`의 작업을 순차 await로 바꾸지 않으며, 경쟁에서 진 작업의 늦은 실패도 처리한다. cleanup·잠금 해제·취소 후 결과 무시·메모이즈 실패 재시도와 동기 콜백 반환값을 보존한다.

- 직접 작성해 이벤트 prop·리스너·observer에 등록하는 내부 함수와 Effect Event는 `const handle* = …`로 선언한다. 클래스 이벤트 필드는 `private readonly handle* = …`로 receiver를 보존한다. 기존 라이브러리·부모 prop 함수 참조는 이름을 바꾸거나 `handle*` 별칭으로 감싸지 않으며 순수 계산 함수에는 이 접두사를 강제하지 않는다.
- 래퍼 감사는 TypeScript AST로 typed arrow·단일 return 블록·함수 선언까지 확인한다. 직접 참조로 바꾸기 전에 전달 인자, `this`, 반환값, 실행 시점과 참조 수명을 검토한다. `AbortController.abort()`의 무인자 호출은 receiver와 취소 reason을 지키므로 이벤트에 메서드를 그대로 넘기지 않는다.

- 명명 검사는 기존 `react/jsx-handler-names` 옵션을 우선한다. `checkLocalVariables: false`는 직접 작성한 로컬 함수도 모두 검사에서 제외하므로 로컬 함수·리스너·observer의 `handle*` 명명은 리뷰로 유지한다. 사용자 정책에 따라 명명용 커스텀 규칙을 새로 만들거나 재도입하지 않으며, 이름을 맞추기 위한 별칭 래퍼·disable도 추가하지 않는다.
