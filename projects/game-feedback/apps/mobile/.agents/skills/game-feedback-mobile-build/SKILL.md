---
name: game-feedback-mobile-build
description: Game Feedback 모바일 앱을 dev client로 실행(Metro 8082, adb reverse, 개발 Web 3300/API 4300)하거나 `app.config.ts`·`APP_VARIANT`·`EXPO_PUBLIC_WEB_ORIGIN`·앱 버전·Expo 네이티브 패키지·`bundle:check`를 바꾸고 release 빌드 조건을 확인할 때 사용한다.
---

Expo Go 금지·포트·HTTPS 원칙은 `apps/mobile/AGENTS.md`와 `README.md`, 패키지 최소 배포 기간 게이트는 루트 `AGENTS.md`를 따른다. 명령은 side 루트에서 실행한다. 운영 서명·스토어 제출·배포 설정은 이 앱에 없다.

## dev client 실행

```sh
corepack yarn workspace @side/game-feedback dev:test     # Web 3300 / API 4300, 이미 떠 있으면 그대로 쓴다
adb reverse tcp:3300 tcp:3300                            # 에뮬레이터·USB 기기를 연결할 때마다
APP_VARIANT=development corepack yarn workspace @game-feedback/mobile android   # 또는 ios: dev client 빌드·설치
APP_VARIANT=development corepack yarn workspace @game-feedback/mobile start     # 설치된 dev client용 Metro 8082
```

- 개발 origin 기본값은 `http://localhost:3300`(`parseWebOrigin`, `__DEV__`에서 값이 없을 때)이다. API `WEB_ORIGIN`도 `../../scripts/env.mjs` 기본이 같은 값이라 쿠키·Origin 검사가 맞는다. Android 에뮬레이터는 `adb reverse`로 이 localhost를 유지한다. 실기기는 닿을 수 있는 origin을 `EXPO_PUBLIC_WEB_ORIGIN`과 API `WEB_ORIGIN`에 같은 값으로 준다.
- `dev:test`는 3300·4300이 사용 중이면 실패한다(`../../scripts/dev.mjs` `assertPortFree`). 사용자의 개발 서버를 끄거나 다시 띄우지 않는다.
- `app.config.ts`·`APP_VARIANT`·네이티브 패키지가 바뀌면 dev client를 다시 빌드한다. `expo run:*`은 `android/`·`ios/`가 이미 있으면 prebuild를 건너뛰므로(@expo/cli `ensureNativeProject`) 커밋하지 않는 이 생성 폴더를 새로 만든 뒤 빌드해야 설정이 반영된다.

## 두 스위치: `APP_VARIANT`와 `__DEV__`

- `APP_VARIANT === 'development'`는 `app.config.ts`(네이티브 설정)만 바꾼다: iOS `infoPlist.NSAppTransportSecurity = { NSAllowsLocalNetworking: true }`, Android `expo-build-properties` `usesCleartextTraffic: true`. 그 밖의 값에서는 둘 다 빈 설정이다.
- JS의 origin 규칙은 `src/shared/config/web-origin.ts` `parseWebOrigin(value, __DEV__)`가 정한다: `^https?://host(:port)?$`만 받고(경로·끝 슬래시·userinfo 거부), `__DEV__`가 아니면 `https://`만 받는다. 통과한 값은 `new URL(value).origin`으로 정규화한다(호스트 소문자, `:443`·`:80` 생략). WebView가 보고하는 URL과 문자열 접두로 비교하기 때문이다(`isSameOrigin`, `NativeHost.receive`). 값이 없으면 dev는 `http://localhost:3300`, release는 throw.
- 두 스위치는 서로를 대신하지 않는다. release JS는 `APP_VARIANT`와 무관하게 HTTP origin을 거부하고, release 바이너리에 `APP_VARIANT=development`가 섞이면 cleartext·local networking 허용이 들어간다.
- 검사는 `src/shared/config/env.ts`가 import되는 앱 시작 시점에 실행된다. `bundle:check`(Metro export)는 코드를 실행하지 않으므로 빠지거나 잘못된 origin을 잡지 못한다.

## 환경 파일

