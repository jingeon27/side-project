---
name: mobile
description: 웃긴순간 모바일 앱(apps/mobile, Expo React Native WebView 셸)의 WebView 설정, 탐색 정책, 딥링크, Android 뒤로 가기, 버전 확인, 네이티브 기능을 고치거나 실행할 때 사용한다.
---

- 앱은 웹(`apps/web`)을 WebView 하나로 감싸는 얇은 셸이다. 화면·기능은 웹에 만들고, 앱에는 웹이 할 수 없는 네이티브 기능(공유 시트, 클립보드, 햅틱, 시스템 브라우저)만 둔다. overlay-kit·ts-pattern 같은 UI·분기 라이브러리를 앱에 넣지 않는다.
- 레이어는 `src/_app`, `src/_pages`(web-shell, update-required), `src/features`(bridge, navigation, app-config, analytics), `src/shared`. `modules` 단계는 없다.
- Expo SDK 58의 네이티브 모듈은 설치된 `bundledNativeModules`를 따른다. React·React DOM은 웹과 같은 공통 catalog의 19.3.1을 쓰며, React Native의 peer 범위 `^19.3.0` 안의 패치다. SDK 권장 패치와 달라 `expo.install.exclude`에 명시한다. `hoistingLimits: workspaces`는 유지하고 버전을 바꾸면 타입·단위 검사와 Android/iOS Metro 번들을 검증한다. 새 Expo 패치는 Yarn 24시간 격리 게이트를 통과해야 한다.
- 라이브러리 API는 `apps/mobile/node_modules`의 설치된 타입 정의를 기준으로 한다(버전 번호를 과거 문서에서 복사하지 않는다).

## 동작 규칙

- 세션은 WebView의 HttpOnly 쿠키가 맡는다. 토큰·쿠키를 네이티브로 꺼내거나 넘기지 않는다.
- 웹 메시지는 `nativeEvent.url`의 origin이 `WEB_ORIGIN`일 때만 처리한다(브리지 라우터의 allowedOrigin).
- 모든 탐색은 `features/navigation/lib/navigation-policy.ts`가 판단한다. WebView 안에는 웹 origin·`about:blank`만 열고, 그 밖(다른 사이트·intent·카카오톡·전화)은 밖에서 연다. `javascript:`·`data:`·`file:`은 막는다.
- 딥링크는 `/invite/<토큰>`, `/groups/<id>`, `/contests/<id>`만, 안전 문자만 받는다. 웹이 `app.ready`를 알린 뒤에는 `navigation.open`으로, 그 전에는 첫 URL로 보낸다.
- 화면 기록은 웹이 가진다. Android 뒤로 가기는 `navigation.back`으로 웹에 먼저 묻고(800ms), 웹이 처리하지 않으면 WebView 뒤로 가기, 기록이 없으면 앱을 닫는다.
- 안전 영역은 네이티브(SafeAreaView)가 맡는다. 웹에서 따로 처리하지 않게 한다.
- 버전 확인(`/backend/app/config`)은 실패해도 앱을 막지 않는다. 최소 버전보다 낮을 때만 업데이트 화면.
- 메인 문서 연결 오류·5xx는 다시 시도 화면, 4xx는 웹 화면을 그대로 둔다.

## 실행

- Expo Go로는 열지 않는다(네이티브 모듈). `APP_VARIANT=development`로 dev client를 만든 뒤 `start`. 개발 빌드만 평문 http와 iOS 로컬 네트워크 예외를 허용한다. `APP_VARIANT=development`가 아니면 운영 빌드로 보고 https WEB_ORIGIN이 없으면 `app.config.ts`가 멈춘다.
- 웹 주소는 프로젝트 루트 `.env`의 `WEB_ORIGIN`(개발 빌드만 기본 `http://localhost:3200`, 그 밖에는 https origin이 없으면 설정 단계에서 실패). Android 에뮬레이터는 `adb reverse tcp:3200 tcp:3200`(10.0.2.2를 쓰면 API의 Origin 검사가 POST를 막는다).
- 앱은 웹 origin의 `/backend/*`만 부른다. API 주소를 따로 두지 않는다.
- 네이티브 빌드·실기기 확인(키보드, 파일 업로드, 공유 시트)은 테스트가 대신하지 못한다. 바꾼 뒤에는 실기기에서 직접 확인한다.

메시지 계약을 바꿀 때는 `bridge` 스킬, 이벤트·오류 수집은 `monitoring` 스킬, 테스트 레인은 `testing` 스킬과 `apps/mobile/AGENTS.md`를 따른다.

