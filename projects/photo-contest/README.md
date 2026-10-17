# 웃긴순간

친구들과 그룹을 만들고 사진·동영상·합성으로 웃긴 순간을 나누는 커뮤니티입니다. 그룹은 종료일 없이 유지되며 멤버는 여러 게시물을 올릴 수 있습니다. 웹과 Expo WebView 앱이 같은 HttpOnly 세션과 GraphQL API를 사용합니다.

## 실행

Node.js 24(`.nvmrc`)·Corepack·Yarn 4.17을 사용합니다. 저장소 루트에서 실행하세요.

```sh
corepack yarn install --immutable
cp projects/photo-contest/.env.example projects/photo-contest/.env
corepack yarn workspace @side/photo-contest db:generate
corepack yarn workspace @side/photo-contest codegen
corepack yarn workspace @side/photo-contest db:local
```

별도 터미널에서 해당 개발 DB에 마이그레이션을 적용하고 서버를 시작합니다.

```sh
corepack yarn workspace @side/photo-contest db:migrate
corepack yarn dev:photo-contest
```

- 웹: http://localhost:3200
- API: http://127.0.0.1:4200, 브라우저에서는 같은 origin의 `/backend/*` 프록시로 호출
- 기본 로컬 DB: 55432. `LOCAL_POSTGRES_PORT`와 `DATABASE_URL`을 함께 바꿔 프로젝트별로 분리
- DB·사진: 프로젝트 `.data/postgres`·`.data/photos`

`NODE_ENV=development`와 `ENABLE_DEV_LOGIN=true`가 모두 있어야 닉네임 로그인이 열립니다. 같은 닉네임은 같은 개발 계정입니다. 다른 브라우저 프로필에서 친구 계정으로 초대 링크를 열어보세요.

## 구성과 기능

