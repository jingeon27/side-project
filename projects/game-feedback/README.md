# Game Feedback

클래시로얄 플레이어가 플레이 고민을 올리고, 다른 사용자의 피드백을 받아 `도움됨`으로 표시하는 웹 서비스다. 한국어 중심의 비공개 알파를 구현하며 `/ko`, `/ja`, `/en` 경로를 준비한다. Expo WebView 모바일 앱도 같은 화면을 사용하며 공개 베타·추가 게임은 후속 단계다.

작성자와 1:1 대화를 시작하고 채팅함에서 이어 갈 수 있다. 대화와 메시지는 PostgreSQL에 보존하며 새 메시지·읽음 변경은 인증된 SSE 연결로 갱신한다. 상대 차단은 대화 조회와 메시지 전송에도 적용한다. 현재 구현·검증 상태는 [구현 기록](docs/implementation.md)에 구분해 남긴다.

## 게시판과 글쓰기

상단/왼쪽 메뉴와 모바일 하단 메뉴의 **게시판**에서 계정 거래, 친선전 모집, 친구 추가와 일반 판매를 선택한다. `/:locale/boards/account-trade`, `/friendly`, `/friends`, `/marketplace`가 각각의 목록이며 검색과 이전 글 보기를 지원한다. 로그인한 계정으로 **글쓰기**를 누르면 Quill 편집기에서 굵게, 기울임, 밑줄, 취소선, 제목, 목록, 인용과 링크를 작성할 수 있다. 저장한 서식은 수정과 새로고침에도 유지된다. 덱 카드 목록은 표시하지 않는다.

게시판 글은 피드백 라운지와 분리되고 작성자의 공개 프로필에서는 함께 확인할 수 있다. 상세에서 댓글을 남기거나 **채팅하기**로 대화를 시작한다. 글 작성자만 수정/삭제할 수 있고 기존 신고와 차단 정책도 적용된다.

채팅의 첨부 버튼으로 JPEG/PNG/GIF/WebP 이미지 또는 MP4/WebM 동영상을 보낸다. 파일당 최대 25MB이며 현재 화면은 메시지마다 파일 한 개를 선택한다. 본문 없이 파일만 보낼 수도 있고 실패한 전송의 파일과 초안을 유지한다. 이미지는 대화 안의 확대 창으로 열고 동영상은 재생 컨트롤을 사용한다. 모바일 Enter는 줄바꿈이며 전송 버튼으로 보낸다. 데스크톱 키보드에서만 Enter 전송/Shift+Enter 안내를 표시한다. 파일은 대화 참여자에게만 제공하며 차단/로그아웃/계정 삭제 정책을 적용한다.

## 로컬 실행

저장소의 Node.js 24와 Yarn 4.17.0을 사용한다. 의존성은 기존 `node-modules` linker로 설치한다.

```sh
nvm use
corepack yarn install --immutable
cp projects/game-feedback/.env.example projects/game-feedback/.env
corepack yarn workspace @side/game-feedback dev:demo
```

명시적 데모 실행은 외부 자격 증명 없이 가짜 로그인과 게임 프로필을 사용한다. Web 진입점은 <http://localhost:3300/>, API는 <http://localhost:4300>이다. 첫 방문 언어는 브라우저 설정을 따른다. 한국어로 바로 보려면 <http://localhost:3300/ko>를 사용한다. Ctrl+C는 이 실행이 시작한 API와 Web을 종료한다. 로컬 PostgreSQL 데이터와 소유 프로세스는 유지되며 다음 명령으로 중지한다.

```sh
corepack yarn workspace @side/game-feedback db:stop
```

실제 Google/Supercell 제공자를 사용하려면 프로젝트 `.env`에 발급받은 값을 설정한 뒤 `corepack yarn workspace @side/game-feedback dev`를 실행한다. 일반 실행의 데모 모드는 꺼져 있다. 개발 실행은 계약 빌드, 전용 Prisma 생성, 소유 DB 시작, Migration 적용, 카테고리 seed를 준비한다. 데모 샘플은 명시적 데모 실행에만 추가한다.

## 언어와 반응형 화면

첫 진입 `/`는 저장한 언어를 우선하고, 자동 선택이면 기기나 브라우저의 `Accept-Language`에서 한국어, 영어, 일본어를 선택한다. 지원하는 언어가 없으면 영어를 사용한다. 위치 권한이나 IP 조회는 사용하지 않는다. `/ko`, `/en`, `/ja`로 전달된 링크는 해당 언어와 상세 경로를 유지한다.

상단 지구본 또는 프로필 설정의 **언어**에서 **기기 설정에 맞춤**, **한국어**, **English**, **日本語**를 선택한다. 로그인 없이 바꿀 수 있고 선택은 서비스 전용 `gf_language` 쿠키에 저장되어 새로고침과 다음 접속에도 적용된다. 설정은 브라우저와 앱 WebView별로 저장하며 계정 간 동기화하지 않는다. 메뉴, 피드, 게시글 작성과 답변, 프로필, 채팅 등 주요 화면의 문구와 날짜 표시는 선택한 언어를 사용한다. 사용자 닉네임, 게시글과 메시지 원문은 자동 번역하지 않는다. 가이드와 약관 등 안내 본문은 한국어 원문임을 알리고 `lang="ko"`를 지정한다. 기존 원문 기준 canonical 정책을 유지한다.

