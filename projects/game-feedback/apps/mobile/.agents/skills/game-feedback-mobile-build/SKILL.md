---
name: game-feedback-mobile-build
description: Game Feedback 모바일 앱을 dev client로 실행(Metro 8082, adb reverse, 개발 Web 3300/API 4300)하거나 `app.config.ts`·`APP_VARIANT`·`EXPO_PUBLIC_WEB_ORIGIN`·앱 버전·Expo 네이티브 패키지·`bundle:check`를 바꾸고 release 빌드 조건을 확인할 때 사용한다.
---

Expo Go 금지·포트·HTTPS 원칙은 `apps/mobile/AGENTS.md`와 `README.md`, 패키지 최소 배포 기간 게이트는 루트 `AGENTS.md`를 따른다. 명령은 side 루트에서 실행한다. 운영 서명·스토어 제출·배포 설정은 이 앱에 없다.

## dev client 실행

```sh
yarn workspace @side/game-feedback dev:test     # Web 3300 / API 4300, 이미 떠 있으면 그대로 쓴다
adb reverse tcp:3300 tcp:3300                            # 에뮬레이터·USB 기기를 연결할 때마다
APP_VARIANT=development yarn workspace @game-feedback/mobile android   # 또는 ios: dev client 빌드·설치
APP_VARIANT=development yarn workspace @game-feedback/mobile start     # 설치된 dev client용 Metro 8082
```

- 개발 origin 기본값은 `http://localhost:3300`(`parseWebOrigin`, `__DEV__`에서 값이 없을 때)이다. API `WEB_ORIGIN`도 `../../scripts/env.ts` 기본이 같은 값이라 쿠키·Origin 검사가 맞는다. Android 에뮬레이터는 `adb reverse`로 이 localhost를 유지한다. 실기기는 닿을 수 있는 origin을 `EXPO_PUBLIC_WEB_ORIGIN`과 API `WEB_ORIGIN`에 같은 값으로 준다.
- `dev:test`는 3300·4300이 사용 중이면 실패한다(`../../scripts/dev.ts` `assertPortFree`). 사용자의 개발 서버를 끄거나 다시 띄우지 않는다.
- `app.config.ts`·`APP_VARIANT`·네이티브 패키지가 바뀌면 dev client를 다시 빌드한다. `expo run:*`은 `android/`·`ios/`가 이미 있으면 prebuild를 건너뛰므로(@expo/cli `ensureNativeProject`) 커밋하지 않는 이 생성 폴더를 새로 만든 뒤 빌드해야 설정이 반영된다.

## 두 스위치: `APP_VARIANT`와 `__DEV__`

- `APP_VARIANT === 'development'`는 `app.config.ts`(네이티브 설정)만 바꾼다: iOS `infoPlist.NSAppTransportSecurity = { NSAllowsLocalNetworking: true }`, Android `expo-build-properties` `usesCleartextTraffic: true`, 개발 식별자 기본값, associated domains `?mode=developer`. 그 밖의 값은 운영 빌드라 https `EXPO_PUBLIC_WEB_ORIGIN`(포트 없음)과 `MOBILE_APPLE_TEAM_ID`·`MOBILE_IOS_BUNDLE_ID`·`MOBILE_ANDROID_PACKAGE`가 없으면 `expo config`·`start`·`prebuild`·EAS 빌드가 오류로 멈춘다. `bundle:check`는 변수를 주지 않으면 개발 설정으로 읽는다.
- JS의 origin 규칙은 `src/shared/config/web-origin.ts` `parseWebOrigin(value, __DEV__)`가 정한다: `^https?://host(:port)?$`만 받고(경로·끝 슬래시·userinfo 거부), `__DEV__`가 아니면 `https://`만 받는다. 통과한 값은 `new URL(value).origin`으로 정규화한다(호스트 소문자, `:443`·`:80` 생략). WebView가 보고하는 URL과 문자열 접두로 비교하기 때문이다(`isSameOrigin`, `NativeHost.receive`). 값이 없으면 dev는 `http://localhost:3300`, release는 throw.
- 두 스위치는 서로를 대신하지 않는다. release JS는 `APP_VARIANT`와 무관하게 HTTP origin을 거부하고, release 바이너리에 `APP_VARIANT=development`가 섞이면 cleartext·local networking 허용이 들어간다.
- 검사는 `src/shared/config/env.ts`가 import되는 앱 시작 시점에 실행된다. `bundle:check`(Metro export)는 코드를 실행하지 않으므로 빠지거나 잘못된 origin을 잡지 못한다.