| 앱·패키지           | 역할                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/api`          | NestJS 12 schema-first GraphQL·인증/업로드 REST, Prisma 6·PostgreSQL                             |
| `apps/web`          | Next.js 16 App Router, Apollo Client 4, Base UI·RHF·Zod, 통합 게시물 피드·MY 그룹 관리·반응형 웹 |
| `apps/mobile`       | Expo SDK 57 WebView 셸, 시스템 브라우저 로그인·공유·클립보드·햅틱·딥링크                         |
| `packages/bridge`   | zod로 검사하는 앱↔웹 메시지 계약                                                                 |
| `packages/test-kit` | 테스트 DB 격리·API 기동·이미지·MP4·fixture 준비                                                  |

그룹은 멤버 전용이며 초대 링크로 가입합니다. 모든 멤버가 초대 링크를 공유하고 관리자만 재발급할 수 있습니다. 홈은 가입한 모든 그룹의 사진·동영상을 최신순으로 모읍니다. MY에서 내 그룹을 보고 새 그룹을 만듭니다. 그룹에서 제목·내용과 파일을 올리며, 게시물은 작성자와 관리자가 삭제할 수 있습니다.

게시물에 댓글을 남길 수 있습니다. 댓글은 멤버만 조회·작성하며 작성자와 관리자가 삭제합니다. 본문은 최대 1000자이고 최신순으로 24개씩 조회합니다. 댓글 시트는 내 글과 다른 멤버의 글을 말풍선으로 구분하고, 게시물 작성자 표시·댓글 수·빈 목록 안내를 제공합니다. 입력창은 내용에 따라 늘어나며 전송 버튼과 함께 하단에 고정됩니다. 피드 맨 위에서 아래로 당겼다 놓으면 최신 글과 인기를 함께 새로 받습니다. 짧은 당김·가로 이동·입력·사진 확대는 새로고침을 실행하지 않습니다. 키보드 포커스 시 새로고침 조작도 제공합니다. 바텀시트는 화면 너비를 채우며 폼에는 필수·선택 여부를 표시합니다.

‘이달의 인기’는 한국 시간 기준 이번 달에 올라온 게시물 중 좋아요가 많은 순서로 3개를 보여 줍니다. 동률이면 작성 시각·ID 내림차순입니다. 최신 게시물은 24개씩 더 불러옵니다. 그룹·정렬별 Apollo 캐시를 분리하고 가입·작성·삭제 뒤 목록을 다시 받습니다.

사진은 JPEG/PNG/WebP를 실제 디코딩해 최대 1600px WebP로 저장합니다. 브라우저가 읽을 수 있는 HEIC도 업로드 전에 변환합니다. 동영상은 실제 컨테이너·코덱·재생 시간을 검사하며 MP4(H.264/AAC), WebM(VP8·VP9/Opus·Vorbis), 100MB·5분 이하를 지원합니다. 파일은 비공개로 저장하고 재생·탐색의 byte Range 요청에도 매번 멤버십을 검사합니다. 사용하지 않은 업로드와 삭제 실패 파일은 정리 작업이 재시도합니다.

웹은 최대 1440px이며 게시물은 모바일·태블릿 최대 540px, 데스크톱 최대 680px의 1열 피드입니다. 흑백 UI·여백·명확한 글자 위계를 사용하고 제목·사진·본문을 펼쳐 보여 줍니다. 인기 게시물은 순위가 붙은 사각형 미리보기이며 프로필에 스토리 장식 테두리를 두지 않습니다. 데스크톱은 왼쪽 고정 메뉴와 오른쪽 인기 사진, 모바일·태블릿은 하단 메뉴와 피드 위의 인기 목록을 보여 줍니다. 최신·인기 조회는 별도 Suspense/실패 경계를 가지며 RSC에서 미리 준비합니다. 고정 메뉴와 정렬 항목은 JSX로 직접 선언합니다.

기존 대회 사진·숨김·작성 시각·좋아요는 `20261015090000_gallery_posts`가 그룹 게시물로 복사합니다. 기존 테이블과 대회 URL은 보존합니다. 새 그룹의 작성 흐름은 대회나 마감일에 의존하지 않습니다. 개발 DB에는 검토 후 위 `db:migrate` 명령을 실행하세요.

인기 목록은 기기와 관계없이 왼쪽부터 순위·사진·내용 순서로 한 줄씩 표시하고, 기존 대회 순위는 사진 아래에 표시합니다. favicon은 윙크하며 웃는 얼굴의 흑백 아이콘을 사용한 `apps/web/src/app/icon.svg`이며 Next.js가 아이콘 메타데이터를 생성합니다. 모바일 상단과 데스크톱 메뉴의 브랜드 아이콘도 같은 SVG를 사용합니다.

데스크톱에서는 피드·인기 목록을 카드로 구분하고 MY의 프로필·그룹을 좌우로 보여 줍니다. 그룹의 글쓰기 버튼은 스크롤 중에도 상단에 남으며, 초대·멤버 정보는 오른쪽에서 열 수 있습니다. 글쓰기 시트는 미디어·내용, 댓글 시트는 원본 게시물·대화를 나란히 보여 줍니다. 댓글은 화면 높이의 약 75%로 열리고 위로 끌거나 확장 버튼을 누르면 전체 높이로 펼쳐집니다. 배경은 기본 상태에서도 살짝 어둡고 시트를 펼칠수록 더 어두워집니다. 아래로 끌거나 축소 버튼을 누르면 기본 크기로 돌아가며 입력창은 하단에 유지됩니다. 게시물 등록 뒤에는 목록 위로 돌아갑니다.

## 서비스 정책

이용약관(`/terms`)과 개인정보 처리방침(`/privacy`)은 로그인 없이 읽을 수 있습니다. 로그인 화면·MY·데스크톱 메뉴에서 연결하며, 운영자 김진건과 문의처 jingeon27@gmail.com은 `apps/web/src/_pages/legal/@page/model/policy.ts`에서 관리합니다.

두 문서는 검토용 초안입니다. 계정·미디어·인증 정보의 처리는 현재 구현을 기준으로 설명합니다. 정식 공개 전 실제 호스팅·저장소·분석 서비스의 위탁·국외 이전, 문의·운영 이력·백업 보관 기간과 아동 개인정보 처리 기준을 확인해 확정해야 합니다. 작성 시 [개인정보보호위원회의 2026년 개인정보 처리방침 작성지침](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&nttId=12021)을 참고했습니다.

## 모바일 앱

Expo Go 대신 dev client 또는 스토어 빌드를 사용합니다.

```sh
APP_VARIANT=development corepack yarn workspace @photo-contest/mobile android
APP_VARIANT=development corepack yarn workspace @photo-contest/mobile ios
corepack yarn workspace @photo-contest/mobile start
corepack yarn workspace @photo-contest/mobile bundle:check
```

`EXPO_PUBLIC_WEB_ORIGIN`을 웹 주소로 설정하고 Android 에뮬레이터에서는 `adb reverse tcp:3200 tcp:3200`을 사용합니다. 쿠키는 WebView가 보관합니다. Google 로그인을 WebView에서 열지 않고 시스템 브라우저·PKCE·일회용 코드 교환으로 처리합니다. 최소 버전 확인 실패는 시작을 막지 않습니다.

## 인증·저장소·모니터링

로그인 화면에서 직접 정한 아이디·비밀번호로 회원가입하거나 로그인할 수 있습니다. 아이디는 영문·숫자·밑줄 3~24자로 대소문자를 구분하지 않으며, 가입 비밀번호는 15~128자입니다. 서버는 임의 salt를 쓴 scrypt 해시만 저장하고 기존 HttpOnly 세션 쿠키를 발급합니다. 반복 시도는 DB에서 제한합니다.

소셜 로그인은 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`, `KAKAO_CLIENT_ID`·`KAKAO_CLIENT_SECRET`을 `.env`에 설정하면 사용할 수 있습니다. 미설정 수단은 화면에서 숨깁니다. Google·카카오 앱의 callback은 `https://<웹 도메인>/backend/auth/<provider>/callback`입니다. 실제 OAuth 앱과 계정으로 하는 인증은 별도 설정 후 확인해야 합니다.

