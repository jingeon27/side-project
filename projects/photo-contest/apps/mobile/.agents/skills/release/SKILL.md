---
name: release
description: 모바일 앱을 dev client로 실행하거나 스토어 빌드를 준비하면서 EXPO_PUBLIC 환경변수, 앱 버전과 API 최소·최신 버전 정책, Expo SDK·네이티브 패키지 버전, bundle:check·expo config 검사, Sentry 빌드 설정을 다룰 때 사용한다.
---

Expo Go를 쓰지 않는 이유와 `10.0.2.2` 대신 `adb reverse`를 쓰는 이유는 프로젝트 `mobile` 스킬에 있다. 명령은 side 루트에서 실행한다.

## 실행

```sh
APP_VARIANT=development yarn workspace @photo-contest/mobile android   # 또는 ios — dev client 빌드·설치
APP_VARIANT=development yarn workspace @photo-contest/mobile start      # Metro
adb reverse tcp:3200 tcp:3200                                                     # 에뮬레이터·USB 기기를 다시 연결할 때마다
```

- JS만 바뀌면 리로드로 충분하다. `app.config.ts`·`APP_VARIANT`·네이티브 패키지·플러그인·`version`이 바뀌면 `yarn workspace @photo-contest/mobile exec expo prebuild --clean` 뒤 다시 빌드한다. `expo run:*`은 `android/`·`ios/`(커밋하지 않는 생성물)가 있으면 prebuild를 건너뛴다.
- 웹·API는 사용자의 개발 서버(3200/4200)를 그대로 쓰고 끄거나 다시 띄우지 않는다. iOS 실기기에서는 `localhost`가 Mac이 아니므로, 기기가 닿는 origin을 쓰려면 웹·API의 `WEB_ORIGIN`도 같은 값이어야 한다.

## EXPO_PUBLIC_* (빌드 때 번들에 박히는 공개 값)

