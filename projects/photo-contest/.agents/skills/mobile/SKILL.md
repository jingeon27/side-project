---
name: mobile
description: 웃긴순간 모바일 앱(apps/mobile, Expo React Native WebView 셸)의 WebView 설정, 탐색 정책, 딥링크, Android 뒤로 가기, 버전 확인, 네이티브 기능을 고치거나 실행할 때 사용한다.
---

- 앱은 웹(`apps/web`)을 WebView 하나로 감싸는 얇은 셸이다. 화면·기능은 웹에 만들고, 앱에는 웹이 할 수 없는 네이티브 기능(공유 시트, 클립보드, 햅틱, 시스템 브라우저, 소셜 로그인 핸드오프)만 둔다. overlay-kit·ts-pattern 같은 UI·분기 라이브러리를 앱에 넣지 않는다.
- 레이어는 `src/_app`, `src/_pages`(web-shell, update-required), `src/features`(bridge, navigation, app-config, analytics), `src/shared`. `modules` 단계는 없다.
- Expo SDK 58의 네이티브 모듈은 설치된 `bundledNativeModules`를 따른다. React·React DOM은 웹과 같은 공통 catalog의 19.3.1을 쓰며, React Native의 peer 범위 `^19.3.0` 안의 패치다. SDK 권장 패치와 달라 `expo.install.exclude`에 명시한다. `hoistingLimits: workspaces`는 유지하고 버전을 바꾸면 타입·단위 검사와 Android/iOS Metro 번들을 검증한다. 새 Expo 패치는 Yarn 24시간 격리 게이트를 통과해야 한다.
- 라이브러리 API는 `apps/mobile/node_modules`의 설치된 타입 정의를 기준으로 한다(버전 번호를 과거 문서에서 복사하지 않는다).

## 동작 규칙

- 세션은 WebView의 HttpOnly 쿠키가 맡는다. 토큰·쿠키를 네이티브로 꺼내거나 넘기지 않는다.
- 웹 메시지는 `nativeEvent.url`의 origin이 `WEB_ORIGIN`일 때만 처리한다(브리지 라우터의 allowedOrigin).
- 모든 탐색은 `features/navigation/lib/navigation-policy.ts`가 판단한다. WebView 안에는 웹 origin·`about:blank`만 열고, 그 밖(다른 사이트·intent·카카오톡·전화)은 밖에서 연다. `javascript:`·`data:`·`file:`은 막는다.
- 딥링크는 `/invite/<토큰>`, `/groups/<id>`, `/contests/<id>`만, 안전 문자만 받는다. 웹이 `app.ready`를 알린 뒤에는 `navigation.open`으로, 그 전에는 첫 URL로 보낸다.
- 소셜 로그인 코드는 검증된 https 앱 링크 `<WEB_ORIGIN>/app-auth/callback`으로만 받는다(iOS associated domains `applinks`·`webcredentials`, Android `autoVerify` intent filter, 웹의 AASA·assetlinks). 인증 세션만 이 주소를 읽고, 딥링크 처리기는 콜백을 열지 않는다. 앱 스킴(`photocontest://`)은 로그인 밖의 딥링크에만 남긴다. 최소 iOS는 17.4(`ASWebAuthenticationSession` https 콜백).
- 화면 기록은 웹이 가진다. Android 뒤로 가기는 `navigation.back`으로 웹에 먼저 묻고(800ms), 웹이 처리하지 않으면 WebView 뒤로 가기, 기록이 없으면 앱을 닫는다.
- 안전 영역은 네이티브(SafeAreaView)가 맡는다. 웹에서 따로 처리하지 않게 한다.
- 버전 확인(`/backend/app/config`)은 실패해도 앱을 막지 않는다. 최소 버전보다 낮을 때만 업데이트 화면.
- 메인 문서 연결 오류·5xx는 다시 시도 화면, 4xx는 웹 화면을 그대로 둔다.

## 실행

- Expo Go로는 열지 않는다(앱 링크 콜백·네이티브 모듈). `APP_VARIANT=development`로 dev client를 만든 뒤 `start`. 개발 빌드만 평문 http와 iOS 로컬 네트워크 예외를 허용한다. `APP_VARIANT=development`가 아니면 운영 빌드로 보고 https 웹 origin과 앱 링크 값(Team ID·bundle id·package)이 없으면 `app.config.ts`가 멈춘다.
- 웹 주소는 `EXPO_PUBLIC_WEB_ORIGIN`(개발 빌드만 기본 `http://localhost:3200`, 그 밖에는 https origin이 없으면 설정 단계에서 실패). Android 에뮬레이터는 `adb reverse tcp:3200 tcp:3200`(10.0.2.2를 쓰면 API의 Origin 검사가 POST를 막는다).
- 개발 빌드의 http `localhost` 웹에는 앱 링크가 없어 소셜 로그인이 앱으로 돌아오지 않는다(아이디 로그인은 된다). 확인하려면 https 터널 origin을 웹·API `WEB_ORIGIN`과 `EXPO_PUBLIC_WEB_ORIGIN`에 같이 넣고 `release` 스킬의 개발용 앱 링크 절차를 따른다.
- 앱은 웹 origin의 `/backend/*`만 부른다. API 주소를 따로 두지 않는다.
- 네이티브 빌드·실기기 확인(키보드, 소셜 로그인 복귀, 파일 업로드, 공유 시트)은 테스트가 대신하지 못한다. 바꾼 뒤에는 실기기에서 직접 확인한다.

메시지 계약을 바꿀 때는 `bridge` 스킬, 이벤트·오류 수집은 `monitoring` 스킬, 테스트 레인은 `testing` 스킬과 `apps/mobile/AGENTS.md`를 따른다.

## 사용자 피드백: 라이브러리 우선과 구독 수명

- 네이티브 동작은 설치된 React Native·Expo·WebView API에 우선 맡긴다. Base UI는 DOM primitive이므로 네이티브 제스처·Android BackHandler·WebView 메시지 전송을 대체하지 못한다. origin 검증·요청 짝짓기·800ms 뒤로 가기 정책은 앱/bridge가 소유한다.
- Effect에서 설치한 AppState·Linking 구독의 최신 콜백은 `useEffectEvent`로 분리한다. 구독 대상·활성 조건은 dependency에 남기고 cleanup에서 리스너와 진행 중 작업의 후속 동작을 해제한다.
- WebView prop·callback ref·렌더 중 만든 라우터/PushInbox는 Effect 밖에서도 호출된다. 여기에 Effect Event를 넘기지 않고 일반 콜백·필요한 최신 ref를 유지한다. 외부 상태 렌더는 `useSyncExternalStore`, 값 변화 동기화는 reactive Effect를 사용한다.
- `else`·`else if`는 쓰지 않는다. 기존 공통 no-else lint와 가드·조기 반환 기준을 유지한다.

- `let`을 피하려고 `const state = { value: ... }`의 속성을 재할당하는 임시 가변 객체를 만들지 않는다. `useRef`로 기계적으로 옮기는 것도 피한다. 순수 계산·파생 값, state/reducer, 기존 외부 store·구독 API를 우선한다. 실제 이벤트 이력·취소·동시 실행처럼 React 렌더와 별도인 수명은 해당 자원을 소유하는 구독 객체나 AbortController·라이브러리 Mutex에 맡긴다. 단지 가변 변수를 숨기기 위한 class를 추가하지 않는다. `useRef`는 대안이 부적절하고 비렌더 값을 보존할 필요가 명확한 경우에만 쓴다.
