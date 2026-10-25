# 별사대 · 별난 사진 대회

친구들과 그룹을 만들고 사진·동영상·합성·유튜브와 일반 링크로 웃긴 순간을 나누는 커뮤니티입니다. 그룹은 종료일 없이 유지되며 멤버는 여러 게시물을 올릴 수 있습니다. 웹과 Expo WebView 앱이 같은 HttpOnly 세션과 GraphQL API를 사용합니다.

단일 VM의 운영 Docker·CD·백업·복구와 사용자가 준비할 설정은 [배포 안내](docs/deployment.md)에 있습니다. Game Feedback과 EC2·Caddy를 공유하고 RDS PostgreSQL·서비스별 S3를 사용한다. CI에서 AMD64 운영 이미지를 검증하며, 운영 배포는 브랜치와 활성화 값을 등록한 뒤에만 실행합니다. 운영은 소셜 로그인 없이 직접 가입을 사용합니다.

사진·동영상은 게시물의 저장 버튼으로 파일을 내려받습니다. 권한을 확인한 뒤 60초 presigned 다운로드 URL을 발급합니다. 파일 없이 링크만 등록하거나 파일과 링크를 함께 첨부할 수 있습니다. 유튜브 링크는 클릭 후 재생하며 일반 링크는 외부 주소로 엽니다. 자세한 계약은 [첨부·저장 안내](docs/post-attachments.md)를 따릅니다.

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

아이디·비밀번호로 가입하거나 익명으로 시작합니다. 소셜·개발 닉네임 로그인은 제공하지 않습니다. 다른 브라우저 프로필에서 친구 계정으로 초대 링크를 열어보세요.

## 구성과 기능

