# Game Mate

클래시로얄 플레이어가 플레이 고민을 올리고, 다른 사용자의 피드백을 받아 `도움됨`으로 표시하는 웹 서비스다. 한국어 중심의 비공개 알파를 구현하며 `/ko`, `/ja`, `/en` 경로를 준비한다. Expo WebView 모바일 앱도 같은 화면을 사용하며 공개 베타·추가 게임은 후속 단계다.

작성자와 1:1 대화를 시작하고 채팅함에서 이어 갈 수 있다. 대화와 메시지는 PostgreSQL에 보존하며 새 메시지·읽음 변경은 인증된 SSE 연결로 갱신한다. 상대 차단은 대화 조회와 메시지 전송에도 적용한다. 현재 구현·검증 상태는 [구현 기록](docs/implementation.md)에 구분해 남긴다.

## 게시판과 글쓰기

홈 `/:locale`은 모든 게임과 게시판의 글을 모은 **피드**다. 각 게임은 **피드백, 친추판매, 전투 모집, 게임코치, 자유게시판**의 다섯 메뉴를 공통으로 사용한다. `/:locale/boards/feedback`, `/friend-sale`, `/friendly`, `/coaching`, `/free`에서 종류별 글을 보고, 다른 게임은 같은 경로의 `game=<category-slug>`로 구분한다. 메뉴를 게임마다 복제하지 않고 활성 카테고리와 공통 게시판 설정을 조합한다. 계정 거래는 제공하지 않는다.

화면과 메뉴의 이름은 **홈**이다. 모바일 헤더에는 홈/가이드/채팅/프로필처럼 현재 화면 이름을 표시한다. 게임 이름 아래에 전체와 피드백/친추판매/전투 모집/게임코치/자유게시판을 같은 크기의 칩으로 나란히 표시하며, 선택한 칩을 강조하고 가로 스크롤로 이동한다. 언어를 변경하는 동안 테마를 유지하는 로딩 화면을 보여준다. 채팅은 정상 연결 문구를 생략하고 오프라인/재연결이 필요할 때만 상태를 표시한다.

헤더의 검색 아이콘은 `/:locale/search` 페이지를 엽니다. 현재 분류, 게임, 답변 상태, 전투 유형, 모집 유형과 검색어를 전달하고 검색 버튼 또는 Enter로 검색합니다. 검색 URL을 공유하거나 새로고침해도 조건을 유지하며 상세에서 돌아오면 검색 결과로 복귀합니다. 검색 결과 페이지는 noindex입니다. 모바일 본문에는 홈 타이틀을 반복하지 않습니다.

피드백 목록은 **전체 / 답변 대기 / 답변 있음** 칩으로 요청을 고릅니다. 선택은 `feedbackStatus=WAITING|ANSWERED`로 저장하고 검색, 상세에서 복귀, 새로고침에도 유지합니다. 답변 상태와 개수는 숨김·삭제된 답변과 차단한 사용자의 답변을 제외한 기준입니다. 카드에서 답변 상태, 두 줄의 본문, 조회수·등록시각과 답변 개수를 확인합니다. 목록을 불러오는 동안에도 제목·검색·글쓰기·필터는 유지하며 목록만 스켈레톤으로 표시합니다. 비로그인 HTML에도 선택한 상태와 글을 렌더하고 canonical은 해당 게임의 기본 피드백 목록을 가리킵니다.

전투 모집은 **1:1**과 **팀전**을 선택해 작성하고 수정할 수 있다. 분류 화면의 **전체 / 1:1 / 팀전** 칩으로 목록을 좁히고 검색을 함께 사용한다. 선택한 전투 유형에서 글쓰기를 열면 해당 유형이 기본값이며 목록·상세·비로그인 HTML에도 유형을 표시한다. 기존 `/boards/friendly` 링크는 유지하며 유형이 없는 기존 글은 전체 목록에 남긴다.

친추판매는 **판매 금액 (원)**을 입력한다. 1~10,000,000원의 정수를 저장하며 피드·게시판 카드와 상세에 표시하고 수정할 수 있다. 비워두면 **가격 협의**, 금액 정보가 없는 기존 글은 **판매 금액 미등록**으로 표시한다. 다른 게임도 같은 입력을 사용한다.

