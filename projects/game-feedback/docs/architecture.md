# 구조

`jingeon27/side-project`의 `develop`을 기준으로 기존 Workspace 안에 `projects/game-feedback`를 추가한다. 저장소의 Node.js 24, Yarn 4.17.0과 `node-modules` linker를 유지한다. 루트 Workspace는 이미 `projects/*`, 하위 앱·패키지, 공용 `packages/*`를 포함한다.

| Workspace                  | 역할                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `@side/game-feedback`      | 안전한 로컬 DB·실행·검증 명령                                                          |
| `@game-feedback/web`       | Next.js App Router, React, 공통 디자인 시스템·Base UI, TanStack Query, React Hook Form |
| `@game-feedback/api`       | NestJS + Express, Zod 검증, Prisma, 외부 제공자 인터페이스                             |
| `@game-feedback/mobile`    | Expo 58·React Native WebView 셸, 앱 탐색·인증·연결 복구                                |
| `@game-feedback/bridge`    | Web/Mobile 메시지의 Zod 계약·bootstrap·dispatch                                        |
| `@game-feedback/contracts` | 서버 요청 검증 및 공유 데이터 계약                                                     |
| `@game-feedback/sdk`       | OpenAPI에서 Orval로 생성한 클라이언트 및 스키마                                        |

집계 패키지는 `test`, `build`, `typecheck`, `check`를 앱·패키지 명령에 위임한다. API가 DB URL 가드·단위·PostgreSQL 통합 테스트를 소유하고 Web이 캐시 경계 Vitest와 Playwright를 소유한다. 테스트 러너와 파일을 루트 또는 프로젝트 집계에 두지 않는다. 실행기는 `packageManager`와 같은 버전으로 직접 설치한 Yarn CLI를 사용하며 버전별 `.yarn/releases` 경로를 가정하지 않는다.

브라우저는 같은 출처의 `/api`를 호출하고 Next의 rewrite가 API로 전달한다. 이 구조로 HttpOnly 세션 쿠키와 OAuth callback이 Web 출처에 머문다. 로컬 Web은 3300, API는 4300이다. 비공개 알파에서는 한국어 콘텐츠를 우선하고 다른 locale의 준비 상태를 안내한다.

## Web FSD 구성

현재 저장소의 공통 ESLint preset에 따라 다음 5레이어를 사용한다. Next의 예약 디렉터리와 구분하기 위해 앱 조합과 화면에 `_app`·`_pages` 이름을 사용한다.

| 경로           | 책임                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------- |
| `src/app`      | 경로·locale·params를 공개 화면 진입점에 전달하는 Next 어댑터                                 |
| `src/_app`     | Query·Overlay·세션·SSE Provider 조합, 전역 스타일, 레이아웃 진입점                           |
| `src/_pages`   | 피드·요청 상세·채팅·설정·알림·안내 화면, 화면별 폼과 흐름                                    |
| `src/widgets`  | 공통 셸, 로그인·프로필 연결·요청 작성 workflow, 채팅 시작·실시간 연결 조합                   |
| `src/features` | auth·user·game-profile·post·answer·comment·category·notification·moderation·chat 서버 도메인 |
| `src/shared`   | REST transport·오류 문구, RHF/Zod 연결, 날짜, Dialog 등 도메인 비의존 UI                     |

`features/<domain>/api`에서 REST IO를 수행하고 `model/*.options.ts`에서 query options와 키를 정의한다. UI는 options factory를 `useQuery`/`useInfiniteQuery`에 직접 전달하며 같은 factory로 cache를 무효화한다. mutation 정책은 도메인의 mutationOptions 팩토리가 정의하고 호출부에서 useMutation으로 직접 조립한다. 화면이 성공 후 이동·닫기를 담당한다. 사용자별 조회는 사용자 ID로 scope를 나누고 불완전한 인자의 조회에는 skipToken을 사용한다.

