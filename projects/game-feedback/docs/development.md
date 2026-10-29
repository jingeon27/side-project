# Game Mate 개발 가이드

[프로젝트 안내](../README.md) · [기능 안내](features.md)

로컬 환경·외부 연동·테스트의 상세 사용법입니다. 운영 배포와 롤백은 [공통 EC2 가이드](../../../deploy/shared-instance/README.md)를 따릅니다.

## `.env` 변경 반영

로컬 설정은 **현재 실행하는 checkout의 `projects/game-feedback/.env`**에서 읽습니다. 저장소 루트 `.env`나 다른 worktree의 `.env`는 자동으로 공유하지 않습니다. Google client ID/secret과 문의 주소를 바꾼 뒤 실행 중인 개발 명령을 종료하고 저장소 루트에서 다시 실행합니다.

```sh
nvm use
npm install --global @yarnpkg/cli-dist@4.17.0 --force
yarn workspace @side/game-feedback dev
```

이 집계 명령이 프로젝트 `.env`를 읽어 API와 웹에 전달합니다. 앱만 직접 실행하는 `@game-feedback/web dev`는 이 로더를 거치지 않습니다. API의 OAuth 제공자는 시작할 때 구성되고, 웹의 공개 설정은 번들에 들어가므로 두 프로세스를 다시 시작한 뒤 화면을 새로고침합니다. 부모 셸에 같은 환경변수를 이미 export했다면 그 값이 `.env`보다 우선하므로 함께 확인합니다.

```dotenv
GOOGLE_CLIENT_ID=<Google 웹 애플리케이션 client ID>
GOOGLE_CLIENT_SECRET=<client secret>
GAME_FEEDBACK_CONTACT_EMAIL=contact@bambyul.com
```

Google callback은 `WEB_ORIGIN`에서 자동으로 정합니다. Google Cloud의 승인된 리디렉션 URI에 로컬은 `http://localhost:3300/api/auth/google/callback`, 운영은 `https://game.bambyul.com/api/auth/google/callback`을 등록합니다. 별도 포트로 띄웠다면 해당 웹 포트를 사용합니다. API 서브도메인으로 바꾸지 않으며, Google 키를 브라우저용 `NEXT_PUBLIC_*` 변수에 넣지 않습니다.

운영의 로컬 개발 `.env`는 서버에 자동 반영되지 않습니다. 공유 배포의 `/srv/side-project/services/game-feedback/.env`에서 Google 설정을 바꾸고 컨테이너를 재생성해야 하며, 문의 주소 등 웹 번들 값은 GitHub Variable `GAME_FEEDBACK_CONTACT_EMAIL` 변경 후 새 웹 이미지 빌드·배포가 필요합니다. 서비스의 기존 설정·검증된 이미지·DB를 유지하는 절차는 [공유 배포 문서](../../../deploy/shared-instance/README.md)를 따릅니다.

## 로컬 실행

저장소의 Node.js 24와 Yarn 4.17.0을 사용한다. 의존성은 기존 `node-modules` linker로 설치한다.

```sh
nvm use
yarn install --immutable
cp projects/game-feedback/.env.example projects/game-feedback/.env
yarn workspace @side/game-feedback dev:test
```

테스트 실행은 일반 서비스 UI에 예시 콘텐츠를 준비하고, 서버 API로 고정 계정의 테스트 토큰을 발급한다. 화면에 데모 가입 폼이나 계정 선택기, 테스트 배지는 표시하지 않는다. Web 진입점은 <http://localhost:3300/>, API는 <http://localhost:4300>이다. 첫 방문 언어는 브라우저 설정을 따른다. 한국어로 바로 보려면 <http://localhost:3300/ko>를 사용한다. Ctrl+C는 이 실행이 시작한 API와 Web을 종료한다. 로컬 PostgreSQL 데이터와 소유 프로세스는 유지되며 다음 명령으로 중지한다.

```sh
yarn workspace @side/game-feedback db:stop
```

실제 소셜 로그인과 Supercell 제공자를 사용하려면 프로젝트 `.env`에 발급받은 값을 설정한 뒤 `yarn workspace @side/game-feedback dev`를 실행한다. 일반 실행의 데모 모드는 꺼져 있다. 개발 실행은 계약 빌드, 전용 Prisma 생성, OpenAPI·SDK 자동 생성, 소유 DB 시작, Prisma 스키마 동기화, 카테고리 seed를 준비한다. 예시 콘텐츠는 명시적인 테스트 또는 기존 데모 실행에서만 추가한다.