게임코치 목록은 **전체 / 수강생 모집 / 코치 구함**으로 필터링합니다. 선택한 모집 유형은 검색과 글쓰기의 기본값으로 이어집니다. 게임코치에서는 가르치는 사람이 **수강생 모집**, 배우려는 사람이 **코치 구함**을 선택한다. **시간당, 월 단위, 목표 점수 달성까지** 중 수강료 기준을 선택하고 원화 수강료 또는 희망 수강료를 입력한다. 목표 달성형은 목표 점수와 달성까지의 총금액을 저장한다. 금액을 비워두면 선택한 기준의 수강료 협의로 표시한다. 상세의 **코칭 상담**에서 작성자와 1:1 채팅을 시작한다. 코칭료 결제나 수강 완료를 처리하는 흐름은 없다.

홈의 **글쓰기**에서는 게임과 **분류**를 선택한다. 게임별 메뉴에서 글쓰기를 열면 해당 게임과 분류가 기본 선택되며, 분류는 피드백·친추판매·전투 모집·게임코치·자유게시판 사이에서 변경할 수 있다. 게임별 메뉴의 게임 선택은 유지한다. Quill의 굵게, 기울임, 밑줄, 취소선, 제목, 목록, 인용과 링크를 저장한다. **사진 삽입/동영상 삽입**으로 본문에 미디어를 넣고 수정과 새로고침에도 유지한다. JPEG/PNG/GIF/WebP/MP4/WebM, 파일당 25MB, 글당 미디어 10개를 지원한다. 공개 전에는 업로더만 보고, 등록 후에는 게시글의 공개/숨김/삭제와 차단 정책을 따른다. 덱 카드 목록은 표시하지 않는다.

친추판매·전투 모집의 글은 피드백 목록과 분리되고 작성자의 공개 프로필에서는 함께 확인할 수 있다. 상세에서 댓글을 남기거나 **채팅하기**로 대화를 시작한다. 글 작성자만 수정/삭제할 수 있고 기존 신고와 차단 정책도 적용된다.

채팅의 첨부 버튼으로 JPEG/PNG/GIF/WebP 이미지 또는 MP4/WebM 동영상을 보낸다. 파일당 최대 25MB이며 현재 화면은 메시지마다 파일 한 개를 선택한다. 본문 없이 파일만 보낼 수도 있고 실패한 전송의 파일과 초안을 유지한다. 이미지는 대화 안의 확대 창으로 열고 동영상은 재생 컨트롤을 사용한다. 모바일 Enter는 줄바꿈이며 전송 버튼으로 보낸다. 데스크톱 키보드에서만 Enter 전송/Shift+Enter 안내를 표시한다. 파일은 대화 참여자에게만 제공하며 차단/로그아웃/계정 삭제 정책을 적용한다.

## `.env` 변경 반영

로컬 설정은 **현재 실행하는 checkout의 `projects/game-feedback/.env`**에서 읽습니다. 저장소 루트 `.env`나 다른 worktree의 `.env`는 자동으로 공유하지 않습니다. Google client ID/secret과 문의 주소를 바꾼 뒤 실행 중인 개발 명령을 종료하고 저장소 루트에서 다시 실행합니다.

```sh
nvm use
corepack yarn workspace @side/game-feedback dev
```

이 집계 명령이 프로젝트 `.env`를 읽어 API와 웹에 전달합니다. 앱만 직접 실행하는 `@game-feedback/web dev`는 이 로더를 거치지 않습니다. API의 OAuth 제공자는 시작할 때 구성되고, 웹의 공개 설정은 번들에 들어가므로 두 프로세스를 다시 시작한 뒤 화면을 새로고침합니다. 부모 셸에 같은 환경변수를 이미 export했다면 그 값이 `.env`보다 우선하므로 함께 확인합니다.

```dotenv
GOOGLE_CLIENT_ID=<Google 웹 애플리케이션 client ID>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=http://localhost:3300/api/auth/google/callback
GAME_FEEDBACK_CONTACT_EMAIL=contact@bambyul.com
```

Google Cloud의 승인된 리디렉션 URI도 위 `GOOGLE_REDIRECT_URI`와 일치시킵니다. 별도 포트로 띄웠다면 해당 웹 포트를 사용합니다. 운영 callback은 `https://game.bambyul.com/api/auth/google/callback`이며 API 서브도메인으로 바꾸지 않습니다. Google 키를 브라우저용 `NEXT_PUBLIC_*` 변수에 넣지 않습니다.

