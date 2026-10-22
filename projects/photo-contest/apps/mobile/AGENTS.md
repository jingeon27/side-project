# Mobile (Expo WebView 셸)

웹(`apps/web`)을 WebView 하나로 감싼다. 세션은 WebView의 HttpOnly 쿠키 `contest_session`이 맡고 토큰을 네이티브로 넘기지 않는다. 화면 기록은 웹이 가지며, 네이티브는 Android 뒤로 가기만 웹에 묻는다.

## 실행

- Expo Go로는 열지 않는다. 앱 스킴(`photocontest://`) 콜백과 네이티브 모듈은 dev client·스토어 빌드에서만 동작한다.
  - `APP_VARIANT=development corepack yarn workspace @photo-contest/mobile android` (또는 `ios`)로 dev client를 만든 뒤 `start`로 Metro를 띄운다. `APP_VARIANT=development`일 때만 Android가 http(평문)를 허용한다.
- 웹 주소는 `EXPO_PUBLIC_WEB_ORIGIN`(빌드 때 고정). 없으면 `http://localhost:3200`. origin 형식이 아니면 시작할 때 오류를 낸다. 운영은 https만 쓴다.
- Android 에뮬레이터는 `adb reverse tcp:3200 tcp:3200`으로 같은 `localhost` 주소를 쓴다. `10.0.2.2`로 열면 API의 Origin 검사(WEB_ORIGIN)가 POST를 막는다.
- 앱은 웹 origin의 `/backend/*` 프록시만 부른다(`API_BASE`). API 주소를 따로 두지 않는다.
- 업데이트 화면의 스토어 링크는 `EXPO_PUBLIC_STORE_URL`. 없으면 Android만 `market://details?id=<패키지>`, iOS는 버튼을 숨긴다.
- `metro.config.js`는 두지 않는다. Expo 기본 설정이 워크스페이스(브리지·zod)를 찾는다(`bundle:check`로 확인).
- `package.json`의 `"type": "module"`은 Playwright가 test-kit(ESM, `import.meta`)을 읽기 위해 필요하다.

## 구조 (`src`)

- `_app`: `App.tsx`(첫 링크·분석 기기 ID를 읽고 app_opened를 보낸 뒤 웹 셸, 최소 버전 미달이면 업데이트 화면), 스플래시 제어, `providers`(SafeAreaProvider, 오류 경계). `index.ts`가 Sentry를 켜고 루트를 감싼다.
- `_pages/web-shell`: `@page/WebShellPageTemplate`, `model`(WebView 이벤트·브리지·뒤로 가기·AppState 훅), `ui`(LoadingOverlay, OfflineView), `lib`(순수 판단, `shell-events.ts`는 기능 결과·실패 → 분석 이벤트·Sentry 태그).
- `_pages/update-required`: 최소 버전보다 낮은 앱. 웹을 열지 않는다.
- `features/bridge`: `lib/create-capabilities.ts`(순수, 플랫폼 기능 주입, 공유·소셜 로그인 결과를 `onOutcome`으로 알린다), `model/native-capabilities.ts`(expo 모듈 연결).
- `features/navigation`: `navigation-policy`(onShouldStartLoadWithRequest), `deep-link`(URL → 웹 경로, path_template), `back-press`, `read-initial-link`.
- `features/app-config`: `/app/config`·`/health` 호출과 zod 스키마, 버전 비교.
- `features/analytics`: `config/events.ts`(이벤트 카탈로그), `lib/create-analytics.ts`(순수, SDK 주입), `model/analytics.ts`(Amplitude 연결).
- `shared`: `config/env.ts`, `config/theme.ts`(웹 토큰 색), `lib`(`monitoring/`은 Sentry 연결).
- 기능(feature)끼리는 서로 import하지 않는다. 분석 연결은 화면(`_pages`)·앱(`_app`)이 한다. 공용 FSD lint가 같은 레이어 import는 막지 않으므로 리뷰로 지킨다.
- slice 간 import는 각 slice의 named export `index.ts`를 통한다(`fsdBoundaries`). 배럴은 네이티브 모듈을 함께 불러오므로 unit 레인(node)이 읽는 `shell-events.ts`만 이유를 적고 순수 모듈을 직접 가져온다.

## 동작 규칙

