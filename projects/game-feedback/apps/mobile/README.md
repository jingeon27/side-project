# Game Feedback Mobile

기존 웹을 여는 Expo 57 + React Native 0.86 WebView 앱이다. 게시글·댓글·1:1 채팅·테스트 계정·공통 디자인 시스템은 웹과 동일하다. 앱 화면을 별도로 복제하지 않는다.

## 개발 실행

저장소 루트에서 Node 24와 Yarn 4.17을 사용한다. Xcode 또는 Android SDK가 설치된 환경에서 dev client를 만든다. Expo Go는 사용하지 않는다.

```sh
corepack yarn install --immutable
corepack yarn workspace @side/game-feedback dev:demo
# 다른 터미널: Android 에뮬레이터가 같은 localhost 웹 origin을 사용하도록 연결
adb reverse tcp:3300 tcp:3300
APP_VARIANT=development corepack yarn workspace @side/game-feedback mobile:android
# 또는 iOS 시뮬레이터
APP_VARIANT=development corepack yarn workspace @side/game-feedback mobile:ios
# 이미 설치된 dev client에서 Metro만 실행
APP_VARIANT=development corepack yarn workspace @side/game-feedback mobile:start
```

Metro 포트는 8082다. 기본 웹 주소는 `http://localhost:3300`이며 앱에서도 **로그인 / 시작하기**에서 새벽의호그·덱연구소·운영테스터를 선택할 수 있다. 실기기는 접근 가능한 Web origin을 `EXPO_PUBLIC_WEB_ORIGIN`과 API의 `WEB_ORIGIN`에 동일하게 설정한다. 인증·채팅 요청은 모두 Web origin의 `/api` rewrite를 통한다.

`.env.example`을 이 앱의 `.env`로 복사해 개발 origin을 지정할 수 있다. release 빌드는 명시적인 HTTPS origin이 필수다. `APP_VARIANT=development`일 때만 Android HTTP를 허용한다. 스킴은 `gamefeedback`, 번들/패키지는 `dev.side.gamefeedback`이다. 운영 서명·스토어 등록·배포는 포함하지 않는다.

## 네이티브 연결

- SafeAreaView가 위·아래 여백을 관리한다. 웹은 기존 `@side/design-system` 스타일을 렌더링하고 네이티브 로딩·오류 화면은 같은 흰색·검정 팔레트를 따른다.
- 같은 Web origin만 내부에서 연다. 다른 HTTP(S)·전화·이메일 링크는 OS로 보내고 실행 가능한 URL·로컬 파일 URL은 거부한다. 새 창에도 동일한 정책을 적용한다.
- Android 뒤로 가기는 웹 모달 → 상세 진입 이력 → 논리적 상위 화면 순서로 처리한다. 홈에서는 앱을 종료한다. 800ms 안에 웹 응답이 없으면 WebView history/종료로 복구하며 응답 대기 중 중복 누름을 막는다. iOS 스와이프는 WebView 기록을 사용하고 웹 모달이 열린 동안 비활성화한다.
- `gamefeedback://ko/posts/<id>`, `gamefeedback://ko/messages/<conversationId>`, `gamefeedback://ko/users/<id>?cursor=...`처럼 알려진 경로를 받는다. 기존 `messages?conversation=<id>` 링크는 중첩 경로로 변환한다. `en`·`ja`도 같은 화면 경로를 허용한다. HTTPS universal/app link의 OS 등록은 운영 도메인이 정해진 뒤 추가한다.
- 셸 렌더 오류는 서비스 경계에서 복구 화면을 표시한다. 재시도는 기존 OS listener·host를 정리한 새 WebView로 초기 화면을 열고 HttpOnly 쿠키 저장소를 유지한다. 웹의 기능 오류는 웹 내부 경계에서 처리한다.
- 메인 문서 연결 실패·5xx는 다시 시도 화면을 연다. 4xx는 웹이 표시한다. 다시 시도·Android renderer 종료는 마지막 주소로 WebView를 재생성하고 iOS content 종료는 reload한다.
- 웹 준비 메시지 이전에는 딥링크를 문서 주소로, 이후에는 Next router 이동으로 전달한다. background에서 active로 돌아오면 세션을 먼저 확인하고 필요한 캐시를 갱신한다.