| 변수 | 쓰는 곳 | 비었을 때 |
| --- | --- | --- |
| `EXPO_PUBLIC_WEB_ORIGIN` | `src/shared/config/env.ts`(`WEB_ORIGIN`·`API_BASE`, 판단은 `web-origin.ts`), `app.config.ts` `extra.webOrigin` | 개발 빌드(`APP_VARIANT=development`, `__DEV__`)만 `http://localhost:3200`. 그 밖에는 https origin이 아니면 `app.config.ts`가 설정 단계에서, 번들이 시작할 때 throw |
| `EXPO_PUBLIC_STORE_URL` | `env.ts` `STORE_URL` → `resolveStoreUrl`(https·itms-apps·market만) | Android는 `market://details?id=<패키지>`, iOS는 업데이트 버튼 없음 |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_AMPLITUDE_API_KEY` | 모니터링 초기화(`monitoring` 스킬) | 아무것도 보내지 않는다 |

- `process.env.EXPO_PUBLIC_X`를 점 표기 그대로 `src/shared/config/env.ts`에서만 읽는다. 구조분해나 `process.env['…']`는 빌드 때 치환되지 않는다.
- Expo는 `apps/mobile`의 `.env*`만 읽는다(프로젝트 루트 `.env`는 API·웹용). 셸 변수나 `apps/mobile/.env.local`(커밋 금지)로 주고, 토큰 같은 비밀은 넣지 않는다.
- 운영 빌드에는 https `EXPO_PUBLIC_WEB_ORIGIN`(포트 없음)을 반드시 넣는다. 빠지거나 http면 prebuild·번들링이 설정 오류로 멈춘다(localhost가 박히면 모든 사용자가 오프라인 화면을 본다). 값을 바꾸면 바이너리를 다시 만들어 내야 반영된다.

## 앱 링크 값 (빌드 설정, 번들에 넣지 않음)

| 변수 | 쓰는 곳 | 운영 빌드에서 비었을 때 | 개발 빌드 기본 |
| --- | --- | --- | --- |
| `MOBILE_APPLE_TEAM_ID` | `ios.appleTeamId`(AASA의 `<Team ID>.<bundle id>`와 같아야 한다) | 멈춤 | 없음 |
| `MOBILE_IOS_BUNDLE_ID` | `ios.bundleIdentifier` | 멈춤 | `dev.side.photocontest` |
| `MOBILE_ANDROID_PACKAGE` | `android.package` | 멈춤 | `dev.side.photocontest` |

- EAS 빌드는 production 환경의 EAS 환경변수(비밀 아님, plain text 가능)로 넣는다. 웹 배포 환경의 같은 이름 값과 Android 서명 지문(`MOBILE_ANDROID_SHA256_FINGERPRINTS`, 웹 전용)이 함께 맞아야 링크가 검증된다.
- `app.config.ts`가 web origin host로 `ios.associatedDomains`(`applinks:<host>`·`webcredentials:<host>`)와 Android `intentFilters`(https·host·`/app-auth/callback`·`autoVerify`)를 만들고 `ios.deploymentTarget`을 17.4로 둔다(Expo SDK 56+ 내장 설정. `expo-build-properties`의 `ios.deploymentTarget`은 폐기 예정).

## 스토어·콘솔 준비 (첫 제출 전, 식별자를 바꿀 때마다)

1. Apple Developer: App ID(`MOBILE_IOS_BUNDLE_ID`)에 Associated Domains capability를 켠다(EAS가 capability를 동기화하지만 수동 서명이면 직접 켜고 프로비저닝 프로필을 다시 만든다). Team ID를 웹·EAS의 `MOBILE_APPLE_TEAM_ID`에 넣는다.
2. 최소 iOS가 17.4로 올라가므로 App Store Connect의 지원 OS가 바뀐다. 17.4 미만 기기는 새 버전을 받지 못하고, https 콜백을 받지 못하는 이전 바이너리는 로그인할 수 없다(운영 사용자가 없어 호환 기간을 두지 않는다). 스토어 재배포가 필요하다.
3. AASA: 웹 배포 후 `curl -sI https://<host>/.well-known/apple-app-site-association`이 리다이렉트 없이 200·`application/json`인지 본다. iOS는 설치·업데이트 때 Apple CDN(`https://app-site-association.cdn-apple.com/a/v1/<host>`)에서 받으며 CDN 캐시는 최대 하루쯤 늦을 수 있다. 내용을 바꾸면 CDN에 반영된 것을 확인한 뒤 앱을 다시 설치해 시험한다.
4. Google Play Console: 앱 무결성 > 앱 서명의 "앱 서명 키 인증서" SHA-256(Play App Signing)을 웹 `MOBILE_ANDROID_SHA256_FINGERPRINTS`에 넣는다. 내부 테스트로 직접 서명한 APK를 배포하면 업로드 키 SHA-256도 쉼표로 함께 넣는다. 설치 후 `adb shell pm get-app-links <패키지>`가 `verified`인지 본다(재검증: `adb shell pm verify-app-links --re-verify <패키지>`).
5. 개발용 앱 링크 확인: https 터널 origin을 `EXPO_PUBLIC_WEB_ORIGIN`·웹·API `WEB_ORIGIN`에 같이 넣고 `APP_VARIANT=development`로 다시 빌드한다(iOS는 `?mode=developer`라 기기 설정 > 개발자 > Associated Domains Development를 켠다). 웹에는 개발 서명의 Team ID·debug keystore SHA-256을 넣는다.

## 버전과 강제 업데이트

- 앱 버전의 원본은 `app.config.ts`의 `version`(숫자 `x.y.z`, `package.json`의 version은 쓰지 않는다)이다. 바이너리에 들어가므로 올린 뒤 네이티브를 다시 빌드한다. 스토어 제출마다 올려야 하는 `ios.buildNumber`·`android.versionCode`는 아직 없으니 첫 제출 전에 넣는다.
- API 배포 환경의 `MOBILE_MINIMUM_VERSION`(기본 1.0.0)과 `MOBILE_LATEST_VERSION`(기본·하한 = 최소, `apps/api/src/config/env.ts`의 `appVersions()`)이 `GET /backend/app/config`로 온다. 앱은 최소보다 낮을 때만 막고 latest는 아직 쓰지 않는다.
- 새 버전이 두 스토어에서 실제로 받아지는 것을 확인한 뒤에 최소 버전을 올린다. 먼저 올리면 받을 수 없는 버전을 요구해 사용자가 갇힌다.
- 업데이트 화면은 옛 바이너리가 그린다. iOS 빌드에는 처음부터 `EXPO_PUBLIC_STORE_URL`을 넣는다 — 주소 없이 나간 버전은 강제 업데이트 때 버튼 없이 막힌다.
- 최소 버전은 웹이 옛 앱을 더 지원할 수 없을 때(브리지 `PROTOCOL_VERSION` 변경 등)만 올린다. 그 밖에는 웹의 `supports()` 대체로 옛 앱을 살린다(`bridge` 스킬).