로컬 Sentry·Amplitude 키는 같은 `projects/game-feedback/.env`에 넣는다. 앱별 실행 명령 대신 위 집계 명령으로 시작해야 Web/API에 함께 전달된다. [관측 설정과 수신 확인](observability.md#설정과-실행)을 따른다. S3 직접 업로드를 확인하려면 같은 파일에 서버 전용 S3 설정을 넣고 [게시글·채팅 첨부 설정](media-upload.md)에 따라 버킷 CORS를 적용한다.

## Web UI와 shadcn/ui

브라우저 로그인창은 CSS 미디어쿼리로 768px 미만에서 하단 시트, 그 이상에서 중앙 모달로 표시한다. 같은 내용과 포커스를 유지하므로 열린 채로 화면 크기를 바꿔도 창을 다시 만들지 않는다. 앱 WebView에서는 기존 `/:locale/login` 페이지를 사용한다. 같은 Google·카카오·Discord 버튼을 공유하며 미설정 제공자는 준비 상태로 표시한다. 뒤로 가기와 로그인 완료 시 원래 화면·필터·언어를 유지하고, OAuth 복귀 주소는 같은 서비스의 언어 경로만 허용한다. 닉네임과 필수 약관 동의는 별도 `/:locale/onboarding` 페이지에서 받고 완료 후 원래 화면으로 돌아간다.

웹은 공통 `@side/design-system`의 **shadcn/ui Base UI / base-nova** 컴포넌트를 사용한다. 공통 패키지와 Web의 components.json은 같은 base-nova/neutral/lucide 설정을 사용하고 ui/utils alias는 공통 소스를 가리킨다. 설치 원본과 조정 범위는 [공통 shadcn 구성](../../../packages/design-system/SHADCN.md)에 정리했다.

작성/수정/로그인/신고/언어/검색/채팅 폼은 Input, Textarea, NativeSelect, Checkbox를 사용한다. 버튼과 모달은 공통 shadcn 기반을 사용하며 피드 탭은 방향키로 조작할 수 있는 Tabs와 URL 상태를 연결한다. 분류/금액 입력과 WYSIWYG, 키보드 포커스, 중첩 모달, WebView의 16px 입력과 터치 영역을 유지한다. 색과 타이포그래피는 Photo Contest와 같은 공통 토큰에서 가져온다.

## 언어와 반응형 화면

첫 진입 `/`는 저장한 언어를 우선하고, 자동 선택이면 기기나 브라우저의 `Accept-Language`에서 한국어, 영어, 일본어를 선택한다. 지원하는 언어가 없으면 영어를 사용한다. 위치 권한이나 IP 조회는 사용하지 않는다. `/ko`, `/en`, `/ja`로 전달된 링크는 해당 언어와 상세 경로를 유지한다.

상단 지구본 또는 프로필 설정의 **언어**에서 **기기 설정에 맞춤**, **한국어**, **English**, **日本語**를 선택한다. 로그인 없이 바꿀 수 있고 선택은 서비스 전용 `gf_language` 쿠키에 저장되어 새로고침과 다음 접속에도 적용된다. 설정은 브라우저와 앱 WebView별로 저장하며 계정 간 동기화하지 않는다. 메뉴, 피드, 게시글 작성과 답변, 프로필, 채팅 등 주요 화면의 문구와 날짜 표시는 선택한 언어를 사용한다. 사용자 닉네임, 게시글과 메시지 원문은 자동 번역하지 않는다. 가이드와 약관 등 안내 본문은 한국어 원문임을 알리고 `lang="ko"`를 지정한다. 기존 원문 기준 canonical 정책을 유지한다.

모바일은 한 열, 태블릿과 데스크톱은 기존 여러 열 배치를 사용한다. 모바일 채팅 상세에서는 상단 공통 메뉴와 하단 탭을 숨기고 대화 헤더의 뒤로 가기로 목록에 복귀한다. 입력창과 모달은 visual viewport 높이를 따라가며 Safe Area를 반영한다. 입력 글자는 16px, 하단 메뉴와 주요 언어 선택은 최소 44px 조작 영역을 사용한다. 게시글과 프로필의 긴 내용은 화면 안에서 줄바꿈한다.

## 서버에서 테스트 토큰 발급하기

`dev:test`는 API 실행 인수 `--test-auth`로 테스트 인증을 켜고 데모 인증은 끈다. 로그인 화면은 카카오, Discord, Google만 제공한다. 외부 소셜 인증을 거치지 않고 API 테스트를 하려면 다음 요청을 사용한다.

```sh
curl --fail --silent --show-error http://localhost:4300/api/auth/test-token \
  -H 'Origin: http://localhost:3300' \
  -H 'Content-Type: application/json' \
  -d '{"accountId":"sample-user-0"}'
```

응답은 `{ accessToken, tokenType: "Bearer", expiresAt, user }`다. 이후 REST 요청에 `Authorization: Bearer <accessToken>`을 전달한다. 쓰기 요청에는 위 Origin 헤더도 보낸다. 같은 요청은 브라우저 테스트용 HttpOnly 세션 쿠키도 설정한다. 서버는 토큰의 해시만 저장하고 1시간 후 만료시키며 로그아웃 시 폐기한다. 잘못된 Bearer 헤더는 쿠키 인증으로 대체하지 않는다.

| 계정       | accountId           | 초기 상태                            |
| ---------- | ------------------- | ------------------------------------ |
| 새벽의호그 | `sample-user-0`     | 일반 사용자, 태그 `#GG829JGY`        |
| 덱연구소   | `sample-user-3`     | 서비스 인증 사용자, 태그 `#9QY82JGY` |
| 운영테스터 | `sample-test-admin` | 운영자                               |

플레이어 태그는 `#` 뒤 영문·숫자 8자리입니다. 입력 시 앞뒤 공백을 제거하고 `#` 생략과 소문자는 정규화합니다. 예: `gg829jgy` → `#GG829JGY`.

발급은 미리 정의한 계정 ID만 허용한다. 테스트 인증이 꺼지면 endpoint는 404이고 production에서 활성화를 시도하면 시작을 거부한다. 기존 `/api/auth/test-login` 쿠키 전환 API는 테스트 자동화 호환을 위해 유지한다. 시작할 때 기존 사용자 변경과 메시지를 덮어쓰지 않는다. 피드백 6개와 친추판매, 친선전, 코치/수강생 모집, 자유글 10개를 추가하고 수강료 세 유형과 판매 금액을 준비한다.

## 소셜 로그인 설정

카카오, Discord, Google의 로그인 시작은 `/api/auth/social/<provider>`, 콜백은 `/api/auth/social/<provider>/callback`이다. Google의 기존 `/api/auth/google`과 `/api/auth/google/callback`도 지원하며 기본 Google redirect URI는 기존 콜백이다. 환경변수의 redirect URI와 각 개발자 콘솔에 등록한 URL을 일치시킨다.

| 제공자  | 환경변수                                              | 기본 콜백                           | 요청 범위           |
| ------- | ----------------------------------------------------- | ----------------------------------- | ------------------- |
| 카카오  | `KAKAO_CLIENT_ID`(REST API 키), `KAKAO_CLIENT_SECRET` | `/api/auth/social/kakao/callback`   | 사용자 식별 ID      |
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`          | `/api/auth/social/discord/callback` | `identify`          |
| Google  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`            | `/api/auth/google/callback`         | `openid`, PKCE S256 |

제공자별 콜백은 `WEB_ORIGIN`과 위 경로에서 자동으로 정한다. 세션 API의 `socialProviders`가 서버 설정 상태를 전달하고 설정된 로그인 버튼만 동작한다. 제공자와 외부 사용자 ID를 묶어 계정을 식별하며 서비스 닉네임은 가입 단계에서 직접 입력한다. 네이티브 WebView도 선택한 제공자를 시스템 브라우저로 전달하고 기존 일회용 앱 티켓/PKCE 교환으로 복귀한다.

구현 기준은 [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)다. 로컬 검증은 가짜 제공자를 사용하며 실제 콘솔 키와 외부 계정 로그인은 별도로 확인해야 한다.

## 명령

모든 명령은 저장소 루트에서 실행한다.

| 명령 뒤의 작업                                                          | 실행 내용                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `yarn workspace @side/game-feedback setup`                              | 계약 및 Prisma 준비, 개발 DB 시작, 현재 Prisma 스키마 적용, 카테고리 seed         |
| `yarn workspace @side/game-feedback typecheck` / `check`                | 계약/API/SDK/Bridge/Web/Mobile/Admin 타입, API·패키지·스크립트와 각 앱 lint 위임  |
| `yarn workspace @side/game-feedback test`                               | API Vitest+Supertest, SDK 응답 검증, Web Vitest, Mobile Vitest 단위·UI 테스트     |
| `yarn workspace @side/game-feedback test:e2e`                           | 테스트 DB 시작 및 Web 데모/테스트 토큰/프로덕션 프리패칭·Mobile Playwright 테스트 |
| `yarn workspace @side/game-feedback build`                              | API/Web production build 및 Mobile Android/iOS Metro export                       |
| `yarn workspace @side/game-feedback codegen`                            | 서버 계약 → OpenAPI → Orval Client 생성                                           |
| `yarn workspace @side/game-feedback db:start` / `db:stop` / `db:status` | 개발 DB 소유 프로세스 관리                                                        |
| `yarn workspace @side/game-feedback db:test:start` / `db:test:stop`     | 테스트 DB 관리                                                                    |
| `yarn workspace @side/game-feedback db:sync`                            | 개발 DB URL 검증 후 `prisma migrate deploy`                                       |

API만 검증하려면 `yarn workspace @game-feedback/api test`를 실행한다. API가 전용 테스트 DB와 Prisma를 준비한 뒤 Vitest + Supertest 통합 테스트까지 실행한다. 자세한 명령과 격리 정책은 [API 테스트 가이드](../apps/api/README.md)를 따른다.

## API 규격 자동 생성

`apps/api/openapi.json`은 REST 요청·응답·경로를 기술하는 OpenAPI 규격이다. 원본은 `packages/contracts`의 Zod 스키마와 API 경로 정의이며 JSON을 직접 편집하지 않는다. Orval이 이 규격에서 타입·클라이언트·Zod 응답 검증 코드를 만든다.

프로젝트의 `dev`/`dev:test`/`dev:demo`/`setup`, `check`/`typecheck`, `test`/`test:e2e`, `build`는 시작할 때 **계약 빌드 → Prisma 생성 → OpenAPI → SDK 생성**을 순서대로 실행한다. 실행 중 계약을 수정했다면 `codegen`을 다시 실행하거나 개발 서버를 다시 시작한다. 앱 워크스페이스의 개별 명령을 직접 실행하면 이 준비 단계는 실행하지 않는다.

`openapi.json`은 중간 생성 파일이므로 프로젝트 `.gitignore`에서 제외하고 Git에 올리지 않는다. 초기 체크아웃에서도 위 준비 단계가 원본 Zod 스키마와 API 경로 정의로 새로 생성한다. SDK 생성 코드는 API 변경 리뷰와 누락 검사를 위해 Git에 포함한다. CI는 규격과 SDK를 생성한 뒤 SDK diff와 SDK 소유 응답 검증 테스트를 검사한다. 생성 과정은 DB 접속이나 외부 API 호출이 필요 없다.

OpenAPI JSON과 Swagger UI를 제공하는 HTTP 엔드포인트는 등록하지 않는다. 운영(`NODE_ENV=production`) HTTP 설정은 `/openapi.json`, `/api/openapi.json`, `/docs`, `/api/docs`, `/swagger`, `/api-json` 등 문서·원본 경로와 하위 자산을 404로 차단한다. SDK 생성에는 영향이 없다. [Sentry 수집 확인](observability.md)과 [부하테스트 예제](load-testing.md)를 참고한다.

## 모바일 WebView 앱

`apps/mobile`은 Expo dev client로 실행하며 웹의 테스트 계정·게시글·댓글·채팅·공통 디자인을 그대로 사용한다. Metro는 8082, Android/iOS E2E는 Web 3302·API 4302와 별도 `gf_test_mobile_*` 스키마를 사용한다. API는 Vitest+Supertest, Web은 Vitest+Playwright, Mobile은 Vitest 단위·UI와 Playwright native host 검증을 소유한다.

```sh
# 웹 실행 후 별도 터미널에서
adb reverse tcp:3300 tcp:3300
yarn workspace @side/game-feedback mobile:android
# iOS
yarn workspace @side/game-feedback mobile:ios
```

[모바일 실행·테스트 가이드](../apps/mobile/README.md)에 origin 설정, 시스템 브라우저 Google 로그인, 뒤로 가기·딥링크·연결 복구와 실기기 확인 범위를 정리했다.

## 데이터 격리

개발 DB는 `127.0.0.1:55442/game_feedback`, 테스트 DB는 `127.0.0.1:55444/game_feedback_test`이며 서비스 전용 `game_feedback` 역할을 쓴다. bootstrap 관리자 자격 증명은 프로젝트 `.data`에만 저장하고 앱에 전달하지 않는다. 앱 역할에는 superuser·DB 생성·역할 생성 권한이 없다. DB의 TCP 연결은 loopback으로 한정한다.

DB 실행기는 고정된 프로젝트 데이터 디렉터리만 관리한다. 포트가 다른 프로세스에 사용 중이면 종료하지 않고 실패한다. 스키마 동기화 실행기는 hostname, port, database, user, schema를 검증한다. 개발과 테스트 간 URL 교체, 원격 URL, 기존 서비스 DB는 허용하지 않는다. 외부 배포의 Migration 절차는 별도의 운영 설정과 검토가 필요하다.

DB 소유 프로세스가 실행 중이어도 PostgreSQL이 예기치 않게 종료되면 `db:status`가 실행 중으로 표시될 수 있다. 연결 오류가 계속되면 해당 개발·테스트 DB의 `db:stop` 후 `db:start`를 실행한다. 데이터는 유지되며 포트의 다른 프로세스를 종료할 필요는 없다.

## Next.js와 프리패칭 검증

Game Feedback Web은 Next.js 16.4.3과 React 19.3.1을 사용한다. Cache Components와 Partial Prefetching을 활성화하고 URL 조회와 라우트 모션/알림 위치를 Suspense로 분리했다. 세션·언어·화면 모드의 private cache는 production 서버에서 요청 간 공유하지 않는다. 공개 글/프로필의 첫 HTML은 JavaScript 없이 본문과 SEO를 제공하며 클라이언트 이동에서는 본문을 스트리밍한다. 문서 접근 검사를 통해 없는 글과 차단된 사용자의 공개 경로는 HTML을 보내기 전에 404로 처리한다.

공개 게시글 상세는 `cacheTag`와 `cacheLife`를 사용한다. NestJS가 변경을 커밋하면 Next의 `POST /internal/cache/revalidate`가 `revalidateTag(tag, { expire: 0 })`를 호출하고, 실패는 DB 큐에서 재시도한다. API가 `.data/cache-revalidation.key`를 권한 600으로 원자적으로 생성하고 Next가 같은 파일을 읽는다. 운영 Compose는 API 쓰기·Web 읽기 전용 볼륨을 공유한다. 콜백 주소는 WEB_ORIGIN(운영은 내부 gf-web 주소)에서 정하며 별도 환경변수를 요구하지 않는다.

`yarn workspace @game-feedback/web test:prefetch`는 격리된 테스트 DB와 3353/4353 포트에서 production 빌드 + `@next/playwright`의 `instant()`를 검증한다. 테스트 빌드에만 `ENVIRONMENT=test`에서 Next testing API를 포함하고 일반 build에는 포함하지 않는다. 실행 중인 다른 서비스나 포트는 재사용하거나 종료하지 않는다.

테스트 토큰만 켠 실제 개발 모드의 채팅을 검증하려면 `yarn workspace @game-feedback/web test:test-auth`를 실행한다. 테스트 실행기가 createApp 옵션으로 인증을 켠 별도 설정에서 플레이어 채팅과 일반/인증 문의의 전송·응답·목록/새로고침을 검사하며 프로젝트 `test:e2e`와 CI에도 포함한다.

관리자 실행·로그인·검증 절차는 [Admin README](../apps/admin/README.md)를 참고한다. 운영 배포 준비 요청 이후 최초 migration을 포함하며 운영은 `migrate deploy`, 로컬은 전용 URL 가드를 거친 `db:sync`를 사용한다. 기존 로컬 DB를 초기화하거나 최초 migration을 중복 적용하지 않는다.

Photo Contest와 서울 EC2 한 대·Caddy·PostgreSQL 컨테이너를 공유하고, 비공개 S3 버킷 하나의 `game-feedback/production/` 폴더를 사용한다. Docker/HTTPS, GitHub Actions CD, DB 권한 분리와 복구 절차는 [공통 운영 가이드](../../../deploy/shared-instance/README.md)에 정리했다. 실제 AWS 생성과 공개 배포는 이 코드를 추가하는 것만으로 실행되지 않는다.

API의 JSON 요청은 NestJS 12.2의 StandardSchemaValidationPipe와 명시한 Zod 스키마가 검증하며 공개 도메인과 관리자 도메인의 controller/service를 분리한다. DTO 타입은 Zod에서 추론하며 계약의 정규화와 중첩 JSON 규칙을 HTTP 경계에서 유지하고 응답 검증과 OpenAPI/SDK 생성은 기존 Zod 계약을 사용한다.

일반 Web Playwright·테스트 토큰·모바일 WebView 검사는 격리 API와 실제 production build/start를 사용한다. 프리패칭은 별도 test:prefetch에서 검증한다. 관측 검사는 production build/start로 실행한다. 일반 dev 명령은 유지한다.

GET/HEAD 헬스체크는 세션 조회와 일반 요청 제한에서 분리한다. 업무 API의 읽기·쓰기·인증·업로드 제한은 유지한다.