서버·세션 상태는 TanStack Query, 폼은 RHF와 Zod, 모달은 overlay-kit을 사용한다. 공통 Base UI Dialog로 접근성·스타일을 조합하며 열림 boolean과 별도 mutation pending/error 상태를 복제하지 않는다. es-toolkit은 query prefix 구성, ts-pattern은 명시적인 화면 분기에 사용한다. 서버 데이터를 Zustand 등 별도 store에 복사하지 않는다. 사용자 ID별 OverlayProvider가 모달 상태를 소유해 다른 탭의 계정 전환·로그아웃 후 이전 계정의 초안·탈퇴 확인 입력을 폐기하고 SSE도 같은 수명으로 종료한다. 브라우저의 REST·HttpOnly 쿠키·SSE 계약과 Orval 생성 경로는 유지한다.

slice 외부 import는 public `index.ts`를 통한다. 공통 Next·FSD lint가 레이어 방향·공개 API·페이지 간 참조와 컴포넌트/핸들러 규칙을 검사하고, Web 로컬 규칙이 inline query-key·enum·타입 이름을 검사한다. 이 lint는 집계 check와 기존 CI에서 실행한다.

## 서비스 오류 경계

Web의 `shared/ui/ServiceErrorBoundary`는 설치된 Next 16.4의 `catchError`와 TanStack `QueryErrorResetBoundary`를 조합한다. Next의 redirect·notFound 제어 흐름은 프레임워크로 넘긴다. `ErrorRecovery`는 공통 디자인 시스템의 버튼과 토큰으로 영역 이름·재시도만 표시하고 예외 본문·응답 payload를 노출하지 않는다.

- `CommunityShell`의 본문·상단/하단 메뉴·양쪽 사이드바를 독립 경계로 나눈다. 본문은 계정·경로로 reset하며 Server Component도 포함하므로 재시도에 route refresh를 사용한다. `[locale]/error.tsx`는 셸 안쪽 라우트의 마지막 복구 경계이며 예약 라우트 파일은 `_app/errors`를 재수출한다.
- 피드 카드, 게시글·답변·댓글, 채팅 목록·대화창은 각각 실패한 영역만 재생성한다. 계정·대화 ID가 바뀌면 이전 오류 상태를 폐기한다. 대화 목록 실패 시 건강한 대화창의 초안과 상태는 유지된다. 채팅 오류 화면도 기존 반응형 레이아웃과 목록/대화창 표시 규칙을 따른다.
- 모든 overlay controller는 `openOverlay`로 연다. controller는 받은 `{ open, onOpenChange, onOpenChangeComplete }`를 시트·대화상자에 그대로 넘기고 닫을 때는 `onOpenChange(false)`만 부른다. overlay는 닫기 전환이 끝난 `onOpenChangeComplete(false)`에서 제거된다. provider 아래에 그려지는 포털도 별도 경계로 감싸며 controller 렌더 자체의 오류도 잡는다. 실패한 창은 공통 Dialog에서 재시도·닫기를 제공하고 본문과 다른 창을 유지한다. NativeBridge·가입 안내도 각각 경계를 두며 세션 Provider에는 서비스 복구 경계를 둔다.
- Mobile은 SafeAreaProvider 안에서 WebShellPage를 네이티브 경계로 감싼다. 렌더 오류 시 셸을 unmount해 OS listener·host를 정리하고 재시도에 서비스 초기 화면으로 재생성한다. 쿠키 저장소를 삭제하지 않는다. 문서 연결·renderer/content process 오류는 기존 WebView 복구가 별도로 처리한다.

React 경계는 렌더·라이프사이클 오류를 담당한다. REST 응답 검증·조회·mutation·폼 제출·SSE 연결의 예상 가능한 오류는 기존 도메인 처리에 남기며 전역 `throwOnError`로 바꾸지 않는다. 복구 callback이 실패하면 같은 오류 화면 안에서 재시도할 수 있고 다른 cache를 일괄 삭제하지 않는다.

## 공통 디자인 시스템

`packages/design-system`의 `@side/design-system`을 Photo Contest 웹과 함께 사용한다. 색·타이포·간격·모서리·그림자·포커스·터치 영역과 `cn` 충돌 규칙은 이 패키지가 소유한다. Photo Contest의 흑백 기본 UI와 오렌지 강조색을 공통 토큰으로 사용하며 앱 이름·게임 정보·화면 레이아웃은 각 앱에 남긴다.