- `EXPO_PUBLIC_WEB_ORIGIN`은 `src/shared/config/env.ts`에서만 `process.env.EXPO_PUBLIC_WEB_ORIGIN`으로 읽는다. 번들에 들어가는 공개 값이므로 비밀을 두지 않고, 바꾸면 다시 번들·빌드해야 반영된다.
- `.env.example`(`APP_VARIANT=development`, `EXPO_PUBLIC_WEB_ORIGIN=http://localhost:3300`)을 복사한 `apps/mobile/.env`는 `expo run:*`·`prebuild`·`export`가 읽고 셸 변수가 우선한다. release 네이티브 설정을 만들 때 이 파일의 `APP_VARIANT=development`가 섞이지 않게 한다. `.env`는 커밋하지 않는다.

## `app.config.ts`가 원본이다

- `name` '플레이메이트', `slug` 'game-feedback', `scheme` 'gamefeedback', `ios.bundleIdentifier`·`android.package` `dev.side.gamefeedback`, `orientation` portrait, `userInterfaceStyle` 'light', `backgroundColor` '#ffffff'.
- iOS `NSPhotoLibraryUsageDescription`·`NSCameraUsageDescription`·`NSMicrophoneUsageDescription`은 WebView 파일 선택·촬영용이다. 웹 첨부 기능을 바꾸면 문구도 확인한다.
- `android.predictiveBackGestureEnabled: false`는 Android back을 웹에 먼저 묻는 흐름의 전제다(`game-feedback-mobile-webview-shell`).
- universal/app link(associated domains, intent filter)는 없다. 스킴을 바꾸면 bridge `APP_SCHEME`과 API 콜백 문자열까지 함께 바꾼다(`game-feedback-mobile-bridge`).

## 버전

- 앱 버전은 `app.config.ts` `version`('1.0.0')과 `src/shared/config/env.ts` `APP_VERSION`('1.0.0')에 따로 있다. `APP_VERSION`은 user agent `GameFeedbackApp/<v>`와 bootstrap `version`에 쓰인다. 둘을 함께 올리고 `src/_pages/web-shell/ui/WebShellPage.spec.tsx`의 user agent 기대값을 고친다. `package.json` `version`(0.1.0)은 앱 버전이 아니다.
- `ios.buildNumber`·`android.versionCode`는 아직 없다. 스토어 제출 전에 정한다.

## Expo SDK·네이티브 패키지

- 버전 기준은 설치된 `node_modules/expo/bundledNativeModules.json`이다. 현재 `react`·`react-native`·`react-native-webview`·`react-native-safe-area-context`·`react-native-web`·`react-dom`·`expo-*`가 이 값과 같다. `typescript`는 저장소 공통 6.0.2, typecheck는 `tsc7`을 유지한다.
- `installConfig.hoistingLimits: "workspaces"`로 이 앱의 React가 Web과 분리된다. React 버전을 Web에 맞추지 않는다.
- `metro.config.js`는 없다. `@game-feedback/bridge`는 TS 소스(`exports` → `./src/index.ts`)를 Metro가 직접 해석하므로 브리지 의존성(`zod`·`ts-pattern`·`es-toolkit`)이나 export 형식을 바꾸면 `bundle:check`를 돌린다.
- 네이티브 모듈을 더하면 `vitest.setup.ts` 대역(`game-feedback-mobile-test`)과 dev client 재빌드가 함께 필요하다.

## 검사

```sh
corepack yarn workspace @game-feedback/mobile typecheck      # tsc7 --noEmit
corepack yarn workspace @game-feedback/mobile lint           # 공유 expo 설정 + FSD 경계
corepack yarn workspace @game-feedback/mobile test src/shared/config
corepack yarn workspace @game-feedback/mobile bundle:check
```

- `bundle:check`(`scripts/bundle-check.mjs`)는 `expo export --platform android`, 이어서 `ios`를 `.expo-export-check/<platform>`에 만들고 첫 실패에서 멈춘 뒤 폴더를 항상 지운다. 프로젝트 `build`도 이것을 실행한다.
- origin 규칙을 바꾸면 `src/shared/config/web-origin.spec.ts`(unit)에 release HTTP·경로·userinfo·`javascript:` 거부 사례를 유지하고, 정규화 회귀(`web-origin.test.ts`, `navigation-policy.test.ts`, `native-host.test.ts`)도 함께 돌린다.
- Metro export·Playwright 통과는 서명된 네이티브 빌드나 dev client 실기기 확인을 대신하지 않는다. 보고할 때 따로 적는다.