운영은 `NODE_ENV=production`, HTTPS `WEB_ORIGIN`, `DATABASE_URL`, 영속 `STORAGE_DIR` 또는 private S3 호환 버킷이 필요합니다. 별도 컨테이너에서 API를 실행하면 `API_HOST`를 명시하고 웹 프록시를 통해 접근하게 구성합니다.

웹은 일회용 티켓을 받은 뒤 GraphQL Upload mutation으로 파일을 전송합니다. Apollo UploadHttpLink가 multipart 요청과 쿠키를 처리합니다. 기존 업로드 REST 경로는 이전 클라이언트 호환용으로 유지합니다. API가 실제 형식·40MP·10MB를 검사하고 1600px WebP로 바꾸며 메타데이터를 제거합니다. 매 파일 조회에서 그룹 권한을 확인하고 `private, no-store`로 응답합니다. S3/R2 어댑터는 실제 버킷 권한으로 별도 검증해야 합니다.

| 앱     | 오류 수집                                               | 사용자 행동 측정                |
| ------ | ------------------------------------------------------- | ------------------------------- |
| API    | `SENTRY_DSN`, 내부 GraphQL 오류·REST 5xx·주기 작업 실패 | 도메인 이벤트를 DB에만 기록     |
| 웹     | `NEXT_PUBLIC_SENTRY_DSN`, 서버는 `SENTRY_DSN` 우선      | `NEXT_PUBLIC_AMPLITUDE_API_KEY` |
| 모바일 | `EXPO_PUBLIC_SENTRY_DSN`                                | `EXPO_PUBLIC_AMPLITUDE_API_KEY` |