운영의 로컬 개발 `.env`는 서버에 자동 반영되지 않습니다. 공유 배포의 `/srv/side-project/services/game-feedback/.env`에서 Google 설정을 바꾸고 컨테이너를 재생성해야 하며, 문의 주소 등 웹 번들 값은 GitHub Variable `GF_CONTACT_EMAIL` 변경 후 새 웹 이미지 빌드·배포가 필요합니다. 서비스의 기존 설정·검증된 이미지·DB를 유지하는 절차는 [공유 배포 문서](../../deploy/shared-instance/README.md)를 따릅니다.

## 계정 등록, 인증과 관리자 문의

게임 계정은 **설정 → 게임 계정 → 계정 등록**에서 사용자에게 등록한다. 글쓰기에 게임 프로필을 첨부하거나 게시글에 게임 프로필을 표시하지 않는다. 사용자 대표 Supercell 태그는 작성자/공개 프로필에서 확인한다. 등록만으로 인증되지 않으며 대표 태그를 바꾸면 기존 인증을 해제한다.

설정의 **프로필 인증 문의**와 문의 페이지의 **관리자에게 문의하기**는 담당 관리자와 기존 **비공개 1:1 채팅**을 연다. 같은 사용자의 문의 대화는 재사용하고 사용자는 채팅으로 문의 내용과 답변을 확인한다. 실제 관리자가 없는 환경은 문의 불가 오류를 표시하며 가짜 답변을 만들지 않는다. 미인증 사용자는 글쓰기 화면과 작성한 글 상세에서도 인증을 신청할 수 있고, 인증 없이도 글을 작성할 수 있다.

사용자 프로필과 채팅 상단의 **사용자 신고** 버튼에서 신고를 접수한다. **대화내역 삭제**는 확인한 마지막 메시지까지만 내 계정에서 제거하며 상대방 기록과 이후 새 메시지는 유지한다. 관리자는 별도 React/Vite 서비스 `apps/admin`에서 실행한다. `corepack yarn workspace @side/game-feedback admin:dev`로 http://127.0.0.1:3303 에서 열며 공개 Web/WebView에는 관리자 화면이나 메뉴가 없다. 관리자 REST API는 별도로 기존 관리자 권한 검증을 유지한다. 문의함의 채팅/처리 상태와 프로필 인증 승인/해제, 신고함의 검토/반려/콘텐츠 숨김, 사용자 밴/해제를 제공한다. 밴은 기존 세션에도 글쓰기/댓글/일반 채팅/업로드 제한을 적용하며 관리자 문의 채팅은 유지한다. 제재 사유와 관리자 조치는 감사 기록에 남긴다.

로컬에서는 테스트 토큰 API에 `sample-test-admin`을 전달해 관리자 화면을 확인한다. 일반 계정으로 문의한 후 운영테스터의 문의함에서 채팅 답변과 인증 처리를 테스트할 수 있다. 관리자 인증 표시는 수동 서비스 검토 결과이며 Supercell API의 계정 소유권 검증과 구분한다.

## 로컬 실행

저장소의 Node.js 24와 Yarn 4.17.0을 사용한다. 의존성은 기존 `node-modules` linker로 설치한다.

```sh
nvm use
corepack yarn install --immutable
cp projects/game-feedback/.env.example projects/game-feedback/.env
corepack yarn workspace @side/game-feedback dev:test
```

테스트 실행은 일반 서비스 UI에 예시 콘텐츠를 준비하고, 서버 API로 고정 계정의 테스트 토큰을 발급한다. 화면에 데모 가입 폼이나 계정 선택기, 테스트 배지는 표시하지 않는다. Web 진입점은 <http://localhost:3300/>, API는 <http://localhost:4300>이다. 첫 방문 언어는 브라우저 설정을 따른다. 한국어로 바로 보려면 <http://localhost:3300/ko>를 사용한다. Ctrl+C는 이 실행이 시작한 API와 Web을 종료한다. 로컬 PostgreSQL 데이터와 소유 프로세스는 유지되며 다음 명령으로 중지한다.

```sh
corepack yarn workspace @side/game-feedback db:stop
```

