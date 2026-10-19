---
name: mobile
description: 웃긴순간 모바일 앱(apps/mobile, Expo React Native WebView 셸)의 WebView 설정, 탐색 정책, 딥링크, Android 뒤로 가기, 버전 확인, 네이티브 기능을 고치거나 실행할 때 사용한다.
---

- 앱은 웹(`apps/web`)을 WebView 하나로 감싸는 얇은 셸이다. 화면·기능은 웹에 만들고, 앱에는 웹이 할 수 없는 네이티브 기능(공유 시트, 클립보드, 햅틱, 시스템 브라우저, 소셜 로그인 핸드오프)만 둔다. overlay-kit·ts-pattern 같은 UI·분기 라이브러리를 앱에 넣지 않는다.
- 레이어는 `src/_app`, `src/_pages`(web-shell, update-required), `src/features`(bridge, navigation, app-config, analytics), `src/shared`. `modules` 단계는 없다.
- 버전은 Expo SDK 57이 고정한 값(`bundledNativeModules`)을 따른다. 모바일 워크스페이스는 `hoistingLimits: workspaces`라 자기 React(19.2.3)를 따로 가진다 — 웹의 React 버전에 맞추지 않는다. 패키지를 추가하면 `expo install` 기준 버전 + Yarn 24시간 격리 게이트를 확인하고 `bundle:check`로 Metro 번들을 확인한다.
- 라이브러리 API는 `apps/mobile/node_modules`의 설치된 타입 정의를 기준으로 한다(react-native-webview 13.16 등).

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

- Expo Go로는 열지 않는다(앱 스킴 콜백·네이티브 모듈). `APP_VARIANT=development`로 dev client를 만든 뒤 `start`. 개발 빌드만 평문 http를 허용한다.
- 웹 주소는 `EXPO_PUBLIC_WEB_ORIGIN`(기본 `http://localhost:3200`). Android 에뮬레이터는 `adb reverse tcp:3200 tcp:3200`(10.0.2.2를 쓰면 API의 Origin 검사가 POST를 막는다).
- 앱은 웹 origin의 `/backend/*`만 부른다. API 주소를 따로 두지 않는다.
- 네이티브 빌드·실기기 확인(키보드, 소셜 로그인 복귀, 파일 업로드, 공유 시트)은 테스트가 대신하지 못한다. 바꾼 뒤에는 실기기에서 직접 확인한다.

메시지 계약을 바꿀 때는 `bridge` 스킬, 이벤트·오류 수집은 `monitoring` 스킬, 테스트 레인은 `testing` 스킬과 `apps/mobile/AGENTS.md`를 따른다.