| 앱·패키지           | 역할                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/api`          | NestJS 12 schema-first GraphQL·인증/업로드 REST, Prisma 7·PostgreSQL                             |
| `apps/web`          | Next.js 16 App Router, Apollo Client 4, Base UI·RHF·Zod, 통합 게시물 피드·MY 그룹 관리·반응형 웹 |
| `apps/mobile`       | Expo SDK 57 WebView 셸, 시스템 브라우저 로그인·공유·클립보드·햅틱·딥링크                         |
| `packages/bridge`   | zod로 검사하는 앱↔웹 메시지 계약                                                                 |
| `packages/test-kit` | 테스트 DB 격리·API 기동·이미지·MP4·fixture 준비, 로컬 개발·테스트용 S3 호환 대역                 |

누구나 로그인 후 공개·비공개 그룹을 만들 수 있습니다. `/explore`에서 이름으로 탐색하며 초대 링크 없이도 그룹에 들어갑니다. `/sign`에서 익명으로 시작하거나 로그인·회원가입한 뒤 공개 그룹의 사진·동영상·댓글을 보고 바로 가입할 수 있습니다. 세션 없는 콘텐츠 진입은 `/sign`으로 이동합니다. 기존 익명 사용자는 로그인 화면의 익명으로 계속하기로 같은 세션을 유지합니다. 비공개 그룹은 익명으로 이용할 수 없다는 모달을 확인한 뒤 로그인합니다. 비공개 그룹은 관리자·부관리자가 가입 신청을 수락해야 내용을 볼 수 있으며, 초대 링크도 승인을 우회하지 않습니다. 기존 그룹은 비공개로 유지합니다. 모든 멤버가 초대 링크를 공유하고 관리자만 재발급할 수 있습니다. 홈은 가입한 모든 그룹의 사진·동영상을 최신순으로 모읍니다. MY에서 내 그룹을 보고 새 그룹을 만듭니다. `/groups/[id]/write`에서 제목·내용과 파일을 올리며, 게시물은 작성자와 관리자·부관리자가 삭제할 수 있습니다.

그룹 메뉴의 ‘대회’에서 관리자와 부관리자가 대회 제목·접수 기간·투표 마감을 정합니다. 글쓰기에서 일반 게시물 또는 접수 중인 대회를 선택하며 사진·동영상·합성으로 여러 번 참여할 수 있습니다. 그룹은 대회가 끝나도 유지됩니다. 투표는 그룹 멤버가 대회당 한 번 하고 본인 참여작에는 투표할 수 없습니다. 종료 후 ‘명예의 전당’에서 최종 순위와 우승작을 봅니다. 동점은 공동 우승이며 한 표도 없으면 우승작을 정하지 않습니다. 순위는 사진 밖에 표시합니다.

그룹의 ‘그룹 프로필 수정’에서 관리자·부관리자가 이름·소개(500자)·대표 사진을 변경합니다. 사진 선택 자리에 미리보기가 나오며 교체·삭제할 수 있습니다. JPEG/PNG/WebP 10MB 이하 원본을 그대로 올리며 서버는 변환하지 않습니다. 그룹 상단·탐색·MY에 반영하며 그룹 사진과 소개는 비공개 그룹도 탐색에서 보이는 메타데이터입니다. 비공개 게시물의 접근 권한은 유지합니다. 공개 그룹은 소개·대표 사진을 SEO·공유 메타데이터에 사용합니다.

대회 개최 시 ‘1인당 좋아요 한도’를 1~100개로 정하며 **기본값은 1개**입니다. 대회별·사용자별로 집계하고 여러 작품의 동시 요청도 서버의 Serializable 트랜잭션에서 검사합니다. 취소하면 다른 작품을 선택할 수 있습니다. 일반 게시물과 댓글 좋아요에는 이 한도가 적용되지 않고, 대회당 한 표인 최종 투표도 별도입니다. 숨긴 작품의 기존 좋아요도 한도에 포함합니다. 기존 대회는 마이그레이션으로 기본값 1을 받지만 저장된 좋아요는 지우지 않으며, 이미 한도를 넘은 사용자는 취소해 한도 미만이 되어야 새 작품을 고를 수 있습니다.

‘초대와 그룹 멤버’에서 그룹장이 부관리자를 임명·해제하거나 다른 멤버에게 관리자를 양도합니다. 부관리자는 개최·게시물/댓글 삭제·비공개 가입 승인을 맡고, 임명·양도·초대 재발급은 그룹장만 할 수 있습니다. 관리자 양도 시 이전 그룹장은 일반 멤버가 됩니다.

게시물에 댓글을 남길 수 있습니다. 댓글은 그룹의 공개 범위에 따라 조회하며 멤버만 작성할 수 있고 작성자와 관리자가 삭제합니다. 본문은 최대 1000자이고 최신순으로 24개씩 조회합니다. 멤버는 댓글에 좋아요를 누르거나 취소할 수 있고, 공개 그룹의 좋아요 수는 가입 전에도 보입니다. 같은 회원의 중복 요청은 하나의 반응으로 저장하며 댓글·게시물·사용자가 삭제되면 반응도 함께 정리합니다. 댓글 시트는 내 글과 다른 멤버의 글을 말풍선으로 구분하고, 게시물 작성자 표시·댓글 수·빈 목록 안내를 제공합니다. 입력창은 내용에 따라 늘어나며 전송 버튼과 함께 하단에 고정됩니다. 피드 맨 위에서 아래로 당겼다 놓으면 최신 글과 인기를 함께 새로 받습니다. 짧은 당김·가로 이동·입력·사진 확대는 새로고침을 실행하지 않습니다. 키보드 포커스 시 새로고침 조작도 제공합니다. 바텀시트는 화면 너비를 채우며 폼에는 필수·선택 여부를 표시합니다.

‘이달의 인기’는 한국 시간 기준 이번 달에 올라온 게시물 중 좋아요가 많은 순서로 3개를 보여 줍니다. 동률이면 작성 시각·ID 내림차순입니다. 최신 게시물은 24개씩 더 불러옵니다. 그룹·정렬별 Apollo 캐시를 분리하고 가입·작성·삭제 뒤 목록을 다시 받습니다.

게시물은 서명된 POST로 저장소에 직접 업로드하고 완료 확인을 거쳐 등록합니다. 서버는 형식(JPEG/PNG/WebP·MP4/WebM)과 크기(사진 10MB·동영상 100MB)를 발급할 때 정하고, 완료할 때 저장소 HEAD로 크기·형식만 확인합니다. 파일 내용을 읽거나 변환하지 않습니다. 브라우저가 읽을 수 있는 사진은 전송 전에 줄이고, 동영상은 브라우저가 읽은 길이로 5분 이하만 올립니다. 파일은 비공개 버킷에 두며 `/backend/media/:id`는 매번 그룹의 공개 범위와 멤버십을 확인한 뒤 60초 서명 GET으로 보냅니다. 재생·탐색의 Range는 저장소가 처리합니다. 사용하지 않은 업로드와 삭제 실패 파일은 정리 작업이 재시도합니다.

웹은 최대 1440px이며 게시물은 모바일·태블릿 최대 540px, 데스크톱 최대 680px의 1열 피드입니다. 흑백 UI·여백·명확한 글자 위계를 사용하고 제목·사진·본문을 펼쳐 보여 줍니다. 인기 게시물은 순위가 붙은 사각형 미리보기이며 프로필에 스토리 장식 테두리를 두지 않습니다. 데스크톱은 왼쪽 고정 메뉴와 오른쪽 인기 사진, 모바일·태블릿은 하단 메뉴와 피드 위의 인기 목록을 보여 줍니다. 최신·인기 조회는 별도 Suspense/실패 경계를 가지며 RSC에서 미리 준비합니다. 고정 메뉴와 정렬 항목은 JSX로 직접 선언합니다.

기존 대회 사진·숨김·작성 시각·좋아요는 `20261015090000_gallery_posts`가 그룹 게시물로 복사합니다. 기존 테이블과 대회 URL은 보존합니다. 새 그룹의 작성 흐름은 대회나 마감일에 의존하지 않습니다. 개발 DB에는 검토 후 위 `db:migrate` 명령을 실행하세요.

인기 목록은 기기와 관계없이 왼쪽부터 순위·사진·내용 순서로 한 줄씩 표시하고, 기존 대회 순위는 사진 아래에 표시합니다. favicon은 윙크하며 웃는 얼굴의 흑백 아이콘을 사용한 `apps/web/src/app/icon.svg`이며 Next.js가 아이콘 메타데이터를 생성합니다. 모바일 상단과 데스크톱 메뉴의 브랜드 아이콘도 같은 SVG를 사용합니다.

데스크톱에서는 피드·인기 목록을 카드로 구분하고 MY의 프로필·그룹을 좌우로 보여 줍니다. 그룹의 글쓰기 버튼은 스크롤 중에도 상단에 남으며, 초대·멤버 정보는 오른쪽에서 열 수 있습니다. 글쓰기 시트는 미디어·내용, 댓글 시트는 원본 게시물·대화를 나란히 보여 줍니다. 댓글은 화면 높이의 약 75%로 열리고 헤더를 위로 끌면 전체 높이로 펼쳐집니다. 별도의 확대·축소 아이콘은 두지 않습니다. 배경은 기본 상태에서도 살짝 어둡고 시트를 펼칠수록 더 어두워집니다. 헤더를 아래로 끌면 기본 크기로 돌아가며 입력창은 하단에 유지됩니다. 게시물 등록 뒤에는 목록 위로 돌아갑니다.

## 서비스 정책

이용약관(`/terms`)과 개인정보 처리방침(`/privacy`)은 로그인 없이 읽을 수 있습니다. 로그인 화면·MY·데스크톱 메뉴에서 연결하며, 운영자 김진건과 문의처 contact@bambyul.com은 `apps/web/src/_pages/legal/@page/model/policy.ts`에서 관리합니다.

두 문서는 검토용 초안입니다. 계정·미디어·인증 정보의 처리는 현재 구현을 기준으로 설명합니다. 정식 공개 전 실제 호스팅·저장소·분석 서비스의 위탁·국외 이전, 문의·운영 이력·백업 보관 기간과 아동 개인정보 처리 기준을 확인해 확정해야 합니다. 작성 시 [개인정보보호위원회의 2026년 개인정보 처리방침 작성지침](https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&nttId=12021)을 참고했습니다.

## 모바일 앱

Expo Go 대신 dev client 또는 스토어 빌드를 사용합니다.

```sh
corepack yarn workspace @photo-contest/mobile android
corepack yarn workspace @photo-contest/mobile ios
corepack yarn workspace @photo-contest/mobile start
corepack yarn workspace @photo-contest/mobile bundle:check
```

`WEB_ORIGIN`을 웹 주소로 설정하고 Android 에뮬레이터에서는 `adb reverse tcp:3200 tcp:3200`을 사용합니다. 쿠키는 WebView가 보관합니다. 최소 버전 확인 실패는 시작을 막지 않습니다. 모바일도 프로젝트 루트 `.env`의 공개 Sentry·Amplitude 키를 사용합니다.

## 인증·저장소·모니터링

로그인 화면에서 직접 정한 아이디·비밀번호로 회원가입하거나 로그인할 수 있습니다. 아이디는 영문·숫자·밑줄 3~24자로 대소문자를 구분하지 않으며, 가입 비밀번호는 8~128자입니다. 서버는 임의 salt를 쓴 scrypt 해시만 저장하고 기존 HttpOnly 세션 쿠키를 발급합니다. 반복 시도는 DB에서 제한합니다.

현재 제품은 아이디·비밀번호와 익명 세션으로 이용하며 소셜 로그인 설정은 필요하지 않습니다. 로컬·운영 환경변수 예제와 배포 컨테이너에서도 소셜 제공자 키를 요구하지 않습니다. `.env` 변경은 다음 개발 서버 시작 때 반영됩니다.

운영은 `NODE_ENV=production`, HTTPS `WEB_ORIGIN`, `DATABASE_URL`, private S3 호환 버킷(`S3_BUCKET`과 자격 증명)이 필요합니다. 버킷 CORS에 웹 origin의 POST를 허용합니다. 별도 컨테이너에서 API를 실행하면 `API_HOST`를 명시하고 웹 프록시를 통해 접근하게 구성합니다.

모든 사진·동영상은 S3 presigned URL로만 오갑니다. 웹 게시물은 requestPostUpload → 저장소 FormData POST → completePostUpload → createPost, 기존 대회 제출은 requestUploadUrl → POST → completeSubmissionUpload → createSubmission, 그룹 대표 사진은 requestGroupAvatarUpload → POST → completeGroupAvatarUpload → updateGroupProfile 순서이며 저장소에 세션 쿠키를 보내지 않습니다. POST 정책이 최종 키·형식·정확한 크기를 고정하고 완료는 HEAD로 확인합니다. API는 파일을 받거나 읽거나 변환·중계하지 않으며 메타데이터도 제거하지 않으므로 공개 전에 확인해야 합니다. 게시물·대회 사진·대표 사진의 고정 경로는 매 요청 권한을 확인하고 `private, no-store` 307로 60초 서명 GET에 보냅니다. 서버 HTML·공개 캐시에는 만료되는 주소 대신 고정 경로만 남습니다. 실제 S3 객체·CORS·IAM 검증은 운영 환경에서 별도로 진행합니다.

로컬 개발과 테스트는 Docker 없이 `@photo-contest/test-kit`의 S3 호환 대역을 씁니다(MinIO로 옮기기 전까지의 임시 대역). `.env.example`의 `S3_*`·`AWS_*` 값을 `.env`에 옮기면 `dev`가 대역을 4210 포트로 함께 띄우고 객체는 `.data/s3`에 저장합니다. 따로 띄우려면 `corepack yarn workspace @photo-contest/test-kit s3`를 실행합니다. 예전 `STORAGE_BACKEND`·`STORAGE_DIR`은 쓰지 않으며, 기존 로컬 사진(`.data/photos`)을 계속 보려면 `.data/s3/photo-contest-dev/`로 옮깁니다. Android 에뮬레이터에서 사진을 보려면 `adb reverse tcp:4210 tcp:4210`도 추가합니다. 테스트 레인은 빈 포트에 대역을 자동으로 띄우고 끝나면 지웁니다.

| 앱     | 오류 수집                                               | 사용자 행동 측정                |
| ------ | ------------------------------------------------------- | ------------------------------- |
| API    | `SENTRY_DSN`, 내부 GraphQL 오류·REST 5xx·주기 작업 실패 | 도메인 이벤트를 DB에만 기록     |
| 웹     | `NEXT_PUBLIC_SENTRY_DSN`, 서버는 `SENTRY_DSN` 우선      | `NEXT_PUBLIC_AMPLITUDE_API_KEY` |
| 모바일 | `NEXT_PUBLIC_SENTRY_DSN`                                | `NEXT_PUBLIC_AMPLITUDE_API_KEY` |

API Sentry의 실제 수집 확인은 `corepack yarn workspace @side/photo-contest sentry:check`로 한다. 설정한 DSN으로 확인용 이벤트 1건을 보내고 2xx 응답과 eventId를 출력한다. Sentry에서 `verification:configuration-check`, `service:photo-contest` 태그로 찾는다. 브라우저 키는 개발 서버 재시작 또는 운영 웹 재빌드가 필요하다. [부하테스트 예제와 지표](docs/load-testing.md)도 참고한다.

GraphQL IDE는 제공하지 않고 운영에서는 introspection과 오류 stacktrace도 차단한다. 개발에서만 스키마 조회를 허용하며 API의 운영 모드 HTTP 통합 테스트로 확인한다.

키가 없으면 전송하지 않습니다. 요청·쿠키·사용자 정보를 제거하고 분석 속성에 닉네임·설명·초대 토큰을 넣지 않습니다. 앱과 웹은 브리지의 기기 ID로 분석 사용자를 연결합니다. 실제 Sentry·Amplitude 프로젝트 수신은 별도 확인이 필요합니다.

공용 ESLint 설정은 저장소 `packages/eslint-config`에 있습니다. `corepack yarn workspace @side/eslint-config check`로 else·컴포넌트 fetch·오버레이 상태 금지와 FSD·인라인 핸들러 규칙의 RuleTester fixture를 검증합니다.

## 앱별 테스트

로컬에서는 별도 터미널에서 테스트 DB를 시작합니다. `db:test:local`은 `.data/test-postgres`·55434·`photo_contest_test`를 사용해 개발 DB와 분리합니다. 포트를 바꾸면 `.env`의 `LOCAL_TEST_POSTGRES_PORT`와 `TEST_DATABASE_URL`도 함께 바꾸세요.

```sh
corepack yarn workspace @side/photo-contest db:test:local
```

| 앱     | `test`                     | `test:api`                                | `test:e2e`                                                                                                                |
| ------ | -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| API    | 순수 규칙·저장소 서명 unit | 없음                                      | `test:integration`: Vitest + supertest + 실제 PostgreSQL, 구현 옆 `*.integration.{spec,test}.ts` (`test:e2e`는 호환 이름) |
| 웹     | unit·실제 폼/캐시 UI       | 생성 GraphQL 문서를 격리 API에 실행(4321) | Pixel 7·iPhone 15(WebKit)·데스크톱·가짜 앱, 웹 3320/API 4320                                                              |
| 모바일 | unit·UI                    | 앱 설정·상태 API(4331)                    | Android/iOS 가짜 WebView와 실제 웹, 웹 3330/API 4330                                                                      |
| bridge | 자체 Vitest                | 없음                                      | 없음                                                                                                                      |

```sh
corepack yarn workspace @side/photo-contest check
corepack yarn workspace @photo-contest/web lint
corepack yarn workspace @photo-contest/mobile lint
corepack yarn workspace @photo-contest/api test:integration
corepack yarn workspace @side/photo-contest test:api
corepack yarn workspace @photo-contest/web exec playwright install chromium webkit
corepack yarn workspace @side/photo-contest test:e2e
corepack yarn workspace @photo-contest/web test:cache
corepack yarn workspace @photo-contest/test-kit check:cleanup
corepack yarn build:photo-contest
corepack yarn format:check
```

모든 DB 레인은 `TEST_DATABASE_URL`만 사용합니다. loopback·전용 포트(`LOCAL_TEST_POSTGRES_PORT`, 기본 55434)·`photo_contest_test`가 아니면 거부하고 개발 DB로 대신하지 않습니다. 격리 스키마에 마이그레이션을 적용하고 종료 시 스키마·사진 폴더를 제거합니다. 웹 브라우저 E2E는 실제 production build/standalone 서버를 실행합니다. 검증용 API는 `.e2e-build`, Next는 `.next/e2e`·`.next/e2e-mobile`을 써 개발 서버와 겹치지 않습니다.

/testing/users와 /testing/contests/:id/phase는 격리 실행기가 createApp({ testFixtures: true })로 등록할 때만 열립니다. NODE_ENV=test만 설정한 일반 서버에는 없습니다. 테스트 밖에서 등록하면 시작을 거부합니다.

보고서·trace는 각 앱의 `playwright-report`·`test-results`, 화면 캡처는 웹 앱의 `.data/screens`에 남습니다. CI는 앱별 레인과 WebKit 설치·테스트 DB·종료 후 정리 검사를 실행합니다.

공개 그룹·대회 목록·대회 상세·명예의 전당에는 canonical·OG/Twitter·JSON-LD와 서버 HTML을 제공합니다. 사이트맵에는 공개 그룹과 공개 대회만 포함하고 비공개 대회는 로그인한 그룹장에게도 noindex·구조화 데이터 제외를 적용합니다. 도메인 설정과 검증 방법은 [SEO 안내](docs/seo.md)를 참고하세요.

실제 네이티브 빌드·실기기의 키보드/그룹/시스템 공유 시트와 외부 OAuth는 브라우저 테스트로 대체되지 않습니다. 제품 가설·베타 사용자 모집은 [기획](docs/product-plan.md), 코드와 검증 결과는 [구현 기록](docs/implementation.md)을 참고하세요.

새 기능 사양은 단위·통합 모두 `.spec.ts(x)`를 사용합니다. 기존 API `test:e2e` 명령은 `test:integration`에 위임하는 호환 이름입니다. 이번 변경은 `20261020010000_group_contests` 마이그레이션을 포함하며 기존 Contest는 LEGACY, 일반 Post는 contestId=null로 보존합니다.

공개 SEO 콘텐츠는 Next Data Cache에서 30초, 사이트맵 데이터는 60초 주기로 재검증하며 웹의 쓰기 성공 뒤 즉시 만료시킵니다. 공개 여부·대회 일정과 로그인 사용자별 조회는 매번 확인합니다. 운영 Caddy의 GraphQL 경로도 Web을 거쳐야 하므로 [배포 안내](docs/deployment.md)에 따라 프록시 설정을 함께 갱신합니다. 실제 standalone 캐시 검증은 앱의 test:cache가 소유합니다.

댓글 좋아요의 `20261022120000_post_comment_likes` 마이그레이션은 기존 댓글을 보존하고 관계 테이블만 추가합니다. 개발 환경에서는 `yarn workspace @side/photo-contest db:migrate`를 적용한 뒤 API·웹을 재시작합니다. 테스트는 격리 스키마에 적용하며 개발 DB에는 자동으로 적용하지 않습니다.

게시물의 관리 동작은 카드 오른쪽 `⋯` 메뉴에 모았습니다. 작성자·관리자는 제목·내용·카테고리를 수정하거나 삭제하며, 관리자만 숨길 수 있습니다. 숨긴 게시물 관리에서 다시 공개할 수 있습니다. 미디어·대회 참여와 작성자는 수정 시 유지됩니다.

댓글에는 한 단계 답글을 달 수 있습니다. 원댓글은 최신순, 펼친 답글은 오래된 순으로 각각 페이지를 나누며 답글에도 좋아요·취소와 작성자·관리자 삭제를 제공합니다. 원댓글을 지우면 답글과 연결된 좋아요도 함께 삭제되므로 확인창에서 안내합니다. `postCommentCount(postId, parentId)`는 해당 목록의 개수, 게시물의 `commentCount`는 답글을 포함한 전체 개수입니다. Apollo는 `postId`와 `parentId`별로 목록을 분리합니다.

`20261022130000_post_comment_replies`는 nullable parentId와 같은 게시물 안의 댓글을 참조하는 복합 FK를 추가합니다. 기존 댓글은 원댓글로 유지합니다. 개발 DB는 앞서 안내한 `db:migrate`로 적용하며 테스트는 격리 스키마에서 확인합니다.

### Prisma 7

Prisma CLI·Client·PostgreSQL 어댑터는 7.10.1로 맞춘다. 앱의 `prisma.config.ts`가 프로젝트 `.env`를 명시적으로 읽고 CLI 연결 URL을 전달한다. `db:generate`는 DB URL 없이 실행할 수 있으며 `db push`는 Client를 자동 생성하지 않는다.

기존 CommonJS 빌드·운영 스크립트·생성 경로와 호환되도록 `prisma-client-js` 생성기를 유지한다. 런타임은 `createPrismaAdapter`를 통해 Rust 쿼리 엔진 없이 pg를 사용한다. URL의 `schema`는 ORM과 raw SQL 양쪽에, `connection_limit`은 pg 풀의 최대 연결 수에 전달한다. pg는 풀 대기와 연결에 같은 timeout을 쓰므로 `pool_timeout`을 우선하고 없으면 `connect_timeout`(기본 5초)을 쓴다. 운영 URL의 `sslcert`는 서버 CA로 읽고 인증서 검증을 유지한다. Serializable 커밋에서 어댑터가 직접 던지는 `TransactionWriteConflict`도 `P2034`와 같은 재시도 한도로 처리한다.