## Expo SDK·네이티브 패키지

1. 버전은 설치된 `node_modules/expo/bundledNativeModules.json`이 정한다. 추가·변경은 `yarn workspace @photo-contest/mobile exec expo install <패키지>`, 확인은 `… exec expo install --check`. `typescript` 줄(SDK 기대 ~6.0.3)은 무시하고 저장소 공통 버전을 유지한다 — 그래서 `--fix`를 쓰지 않는다.
2. `All versions satisfying … are quarantined`(Yarn `npmMinimalAgeGate` 24시간)가 나오면 게이트를 끄지 말고 `yarn npm info <패키지> --fields time --json`으로 24시간이 지난 버전을 고른다.
3. React는 이 워크스페이스 것만 바꾼다(`installConfig.hoistingLimits: "workspaces"`). `react`·`react-dom`은 공통 catalog의 19.3.1을 사용하고 `@types/react`는 같은 minor로 맞춘다. React Native의 peer 범위 `^19.3.0` 안의 패치지만 SDK의 정확한 권장값과 달라 `expo.install.exclude`에 명시한다. 변경 뒤 typecheck·테스트·Android/iOS 번들을 검증한다. 확인: `node -p "require('./projects/photo-contest/apps/mobile/node_modules/react/package.json').version"`.
4. 의존성 변경은 `chore(deps)` 커밋으로 먼저 둔다(`commit` 스킬). `metro.config.js`는 만들지 않는다.
5. `prebuild --clean` → dev client 재빌드 → 아래 검사 → 실기기 확인.

## 검사

```sh
yarn workspace @photo-contest/mobile typecheck
yarn workspace @photo-contest/mobile lint
yarn workspace @photo-contest/mobile bundle:check   # Metro android 번들(워크스페이스 브리지·zod 해석), 결과 폴더는 지운다
APP_VARIANT=development yarn workspace @photo-contest/mobile exec expo config --type introspect --json | grep -c usesCleartextTraffic   # 1
EXPO_PUBLIC_WEB_ORIGIN=https://contest.example MOBILE_APPLE_TEAM_ID=ABCDE12345 MOBILE_IOS_BUNDLE_ID=com.example.contest MOBILE_ANDROID_PACKAGE=com.example.contest \
  yarn workspace @photo-contest/mobile exec expo config --type introspect --json | grep -c 'usesCleartextTraffic\|NSAllowsLocalNetworking'   # 0
EXPO_PUBLIC_WEB_ORIGIN=https://contest.example MOBILE_APPLE_TEAM_ID=ABCDE12345 MOBILE_IOS_BUNDLE_ID=com.example.contest MOBILE_ANDROID_PACKAGE=com.example.contest \
  yarn workspace @photo-contest/mobile exec expo config --type introspect --json | grep -c 'applinks:contest.example'   # 운영 설정: associated domains·intent filter·17.4
yarn workspace @photo-contest/mobile exec expo config   # 운영 값 없이 실행하면 빠진 이름을 담은 오류로 멈춰야 한다
```

## Sentry 빌드

- `app.config.ts` plugins의 `@sentry/react-native/expo`에는 organization·project·authToken을 넣지 않는다(`Missing config for organization, project` 경고는 정상). 소스맵 업로드는 빌드 환경의 `SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_AUTH_TOKEN`으로만 한다.
- debug가 아닌 빌드는 업로드를 시도하고, 실패하면 Xcode·Gradle 단계가 멈춘다. 토큰 없이 릴리스 빌드할 때는 `SENTRY_DISABLE_AUTO_UPLOAD=true`를 함께 준다.