공통 Button·IconButton·TextField·TextAreaField·FormField·Avatar·Badge·Spinner·Dialog를 named export로 제공한다. Next 전용 ButtonLink는 `/next`, CSS는 `/styles.css`로 공개한다. 공유 CSS는 자체 UI 소스의 Tailwind 검색도 선언해 소비 앱에서 패키지 클래스가 누락되지 않도록 한다. 프레임워크별 라우팅·서버 상태·인증·오버레이 수명은 공통 패키지에 넣지 않는다.

Game Feedback은 `shared/ui` 어댑터에서 기존 화면 API를 유지하고, CSS 진입점은 `src/_app/styles/tailwind.css`다. 앱별 CSS는 화면 도메인별로 분리하고 공통 색·버튼·입력·모달 스타일을 재정의하지 않는다. Photo Contest는 기존 public UI 경로에서 공통 구현을 re-export하고, 브라우저 뒤로 가기·WebView·portal 위치가 결합된 시트·확인창 동작은 앱에서 유지한다.

공통 패키지는 자체 lint·타입·UI 테스트를 소유한다. 양쪽 CI는 공통 패키지 check를 실행하고 공유 packages 변경에도 두 앱을 검증한다. 두 웹의 개발 서버·DB를 섞지 않는다.

## 서버 렌더링과 검색 메타데이터

`shared/seo`는 정적 페이지별 title·description·keywords와 canonical·Open Graph·Twitter, 구조화 데이터 직렬화·색인 정책을 소유한다. `features/*/api/*.server.ts`의 REST 조회를 `index.server.ts`에서 명시적으로 공개하며 client barrel과 분리한다. `_pages/post/index.server.tsx`와 `_pages/profile/index.server.tsx`는 같은 React request cache를 페이지와 `generateMetadata`에서 재사용한다. `src/app`은 이 진입점을 재수출한다. 공개 origin은 환경설정만 신뢰한다.

서버 transport는 SDK의 요청별 `baseUrl`로 고정된 API origin에 접근하고 Game Feedback 세션 cookie 하나만 전달한다. SDK의 Zod 파싱·fallback·no-store는 그대로 적용하며 전역 fetch 교체나 요청 간 세션 cache를 사용하지 않는다. 서버 세션은 `ServiceProviders` 안의 경계에서 준비해 QueryClient의 초기 세션을 만들고, 상세 초기 데이터는 동일 viewer일 때만 사용한다. 계정이 자동 갱신되는 경우에도 이전 요청 취소·private cache 제거 이후 새 세션을 확정하며 늦게 도착한 결과가 최신 로그인/로그아웃을 덮어쓰지 않는다.

`GET /api/users/:id`는 공개 author·가입 시각·보이는 요청/답변/도움됨 수만 반환한다. role·Google subject·약관·세션·운영 검증 시각은 공개하지 않는다. 작성글은 기존 `GET /api/posts?authorId=...`의 cursor 흐름을 사용한다. 공개/차단/비데모 사용자 필터를 기존 UserVisibilityService와 공유하며 숨김·삭제된 부모 게시글의 답변도 집계하지 않는다. DB schema 변경은 없다.

`DiscussionForumPosting`은 실제 게시글·보이는 답변/댓글, `ProfilePage`는 공개 프로필의 실제 활동 값을 사용한다. JSON-LD의 `<`·줄 구분자를 이스케이프해 사용자 본문이 script를 닫지 못하게 한다. `/og`, `/robots.txt`, `/sitemap.xml`은 `_app/seo`가 구현하고 예약 라우트는 어댑터만 둔다. 활성화된 sitemap은 인증 cookie 없이 공개 목록을 순회하며 최대 500 page/50,000 URL 범위와 cursor 진행을 검증한다.

## Mobile WebView 구성

`apps/mobile/src/_app`은 Provider와 셸 조합만 담당한다. `_pages/web-shell`은 UI·WebView 핸들러·OS 수명 주기를, `features/navigation`은 순수 URL 정책을, `features/bridge`는 native host와 PKCE 시스템 인증을 소유한다. 공통 계약은 `packages/bridge`에 두고 제품 화면은 Web FSD에서 렌더링한다.

세션 쿠키는 WebView에만 남는다. Google OAuth 시작 시 앱 challenge를 서버 attempt에 보존하고 완료 후 hashed AppLoginTicket을 발급한다. WebView가 verifier와 함께 REST 교환을 요청하면 Origin·challenge·2분 만료를 확인하고 원자적 delete로 한 번만 소비한다. 그 뒤 기존 SessionService가 HttpOnly 쿠키를 발급한다. 앱 교환으로 세션을 바꾸면 이전 SSE도 종료한다. OAuthAttempt와 AppLoginTicket은 현재 Prisma 스키마에서 관리한다.