## 환경 파일

- `EXPO_PUBLIC_WEB_ORIGIN`은 `src/shared/config/env.ts`에서만 `process.env.EXPO_PUBLIC_WEB_ORIGIN`으로 읽는다. 번들에 들어가는 공개 값이므로 비밀을 두지 않고, 바꾸면 다시 번들·빌드해야 반영된다.
- `.env.example`(`APP_VARIANT=development`, `EXPO_PUBLIC_WEB_ORIGIN=http://localhost:3300`)을 복사한 `apps/mobile/.env`는 `expo run:*`·`prebuild`·`export`가 읽고 셸 변수가 우선한다. release 네이티브 설정을 만들 때 이 파일의 `APP_VARIANT=development`가 섞이지 않게 한다. `.env`는 커밋하지 않는다.

## `app.config.ts`가 원본이다

- `name` 'Game Mate', `icon` `./assets/icon.png`(Android adaptive icon `./assets/adaptive-icon.png`, 배경 `#147d64`), `slug` 'game-feedback', `scheme` 'gamefeedback'(로그인 밖 딥링크), `ios.bundleIdentifier`·`android.package`는 `MOBILE_IOS_BUNDLE_ID`·`MOBILE_ANDROID_PACKAGE`(개발 기본 `dev.side.gamefeedback`), `ios.appleTeamId`는 `MOBILE_APPLE_TEAM_ID`, `ios.deploymentTarget` '17.4'(Expo SDK 56+ 내장 설정), `orientation` portrait, `userInterfaceStyle` 'light', `backgroundColor` '#ffffff'.
- iOS `NSPhotoLibraryUsageDescription`·`NSCameraUsageDescription`·`NSMicrophoneUsageDescription`은 WebView 파일 선택·촬영용이다. 웹 첨부 기능을 바꾸면 문구도 확인한다.
- `android.predictiveBackGestureEnabled: false`는 Android back을 웹에 먼저 묻는 흐름의 전제다(`game-feedback-mobile-webview-shell`).
- 앱 링크는 소셜 로그인 콜백 하나다: web origin host로 `ios.associatedDomains`(`applinks:`·`webcredentials:`)와 Android `intentFilters`(https·host·`/app-auth/callback`·`autoVerify`)를 만든다. http 개발 origin에는 두지 않는다(그때 소셜 로그인은 앱으로 돌아오지 않는다).

## 스토어·콘솔 준비 (첫 제출 전, 식별자를 바꿀 때마다)

1. Apple Developer: App ID(`MOBILE_IOS_BUNDLE_ID`)에 Associated Domains capability를 켠다(EAS가 동기화, 수동 서명이면 직접 켜고 프로필 재생성). Team ID를 웹·EAS의 `MOBILE_APPLE_TEAM_ID`에 넣는다.
2. 최소 iOS 17.4로 17.4 미만 기기는 새 버전을 받지 못하고, 커스텀 스킴 콜백을 기다리는 이전 바이너리는 소셜 로그인을 할 수 없다(운영 사용자가 없어 호환 기간을 두지 않는다). 두 스토어 모두 재배포한다.
3. AASA: 웹 배포 후 `curl -sI https://<host>/.well-known/apple-app-site-association`이 리다이렉트 없이 200·`application/json`인지 본다. iOS는 Apple CDN(`https://app-site-association.cdn-apple.com/a/v1/<host>`)에서 받으며 캐시가 최대 하루쯤 늦을 수 있다. 내용을 바꾸면 CDN 반영을 확인한 뒤 앱을 다시 설치해 시험한다.
4. Google Play Console: 앱 무결성 > 앱 서명의 "앱 서명 키 인증서" SHA-256(Play App Signing)을 웹 `MOBILE_ANDROID_SHA256_FINGERPRINTS`에 넣는다. 직접 서명한 빌드를 배포하면 업로드 키 SHA-256도 쉼표로 함께 넣는다. 설치 후 `adb shell pm get-app-links <패키지>`가 `verified`인지 본다(재검증 `adb shell pm verify-app-links --re-verify <패키지>`).
5. EAS 빌드는 production 환경의 EAS 환경변수로 `EXPO_PUBLIC_WEB_ORIGIN`·`MOBILE_APPLE_TEAM_ID`·`MOBILE_IOS_BUNDLE_ID`·`MOBILE_ANDROID_PACKAGE`를 넣는다(비밀 아님). 웹 배포 환경의 같은 값과 맞아야 링크가 검증된다.
6. 개발용 확인: https 터널 origin을 `EXPO_PUBLIC_WEB_ORIGIN`·API `WEB_ORIGIN`에 같이 넣고 `APP_VARIANT=development`로 다시 빌드한다(iOS는 기기 설정 > 개발자 > Associated Domains Development). 웹에는 개발 서명 Team ID·debug keystore SHA-256을 넣는다.