모바일은 한 열, 태블릿과 데스크톱은 기존 여러 열 배치를 사용한다. 모바일 채팅 상세에서는 상단 공통 메뉴와 하단 탭을 숨기고 대화 헤더의 뒤로 가기로 목록에 복귀한다. 입력창과 모달은 visual viewport 높이를 따라가며 Safe Area를 반영한다. 입력 글자는 16px, 하단 메뉴와 주요 언어 선택은 최소 44px 조작 영역을 사용한다. 게시글과 프로필의 긴 내용은 화면 안에서 줄바꿈한다.

## 고정 테스트 계정으로 확인하기

`dev:demo` 실행 후 `/ko`에서 **로그인 / 시작하기**를 누르면 계정을 선택할 수 있다. 선택 즉시 해당 DB 사용자로 세션이 발급된다. `/ko/settings`의 **테스트 계정 전환**에서도 바꿀 수 있다.

| 선택 계정                           | 고정 ID             | 초기 상태                     |
| ----------------------------------- | ------------------- | ----------------------------- |
| 새벽의호그 · 테스트 플레이어로 시작 | `sample-user-0`     | 일반 사용자, 태그 `#2PP`      |
| 덱연구소 · 인증 코치로 시작         | `sample-user-3`     | 서비스 인증 예시, 태그 `#9QY` |
| 운영테스터 · 운영자 테스트로 시작   | `sample-test-admin` | 데모 운영자, 태그 미등록      |

새벽의호그로 게시글을 작성하고, 덱연구소로 전환해 댓글·채팅을 남긴 뒤 다시 새벽의호그로 돌아오면 작성자와 알림·대화 상태를 확인할 수 있다. 기본 샘플 게시글에는 댓글과 두 계정 사이의 대화가 저장돼 있다. 전환 시 이전 세션은 폐기하며 운영자 계정도 참여하지 않은 비공개 채팅을 읽을 수 없다.

모든 고정 계정은 테스트 계정으로 표시한다. **인증 유저 (테스트)**는 서비스 인증 배지의 예시이며 게임 계정 소유권은 `UNVERIFIED`다. 일반 Google 가입자는 인증되지 않은 상태로 시작한다. 대표 태그는 프로필 조회·저장 성공 후 사용자 정보와 게임 계정에 함께 반영하고 재로그인에도 유지한다. 태그 변경은 기존 게시글 스냅샷을 바꾸지 않는다.

고정 계정 목록·전환 API는 명시적 데모에서만 제공하고 production에서는 사용할 수 없다. 이 절의 초기 상태는 최초 생성 기준이며 이후 저장한 태그·운영자 인증 변경을 시작할 때 덮어쓰지 않는다.

## 명령

모든 명령은 저장소 루트에서 실행한다.

| 명령 뒤의 작업                                                                   | 실행 내용                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `corepack yarn workspace @side/game-feedback setup`                              | 계약 및 Prisma 준비, 개발 DB 시작, 검토된 Migration 적용, 카테고리 seed       |
| `corepack yarn workspace @side/game-feedback typecheck` / `check`                | 계약/API/SDK/Bridge/Web/Mobile 타입 및 Web·Mobile FSD lint 검사 위임          |
| `corepack yarn workspace @side/game-feedback test`                               | API Vitest+Supertest, SDK 응답 검증, Web Vitest, Mobile Vitest 단위·UI 테스트 |
| `corepack yarn workspace @side/game-feedback test:e2e`                           | 테스트 DB 시작 및 Web·Mobile 소유 Playwright 테스트                           |
| `corepack yarn workspace @side/game-feedback build`                              | API/Web production build 및 Mobile Android/iOS Metro export                   |
| `corepack yarn workspace @side/game-feedback codegen`                            | 서버 계약 → OpenAPI → Orval Client 생성                                       |
| `corepack yarn workspace @side/game-feedback db:start` / `db:stop` / `db:status` | 개발 DB 소유 프로세스 관리                                                    |
| `corepack yarn workspace @side/game-feedback db:test:start` / `db:test:stop`     | 테스트 DB 관리                                                                |
| `corepack yarn workspace @side/game-feedback db:migrate`                         | 개발 DB URL 검증 후 `prisma migrate deploy`                                   |

## 모바일 WebView 앱

`apps/mobile`은 Expo dev client로 실행하며 웹의 테스트 계정·게시글·댓글·채팅·공통 디자인을 그대로 사용한다. Metro는 8082, Android/iOS E2E는 Web 3302·API 4302와 별도 `gf_test_mobile_*` 스키마를 사용한다. API는 Vitest+Supertest, Web은 Vitest+Playwright, Mobile은 Vitest 단위·UI와 Playwright native host 검증을 소유한다.