API 테스트는 Vitest+Supertest가 소유한다. Web은 Vitest+Playwright, Mobile은 Vitest unit/UI와 실제 웹/API를 쓰는 Android/iOS Playwright host가 소유한다. Mobile E2E의 3302/4302·`.next/e2e-mobile`·`gf_test_mobile_*`는 Web E2E의 3301/4301과 분리한다. 실제 네이티브 모듈·서명·스토어 배포는 브라우저 테스트 범위 밖이다.

## API 모듈 구성

`apps/api/src/app.ts`는 애플리케이션 생성·HTTP 설정·미들웨어 등록·초기화만 담당한다. `AppModule.register(options)`는 실행별 설정을 만들고 DatabaseModule과 도메인 모듈을 조합한다. 도메인은 Controller에서 요청을 받고 Service에서 업무 동작을 수행하며, 공용 응답 presenter와 외부 제공자 구현도 소유 도메인에 둔다.

| 도메인          | 책임                                                      |
| --------------- | --------------------------------------------------------- |
| `auth`          | 소셜·데모 인증, 가입, 세션 생성·조회·교체·종료, 계정 삭제 |
| `users`         | 사용자 인증 표시, 공개 사용자 presenter, 조회 제외 사용자 |
| `posts`         | 요청 CRUD와 상세·목록·답변 읽음                           |
| `answers`       | 피드백 답변 CRUD와 도움됨                                 |
| `comments`      | 일반 댓글 CRUD                                            |
| `categories`    | 활성 카테고리 조회와 관리자 생성                          |
| `game-profiles` | 게임 프로필 제공자, 조회·연결과 대표 태그 저장            |
| `notifications` | 알림 조회와 읽음                                          |
| `blocks`        | 사용자 차단·해제와 차단 목록                              |
| `moderation`    | 콘텐츠 신고·숨김과 관리자 신고 조회                       |
| `chat`          | 대화·메시지·읽음, SSE와 채팅 연결 수명                    |
| `health`        | DB 연결 상태 확인                                         |

`config`는 AppConfig와 `APP_CONFIG` 토큰, `database`는 전용 PrismaClient와 소유권에 따른 종료를 제공한다. `common`에는 검증·페이지네이션·HTTP 오류·쿠키·출처 검사 등 도메인에 의존하지 않는 공통 처리를 둔다. 인증 권한 검사는 `auth/session/session-access.ts`의 상태 없는 함수가 요청의 세션을 확인한다. 기존 `security.ts`는 이전 테스트·seed 소비자를 위한 export 호환 진입점이며 구현을 담지 않는다.

Service는 명시적인 `@Inject` 토큰으로 PrismaClient·AppConfig·필요한 도메인 Service를 받는다. ModerationService는 PostsService·AnswersService·CommentsService의 기존 접근 검사를 호출하며, 도메인 전반을 포괄하는 GameService는 사용하지 않는다. HTTP 경로·상태·오류 코드·SQL·트랜잭션과 생성 계약은 유지한다.

auth는 oauth·session·app-login·account, chat은 conversation·message·attachment·events, posts는 media·views, users는 profile·visibility로 함께 바뀌는 구현과 테스트를 묶는다. 여러 책임을 조합하는 controller/module·공통 DTO/presenter는 root에 둔다. 폴더마다 module이나 export barrel을 만들지 않고 기존 Nest module 경계와 exports를 유지한다.

APP_CONFIG는 실행 설정과 명시적 테스트 제공자 override를 보관한다. AuthModule의 IDENTITY_PROVIDERS factory가 OAuth 구현을 만들고 IdentityProviderRegistry로 제공자 선택과 세션의 configured 표시를 일치시킨다. GameProfilesModule의 PROFILE_PROVIDER factory가 기존 profile override·데모·실제 토큰·테스트 인증 우선순위를 유지한다. 외부 오류는 OAuthException·ProfileException에서 ApiError로 전달하며 HTTP 상태와 `{ errorCode, message }`는 바뀌지 않는다.