## 버전

- 앱 버전은 `app.config.ts` `version`('1.0.0')과 `src/shared/config/env.ts` `APP_VERSION`('1.0.0')에 따로 있다. `APP_VERSION`은 user agent `GameFeedbackApp/<v>`와 bootstrap `version`에 쓰인다. 둘을 함께 올리고 `src/_pages/web-shell/ui/WebShellPage.spec.tsx`의 user agent 기대값을 고친다. `package.json` `version`(0.1.0)은 앱 버전이 아니다.
- `ios.buildNumber`·`android.versionCode`는 아직 없다. 스토어 제출 전에 정한다.

## Expo SDK·네이티브 패키지

- 버전 기준은 설치된 `node_modules/expo/bundledNativeModules.json`이다. React·React DOM은 React Native의 peer 범위 `^19.3.0` 안의 19.3.1 패치로 통일한다. 나머지 네이티브 패키지는 이 값을 따른다. `typescript`는 저장소 공통 6.0.2, typecheck는 `tsc7`을 유지한다.
- `installConfig.hoistingLimits: "workspaces"`로 이 앱의 React가 Web과 분리된다. React·React DOM은 공통 catalog의 19.3.1을 사용한다. SDK의 정확한 권장 패치와 달라 `expo.install.exclude`에 명시하고 typecheck·테스트·Android/iOS 번들을 검증한다.
- `metro.config.js`는 없다. `@game-feedback/bridge`는 TS 소스(`exports` → `./src/index.ts`)를 Metro가 직접 해석하므로 브리지 의존성(`zod`·`ts-pattern`·`es-toolkit`)이나 export 형식을 바꾸면 `bundle:check`를 돌린다.
- 네이티브 모듈을 더하면 `vitest.setup.ts` 대역(`game-feedback-mobile-test`)과 dev client 재빌드가 함께 필요하다.

## 검사

```sh
yarn workspace @game-feedback/mobile typecheck      # tsc7 --noEmit
yarn workspace @game-feedback/mobile lint           # 공유 expo 설정 + FSD 경계
yarn workspace @game-feedback/mobile test src/shared/config
yarn workspace @game-feedback/mobile bundle:check
APP_VARIANT=development yarn workspace @game-feedback/mobile exec expo config --type public --json   # 개발 식별자, 앱 링크 없음
EXPO_PUBLIC_WEB_ORIGIN=https://game.example MOBILE_APPLE_TEAM_ID=ABCDE12345 MOBILE_IOS_BUNDLE_ID=com.example.game MOBILE_ANDROID_PACKAGE=com.example.game \
  yarn workspace @game-feedback/mobile exec expo config --type introspect --json   # associated domains·autoVerify intent filter·17.4
```

- `bundle:check`(`scripts/bundle-check.ts`)는 `expo export --platform android`, 이어서 `ios`를 `.expo-export-check/<platform>`에 만들고 첫 실패에서 멈춘 뒤 폴더를 항상 지운다. 프로젝트 `build`도 이것을 실행한다.
- origin 규칙을 바꾸면 `src/shared/config/web-origin.spec.ts`(unit)에 release HTTP·경로·userinfo·`javascript:` 거부 사례를 유지하고, 정규화 회귀(`web-origin.test.ts`, `navigation-policy.test.ts`, `native-host.test.ts`)도 함께 돌린다.
- Metro export·Playwright 통과는 서명된 네이티브 빌드나 dev client 실기기 확인을 대신하지 않는다. 보고할 때 따로 적는다.