## 사용자 피드백: 라이브러리 우선과 구독 수명

- 네이티브 동작은 설치된 React Native·Expo·WebView API에 우선 맡긴다. Base UI는 DOM primitive이므로 네이티브 제스처·Android BackHandler·WebView 메시지 전송을 대체하지 못한다. origin 검증·요청 짝짓기·800ms 뒤로 가기 정책은 앱/bridge가 소유한다.
- Effect에서 설치한 AppState·Linking 구독의 최신 콜백은 `useEffectEvent`로 분리한다. 구독 대상·활성 조건은 dependency에 남기고 cleanup에서 리스너와 진행 중 작업의 후속 동작을 해제한다.
- WebView prop·callback ref·렌더 중 만든 라우터/PushInbox는 Effect 밖에서도 호출된다. 여기에 Effect Event를 넘기지 않고 일반 콜백·필요한 최신 ref를 유지한다. 외부 상태 렌더는 `useSyncExternalStore`, 값 변화 동기화는 reactive Effect를 사용한다.
- `else`·`else if`는 쓰지 않는다. 기존 공통 no-else lint와 가드·조기 반환 기준을 유지한다.

- `let`을 피하려고 `const state = { value: ... }`의 속성을 재할당하는 임시 가변 객체를 만들지 않는다. `useRef`로 기계적으로 옮기는 것도 피한다. 순수 계산·파생 값, state/reducer, 기존 외부 store·구독 API를 우선한다. 실제 이벤트 이력·취소·동시 실행처럼 React 렌더와 별도인 수명은 해당 자원을 소유하는 구독 객체나 AbortController·라이브러리 Mutex에 맡긴다. 단지 가변 변수를 숨기기 위한 class를 추가하지 않는다. `useRef`는 대안이 부적절하고 비렌더 값을 보존할 필요가 명확한 경우에만 쓴다.

- 생성자 인자를 같은 이름의 필드에 그대로 저장하면 별도 필드 선언과 `this.x = x` 대신 TypeScript parameter property(`private readonly x: T`, `readonly code: T`)로 합친다. 기존 접근 범위·readonly·인자 순서를 보존하고 단순 초기값은 매개변수 기본값을 검토한다. 변환·검증·자원 생성까지 억지로 기본 인자로 옮겨 API를 늘리지 않는다. 기본 인자에서는 아직 초기화되지 않은 인스턴스 필드·화살표 핸들러를 참조하지 않으며, 필드 초기화 순서와 상속 클래스의 `super()` 순서를 확인한다.

- 단순 전달 래퍼는 인자 개수·변환/차단, `this`, 반환값/Promise, 호출 시점과 최신 값 조회가 같은 경우에만 직접 함수 참조로 바꾼다. 메서드 receiver·인자 어댑터·최신 ref 조회·동기 이벤트 반환·Effect 경계를 지키는 래퍼는 유지한다.
- Promise 체인은 `async`/`await`와 `try`/`catch`/`finally`를 우선한다. `Promise.all`·`race`의 작업을 순차 await로 바꾸지 않으며, 경쟁에서 진 작업의 늦은 실패도 처리한다. cleanup·잠금 해제·취소 후 결과 무시·메모이즈 실패 재시도와 동기 콜백 반환값을 보존한다.

- 직접 작성해 이벤트 prop·리스너·observer에 등록하는 내부 함수와 Effect Event는 `const handle* = …`로 선언한다. 클래스 이벤트 필드는 `private readonly handle* = …`로 receiver를 보존한다. 기존 라이브러리·부모 prop 함수 참조는 이름을 바꾸거나 `handle*` 별칭으로 감싸지 않으며 순수 계산 함수에는 이 접두사를 강제하지 않는다.
- 래퍼 감사는 TypeScript AST로 typed arrow·단일 return 블록·함수 선언까지 확인한다. 직접 참조로 바꾸기 전에 전달 인자, `this`, 반환값, 실행 시점과 참조 수명을 검토한다. `AbortController.abort()`의 무인자 호출은 receiver와 취소 reason을 지키므로 이벤트에 메서드를 그대로 넘기지 않는다.

- 명명 검사는 기존 `react/jsx-handler-names` 옵션을 우선한다. `checkLocalVariables: false`는 직접 작성한 로컬 함수도 모두 검사에서 제외하므로 로컬 함수·리스너·observer의 `handle*` 명명은 리뷰로 유지한다. 사용자 정책에 따라 명명용 커스텀 규칙을 새로 만들거나 재도입하지 않으며, 이름을 맞추기 위한 별칭 래퍼·disable도 추가하지 않는다.