## 인증과 도메인

Google 제공자는 OAuth code를 검증해 `sub`를 서비스 계정과 연결한다. Google scope는 `openid`만 사용하고, Discord·카카오는 사용자 ID 조회에 필요한 최소 scope(`identify`, 없음)만 요청한다. 공개 이름·사진·이메일은 자동 수집하지 않는다. 닉네임은 서비스 가입 입력으로 정하고 재로그인에도 유지한다. 세션은 HttpOnly 쿠키 `gamefeedback_session`으로 전달한다. production 쿠키는 HTTPS/Secure 설정을 전제로 한다.

Category는 DB에서 관리하고 카테고리 생성은 관리자만 수행한다. 공유 계약인 GameProfile은 정규화한 Player Tag와 게임 데이터를 표현하며 Prisma의 GameAccount는 사용자의 연결 프로필을 저장한다. 초기 소유권은 UNVERIFIED다. 피드백 요청에는 조회 시점 프로필·덱의 스냅샷을 보존해 이후 변경과 분리한다.

사용자 모델의 `isVerified`, `verifiedAt`, `supercellTag`는 DB에 보존한다. 응답의 `isTestAccount`는 서버의 데모 계정 정보로부터 결정하며 클라이언트 입력을 받지 않는다. 서비스 인증은 관리자만 변경하고, 일반 가입·로그인·프로필 입력은 이 권한을 부여하지 않는다. 게임 계정의 `UNVERIFIED` 소유권 상태와 의미를 구분한다. 대표 태그와 GameAccount는 제공자 조회 성공 후 하나의 DB transaction으로 갱신하고 기존 요청 스냅샷을 수정하지 않는다.

고정 테스트 계정 선택은 서버 allowlist의 사용자만 세션에 연결한다. 이 경로는 명시적 데모 모드와 비운영 환경에 한정한다. 정상 Google 세션과 동일한 작성자·참여자 권한 검사를 통과해야 하며 사용자 ID를 임의로 주입해 다른 계정으로 전환할 수 없다. 일반 모드의 테스트 계정 진입점과 데모 데이터는 비노출한다.

API는 `GET /api/auth/test-accounts`, `POST /api/auth/test-login`과 관리자 전용 `PATCH /api/admin/users/:id/verification`을 제공한다. 세션 전환은 이전 세션 토큰을 폐기하고 새 세션을 발급한다. 사용자 인증 변경은 AuditLog에 남긴다.

요청, 답변, 댓글은 작성자 권한을 서버에서 검사한다. 요청자만 자신의 요청에 달린 답변을 도움됨으로 표시한다. 답변 알림은 DB에 저장하며 확인 여부도 서버 상태로 관리한다. 차단 관계와 숨김 상태는 조회 및 작성 흐름에 반영한다.

## 영속 1:1 채팅

채팅은 REST로 대화·메시지를 읽고 쓰며, 같은 출처 `/api/chat/events`의 인증된 SSE로 상태 변경을 전달한다. 메시지 원본과 읽음 경계는 PostgreSQL에 보존한다. 서버 변경 이벤트를 받으면 관련 TanStack Query 조회를 갱신하므로 SSE 재연결 이후에도 DB가 진실의 원천이다.

대화 참여자 쌍은 사용자 ID를 정렬한 canonical pair와 DB unique 제약으로 정한다. 동시에 시작해도 같은 두 사람 사이에 방 하나만 생성한다. 모든 대화·메시지 경로에서 참여자와 양방향 차단 관계를 먼저 검사한다. 메시지 재전송은 발신자와 UUID `clientMessageId`로 중복을 막으며, 다른 대화의 기존 메시지를 반환해 정보를 노출하지 않는다.

읽음 요청은 필수 `messageId` 경계를 가진다. 서버는 그 메시지가 해당 대화에 속하는지 확인하고 경계를 앞으로만 이동한다. 요청 처리 중 도착한 더 최신 메시지는 이 경계에 포함하지 않는다. 이벤트 스트림은 세션 쿠키로 인증하고 로그아웃·세션 만료·탈퇴 후 종료한다. 차단 후에는 대화 노출과 전송을 모두 거부한다.