실제 소셜 로그인과 Supercell 제공자를 사용하려면 프로젝트 `.env`에 발급받은 값을 설정한 뒤 `corepack yarn workspace @side/game-feedback dev`를 실행한다. 일반 실행의 데모 모드는 꺼져 있다. 개발 실행은 계약 빌드, 전용 Prisma 생성, OpenAPI·SDK 자동 생성, 소유 DB 시작, Prisma 스키마 동기화, 카테고리 seed를 준비한다. 예시 콘텐츠는 명시적인 테스트 또는 기존 데모 실행에서만 추가한다.

로컬 Sentry·Amplitude 키는 같은 `projects/game-feedback/.env`에 넣는다. 앱별 실행 명령 대신 위 집계 명령으로 시작해야 Web/API에 함께 전달된다. [관측 설정과 수신 확인](docs/observability.md#로컬에서-먼저-확인하기)을 따른다. S3 직접 업로드를 확인하려면 같은 파일에 서버 전용 S3 설정을 넣고 [게시글·채팅 첨부 설정](docs/media-upload.md)에 따라 버킷 CORS를 적용한다.

## Web UI와 shadcn/ui

로그인은 가로 760px 이하의 모바일 웹과 앱 WebView에서 `/:locale/login` 페이지로 이동하고, 데스크톱에서는 중앙 선택창으로 열린다. 두 화면은 같은 Google·카카오·Discord·X 버튼을 공유하며 미설정 제공자는 준비 상태로 표시한다. 뒤로 가기와 로그인 완료 시 원래 화면·필터·언어를 유지하고, OAuth 복귀 주소는 같은 서비스의 언어 경로만 허용한다. 닉네임과 필수 약관 동의는 별도 `/:locale/onboarding` 페이지에서 받고 완료 후 원래 화면으로 돌아간다.

웹은 공통 `@side/design-system`의 **shadcn/ui Base UI / base-nova** 컴포넌트를 사용한다. 공통 패키지와 Web의 components.json은 같은 base-nova/neutral/lucide 설정을 사용하고 ui/utils alias는 공통 소스를 가리킨다. 설치 원본과 조정 범위는 [공통 shadcn 구성](../../packages/design-system/SHADCN.md)에 정리했다.

작성/수정/로그인/신고/언어/검색/채팅 폼은 Input, Textarea, NativeSelect, Checkbox를 사용한다. 버튼과 모달은 공통 shadcn 기반을 사용하며 피드 탭은 방향키로 조작할 수 있는 Tabs와 URL 상태를 연결한다. 분류/금액 입력과 WYSIWYG, 키보드 포커스, 중첩 모달, WebView의 16px 입력과 터치 영역을 유지한다. 색과 타이포그래피는 Photo Contest와 같은 공통 토큰에서 가져온다.

## 언어와 반응형 화면

첫 진입 `/`는 저장한 언어를 우선하고, 자동 선택이면 기기나 브라우저의 `Accept-Language`에서 한국어, 영어, 일본어를 선택한다. 지원하는 언어가 없으면 영어를 사용한다. 위치 권한이나 IP 조회는 사용하지 않는다. `/ko`, `/en`, `/ja`로 전달된 링크는 해당 언어와 상세 경로를 유지한다.

상단 지구본 또는 프로필 설정의 **언어**에서 **기기 설정에 맞춤**, **한국어**, **English**, **日本語**를 선택한다. 로그인 없이 바꿀 수 있고 선택은 서비스 전용 `gf_language` 쿠키에 저장되어 새로고침과 다음 접속에도 적용된다. 설정은 브라우저와 앱 WebView별로 저장하며 계정 간 동기화하지 않는다. 메뉴, 피드, 게시글 작성과 답변, 프로필, 채팅 등 주요 화면의 문구와 날짜 표시는 선택한 언어를 사용한다. 사용자 닉네임, 게시글과 메시지 원문은 자동 번역하지 않는다. 가이드와 약관 등 안내 본문은 한국어 원문임을 알리고 `lang="ko"`를 지정한다. 기존 원문 기준 canonical 정책을 유지한다.

모바일은 한 열, 태블릿과 데스크톱은 기존 여러 열 배치를 사용한다. 모바일 채팅 상세에서는 상단 공통 메뉴와 하단 탭을 숨기고 대화 헤더의 뒤로 가기로 목록에 복귀한다. 입력창과 모달은 visual viewport 높이를 따라가며 Safe Area를 반영한다. 입력 글자는 16px, 하단 메뉴와 주요 언어 선택은 최소 44px 조작 영역을 사용한다. 게시글과 프로필의 긴 내용은 화면 안에서 줄바꿈한다.

## 서버에서 테스트 토큰 발급하기

`dev:test`는 `GF_TEST_AUTH_ENABLED=true`, `GF_DEMO_MODE=false`로 시작한다. 로그인 화면은 X, 카카오, Discord, Google만 제공한다. 외부 소셜 인증을 거치지 않고 API 테스트를 하려면 다음 요청을 사용한다.

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

X, 카카오, Discord, Google의 로그인 시작은 `/api/auth/social/<provider>`, 콜백은 `/api/auth/social/<provider>/callback`이다. Google의 기존 `/api/auth/google`과 `/api/auth/google/callback`도 지원하며 기본 Google redirect URI는 기존 콜백이다. 환경변수의 redirect URI와 각 개발자 콘솔에 등록한 URL을 일치시킨다.

| 제공자  | 환경변수                                              | 기본 콜백                           | 요청 범위                          |
| ------- | ----------------------------------------------------- | ----------------------------------- | ---------------------------------- |
| X       | `X_CLIENT_ID`, `X_CLIENT_SECRET`                      | `/api/auth/social/x/callback`       | `tweet.read users.read`, PKCE S256 |
| 카카오  | `KAKAO_CLIENT_ID`(REST API 키), `KAKAO_CLIENT_SECRET` | `/api/auth/social/kakao/callback`   | 사용자 식별 ID                     |
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`          | `/api/auth/social/discord/callback` | `identify`                         |
| Google  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`            | `/api/auth/google/callback`         | `openid`, PKCE S256                |

제공자별 `*_REDIRECT_URI`로 콜백을 지정할 수 있다. 세션 API의 `socialProviders`가 서버 설정 상태를 전달하고 설정된 로그인 버튼만 동작한다. 제공자와 외부 사용자 ID를 묶어 계정을 식별하며 서비스 닉네임은 가입 단계에서 직접 입력한다. 네이티브 WebView도 선택한 제공자를 시스템 브라우저로 전달하고 기존 일회용 앱 티켓/PKCE 교환으로 복귀한다.

구현 기준은 [X OAuth 2.0](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)다. 로컬 검증은 가짜 제공자를 사용하며 실제 콘솔 키와 외부 계정 로그인은 별도로 확인해야 한다.

## 팔로우, 공개 열람과 조회수

공개 게시글의 목록, 본문과 댓글은 로그인 없이 읽을 수 있고 첫 HTML에도 포함한다. 작성과 수정은 로그인 흐름을 사용한다. 프로필에서 팔로우하면 이후의 새 게시글을 알림함으로 받고 사용자별 새 글 알림을 켜거나 끌 수 있다. 차단하면 양방향 팔로우를 해제하며 알림도 기존 콘텐츠 접근 정책으로 필터링한다. 알림함과 상단 알림 수는 30초 간격으로 갱신한다.

등록일시는 Asia/Seoul 기준의 `<time datetime>`과 JSON-LD `datePublished`로 제공한다. 조회수는 `/api/posts/:id/views`에서 같은 로그인 사용자 또는 브라우저 방문 ID를 24시간에 한 번 집계하고 새로고침/동시 재시도로 중복 증가하지 않는다. 조회수 변경은 글의 수정일을 바꾸지 않는다. 목록과 상세에 저장된 조회수를 표시하고 JSON-LD에도 ViewAction 수를 연결한다.

입력용 팝업은 핸들로 높이를 조절하는 공통 BottomSheet, 삭제와 차단처럼 버튼만 있는 확인은 중앙 모달을 사용한다. 별도 글쓰기 경로와 검색·채팅의 본문 입력은 각 화면에 유지한다.

## 명령

모든 명령은 저장소 루트에서 실행한다.

| 명령 뒤의 작업                                                                   | 실행 내용                                                                         |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `corepack yarn workspace @side/game-feedback setup`                              | 계약 및 Prisma 준비, 개발 DB 시작, 현재 Prisma 스키마 적용, 카테고리 seed         |
| `corepack yarn workspace @side/game-feedback typecheck` / `check`                | 계약/API/SDK/Bridge/Web/Mobile 타입 및 Web·Mobile FSD lint 검사 위임              |
| `corepack yarn workspace @side/game-feedback test`                               | API Vitest+Supertest, SDK 응답 검증, Web Vitest, Mobile Vitest 단위·UI 테스트     |
| `corepack yarn workspace @side/game-feedback test:e2e`                           | 테스트 DB 시작 및 Web 데모/테스트 토큰/프로덕션 프리패칭·Mobile Playwright 테스트 |
| `corepack yarn workspace @side/game-feedback build`                              | API/Web production build 및 Mobile Android/iOS Metro export                       |
| `corepack yarn workspace @side/game-feedback codegen`                            | 서버 계약 → OpenAPI → Orval Client 생성                                           |
| `corepack yarn workspace @side/game-feedback db:start` / `db:stop` / `db:status` | 개발 DB 소유 프로세스 관리                                                        |
| `corepack yarn workspace @side/game-feedback db:test:start` / `db:test:stop`     | 테스트 DB 관리                                                                    |
| `corepack yarn workspace @side/game-feedback db:sync`                            | 개발 DB URL 검증 후 `prisma db push --skip-generate`                              |

API만 검증하려면 `corepack yarn workspace @game-feedback/api test`를 실행한다. API가 전용 테스트 DB와 Prisma를 준비한 뒤 Vitest + Supertest 통합 테스트까지 실행한다. 자세한 명령과 격리 정책은 [API 테스트 가이드](apps/api/README.md)를 따른다.

## API 규격 자동 생성

`apps/api/openapi.json`은 REST 요청·응답·경로를 기술하는 OpenAPI 규격이다. 원본은 `packages/contracts`의 Zod 스키마와 API 경로 정의이며 JSON을 직접 편집하지 않는다. Orval이 이 규격에서 타입·클라이언트·Zod 응답 검증 코드를 만든다.

프로젝트의 `dev`/`dev:test`/`dev:demo`/`setup`, `check`/`typecheck`, `test`/`test:e2e`, `build`는 시작할 때 **계약 빌드 → Prisma 생성 → OpenAPI → SDK 생성**을 순서대로 실행한다. 실행 중 계약을 수정했다면 `codegen`을 다시 실행하거나 개발 서버를 다시 시작한다. 앱 워크스페이스의 개별 명령을 직접 실행하면 이 준비 단계는 실행하지 않는다.

`openapi.json`은 중간 생성 파일이므로 프로젝트 `.gitignore`에서 제외하고 Git에 올리지 않는다. 초기 체크아웃에서도 위 준비 단계가 원본 Zod 스키마와 API 경로 정의로 새로 생성한다. SDK 생성 코드는 API 변경 리뷰와 누락 검사를 위해 Git에 포함한다. CI는 규격과 SDK를 생성한 뒤 SDK diff와 SDK 소유 응답 검증 테스트를 검사한다. 생성 과정은 DB 접속이나 외부 API 호출이 필요 없다.

## 모바일 WebView 앱

`apps/mobile`은 Expo dev client로 실행하며 웹의 테스트 계정·게시글·댓글·채팅·공통 디자인을 그대로 사용한다. Metro는 8082, Android/iOS E2E는 Web 3302·API 4302와 별도 `gf_test_mobile_*` 스키마를 사용한다. API는 Vitest+Supertest, Web은 Vitest+Playwright, Mobile은 Vitest 단위·UI와 Playwright native host 검증을 소유한다.

```sh
# 웹 실행 후 별도 터미널에서
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

DB 실행기는 고정된 프로젝트 데이터 디렉터리만 관리한다. 포트가 다른 프로세스에 사용 중이면 종료하지 않고 실패한다. 스키마 동기화 실행기는 hostname, port, database, user, schema를 검증한다. 개발과 테스트 간 URL 교체, 원격 URL, 기존 서비스 DB는 허용하지 않는다. 외부 배포의 Migration 절차는 별도의 운영 설정과 검토가 필요하다.

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

## Next.js와 프리패칭 검증

Game Feedback Web은 Next.js 16.4.2를 사용한다. Cache Components와 Partial Prefetching을 활성화하고 URL 조회와 라우트 모션/알림 위치를 Suspense로 분리했다. 세션·언어·화면 모드의 private cache는 production 서버에서 요청 간 공유하지 않는다. 공개 글/프로필의 첫 HTML은 JavaScript 없이 본문과 SEO를 제공하며 클라이언트 이동에서는 본문을 스트리밍한다. 문서 접근 검사를 통해 없는 글과 차단된 사용자의 공개 경로는 HTML을 보내기 전에 404로 처리한다.

공개 게시글 상세는 `cacheTag`와 `cacheLife('max')`를 사용하며, NestJS에서 변경을 커밋한 뒤 Next.js의 `POST /_internal/cache/revalidate`가 `revalidateTag(tag, { expire: 0 })`로 만료한다. 실패한 콜백은 같은 트랜잭션에 저장한 DB 큐에서 재시도한다. 로컬 `dev` 명령은 Web/API가 공유하는 임시 비밀을 생성한다. 따로 실행한다면 두 프로세스에 같은 `GF_CACHE_REVALIDATION_SECRET`(32자 이상), API에 `GF_CACHE_REVALIDATION_URL=http://localhost:3300/_internal/cache/revalidate`를 설정한다. 운영은 `deploy/shared-instance/service.env.example`의 비밀을 `openssl rand -hex 32`로 생성해 서비스 `.env`에 저장한다. Compose가 양쪽에 비밀과 내부 콜백 주소를 전달하며 새 `CacheInvalidation` migration도 적용해야 한다. 자세한 동작과 검증은 [구현 기록](docs/implementation.md)을 참고한다.

`corepack yarn workspace @game-feedback/web test:prefetch`는 격리된 테스트 DB와 3353/4353 포트에서 production 빌드 + `@next/playwright`의 `instant()`를 검증한다. 테스트 빌드에만 `GF_PREFETCH_TESTING=true`로 Next testing API를 포함하고 일반 build에는 포함하지 않는다. 실행 중인 다른 서비스나 포트는 재사용하거나 종료하지 않는다.

테스트 토큰만 켠 실제 개발 모드의 채팅을 검증하려면 `corepack yarn workspace @game-feedback/web test:test-auth`를 실행한다. `GF_DEMO_MODE=false`, `GF_TEST_AUTH_ENABLED=true`인 별도 설정에서 플레이어 채팅과 일반/인증 문의의 전송·응답·목록/새로고침을 검사하며 프로젝트 `test:e2e`와 CI에도 포함한다.

관리자 실행·로그인·검증 절차는 [Admin README](apps/admin/README.md)를 참고한다. 운영 배포 준비 요청 이후 최초 migration을 포함하며 운영은 `migrate deploy`, 로컬은 전용 URL 가드를 거친 `db:sync`를 사용한다. 기존 로컬 DB를 초기화하거나 최초 migration을 중복 적용하지 않는다.

Photo Contest와 서울 EC2 한 대·Caddy를 공유하고 외부 AWS RDS PostgreSQL과 서비스별 S3 버킷을 사용한다. Docker/HTTPS, GitHub Actions CD, DB 권한 분리와 복구 절차는 [공통 운영 가이드](../../deploy/shared-instance/README.md)에 정리했다. 실제 AWS 생성과 공개 배포는 이 코드를 추가하는 것만으로 실행되지 않는다. 이전 Lightsail 구성은 단독 컨테이너 회귀 테스트용으로 보존한다.

API의 JSON 요청 DTO는 class-validator/class-transformer와 controller의 ValidationPipe가 검증하며 공개 도메인과 관리자 도메인의 controller/service를 분리한다. Zod 계약의 정규화와 중첩 JSON 규칙도 HTTP 경계에서 유지하고 응답 검증과 OpenAPI/SDK 생성은 기존 Zod 계약을 사용한다.

일반 Web Playwright·테스트 토큰·모바일 WebView 검사는 격리 API와 실제 production build/start를 사용한다. 프리패칭은 별도 test:prefetch에서 검증한다. 관측 검사는 기본 개발 모드와 `GF_OBSERVABILITY_PRODUCTION=true`인 production 모드를 지원하며 CI는 production 모드를 사용한다. 일반 dev 명령은 유지한다.

GET/HEAD 헬스체크는 세션 조회와 일반 요청 제한에서 분리한다. 업무 API의 읽기·쓰기·인증·업로드 제한은 유지한다.