- 모든 URL은 `navigation-policy`가 판단한다(`originWhitelist={['*']}`). 웹 origin·`about:blank`만 WebView에서 열고, 앱 스킴은 웹 이동으로 바꾸며, 그 밖(다른 사이트·intent·카카오톡·전화)은 `Linking.openURL`로 밖에서 연다. `javascript:`·`data:`·`file:` 등은 막는다.
- 앱 스킴·유니버설 링크는 `/invite/<토큰>`, `/groups/<id>`, `/contests/<id>`만 받는다. 토큰·ID는 `[A-Za-z0-9_-]`만. `photocontest://auth/callback`은 인증 세션이 직접 받으므로 무시한다.
- 웹이 `app.ready`를 알리기 전에는 딥링크를 문서 이동(첫 URL 교체)으로, 알린 뒤에는 `navigation.open`으로 보낸다. iOS의 새 문서 로드만 준비 상태를 지운다(Android는 pushState에도 onLoadStart를 보낸다).
- 메인 문서 연결 오류와 5xx는 오프라인 화면(다시 시도 = 보던 주소로 WebView 재생성). 4xx는 웹이 그린 화면을 그대로 둔다. Android 렌더러가 죽으면 재생성, iOS 콘텐츠 프로세스가 끝나면 reload.
- 버전 검사(`/app/config`, 5초)는 웹 로딩과 함께 돌고, 실패하면 막지 않는다.
- 브리지 패키지(`packages/bridge`)는 고치지 않는다. 계약이 부족하면 보고한다.

## 브리지 기능

| 방향 | 이름 | 앱 동작 |
| --- | --- | --- |
| 웹 → 앱 요청 | `share.open` | RN `Share.share`. iOS는 `url` 필드, Android는 `message`에 문구+URL. 닫으면 `{ shared: false }` |
| 웹 → 앱 요청 | `clipboard.copy` | expo-clipboard. 실패하면 `FAILED` |
| 웹 → 앱 요청 | `haptics.impact` | light/medium/heavy는 impact, success/warning/error는 notification |
| 웹 → 앱 요청 | `link.open` | expo-web-browser `openBrowserAsync`. 0.3초 안에 `{ opened }`로 답한다(iOS는 닫힐 때 끝나서) |
| 웹 → 앱 요청 | `auth.socialLogin` | 아래 핸드오프. 진행 중에 또 오면 `CANCELLED` |
| 앱 → 웹 요청 | `navigation.back` | Android 뒤로 가기. 800ms 안에 `handled`가 아니면 WebView `goBack`, 기록이 없으면 앱 종료 |
| 앱 → 웹 알림 | `app.state` | background에 다녀왔을 때만 `background`/`active`(iOS inactive 무시) |
| 앱 → 웹 알림 | `navigation.open` | 딥링크 경로 |
| 웹 → 앱 알림 | `app.ready` / `navigation.changed` / `auth.changed` | 로딩·스플래시 닫기 / 재생성할 주소 기억 / 분석 사용자 식별만(세션은 쿠키) |

## 모니터링·분석

- Sentry: `EXPO_PUBLIC_SENTRY_DSN`이 없으면 초기화하지 않고 루트도 감싸지 않는다. `sendDefaultPii: false`, 보내기 전에 user·request를 지우고 브레드크럼은 `data`를 뺀다(만들 때도). 오류 경계가 잡은 렌더 오류는 `captureException`, WebView 문제는 warning 메시지(아래 표의 이름 + 태그).
- 소스맵: `@sentry/react-native/expo` 플러그인에 조직·프로젝트를 넣지 않는다. 릴리스 빌드에서 올리려면 빌드 환경에 `SENTRY_AUTH_TOKEN`·`SENTRY_ORG`·`SENTRY_PROJECT`를 둔다. 토큰 없이 릴리스 빌드하면 `SENTRY_DISABLE_AUTO_UPLOAD=true`를 함께 준다(없으면 Xcode·Gradle 업로드 단계가 실패한다). Debug 빌드는 올리지 않는다.
- Amplitude: `EXPO_PUBLIC_AMPLITUDE_API_KEY`가 없으면 아무것도 보내지 않는다. 자동 수집(세션·화면·수명 주기)과 광고 식별자(adid·appSetId·idfv)는 끈다.
- 기기 ID: 시작할 때 초기화를 최대 1.5초 기다려 기기 ID를 브리지 앱 정보 `analyticsDeviceId`로 웹에 넘긴다. 늦거나 실패하면 빼고 연다(웹은 자기 ID를 쓴다).
- 사용자: 웹 `auth.changed`의 `userId`로 `setUserId`, 식별된 사용자가 있을 때 `signedIn: false`면 `reset`(기기 ID가 바뀌고 웹은 다음 실행 때 새 ID를 받는다). 비로그인 상태를 다시 알리는 것만으로는 reset하지 않는다.
- 속성에 닉네임·캡션·초대 토큰·이메일·URL을 넣지 않는다. 경로는 `/`, `/invite/:token`, `/groups/:id`, `/contests/:id`만 보낸다.