ApiAccessMiddleware가 세션을 읽은 다음 ChatLifecycleMiddleware가 현재 사용자·세션 토큰과 탈퇴 시 대화 상대를 컨트롤러 실행 전에 보존한다. 상태 200의 응답이 완료된 뒤 세션 교체·로그아웃·탈퇴의 스트림 종료와 차단 변경 갱신을 전달한다. ChatEvents는 모듈 종료 시 `onModuleDestroy`에서 모든 SSE를 닫는다.

채팅 본문을 제3자 이벤트·오류 로그에 첨부하지 않는다. SSE 상태는 단일 API 프로세스 내에서 전달하므로 다중 인스턴스 배포에는 공유 pub/sub와 재연결·순서·중복 처리를 별도 검증해야 한다. 배포 전 DB 구조는 현재 Prisma 스키마를 기준으로 관리한다.

## DB 경계

Prisma schema와 Client는 `apps/api`에만 속한다. 서비스 DB와 역할은 `game_feedback` 전용이다. 테스트는 별도 서버/DB의 `gf_test_` 임시 스키마로 격리한다. PostgreSQL bootstrap 관리자와 앱 역할은 분리하고 앱 역할의 superuser/createdb/createrole 권한을 거부한다.

DatabaseModule은 실행별 AppConfig와 PrismaClient를 컨테이너에 제공한다. 직접 만든 Client만 애플리케이션 종료 시 연결을 끊고, 테스트 등 외부에서 주입한 Client의 종료 권한은 호출자에게 남긴다. ChatEvents의 스트림 정리가 끝난 뒤 `onApplicationShutdown`에서 소유 DB 연결을 정리한다.

로컬 DB 관리자는 `.data/postgres-dev`와 `.data/postgres-test`만 관리한다. TCP loopback과 고정 전용 포트를 사용한다. 임의 포트 프로세스를 종료하지 않는다. 시작한 DB 소유 프로세스는 랜덤 토큰으로만 제어하며 관리자 비밀과 제어 메타데이터는 Git에서 제외한다.

스키마 동기화 전 URL의 protocol, hostname, port, database, role, schema와 option을 검증한다. 배포 전에는 `schema.prisma`만 관리하며 URL 검증 뒤 `prisma db push`로 적용한다. 데이터 손실 경고가 발생하면 강제하지 않고 실패한다. 원격 운영 Migration은 이 로컬 실행기를 우회해서 임의 실행하지 않고 별도의 운영 절차를 설계한다.

## API 계약과 갱신

Zod 서버 검증 스키마를 OpenAPI에 연결하고 Orval로 SDK와 검증 스키마를 생성한다. 안정적인 `errorCode`를 오류 응답에 포함하고 사용자 문구는 UI에서 선택한다. Orval은 Zod 모델과 각 요청의 응답 스키마를 함께 생성하며 SDK transport가 실제 JSON을 검증한다. 표시 필드의 명시적 `.catch` fallback 이후 원래 계약으로 재검증하고 필수 ID·권한·세션·커서·날짜·본문·목록 오류는 `INVALID_API_RESPONSE`로 구분한다. [필드별 정책](../packages/sdk/README.md)은 SDK가 소유한다. 생성 결과 차이는 계약 변경의 일부로 검토한다.

초기 사용자 콘텐츠에는 Next.js 데이터 캐시를 적용하지 않는다. Mutation 성공 후 TanStack Query의 관련 query를 갱신하고 재방문·포커스 복귀 때 새 상태를 조회한다. Cache Tags는 실제 성능 측정 후 검토한다.

요청 제한은 60초 단위로 적용한다. 인증된 일반 조회는 userId별 240회, 쓰기는 userId별 60회이며 같은 사용자의 세션·IP 변경으로 한도를 나누지 않는다. 비로그인 일반 요청은 IP별 한도를 사용한다. 로그인·가입·OAuth 시도는 사용자와 무관하게 IP별 30회다. 테스트 계정 목록은 일반 조회, 로그아웃은 일반 쓰기로 분류한다. 세션 조회 전에는 IP별 1,000회의 전체 요청 상한을 적용한다. Next 서버의 SSR 호출은 API가 보는 주소가 웹 컨테이너 하나이므로, 웹 서버가 Caddy의 `X-Forwarded-For` 첫 값을 캐시 무효화 비밀에서 파생한 HMAC 키로 서명해 보내고 API는 60초 안의 유효한 서명일 때만 그 IP를 키로 쓴다. 방문자 IP가 없는 쿠키 없는 공유 조회(`'use cache'` 공개 데이터·사이트맵)는 `internal` 버킷(조회 3,000회, 전체 6,000회)을 쓰고, 서명이 없거나 틀리면 소켓 IP로 제한한다. 서버 Supercell 토큰을 쓰는 게임 프로필 조회는 로그인 사용자별 10회다. 한도를 초과하면 `429 RATE_LIMITED`와 `Retry-After`를 반환한다. 이 제한은 API 프로세스 메모리에 있으므로 다중 인스턴스 운영의 공유 한도는 별도 검증이 필요하다.