Google 로그인은 시스템 브라우저 + PKCE를 사용한다. OAuth 완료 후 API가 `gamefeedback://auth/callback?code=...`로 2분짜리 일회용 코드를 보내면 WebView가 `POST /api/auth/app/exchange`로 교환해 HttpOnly 쿠키를 받는다. 실제 세션 토큰은 브리지로 전달하지 않는다. 새 사용자는 웹과 동일한 닉네임·약관·연령 확인을 거친다. Google 제공자의 callback은 기존 Web origin의 `/api/auth/google/callback`이며 실제 자격 증명 검증은 별도다.

## 경로와 화면 전환

웹과 앱은 `@game-feedback/bridge`의 `appRoutes`·`resolveAppRoute`·`WebPathSchema`를 공유한다. locale·화면·ID와 허용 query를 검증하고 동일한 경로로 정규화한다. 검색어와 피드 탭, 프로필 cursor는 유지하며 중복 query·잘못된 인코딩·알 수 없는 경로는 딥링크로 열지 않는다.

| 경로                                                            | 탐색 규칙                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/:locale?tab=unanswered&q=...`                                 | 라운지 루트. 다른 탭에서 돌아오면 마지막 검색/탭을 복원              |
| `/:locale/messages`                                             | 채팅 목록 루트                                                       |
| `/:locale/messages/:conversationId`                             | 목록에서 push, 다른 채팅방으로 이동은 replace. 공통 목록 layout 유지 |
| `/:locale/posts/:postId`, `/:locale/users/:userId?cursor=...`   | 상세는 push. 뒤로 가기는 진입 경로, 직접 진입은 라운지로 replace     |
| `/:locale/settings`, `/:locale/notifications`, `/:locale/guide` | 루트 탭 간 replace로 이력 중복 방지                                  |

채팅방 헤더의 뒤로 가기는 채팅 목록으로 돌아가고, Android 뒤로 가기는 유효한 진입 이력이 있으면 해당 화면으로 돌아간다. 직접 열린 채팅방은 목록으로 돌아간다. 준비된 WebView의 딥링크·동일 origin 새 창은 Next router로 전달하며 같은 URL을 반복 전달해도 이력을 추가하지 않는다. 연결 복구 주소에도 검색·cursor를 유지한다.

웹의 경로 진입 모션은 공통 컨테이너에서 실행하고 화면 전체를 key로 다시 만들지 않는다. 채팅 목록/방은 하나의 전환 영역으로 묶는다. 계정 전환 시 private 화면·캐시는 초기화하며 모션 줄이기 설정을 반영한다. 채팅방별 입력 초안을 영구 저장하는 기능은 포함하지 않는다.

## 검증

```sh
corepack yarn workspace @game-feedback/mobile typecheck
corepack yarn workspace @game-feedback/mobile lint
corepack yarn workspace @game-feedback/mobile test
corepack yarn workspace @game-feedback/mobile exec playwright install chromium webkit
corepack yarn workspace @side/game-feedback test:mobile:e2e
corepack yarn workspace @game-feedback/mobile bundle:check
```

Vitest는 순수 URL·프로토콜·PKCE 판단과 RN Web으로 그린 실제 셸 이벤트를 검증한다. Playwright의 `android-webview`·`ios-webview`는 Chromium/WebKit 모바일 환경에 실제 앱 host·URL 정책·인증 로직을 붙이고 OS 인증창만 대역으로 바꾼다. Google 버튼 취소 테스트에서는 실제 session 응답의 제공자 사용 가능 여부만 켜며 나머지 API·DB는 격리된 실제 서버를 사용한다. API의 일회용 코드 교환·쿠키·재사용·만료·경쟁·Origin·가입 동의는 API 소유 Vitest+Supertest로 검사한다.

실기기에서 별도 확인할 항목은 키보드와 입력창, 노치·하단 여백, Android 하드웨어 뒤로 가기, iOS 스와이프, 시스템 Google 인증 후 앱 복귀, 비행기 모드와 연결 복구다. Metro export와 브라우저 검증은 서명된 네이티브 빌드·실기기 확인을 대신하지 않는다.