| 이벤트 | 보내는 때 | 속성 |
| --- | --- | --- |
| `app_opened` | 프로세스가 뜬 뒤 첫 링크를 읽었을 때 한 번 | `source`: `launch` / `deep_link` |
| `app_foregrounded` | background → active (iOS inactive 제외, Android는 공유 시트·로그인 브라우저에서 돌아올 때도) | 없음 |
| `deep_link_opened` | 앱을 연 링크, 실행 중 들어온 링크 | `path_template` |
| `social_login_started` / `_succeeded` / `_cancelled` / `_failed` | `auth.socialLogin`. succeeded는 앱 로그인 코드를 받았을 때(세션 교환 성공은 웹 `login_succeeded`), 진행 중 중복 요청은 기록하지 않는다 | `provider` |
| `native_share_completed` / `native_share_dismissed` | `share.open` 결과. Android는 OS가 결과를 주지 않아 항상 completed | 없음 |
| `update_required_shown` | 업데이트 화면을 보였을 때 | `minimum_version` |
| `webview_load_failed` | 오프라인 화면을 띄운 메인 문서 오류(4xx·이동 취소 제외). Sentry 태그 `status`·`error_code`·`error_domain` | `status`: 5xx 상태 코드, 연결 오류는 0 |
| `webview_process_terminated` | iOS 콘텐츠 프로세스 종료(reload)·Android 렌더러 종료(재생성). Sentry 태그 `process`·`did_crash` | 없음 |

## 소셜 로그인 핸드오프

1. 웹이 `auth.socialLogin { provider }`를 요청한다.
2. 앱이 32바이트 난수(expo-crypto)로 verifier(base64url 43자)를 만들고 challenge = base64url(SHA-256(verifier)).
3. `openAuthSessionAsync(`${API_BASE}/auth/<provider>?app_challenge=<challenge>`, 'photocontest://auth/callback')`.
4. API가 provider OAuth를 마치면 세션 쿠키 대신 2분짜리 티켓을 만들고 `photocontest://auth/callback?code=<code>`로 보낸다. 실패는 `?error=login_failed`.
5. 앱은 콜백 URL을 정규식으로 읽어(React Native URL 구현을 믿지 않는다) `{ code, verifier }`를 웹에 돌려준다. cancel/dismiss는 `CANCELLED`(웹은 조용히), error·형식 오류는 `FAILED`(웹은 토스트).
6. 웹이 WebView 안에서 `POST /backend/auth/app/exchange { code, verifier }`(Origin = WEB_ORIGIN)로 교환해 WebView 쿠키에 세션을 받는다.

## 테스트 (`apps/mobile`이 소유)

| 스크립트 | 내용 | 서버 |
| --- | --- | --- |
| `test` | vitest `unit`(node, `src/**/*.{spec,test}.ts`) + `ui`(jsdom, `src/**/*.{spec,test}.tsx`, `react-native` → `react-native-web` alias, 네이티브 모듈과 Sentry·Amplitude SDK는 `vitest.setup.ts`의 대역, 가짜 DSN·키로 켠 상태) | 없음 |
| `test:api` | vitest `api`(`src/**/*.api.{spec,test}.ts`). `vitest.api-setup.ts`가 test-kit 격리 API를 띄운다 | API :4331, webOrigin `http://localhost:3331`, 스키마 `mobile_api_*` |
| `test:e2e` | Playwright `android-webview`·`ios-webview`. `e2e/support/native-host.ts`가 앱과 같은 라우터·기능 로직을 페이지에 붙인다 | API :4330 + 웹 dev :3330(`NEXT_DIST_DIR=.next/e2e-mobile`) |
| `bundle:check` | `expo export --platform android`로 Metro 번들이 만들어지는지 확인하고 결과 폴더를 지운다 | 없음 |

- 개발 서버 포트(3200/4200/55433)는 테스트에 쓰지 않는다. DB는 test-kit 격리 스키마만 쓴다.
- 웹 화면의 선택자는 `e2e/support/web-screens.ts`에만 둔다.
- 네이티브 빌드·실기기 확인(키보드가 입력창을 가리는지, 소셜 로그인 복귀, 파일 업로드)은 이 테스트들이 대신하지 못한다.

## 앱 스킬

- `.agents/skills/webview-shell/SKILL.md`: WebView·탐색·딥링크·뒤로 가기·복구.
- `.agents/skills/native-capability/SKILL.md`: 공유·복사·햅틱·시스템 브라우저·소셜 로그인.
- `.agents/skills/mobile-test/SKILL.md`: unit/UI/API·실제 웹과 가짜 OS 경계.
- `.agents/skills/release/SKILL.md`: dev client·빌드·환경변수·버전·Sentry 설정.

e2e의 사용자·로그인 티켓은 테스트 API로 준비하고 DB를 직접 수정하지 않는다. 웹/앱 Sentry·Amplitude 키를 비우며 pageerror를 검사한다. iOS에서는 Android 하드웨어 뒤로 가기 케이스만 실행하지 않는다.