## 외부 서비스 경계

실제 Google·Supercell 구현과 가짜 제공자를 분리한다. 테스트는 가짜 제공자를 강제하며 데모는 명시적 `GF_DEMO_MODE`와 개발 실행에서만 허용한다. production은 데모를 거부한다. Supercell 키·등록 IP가 없거나 제공자 조회가 실패하면 실제 데이터가 조회된 것처럼 성공 처리하지 않는다. 번역·이메일·분석 연동은 후속 범위다.

## 페이지 조립과 별도 관리자

Topbar는 Root, Brand, Title, Back, Breadcrumb, Actions를 제공한다. Next `@topbar` 슬롯의 페이지 어댑터에서 필요한 구성을 선택하고, 게시글은 서버가 조회한 실제 게임/분류를 전달해 조립한다. 불러오지 않은 상세의 헤더와 본문은 각자 placeholder를 표시한다. 초기 검색엔진 문서는 공개 본문과 실제 breadcrumb를 완성해서 응답하고 클라이언트 탐색만 Suspense로 나눈다.

`CreatePostForm`은 생성과 등록 후 이동을, `EditPostSheet`는 기존 값과 수정 저장을 담당한다. 공유 `PostContentFields`는 제목, 본문, 가격/모집 필드만 소유한다. ConnectProfile의 입력은 RHF, 조회 결과/대기/오류는 mutation, 저장은 별도 mutation이 소유한다.

관리자 UI는 `apps/admin`의 React/Vite 서비스로 분리한다. 공개 Web/WebView의 관리자 페이지, 메뉴, 관리용 클라이언트 도메인은 제거한다. 로컬 3303의 관리자 프록시는 요청 Origin을 검증하고 기존 API의 ADMIN 권한 및 감사 기록을 사용한다. 사용자 문의는 기존 1:1 채팅이므로 관리자 UI 분리와 무관하게 유지한다.

NativeHost와 NativeBridgeChannel은 각 환경의 수명과 연결 상태를 클래스로 관리한다. instrumentation-client가 브라우저 이벤트 구독을 한 번 설치하고 React NativeBridge는 최신 router/session/overlay 어댑터만 bind/unbind한다. 경로와 메시지 분기는 ts-pattern, 쿼리 조합과 마지막 overlay 선택은 es-toolkit을 사용한다. sitemap은 24시간 뒤 요청 시 재검증하며 게시글 lastmod는 updatedAt을 사용한다. 정해진 시각에 실행하는 스케줄러는 아니다.

API의 AdminModule은 공개 도메인 서비스와 별개로 관리자 카테고리/사용자/신고/문의의 controller와 service를 소유한다. 같은 Prisma 테이블을 사용해도 권한과 업무 흐름을 공개 service에 섞지 않는다. JSON Body/Query는 Zod 스키마를 명시한 parameter decorator로 받고 NestJS 12.2의 전역 StandardSchemaValidationPipe가 검증한다. Guard → Zod 검증 → Service 순서를 유지하며 DTO 타입은 스키마에서 추론한다. schema 메타데이터를 직접 지정하므로 tsx의 design:paramtypes 생성 여부에 의존하지 않는다. Zod의 계약 정규화와 중첩 JSON 규칙은 HTTP 경계에서 검사해 OpenAPI와 SDK의 단일 계약을 보존하며 Service의 입력 parse를 제거한다. Response Zod 검증과 fallback은 SDK가 계속 소유한다. [Nest ValidationPipe](https://docs.nestjs.com/application/validation)를 기반으로 한다.