키가 없으면 전송하지 않습니다. 요청·쿠키·사용자 정보를 제거하고 분석 속성에 닉네임·설명·초대 토큰을 넣지 않습니다. 앱과 웹은 브리지의 기기 ID로 분석 사용자를 연결합니다. 실제 Sentry·Amplitude 프로젝트 수신은 별도 확인이 필요합니다.

공용 ESLint 설정은 저장소 `packages/eslint-config`에 있습니다. `corepack yarn workspace @side/eslint-config check`로 else·컴포넌트 fetch·오버레이 상태 금지와 FSD·인라인 핸들러 규칙의 RuleTester fixture를 검증합니다.

## 앱별 테스트

로컬에서는 별도 터미널에서 테스트 DB를 시작합니다. `db:test:local`은 `.data/test-postgres`·55434·`photo_contest_test`를 사용해 개발 DB와 분리합니다. 포트를 바꾸면 `.env`의 `LOCAL_TEST_POSTGRES_PORT`와 `TEST_DATABASE_URL`도 함께 바꾸세요.

```sh
corepack yarn workspace @side/photo-contest db:test:local
```

| 앱     | `test`                   | `test:api`                                | `test:e2e`                                                   |
| ------ | ------------------------ | ----------------------------------------- | ------------------------------------------------------------ |
| API    | 순수 규칙·사진 처리 unit | 없음                                      | Vitest + supertest + 실제 PostgreSQL, `test/e2e`             |
| 웹     | unit·실제 폼/캐시 UI     | 생성 GraphQL 문서를 격리 API에 실행(4321) | Pixel 7·iPhone 15(WebKit)·데스크톱·가짜 앱, 웹 3320/API 4320 |
| 모바일 | unit·UI                  | 앱 설정·상태 API(4331)                    | Android/iOS 가짜 WebView와 실제 웹, 웹 3330/API 4330         |
| bridge | 자체 Vitest              | 없음                                      | 없음                                                         |

```sh
corepack yarn workspace @side/photo-contest check
corepack yarn workspace @photo-contest/web lint
corepack yarn workspace @photo-contest/mobile lint
corepack yarn workspace @side/photo-contest test:api
corepack yarn workspace @photo-contest/web exec playwright install chromium webkit
corepack yarn workspace @side/photo-contest test:e2e
corepack yarn workspace @photo-contest/test-kit check:cleanup
corepack yarn build:photo-contest
corepack yarn format:check
```

모든 DB 레인은 `TEST_DATABASE_URL`을 우선 사용하고, 비어 있으면 로컬 `DATABASE_URL`만 허용합니다. 격리 스키마에 마이그레이션을 적용하고 종료 시 스키마·사진 폴더를 제거합니다. 검증용 API는 `.e2e-build`, Next는 `.next/e2e`·`.next/e2e-mobile`을 써 개발 서버와 겹치지 않습니다.

`/testing/users`(사용자+세션), `/testing/contests/:id/phase`(단계 이동), `/testing/app-login-tickets`(외부 성공 콜백 대체)은 `NODE_ENV=test`와 `ENABLE_TEST_API=true`에서만 열립니다. 개발·운영에서 활성화하면 서버가 시작을 거부합니다. 테스트 하네스가 설정하므로 개발 `.env`에서 켤 필요가 없습니다. 웹·모바일의 테스트 데이터는 이 API와 제품 API로 준비합니다.

보고서·trace는 각 앱의 `playwright-report`·`test-results`, 화면 캡처는 웹 앱의 `.data/screens`에 남습니다. CI는 앱별 레인과 WebKit 설치·테스트 DB·종료 후 정리 검사를 실행합니다.

실제 네이티브 빌드·실기기의 키보드/그룹/시스템 공유 시트와 외부 OAuth는 브라우저 테스트로 대체되지 않습니다. 제품 가설·베타 사용자 모집은 [기획](docs/product-plan.md), 코드와 검증 결과는 [구현 기록](docs/implementation.md)을 참고하세요.
