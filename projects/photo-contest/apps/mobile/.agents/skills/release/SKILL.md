---
name: release
description: 모바일 앱을 dev client로 실행하거나 스토어 빌드를 준비하면서 EXPO_PUBLIC 환경변수, 앱 버전과 API 최소·최신 버전 정책, Expo SDK·네이티브 패키지 버전, bundle:check·expo config 검사, Sentry 빌드 설정을 다룰 때 사용한다.
---

Expo Go를 쓰지 않는 이유와 `10.0.2.2` 대신 `adb reverse`를 쓰는 이유는 프로젝트 `mobile` 스킬에 있다. 명령은 side 루트에서 실행한다.

## 실행

```sh
APP_VARIANT=development corepack yarn workspace @photo-contest/mobile android   # 또는 ios — dev client 빌드·설치
corepack yarn workspace @photo-contest/mobile start                              # Metro
adb reverse tcp:3200 tcp:3200                                                     # 에뮬레이터·USB 기기를 다시 연결할 때마다
```

- JS만 바뀌면 리로드로 충분하다. `app.config.ts`·`APP_VARIANT`·네이티브 패키지·플러그인·`version`이 바뀌면 `corepack yarn workspace @photo-contest/mobile exec expo prebuild --clean` 뒤 다시 빌드한다. `expo run:*`은 `android/`·`ios/`(커밋하지 않는 생성물)가 있으면 prebuild를 건너뛴다.
- 웹·API는 사용자의 개발 서버(3200/4200)를 그대로 쓰고 끄거나 다시 띄우지 않는다. iOS 실기기에서는 `localhost`가 Mac이 아니므로, 기기가 닿는 origin을 쓰려면 웹·API의 `WEB_ORIGIN`도 같은 값이어야 한다.

## EXPO_PUBLIC_* (빌드 때 번들에 박히는 공개 값)

| 변수 | 쓰는 곳 | 비었을 때 |
| --- | --- | --- |
| `EXPO_PUBLIC_WEB_ORIGIN` | `src/shared/config/env.ts`(`WEB_ORIGIN`·`API_BASE`), `app.config.ts` `extra.webOrigin` | `http://localhost:3200`. origin 형식이 아니면 시작할 때 throw |
| `EXPO_PUBLIC_STORE_URL` | `env.ts` `STORE_URL` → `resolveStoreUrl`(https·itms-apps·market만) | Android는 `market://details?id=<패키지>`, iOS는 업데이트 버튼 없음 |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_AMPLITUDE_API_KEY` | 모니터링 초기화(`monitoring` 스킬) | 아무것도 보내지 않는다 |

- `process.env.EXPO_PUBLIC_X`를 점 표기 그대로 `src/shared/config/env.ts`에서만 읽는다. 구조분해나 `process.env['…']`는 빌드 때 치환되지 않는다.
- Expo는 `apps/mobile`의 `.env*`만 읽는다(프로젝트 루트 `.env`는 API·웹용). 셸 변수나 `apps/mobile/.env.local`(커밋 금지)로 주고, 토큰 같은 비밀은 넣지 않는다.
- 운영 빌드에는 https `EXPO_PUBLIC_WEB_ORIGIN`을 반드시 넣는다. 빠지면 `http://localhost:3200`이 박혀 모든 사용자가 오프라인 화면을 본다. 값을 바꾸면 바이너리를 다시 만들어 내야 반영된다.

## 버전과 강제 업데이트

- 앱 버전의 원본은 `app.config.ts`의 `version`(숫자 `x.y.z`, `package.json`의 version은 쓰지 않는다)이다. 바이너리에 들어가므로 올린 뒤 네이티브를 다시 빌드한다. 스토어 제출마다 올려야 하는 `ios.buildNumber`·`android.versionCode`는 아직 없으니 첫 제출 전에 넣는다.
- API 배포 환경의 `MOBILE_MINIMUM_VERSION`(기본 1.0.0)과 `MOBILE_LATEST_VERSION`(기본·하한 = 최소, `apps/api/src/config/env.ts`의 `appVersions()`)이 `GET /backend/app/config`로 온다. 앱은 최소보다 낮을 때만 막고 latest는 아직 쓰지 않는다.
- 새 버전이 두 스토어에서 실제로 받아지는 것을 확인한 뒤에 최소 버전을 올린다. 먼저 올리면 받을 수 없는 버전을 요구해 사용자가 갇힌다.
- 업데이트 화면은 옛 바이너리가 그린다. iOS 빌드에는 처음부터 `EXPO_PUBLIC_STORE_URL`을 넣는다 — 주소 없이 나간 버전은 강제 업데이트 때 버튼 없이 막힌다.
- 최소 버전은 웹이 옛 앱을 더 지원할 수 없을 때(브리지 `PROTOCOL_VERSION` 변경 등)만 올린다. 그 밖에는 웹의 `supports()` 대체로 옛 앱을 살린다(`bridge` 스킬).

## Expo SDK·네이티브 패키지

1. 버전은 설치된 `node_modules/expo/bundledNativeModules.json`이 정한다. 추가·변경은 `corepack yarn workspace @photo-contest/mobile exec expo install <패키지>`, 확인은 `… exec expo install --check`. `typescript` 줄(SDK 기대 ~6.0.3)은 무시하고 저장소 공통 버전을 유지한다 — 그래서 `--fix`를 쓰지 않는다.
2. `All versions satisfying … are quarantined`(Yarn `npmMinimalAgeGate` 24시간)가 나오면 게이트를 끄지 말고 `corepack yarn npm info <패키지> --fields time --json`으로 24시간이 지난 버전을 고른다.
3. React는 이 워크스페이스 것만 바꾼다(`installConfig.hoistingLimits: "workspaces"`). `react`·`react-dom`은 SDK 값 그대로(범위 없이), `@types/react`는 같은 minor로 맞추고 웹의 React를 따르지 않는다. 확인: `node -p "require('./projects/photo-contest/apps/mobile/node_modules/react/package.json').version"`.
4. 의존성 변경은 `chore(deps)` 커밋으로 먼저 둔다(`commit` 스킬). `metro.config.js`는 만들지 않는다.
5. `prebuild --clean` → dev client 재빌드 → 아래 검사 → 실기기 확인.

## 검사

```sh
corepack yarn workspace @photo-contest/mobile typecheck
corepack yarn workspace @photo-contest/mobile lint
corepack yarn workspace @photo-contest/mobile bundle:check   # Metro android 번들(워크스페이스 브리지·zod 해석), 결과 폴더는 지운다
APP_VARIANT=development corepack yarn workspace @photo-contest/mobile exec expo config --type introspect --json | grep -c usesCleartextTraffic   # 1, 변수 없이는 0
```

## Sentry 빌드

- `app.config.ts` plugins의 `@sentry/react-native/expo`에는 organization·project·authToken을 넣지 않는다(`Missing config for organization, project` 경고는 정상). 소스맵 업로드는 빌드 환경의 `SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_AUTH_TOKEN`으로만 한다.
- debug가 아닌 빌드는 업로드를 시도하고, 실패하면 Xcode·Gradle 단계가 멈춘다. 토큰 없이 릴리스 빌드할 때는 `SENTRY_DISABLE_AUTO_UPLOAD=true`를 함께 준다.