```sh
# 웹 데모 실행 후 별도 터미널에서
adb reverse tcp:3300 tcp:3300
APP_VARIANT=development corepack yarn workspace @side/game-feedback mobile:android
# iOS
APP_VARIANT=development corepack yarn workspace @side/game-feedback mobile:ios
```

[모바일 실행·테스트 가이드](apps/mobile/README.md)에 origin 설정, 시스템 브라우저 Google 로그인, 뒤로 가기·딥링크·연결 복구와 실기기 확인 범위를 정리했다.

## 게시글·공개 프로필과 SEO

게시글 상세는 `/ko/posts/<id>`, 공개 플레이어 프로필은 `/ko/users/<id>`다. 설정의 공개 프로필 링크 또는 피드·게시글·답변·댓글의 작성자 이름에서 프로필로 이동하고 공개 요청·답변·도움됨 수와 작성글을 확인한다. 프로필 작성글은 실제 링크로 다음 페이지를 제공한다. 두 상세 페이지의 본문·제목·작성자 정보는 JavaScript 없이도 서버 HTML에 포함된다.

피드·가이드·약관·개인정보·문의·채팅·알림·설정에는 각각 title·description·keywords·canonical·Open Graph·Twitter 메타데이터를 둔다. 게시글은 실제 제목·요약·작성/수정 시각과 `DiscussionForumPosting`, 프로필은 닉네임·활동 수와 `ProfilePage`/`Person` 구조화 데이터를 생성한다. 공통 공유 이미지는 `/og`의 1200×630 PNG다. 없는/숨긴/삭제한 콘텐츠와 차단 상대는 메타데이터 조회에서도 404로 처리한다.

`GAME_FEEDBACK_SITE_URL`에는 서비스의 실제 공개 origin을 설정한다. 호스트 요청 헤더를 대표 도메인으로 사용하지 않는다. `GAME_FEEDBACK_INDEXING=true`, production, HTTPS, 데모 비활성 조건이 모두 충족될 때 공개 페이지의 색인·robots·sitemap을 연다. 기본 알파·개발·데모·테스트는 noindex이며 채팅·알림·설정과 테스트 계정 상세는 항상 noindex다. 실제 검색 공개·Search Console 등록은 배포와 별도다.

번역이 준비되지 않은 `/en`·`/ja`는 같은 내용의 `/ko`를 canonical로 지정하고 번역된 페이지처럼 hreflang을 광고하지 않는다. 검색·탭 URL은 피드의 대표 주소를 사용하고, 내용이 달라지는 프로필 cursor 페이지는 해당 URL을 canonical로 유지한다. sitemap은 공개 요청과 해당 작성자의 프로필을 중복 없이 싣고 개인 경로·테스트 계정은 제외한다. 대규모 목록에는 분할 sitemap이 필요하며 현재 범위를 넘거나 cursor가 반복되면 불완전한 XML을 성공으로 반환하지 않는다.

## 데이터 격리

개발 DB는 `127.0.0.1:55442/game_feedback`, 테스트 DB는 `127.0.0.1:55444/game_feedback_test`이며 서비스 전용 `game_feedback` 역할을 쓴다. bootstrap 관리자 자격 증명은 프로젝트 `.data`에만 저장하고 앱에 전달하지 않는다. 앱 역할에는 superuser·DB 생성·역할 생성 권한이 없다. DB의 TCP 연결은 loopback으로 한정한다.

DB 실행기는 고정된 프로젝트 데이터 디렉터리만 관리한다. 포트가 다른 프로세스에 사용 중이면 종료하지 않고 실패한다. Migration 실행기는 hostname, port, database, user, schema를 검증한다. 개발과 테스트 간 URL 교체, 원격 URL, 기존 서비스 DB는 허용하지 않는다. 외부 배포의 Migration 절차는 별도의 운영 설정과 검토가 필요하다.

DB 소유 프로세스가 실행 중이어도 PostgreSQL이 예기치 않게 종료되면 `db:status`가 실행 중으로 표시될 수 있다. 연결 오류가 계속되면 해당 개발·테스트 DB의 `db:stop` 후 `db:start`를 실행한다. 데이터는 유지되며 포트의 다른 프로세스를 종료할 필요는 없다.

## 문서

- [제품과 범위](docs/product.md)
- [구조와 데이터 흐름](docs/architecture.md)
- [REST 응답 Zod 검증·fallback 정책](packages/sdk/README.md)
- [구현 상태와 검증 범위](docs/implementation.md)
- [결정 기록](docs/decisions/0001-project-isolation.md)
- [Yarn 및 실행 방식](docs/decisions/0002-node-modules-runtime.md)
- [사용자가 제공한 MVP Plan v4.0 원문](docs/mvp-plan-v4.md)

사용자 모집, 실제 API 키와 출구 IP, 개인정보·약관 검토, 영어·일본어 공개 품질 검증은 코드 구현과 별도로 완료해야 한다.
