# 구현 및 검증 기록

갱신일: 2026-10-17. 대상 저장소는 [jingeon27/side-project](https://github.com/jingeon27/side-project)이며 `develop`에서 분리한 `feat/game-feedback` Worktree에 구현한다. 사용자 제공 [MVP Plan v4.0 원문](mvp-plan-v4.md)은 수정하지 않는다.

## 구현 범위

- 한국어 중심 `/ko`, `/ja`, `/en` 경로, 최신순·미답변 피드, cursor pagination과 무한 목록.
- 게임 프로필 조회·연결, 대표 Supercell 태그 저장, 작성 시점 프로필·덱 스냅샷을 포함하는 피드백 요청.
- 요청·피드백 답변·일반 댓글 CRUD, 요청자만 가능한 도움됨, 인앱 알림과 답변 읽음.
- Google `openid`, 직접 입력 닉네임, 연령·약관 동의, HttpOnly 세션, 로그아웃·탈퇴.
- 신고·양방향 사용자 차단, 관리자 카테고리·콘텐츠 숨김·사용자 인증 변경과 감사 기록.
- PostgreSQL에 보존하는 1:1 대화·메시지, 참여자 권한, 명시적 메시지까지의 읽음 경계, 인증된 SSE 갱신.
- 명시적 데모의 고정 테스트 계정과 게시글·댓글·채팅 fixture, 실제 사용자 세션 전환.
- 서버 Zod 검증 → OpenAPI → Orval Client 및 응답 검증 스키마 생성.

피드백 답변은 읽음·도움됨의 대상이며 일반 댓글과 구분해 표시하고 저장한다. 서비스 사용자 인증과 게임 계정 소유권 `UNVERIFIED`도 별개다. 기능 구현은 실제 사용자 모집·외부 제공자 검증·공개 출시 완료를 의미하지 않는다.

## 저장소 실행 방식

Node.js 24, Yarn 4.17.0과 기존 `node-modules` linker를 사용한다. 루트 Workspace 경로와 `@side/*` 집계 방식을 유지한다. 버전별 Yarn release 파일, PnP loader 또는 다른 프로젝트의 Prisma Client를 가정하지 않는다.

`@side/game-feedback`는 `test`, `build`, `typecheck`, `check`를 앱·패키지에 위임한다. DB URL 가드·단위·PostgreSQL 통합 테스트는 API가 소유하고 캐시 경계 단위·브라우저 테스트는 Web이 소유한다. 루트·프로젝트 집계에는 테스트 파일·러너 설정·러너 의존성을 두지 않는다.

```sh
nvm use
corepack yarn install --immutable
corepack yarn workspace @side/game-feedback codegen
corepack yarn workspace @side/game-feedback typecheck
corepack yarn workspace @side/game-feedback test
corepack yarn workspace @side/game-feedback test:e2e
corepack yarn workspace @side/game-feedback build
corepack yarn format:check
```

실제 Google·Supercell을 호출하지 않도록 테스트는 가짜 제공자를 강제한다. 통합 테스트는 Migration 이전에 URL을 검증하고 실행별 `gf_test_` 스키마만 생성·정리한다. 브라우저 테스트는 API 4301·Web 3301을 사용해 개발 서버와 분리한다.

## 데이터와 권한

개발 DB는 loopback 55442의 `game_feedback`, 테스트 DB는 55444의 `game_feedback_test`다. 앱은 전용 `game_feedback` 역할을 사용하며 bootstrap 관리자 자격 증명은 앱에 전달하지 않는다. 다른 프로젝트의 DB·환경변수·저장소·실행 프로세스를 사용하거나 변경하지 않는다.

검토된 SQL의 `prisma migrate deploy`만 적용한다. URL의 hostname·port·database·role·schema를 검증하고 reset·db push를 사용하지 않는다. 로컬 실행기는 소유한 DB 프로세스만 제어하고 데이터 디렉터리를 유지한다. 원격 운영 Migration은 별도 절차가 필요하다.

| Migration                         | 내용                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `202610160001_initial`            | 사용자·세션·게임 연결·피드백·알림·신고·차단·감사 기록                            |
| `202610160002_chat`               | canonical pair의 대화방, 발신자별 UUID 중복 방지 메시지, 읽음 경계               |
| `202610160003_user_test_accounts` | User의 서비스 인증 여부·시각과 대표 태그, 기존 synthetic fixture에 한정한 초기값 |

일반 Google 사용자는 `isVerified=false`, `verifiedAt=null`, 대표 태그 미등록으로 시작한다. 관리자만 인증 상태를 변경하고 감사 기록을 남긴다. `isTestAccount`는 서버의 내부 데모 계정 정보로 결정해 응답하며 클라이언트 입력을 받지 않는다.

대표 태그는 대문자와 `#`으로 정규화한다. 제공자 조회 성공 후 User와 GameAccount를 한 transaction으로 갱신하며 실패 시 기존 상태를 유지한다. 이미 작성한 요청의 스냅샷은 바꾸지 않는다.

## 테스트 계정과 채팅

고정 계정은 `sample-user-0` 새벽의호그, `sample-user-3` 덱연구소, `sample-test-admin` 운영테스터다. 최초 상태는 각각 일반 사용자·`#2PP`, 테스트 인증 코치·`#9QY`, 데모 관리자·태그 미등록이다. 이후 수정한 인증·태그와 작성 콘텐츠를 seed가 덮어쓰지 않는다.

계정 목록과 전환은 명시적 데모·비운영 환경에 한정한다. 임의 ID와 권한 필드 주입을 거부하고 이전 세션을 폐기한다. 운영자도 참여하지 않은 비공개 대화는 조회할 수 없다. 서비스 인증 예시는 테스트 배지로 구분한다.

대화방은 두 참여자의 정렬된 ID와 unique 제약으로 중복을 막는다. 메시지는 발신자·`clientMessageId`로 재시도를 중복 저장하지 않는다. 읽음은 요청의 `messageId`까지만 전진하며 이후 도착한 메시지를 미리 읽음 처리하지 않는다. 차단은 양방향 조회·전송·읽음에 적용한다.

SSE는 live 세션을 확인하고 메시지 본문 없이 대화 갱신만 전달한다. 로그아웃·만료·탈퇴 시 연결을 종료한다. 탈퇴 시 참여 대화·메시지를 삭제하며 상대의 채팅함에도 남기지 않는다. 다중 API 인스턴스의 공유 pub/sub와 메시지 신고·보유 정책은 공개 운영 전 별도 검증이 필요하다.

## 요청 제한

60초 단위로 인증된 조회는 userId별 240회, 쓰기는 userId별 60회다. 같은 사용자는 세션·IP 변경으로 한도를 나누지 않는다. 비로그인 일반 요청은 IP별 한도, 로그인·가입·OAuth 시도는 IP별 30회를 적용한다. 테스트 계정 목록은 조회, 로그아웃은 쓰기다. 세션 조회 전에는 IP별 전체 1,000회 상한을 적용한다.

`rate-limit.test.ts`의 단위 테스트 4개는 공유 IP 사용자 분리, 세션·IP 변경 시 사용자 한도 공유, 비로그인·인증 경로, 목록·로그아웃 분류를 다룬다. 제한 상태는 단일 프로세스 메모리에 있으며 초과 응답은 `429 RATE_LIMITED`와 `Retry-After`다.

## 저장소 이식 검증

아래 결과는 올바른 저장소의 Node.js 24·Yarn 4.17.0·node-modules 환경으로 이식한 뒤 확인한 결과다. API 도메인 분리 이후 재검증은 다음 절에서 별도로 기록한다. 이식 이전 환경의 결과를 이 표에 사용하지 않는다.

| 항목                                    | 현재 결과                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------- |
| 의존성 설치와 lockfile 정합성           | Yarn 4.17.0 `install --immutable` 통과                                    |
| API 단위·DB 가드·PostgreSQL 통합 테스트 | 6개 파일, 47개 테스트 통과. DB URL 가드 2개도 API Vitest에 포함           |
| 전체 타입 검사                          | Game Feedback `check` 통과                                                |
| Web 브라우저·생성 Client 계약 테스트    | webpack 개발·E2E 서버로 8개 모두 통과                                     |
| API/Web production build                | API 및 Next.js 기본 Turbopack production build 통과                       |
| OpenAPI·SDK 재생성 동일성               | 105개 파일 재생성 전후 SHA-256 동일                                       |
| 저장소 format과 변경 범위 검사          | 전체 `format:check` 통과. 변경 범위·아티팩트 검사 통과                    |
| 개발 DB Migration·seed·Web/API 실행     | 소유 데이터 보존·Migration·seed 통과, Web/API 200 및 테스트 계정 3개 확인 |
| GitHub Actions                          | 현재 저장소의 PR에서 확인 필요                                            |

기존 photo-contest의 `db:generate`, `codegen`, `check`와 lint·타입 검사가 통과했다. 94개 파일의 테스트 473개(bridge 35, API 63, mobile 137, web 238)가 통과했으며 해당 프로젝트의 tracked 파일 변경은 없다.

E2E 8개는 요청·답변·알림·도움됨, 실제 생성 Client 계약, 두 사용자의 실시간 채팅·읽음·재전송, 고정 계정 전환·제3자 대화 차단, 태그 정규화·재로그인 유지를 검증했다. 첫 Turbopack 개발 서버에서는 채팅 POST 성공 후 최초 RSC 응답 지연과 테스트 1건 실패를 관찰했다. 내부 원인은 확정하지 않았다. 개발·E2E만 `--webpack`으로 실행하고 timeout을 유지한 재검증이 모두 통과했다. production Turbopack build도 통과했다.

이전 Worktree의 개발 프로세스·DB를 중지한 뒤 소유 데이터만 새 Worktree로 복사했다. DB 소유 메타데이터는 새 경로로 갱신하고 이전 control·lock 파일을 재사용하지 않았다. 이전 소스는 보존했다. 테스트 DB 55444는 중지했으며 데이터는 보존했다. 새 Worktree의 개발 데모에서 Web 3300과 API 4300의 200 응답, 테스트 계정 3개, 기존 샘플 게시글 6개 보존을 확인했다. 사용자가 확인할 수 있도록 개발 Web/API와 소유 개발 DB 55442는 실행 중으로 유지한다.

## API 도메인 분리

API를 `auth`, `users`, `posts`, `answers`, `comments`, `categories`, `game-profiles`, `notifications`, `blocks`, `moderation`, `chat`, `health`의 12개 도메인 모듈로 구성했다. `app.ts`는 기동과 HTTP 설정 연결만 담당하고 `AppModule`이 도메인을 조합한다. 기존 전체 업무를 담은 `service.ts`는 제거했다.

설정은 `config`, PrismaClient와 소유권 관리는 `database`, 도메인 공통 검증·페이지네이션·HTTP 처리는 `common`으로 분리했다. 공개 DTO presenter와 Google·Supercell 제공자는 해당 도메인이 소유한다. `security.ts`에는 기존 소비자를 위한 export만 남긴다. 요청 경로·상태·오류 코드·SQL·트랜잭션·스냅샷·차단·채팅 공개 범위는 유지한다.

ChatService는 PrismaClient·AppConfig·ChatEvents를 직접 주입받는다. 채팅 lifecycle 미들웨어는 세션 로드 다음에 실행하며, 변경 이전 세션과 탈퇴 상대를 보존하고 성공 응답 이후 스트림 종료·갱신을 수행한다. ChatEvents의 모듈 종료 정리 이후 DatabaseModule이 직접 소유한 Client만 종료한다. 외부에서 주입한 Client는 호출자가 계속 관리한다.

기존 PR [#4](https://github.com/jingeon27/side-project/pull/4)의 동일한 `feat/game-feedback` 브랜치에서 변경을 검토한다. 추가 테스트 3개로 실행별 AppConfig 독립성, 외부 PrismaClient 종료 권한 보존, SSE 종료 후 소유 DB 연결 정리를 확인했다.

AST로 기존·신규 라우트 44개를 대조해 누락·추가·중복이 없는 것을 확인했다. API 빌드는 이전 dist를 먼저 정리한다. clean build 후 이전 루트 `service.js`·`chat.service.js`가 남지 않고 새 도메인 출력과 전용 Prisma 런타임이 포함되는 것도 확인했다.

| API 도메인 분리 이후 검사 | 상태                                          |
| ------------------------- | --------------------------------------------- |
| Game Feedback `check`     | 통과                                          |
| API 테스트                | 7개 파일, 50개 테스트 통과                    |
| Web E2E                   | 8개 통과(28.7초)                              |
| API/Web production build  | 전체 production build 및 API clean build 통과 |
| OpenAPI·SDK 재생성 동일성 | 105개 파일 SHA-256 동일                       |

컴파일된 production API를 임시 랜덤 포트에서 기동해 health·session 200과 `demoMode=false`를 확인한 뒤 소유 프로세스를 종료했다. 테스트 DB 55444도 중지했고 데이터는 보존했다. Prisma schema, contracts, 생성 SDK·OpenAPI, 루트 package.json·yarn.lock과 다른 프로젝트는 이 리팩터링으로 변경하지 않았다.

## Web FSD와 Safedoc 패턴 적용

로컬 `safedoc-react`, `safedoc-usermall`, `safedoc-global/frontend`의 실제 구조·공개 API·query options·폼·overlay 사용을 확인했다. 공통인 5레이어를 `_app`·`_pages`·`widgets`·`features`·`shared`로 적용하고 `src/app`에는 Next 라우트 어댑터만 남겼다. 옛 `components`·`lib`의 평면 구조를 제거했다.

features는 auth·user·game-profile·post·answer·comment·category·notification·moderation·chat으로 나눈다. 각 도메인의 api/model에 REST IO·query options·mutation을 모으고, 표시 UI에는 조합용 slot을 제공한다. 페이지가 폼·동작·화면 조합을 소유하고 여러 화면에 쓰는 로그인·프로필 연결·요청 작성은 widget으로 둔다. 641줄 채팅 화면을 대화 목록·본문·입력·스크롤·가시 읽음 경계로, 505줄 요청 상세를 표시·답변·댓글·개별 overlay로 나눴다.

TanStack Query options factory를 조회·무효화의 키 단일 출처로 사용한다. 사용자별 private 조회를 scope로 나누고 불완전한 인자에는 skipToken을 사용한다. RHF/Zod와 useWatch, overlay-kit을 실제 폼·모달에 적용했다. 서버 상태를 별도 store로 복제하지 않고 mutation의 pending/error를 직접 쓴다. FSD 분리 단계에서는 기존 Radix Dialog와 Orval REST SDK·HttpOnly 쿠키·SSE 계약을 유지했다. 이후 아래 공통 디자인 시스템 작업에서 Dialog를 Base UI로 통합한다.

Web에 공유 `@side/eslint-config/next`·`fsd-boundaries`, `@side/typescript-config/base`를 연결했다. 레이어 방향·public barrel·페이지 교차 import·직접 fetch·overlay 상태 복제·컴포넌트/핸들러 규칙과 함께, 앱 로컬 lint가 raw query-key·enum·타입 이름을 검사한다. 집계 check에 Web lint, 집계 test에 Web 소유 Vitest를 연결해 기존 CI에서도 실행한다.

세션 전환은 진행 중 query 취소 → 이전 계정 cache 제거 → 새 세션 저장 순서를 유지한다. 로그아웃·탈퇴 후 private cache를 즉시 비우며 SSE는 사용자 ID별로 종료한다. 메시지 실패 초안과 재시도 UUID, 화면에 표시된 메시지까지의 읽음 경계도 보존한다. 최종 교차 검토에서 OverlayProvider가 계정별 수명 밖에 있던 문제를 발견해 사용자 ID별 Provider로 변경했다. 다른 탭에서 계정을 바꿔도 이전 계정의 모달·초안·탈퇴 확인 입력은 남지 않는다.

| Web FSD 이후 검사                         | 결과                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| Node 24 / Yarn 4.17 `install --immutable` | 통과. 기존 패키지 해석 변경 없음                      |
| 집계 `check`                              | 전체 타입·Web FSD 및 코드 규칙 lint 통과, 오류·경고 0 |
| API Vitest                                | 7개 파일·50개 테스트 통과                             |
| Web Vitest                                | 5개 파일·10개 테스트 통과                             |
| Chromium E2E                              | 11개 통과(38.3초)                                     |
| API/Web production build                  | 통과                                                  |
| 전체 `format:check`·diff/산출물 검사      | 통과                                                  |

Web 단위 테스트는 실행 중 이전 세션 요청 취소와 private cache 제거, 사용자별 채팅·알림 cache 무효화 격리, post prefix 선택, 한국어 API 오류·AbortError 보존을 다룬다. 브라우저 검증에는 기존 8개 흐름에 게시글·댓글의 수정·삭제 취소·삭제, 피드 검색·탭의 URL 복원·새로고침·추가 query 보존, 화면 밖 세션 변경 후 이전 계정의 탈퇴 확인 입력 폐기를 추가했다. 검색은 RHF 입력 초안과 350ms 대기를 유지하고 Next가 지원하는 native history API로 URL을 갱신한다.

production Web을 소유한 임시 포트에서 기동해 검색 URL·가이드·채팅·설정의 HTTP 200을 확인한 뒤 종료했다. 테스트 DB 55444는 중지하고 데이터를 보존했다. 개발 데모는 다시 실행해 확인할 수 있도록 유지한다. 이번 Web 변경으로 API·Prisma·contracts·생성 OpenAPI/SDK와 다른 프로젝트 소스는 변경하지 않았다.

## Photo Contest와 공통 디자인 시스템

사용자 요청으로 `packages/design-system`을 새로 만들고 두 웹의 공통 스타일을 연결했다. Photo Contest의 실제 Base UI primitive·토큰·cn을 추출하고 Game Feedback의 공통 버튼·입력·프로필·모달도 이 패키지를 사용한다. Game Feedback의 기존 녹색 위주 값은 공통 의미 토큰을 참조하며 화면별 CSS를 분리한다. REST·채팅·계정·서버 계약은 유지한다.

의존성은 새 workspace와 양쪽 웹 manifest·lockfile을 먼저 별도 커밋했다. Game Feedback의 Radix Dialog, Photo Contest의 직접 CVA·clsx·tailwind-merge 의존성은 공통 구현이 소유하는 라이브러리로 정리했다. 공통 React UI와 Next 전용 ButtonLink 진입점, CSS 진입점을 분리한다. 루트 workspace 경로·Node·Yarn은 유지한다.

Photo Contest의 기존 public UI 경로와 테스트를 유지하며 구현은 공통 패키지를 re-export한다. 계정·Apollo·라우터·WebView 뒤로 가기·portal container·오버레이 수명은 각 앱이 계속 소유한다. Photo Contest API·모바일 소스와 기존 개발 서버·DB는 변경하지 않는다. 브라우저 테스트용 Photo DB는 이번 작업이 소유한 loopback 55445의 별도 데이터 디렉터리에서 실행한다.

| 공통 디자인 시스템 이후 검사     | 결과                                                   |
| -------------------------------- | ------------------------------------------------------ |
| DS 패키지 lint·typecheck·Vitest  | 통과, 4개 파일·9개 테스트                              |
| Photo Web lint·typecheck·unit/UI | 통과, 기존 55개 파일·238개 테스트                      |
| Photo Web 브라우저               | Chrome 모바일·Safari 모바일·데스크톱 9개 통과(30.0초)  |
| Photo Web production build       | 별도 `.next/design-system-build`에서 통과              |
| Game Web unit·기존 집계 check    | 10개 단위 테스트, 전체 타입·lint 통과                  |
| Game Web 브라우저                | 전체 12개 통과(48.4초), 스타일 검증 단독 재검증도 통과 |
| Game API/Web production build    | 통과                                                   |
| 의존성·format·산출물 검사        | `install --immutable`, 전체 format 및 diff 검사 통과   |

Photo 브라우저 검증은 로그인·로그아웃·재로그인, 시트의 뒤로 가기·포커스, 갤러리 피드를 세 브라우저 프로젝트에서 확인했다. Game Web에는 실제 계산된 주 버튼 색상과 44px 크기, 입력 16px, 모달 불투명도·모바일 넘침 검사를 추가했다. 최초 검사에서 기존 주 버튼을 accent로 매핑한 차이를 발견해 두 앱의 기본 주 동작을 공통 primary로 맞춘 뒤 전체 12개를 재검증했다. 모달 애니메이션이 끝난 화면 캡처도 확인했다.

생성 GraphQL·OpenAPI/SDK·Prisma schema는 변경하지 않았다. Photo 테스트 DB 55445는 잔여 테스트 스키마 0개를 확인한 뒤 소유 프로세스를 종료하고 데이터를 보존했다. 기존 Photo 개발 서버 3200·API 4200·DB 55433은 제어하지 않았다. Game 테스트 DB 55444도 중지하고 데이터를 보존했다. 개발 데모를 다시 실행해 Web/API 200, 고정 계정 3개·기존 게시글 6개 보존을 확인했다.

## WebView 모바일과 테스트 구성

사용자 요청으로 `apps/mobile`에 Expo 57·React Native 0.86 기반 WebView 서비스를 추가했다. API는 Vitest+Supertest, Web은 Vitest+Playwright를 사용하며 Mobile도 자체 Vitest unit/UI·Playwright 설정과 파일을 소유한다. 프로젝트 집계의 check/test/build/test:e2e는 새 앱 검사에 위임하고 CI는 Chromium·WebKit을 모두 설치한다.

모바일 `App.tsx`는 11줄의 Provider 조합이다. WebView UI·이벤트·OS 수명 주기는 `_pages/web-shell`, URL·딥링크 판단은 `features/navigation`, 브리지·PKCE 인증은 `features/bridge`, origin·색은 `shared/config`로 분리했다. 공통 Expo·FSD lint를 적용하고 같은 Web 화면의 디자인 시스템·테스트 계정·게시글·댓글·채팅을 사용한다. 새 제품 화면을 네이티브로 복제하지 않았다.

Web과 Mobile의 메시지 계약은 프로젝트 내부 `@game-feedback/bridge`가 소유한다. 메시지의 source origin·구조·경로를 검사하고 초기 bootstrap과 로드 후 fallback을 함께 둔다. 안전 영역·새 창 URL 정책·Android back 대기/중복 억제·딥링크·foreground 갱신·연결 오류 재시도·WebView 프로세스 복구를 연결했다. 앱 복귀는 세션 조회 후 동일 사용자 cache를 갱신하고, 계정 변경이면 실행 중 요청 취소·이전 private cache 제거·새 세션 저장 순서를 따른다. 복귀 조회 중 로그인/로그아웃이 먼저 끝나면 오래된 조회 결과를 무시한다.

Google은 시스템 브라우저에서 인증한다. 앱 PKCE challenge를 OAuthAttempt에 저장하고 완료 시 hashed AppLoginTicket을 발급한다. WebView가 `POST /api/auth/app/exchange`로 2분짜리 일회용 코드를 교환해 HttpOnly 세션을 받는다. verifier 불일치·만료·재사용·동시 교환·CSRF를 거부하며 신규 사용자 동의·가입과 이전 SSE 종료를 기존 인증 정책에 연결했다. 기존 44개 경로에 REST 교환 1개를 추가했다. 검토한 additive Migration `202610170004_mobile_login`을 전용 개발 DB에도 `migrate deploy`로 적용했다.

| 최종 검사                               | 결과                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| Node 24·Yarn 4.17 `install --immutable` | 통과, 기존 버전 해석 변경 없음                               |
| 전체 `format:check`·diff 검사           | 통과                                                         |
| 집계 `check`                            | 계약/API/SDK/Bridge/Web/Mobile 타입·Web/Mobile FSD lint 통과 |
| API Vitest+Supertest                    | 8개 파일·55개 테스트 통과                                    |
| Web Vitest                              | 5개 파일·12개 테스트 통과                                    |
| Mobile Vitest unit/UI                   | 6개 파일·22개 테스트 통과                                    |
| Web Playwright Chromium                 | 12개 통과(48.3초)                                            |
| Mobile Playwright Android/iOS host      | 6개 통과(31.8초)                                             |
| API/Web production build                | 통과                                                         |
| Mobile Metro export                     | Android·iOS 모두 통과, 검사 출력 제거                        |
| OpenAPI/Orval 재생성                    | 커밋된 생성 파일과 diff 없음                                 |

Mobile E2E는 실제 3302/4302 Web/API·전용 55444 DB의 독립 `gf_test_mobile_*` 스키마와 앱의 실제 host·URL·인증 로직을 사용한다. 테스트 계정으로 게시글·댓글·채팅을 작성하고 reload 이후 쿠키·저장을 확인했다. 웹 모달 back·따뜻한 딥링크·foreground 세션 전환과 시스템 로그인 취소도 확인했다. 첫 실행은 같은 채팅 문구가 대화 목록과 본문에 함께 나타나 선택자가 중복되어 실패했다. 실제 대화 log로 선택 범위를 한정한 뒤 전체 흐름이 통과했다. 외부 Google 사용 가능 여부와 OS 인증창만 해당 취소 테스트에서 대역으로 설정한다. API 핸드오프 검증은 가짜 Google 제공자를 사용하는 Supertest가 담당한다.

기존 Photo Contest 코드·서버·DB는 변경하지 않았다. 공통 파일 변경은 신규 Workspace의 lockfile 등록, CI 검증 범위, 루트 프로젝트 안내에 한정한다. 최종 테스트 종료 후 잔여 `gf_test_*` 스키마 0개를 확인하고 전용 테스트 DB를 중지했다. 개발 데모의 Web/API 200, 고정 계정 3개·기존 게시글 6개 보존을 확인했다.

실제 Google/Supercell 연동, 서명된 네이티브 바이너리·dev client·실기기·스토어 배포는 확인하지 않았다. 현재 선택된 Xcode 경로는 전체 Xcode가 아닌 CommandLineTools다. 로컬 실행법·origin·Android reverse·딥링크·실기기 확인 항목은 [모바일 가이드](../apps/mobile/README.md)에 기록했다.

## REST 응답 Zod 검증과 fallback

REST SDK가 HTTP 성공 본문을 단순 `as T`로 넘기던 경로를 제거했다. Orval의 Zod 모델 출력·runtimeValidation·includeZodSchemaInArguments를 사용해 42개 JSON operation이 응답 스키마를 transport에 전달한다. 생성 client의 모든 operation이 호출자 options 이후 스키마를 지정하는지도 SDK 소유 AST 테스트로 검사한다. 기존 raw API helper와 공개 apiFetch export를 제거해 앱의 도메인 API가 생성 함수를 사용하도록 유지했다.

표시용 nickname·name·description·이미지 URL·대표 태그·clan·배지 카운트에 명시적 Zod `.catch` fallback을 적용하고 서비스 인증 boolean이 잘못되면 false로 내린다. 원래 스키마에 선언된 필드에만 적용하고 전체 응답을 원래 계약으로 다시 검증한다. 이름이 같아도 fallback이 계약을 만족하지 않는 필드에는 적용하지 않는다. 원본 입력·요청 본문은 수정하지 않으며 숫자/boolean 문자열을 자동 형변환하지 않는다.

ID·권한·세션 플래그·커서·날짜·UUID·본문·목록 구조·게임 데이터의 출처/소유권 표시는 엄격하게 검증한다. 잘못된 목록 원소를 삭제하거나 목록 전체를 빈 배열로 바꾸지 않는다. 서버 응답 계약에도 비어 있지 않은 ID, ISO 시각, 안전한 비음수 정수, 메시지 UUID 제약을 명시했다. 서버 입력 검증을 느슨하게 만들지 않았다. 자세한 [필드별 정책](../packages/sdk/README.md)은 SDK 문서에 기록했다.

잘못된 성공 JSON은 `ApiResponseValidationError`/`INVALID_API_RESPONSE`로 구분하며 HTTP status와 최대 20개 필드 경로·코드만 보존한다. payload·메시지·토큰을 예외/로그에 추가하지 않는다. HTTP 오류 본문도 Zod로 검증하고 잘못된 코드/문구만 일반 fallback으로 보완한다. 네트워크·요청/본문 취소 오류는 원본을 유지한다. Web 오류 경계는 응답 검증 오류의 분류·진단을 보존해 네트워크 실패와 다른 안내를 표시한다.

| 최종 검증                   | 결과                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| API Vitest+Supertest        | 55개 통과                                                              |
| SDK Vitest                  | 3개 파일·30개 통과                                                     |
| Web Vitest                  | 13개 통과                                                              |
| Mobile Vitest unit/UI       | 22개 통과                                                              |
| Web Playwright              | 기존 흐름과 응답 오염·재조회 복구 포함 14개 통과(51.6초)               |
| Mobile Playwright host      | Android/iOS 6개 통과(33.7초)                                           |
| 집계 check·production build | 전체 타입·Web/Mobile lint, API/Web 빌드, Android/iOS Metro export 통과 |
| OpenAPI/Orval               | 생성 파일 72개의 재생성 SHA-256 동일                                   |
| 공통 디자인 시스템          | 기존 설치·별도 새 설치 모두 lint·typecheck·9개 테스트 통과             |

브라우저에서는 객체 nickname·문자열 카운트·문자열 인증 표시를 받은 카드가 안전한 값으로 그려지는지 확인했다. 잘못된 목록은 성공한 빈 피드로 표시하지 않고 별도 오류를 보여주며, 다시 불러오기 후 정상 응답으로 복구되는 것을 검증했다. SDK 검증에는 중첩 fallback·필수 필드 거부·세션 위조·잘못된 커서·메시지/읽음 경계·게임 데이터 출처·HTTP 오류·비 JSON·204·취소·민감한 payload 미보존을 포함한다.

검증 도중 이전 head의 GitHub Actions가 공통 DS 단계에서 `command not found: vitest`로 실패한 것을 확인했다. 현재 Worktree와 별도 새 설치에서도 재현했다. 이 peer Workspace에서 Yarn의 bin 조회는 Vitest를 누락하지만 Node는 선언된 패키지를 정상 해석하는 것을 확인했다. DS test script만 모듈 해석 기반 실행기로 바꾸어 실제 설치 경로를 하드코딩하지 않고 CLI를 실행하도록 보완했다. 패키지·React 버전과 제품 코드는 바꾸지 않았다. SDK 테스트의 직접 소유를 위해 기존 Vitest를 devDependency/lockfile에 연결하고 집계 test에 위임을 추가했다.

이 변경은 DB schema·Migration·외부 제공자 연동을 변경하지 않는다. 최종 종료 때 전용 테스트 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. 개발 Web/API와 고정 계정 3개·기존 샘플 게시글 6개는 보존했다.

## 서비스·화면·기능 오류 경계

최상위 `app/error.tsx`에 의존하던 렌더 오류 처리를 Web의 공통 경계와 화면별 경계로 나눴다. Next 16.4 설치 문서의 `catchError`를 사용해 redirect·notFound 동작을 보존한다. 셸의 본문·메뉴·사이드바와 피드 카드·게시글·답변·댓글·채팅 목록/대화창을 독립적으로 복구한다. 계정·경로·대화가 바뀌면 이전 오류 상태가 남지 않는다. 서버 컴포넌트가 포함된 본문과 locale 라우트는 재시도 시 route refresh, 클라이언트 기능은 해당 영역의 재생성을 사용한다.

로그인·가입·작성·수정·삭제·신고·차단·프로필 연결 모달을 공통 `openOverlay`로 열어 controller 렌더 오류를 포털 안에 격리했다. 실패한 창은 재시도 또는 닫기를 제공한다. NativeBridge·가입 안내의 오류도 각각 격리한다. Mobile의 SafeAreaProvider 안에는 네이티브 서비스 경계를 추가해 렌더 실패 시 listener·host를 정리하고 WebView를 다시 연다. 정상 형제 영역의 상태·채팅 초안, 기존 API 전송 실패 초안·재전송 UUID·읽음·쿠키 정책은 유지한다. API/폼/SSE 오류를 모두 렌더 예외로 바꾸지 않는다.

Web 소유 UI 검증을 위해 저장소의 기존 Testing Library·jsdom 버전을 manifest/lockfile에 연결했다. Vitest는 unit/UI 레인으로 나누고 공통 Base UI와 shim이 같은 React를 참조하도록 dedupe·의존성 변환/최적화를 설정했다. 제품 패키지 버전은 바꾸지 않았다. Web에서도 Yarn의 peer Workspace bin map이 Vitest를 누락하는 현상을 확인해 DS와 같은 Node 모듈 해석 실행기를 사용한다. 정적 타입·Web/Mobile lint·전체 format과 집계 test도 통과했고, API 55개·SDK 30개 검증을 다시 확인했다.

| 검증              | 결과                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web Vitest        | 8개 파일·23개 통과. 렌더 오류 격리, 형제 상태·대화 초안 유지, 비동기 복구 거부, 반복 실패 후 재시도, 계정/대화 변경, query 오류 재조회, 포털 복구/닫기 |
| Mobile Vitest     | 8개 파일·25개 통과. 기존 셸과 네이티브 렌더 실패·지속 실패·OS listener 정리·WebView 재생성                                                             |
| Web Playwright    | 기존 14개와 댓글·채팅 렌더 오류 주입/국소 복구 2개, 합계 16개 통과(53.6초)                                                                             |
| Mobile Playwright | Android Chromium/iOS WebKit host 6개 통과(31.4초)                                                                                                      |
| 빌드              | Web production build, Android·iOS Metro export 통과                                                                                                    |

브라우저의 날짜 formatter에만 테스트 오류를 주입해 실제 컴포넌트 예외를 재현했다. 앱 코드에 테스트용 crash 경로·스위치를 넣지 않았다. 댓글 실패 중 게시글·답변이 보이고, 대화창 실패 중 목록을 사용할 수 있으며 재시도 후 정상 화면으로 돌아오는 것을 확인했다. 모바일 폭에서 오류 UI의 가로 넘침과 숨겨진 프로필 영역도 확인했다(오류 경계 E2E 2개 재검증, 13.6초). 네이티브 실기기·dev client 확인은 이 검증에 포함되지 않는다.

이전 head `3136eb9`의 Game Feedback Actions는 통과했다. 같은 head의 Photo Contest verify는 Web/Mobile에서 `command not found: vitest`로 실패했고 브라우저 두 레인은 통과했다. 로컬 bin 조회에서도 기존 Photo Workspace의 실행 경로 문제를 확인했다. 이번 오류 경계 변경에는 다른 앱 코드·설정 수정을 포함하지 않는다. 최종 테스트 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. 개발 Web/API 200·고정 계정 3개·기존 게시글 6개 보존도 확인했다.

## 페이지별 SEO와 공개 플레이어 프로필

피드·가이드·약관·개인정보·문의·채팅·알림·설정의 title·description·keywords·canonical·Open Graph·Twitter 메타데이터를 각각 정의했다. 게시글 상세의 기존 client-only 조회를 서버 렌더링·초기 query 데이터로 연결해 JavaScript 없이 제목·본문·답변·댓글을 볼 수 있게 했다. 실제 게시글 제목·본문 요약·작성자·게시/수정 시각으로 article 메타데이터와 `DiscussionForumPosting` JSON-LD를 생성한다. 수정 완료 시 router refresh로 현재 문서의 메타 제목도 갱신한다.

`/[locale]/users/[id]`에는 공개 프로필과 작성글 목록을 추가했다. 닉네임·서비스 인증/테스트 표시·대표 태그·가입일과 보이는 요청/답변/도움됨 수를 보여주고 `ProfilePage`/`Person` JSON-LD와 profile OG 메타데이터를 생성한다. 게시글·답변·댓글·피드의 작성자 이름이 프로필로 연결된다. 카드의 상세 이동과 작성자 링크를 서로 중첩하지 않고 기존 카드 클릭 영역을 유지한다. 작성글 cursor 페이지는 서버 HTML의 실제 링크로 이동할 수 있다. 모바일의 안전한 딥링크 목록에도 users 경로를 추가했다.

API에는 `GET /api/users/:id`와 기존 `/api/posts`의 authorId 필터를 추가했다. 사용자 내부 subject·권한·검증 시각·약관은 공개 프로필 응답에 포함하지 않는다. 기존 공개/차단/비데모 사용자 규칙을 적용하고, 숨김·삭제된 부모의 답변도 활동 집계에서 제외한다. 없는·차단된·숨긴·삭제된 대상은 metadata 조회에서도 404다. REST Zod→OpenAPI→Orval 경로를 재생성했으며 JSON operation은 43개다. 새 프로필 응답도 SDK에서 실제 검증한다. DB schema·Migration은 변경하지 않았다.

서버 요청마다 SDK baseUrl·AbortSignal을 전달하며 Game Feedback cookie 하나만 고정 API origin에 보낸다. 전역 fetch 교체 없이 Zod 검증·fallback·no-store를 유지하고 React cache는 request 안의 metadata/화면 중복 조회만 줄인다. 세션 초기화는 서비스 오류 경계 안에서 수행한다. 초기 snapshot은 같은 viewer일 때만 사용하며 자동 세션 조회도 이전 요청 취소·private cache 제거 후 새 세션을 확정한다. 이 과정에서 발견한 자동 계정 전환의 잔여 cache 경로를 고쳐 느린 profile 재조회 중 이전 계정 snapshot이 다시 보이지 않게 했다. 서버·브라우저의 가입일 표시는 Asia/Seoul로 일치시켰다.

색인은 실제 HTTPS origin·production·명시적 indexing=true·demo=false를 함께 요구한다. 알파·개발·데모는 기본 noindex이며 개인 채팅/알림/설정과 테스트 계정 상세는 항상 제외한다. 미번역 en/ja 경로는 ko canonical을 사용한다. `/og`의 PNG와 `/robots.txt`·`/sitemap.xml`을 추가했고 sitemap은 공개 목록·작성자만 중복 없이 순회한다. origin은 환경설정에서만 읽으며 사용자 Host 헤더를 반영하지 않는다. JSON-LD는 script 종료 문자와 Unicode 줄 구분자를 이스케이프한다. 500 cursor page/50,000 URL을 넘는 목록에는 분할 sitemap이 필요하며 범위 초과·API 실패·반복 cursor를 빈/불완전한 성공 응답으로 숨기지 않는다.

| 검증                       | 결과                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| API Vitest+Supertest       | 8개 파일·58개 통과. 공개 응답 필드·활동 집계·작성자 cursor·숨김/삭제·양방향 차단·비데모 접근 포함                                              |
| SDK Vitest                 | 3개 파일·32개 통과. 새 프로필 응답, 필수 ID 거부, 비공개 필드 제거, 요청별 server origin·cookie 분리 포함                                      |
| Web Vitest                 | 11개 파일·35개 통과. metadata·색인 조건·JSON-LD 탈출·공개 sitemap 순회/실패·cookie allowlist·자동 계정 전환 포함                               |
| Web Playwright             | 전체 20개 통과(약 1.1분). JS 비활성 crawler의 8개 화면 메타, 상세/프로필 HTML·JSON-LD·404, 차단된 metadata, 느린 계정 전환, 수정 후 title 포함 |
| Mobile Vitest / Playwright | 25개 / Android Chromium·iOS WebKit host 6개 통과(36.4초)                                                                                       |
| 후속 UI 검사               | 카드 링크 표현 변경 후 폼·SEO 7개 재검증 통과(30.6초)                                                                                          |
| 정적 검사·빌드             | 집계 타입/FSD lint·API/Web production build·Android/iOS Metro export 통과                                                                      |

구현은 설치된 Next 16.4 metadata·robots·sitemap 문서와 [Google DiscussionForumPosting](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum), [ProfilePage](https://developers.google.com/search/docs/appearance/structured-data/profile-page), [meta 지원 문서](https://developers.google.com/search/docs/crawling-indexing/special-tags)를 참고했다. 키워드 태그를 추가한 것을 검색 순위 보장으로 표현하지 않는다. 실제 공개 도메인·Search Console 등록·Google 색인/리치 결과·외부 OAuth·네이티브 실기기 검증은 수행하지 않았다. 기본 비공개 알파 상태를 유지한다. 재생성 대상 73개 파일의 hash가 재생성 전후 일치했고, 전체 format·diff 검사도 통과했다. 최종 소유 테스트 스키마 0개와 개발 고정 계정 3개·게시글 6개 보존을 확인했다. 소유 테스트 DB를 중지했고 개발 홈·게시글·공개 프로필·robots 응답 200과 메타데이터를 확인했다.

## canonical과 JSON-LD 보완

기존 페이지별 canonical과 게시글 `DiscussionForumPosting`·프로필 `ProfilePage`/`Person` JSON-LD에 홈·공개 안내 페이지의 구조화 데이터를 보완했다. 홈·가이드·약관·개인정보·문의는 하나의 `WebSite` 노드와 페이지별 `WebPage`(문의는 `ContactPage`)를 연결한다. 공통 SEO 모듈에서 metadata와 같은 경로·제목·설명을 사용하며 미번역 en/ja도 ko canonical과 일치한다. 채팅·알림·설정에는 개인 정보를 담는 JSON-LD를 생성하지 않는다. 설치된 Next JSON-LD 가이드와 [Schema.org WebSite](https://schema.org/WebSite)·[WebPage](https://schema.org/WebPage)·[ContactPage](https://schema.org/ContactPage)를 확인했다.

프로필 JSON-LD에 명시적인 url·페이지 이름·설명·언어를 추가했다. 작성글 cursor가 있으면 `ProfilePage`의 url·ID는 현재 canonical을 따르고, 같은 사용자를 나타내는 `Person`의 ID·url은 기본 공개 프로필 주소를 유지한다. JSON-LD script 종료 문자 이스케이프와 기본 알파 noindex 정책은 유지한다.

Web Vitest 11개 파일·37개, 타입 검사·FSD lint, 별도 출력 경로의 production build가 통과했다. JavaScript를 끈 crawler E2E 4개에서 공개 페이지의 JSON-LD·canonical 일치, private 화면의 구조화 데이터 제외, 미번역 경로·추적 query 정규화, 게시글·프로필·404·차단 접근·계정 전환을 확인했다(21.4초). 빌드와 동시 실행한 첫 브라우저 검증은 기존 계정 전환 사례가 시간 초과되어 빌드 종료 후 별도 실행으로 재검증했다. 개발 서버의 홈·문의·게시글·프로필도 200과 실제 canonical·JSON-LD 출력을 확인했다.

이전 head `b137d65`의 Game Feedback CI는 format·계약 생성·DS·집계 검사·단위 테스트·빌드를 통과했으나 Web E2E에서 실패했다. 로그에는 성공한 채팅 오류 주입 사례의 `route.fetch`가 테스트 종료 후 거부되어 다음 사례에 실패가 전파된 것으로 기록되어 있다. 응답 오염·오류 경계 테스트의 afterEach에서 [Playwright unrouteAll](https://playwright.dev/docs/api/class-page#page-unroute-all)의 `behavior: 'wait'`로 실행 중인 handler를 완료한 뒤 page를 닫도록 보완했다. 실패를 무시하는 catch나 재시도를 추가하지 않았다.

정리 보완 후 Web Playwright 전체 20개가 통과했다(약 1.3분). 전체 변경 파일의 Prettier·diff 검사도 통과했다. 잔여 `gf_test_*` 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. 이번 변경은 API·SDK·Mobile·의존성·공통 파일을 수정하지 않아 해당 레인의 검증을 반복하지 않았다.

## Framer Motion 인터랙션

Web에 `framer-motion` 14.3.0을 추가했다. `shared/motion`이 `LazyMotion`·`domAnimation`·`m`·전환 시간과 모션 선호 구독을 소유하며 Provider에서 앱 전체에 연결한다. 공통 디자인 시스템의 Button을 render prop으로 조합한 `MotionButton`을 홈 CTA·피드백 작성·채팅 전송에 사용한다. 색·크기·포커스·disabled·submit 동작은 공통 Button이 담당한다. 루트 lockfile에는 Web 의존성 연결과 Framer Motion·motion-dom·motion-utils 3개 항목만 추가했으며 기존 해석·다른 앱 manifest는 변경하지 않았다. `install --immutable`도 통과했다.

피드 카드가 처음 viewport에 들어올 때 짧게 나타나고 마우스로 올리면 3px 올라간다. 필터 탭의 밑줄, 버튼의 hover/press, 서버가 확인한 도움됨 아이콘, 새 채팅 메시지와 완료 알림에 짧은 전환을 적용했다. 기본 전환은 200ms, 도움됨 아이콘은 280ms다. 서버 HTML의 카드와 프로필은 처음부터 보이며 키보드 탐색은 실제 링크와 버튼을 사용한다. 채팅은 기존 기록을 다시 재생하지 않고 새로 추가된 마지막 메시지에만 진입 모션을 주며 기존 스크롤 높이·읽음 경계를 유지한다.

`MotionConfig`의 사용자 설정과 `useSyncExternalStore`의 media query 구독으로 모션 줄이기를 반영한다. 서버 snapshot은 모션을 줄이는 상태로 고정해 hydration을 맞추고 브라우저 설정이 바뀌면 구독 결과를 갱신한다. 카드의 불필요한 tap 포커스를 제거하고 도움됨 버튼의 tabindex를 명시했다. 완료 알림은 사라지는 즉시 status 역할·접근성을 내려 반복 안내와 닫기 중 조작을 막으며 중앙 정렬을 유지한다. 구현은 [Motion LazyMotion](https://motion.dev/docs/react-lazy-motion)·[MotionConfig](https://motion.dev/docs/react-motion-config)·[AnimatePresence](https://motion.dev/docs/react-animate-presence)와 설치된 Next Client Component 문서를 참고했다.

Web Vitest 37개·타입·FSD lint가 통과했다. 전체 Web Playwright 22개가 통과했으며(약 1.4분), 새 2개 사례는 일반/모션 줄이기 환경에서 카드 hover·실행 중 설정 변경·탭 URL/밑줄·키보드 Enter/Escape와 포커스 복귀·도움됨의 서버 확정·모바일 알림 중앙/닫기·가로 넘침·console/hydration 오류를 검증한다. 기존 계정 전환·모달·채팅·오류 복구와 JS 비활성 SEO 검증도 함께 통과했다. 390px 화면 캡처에서 알림 위치와 내용도 확인했다.

Android Chromium·iOS WebKit의 Mobile host 6개도 통과했다(36.2초). 별도 출력 경로의 Web production build와 마지막 모션 줄이기 전환 보완 후 브라우저 2개 재검증도 통과했다(16초). 변경 파일 Prettier·diff 검사, 잔여 테스트 스키마 0개를 확인했고 소유 테스트 DB를 중지했다. 네이티브 dev client·실기기 확인은 이 검증에 포함하지 않는다.

## 앱 경로와 인터랙션 설계

Web과 Mobile이 `packages/bridge`의 `appRoutes`·`resolveAppRoute`·`WebPathSchema`를 사용한다. 라운지는 `/:locale?tab=unanswered&q=...`, 게시글은 `/:locale/posts/:postId`, 공개 프로필은 `/:locale/users/:userId?cursor=...`, 채팅 목록은 `/:locale/messages`, 대화는 `/:locale/messages/:conversationId`다. 기존 `messages?conversation=<id>` 주소도 새 경로로 연결하며 대화 상세 canonical은 새 경로를 사용한다. 대화 metadata는 상대 닉네임·본문을 포함하지 않고 항상 noindex/nofollow다. REST API 경로·DB schema는 바꾸지 않았다.

루트 탭 간 이동과 채팅방 사이 이동은 replace, 목록에서 상세 진입은 push다. 상단 상세 뒤로 가기는 유효한 앱 이력을 사용해 필터가 있는 이전 피드·프로필로 돌아간다. 외부 링크로 바로 들어온 상세는 논리적 상위 화면으로 replace한다. 채팅방 헤더는 목록을 우선하고 Android 뒤로 가기는 실제 진입 이력을 우선한다. 라운지에서는 네이티브 종료를 요청한다. Next history state를 보존한 채 앱의 index·이전 경로·마지막 피드 필터만 추가하며 검색/탭을 되살릴 때도 새로운 탭 이력을 쌓지 않는다.

채팅 목록은 App Router의 messages layout이 소유해 대화방 경로가 바뀌어도 유지한다. 상위 화면 에러 경계의 key를 pathname에서 사용자 ID로 바꿔 정상적인 라우팅에서 layout 전체를 다시 만드는 문제를 해결했다. 설치된 Next `catchError`는 경로 이동 시 오류 상태를 자체 초기화한다. 계정 전환 때는 계속 private 화면을 다시 만든다. 화면 전환 모션은 공통 main에 180ms 진입 효과만 적용하고, 채팅 목록과 방은 같은 전환 영역으로 묶는다. 전체 화면 key나 이전 화면을 보존하는 exit animation을 추가하지 않으며 모션 줄이기를 따른다.

브리지 location은 query 변경도 전달한다. 준비된 WebView에서는 딥링크·동일 origin 새 창을 router로 보내고 동일 URL의 중복 요청을 무시한다. 피드 검색/탭과 프로필 cursor를 복구 주소에도 보존하고 중복 query·잘못된 인코딩·알 수 없는 경로는 거부한다. 웹 모달을 먼저 닫고 iOS swipe는 모달 중 비활성화한다. 필수 가입 안내는 뒤로 가기로 건너뛰지 않는다. 문서 교체 시 대기 중이던 뒤로 가기를 취소해 새 문서의 history로 잘못 전달하지 않는다. 800ms 응답 실패 시 기존 WebView history/종료 fallback은 유지한다.

집계 타입 검사·Web/Mobile FSD lint, Web Vitest 12개 파일·41개와 Mobile Vitest 8개 파일·28개가 통과했다. Web Playwright 전체 24개(약 1.5분)와 Android Chromium·iOS WebKit host 전체 10개(41.8초)도 통과했다. 새 사례는 필터가 있는 상세 복귀, 탭 이동 전후 history 길이, 채팅 목록 DOM 유지·방 replace, 기존 query URL 리다이렉트·private canonical, 직접 진입의 상위 화면/홈 종료, query location·warm 딥링크·동일 경로 중복 방지를 검증한다. 기존 실시간 채팅·읽음·재시도·계정 전환·오류 복구·모션·JS 비활성 SEO도 함께 통과했다.

별도 `.next/navigation-build` 출력 경로의 Web production build와 Android/iOS Metro export가 통과했다. 변경 파일 Prettier·diff 검사, 잔여 소유 테스트 스키마 0개·소유 테스트 DB 중지와 데이터 보존을 확인했다. 개발 홈·중첩 채팅 경로·API health는 200이며 고정 계정 3개·기존 게시글 6개를 보존했다. API·SDK·REST 계약·DB·의존성은 이번 경로 변경에서 수정하지 않아 해당 테스트를 반복하지 않았다. 네이티브 dev client·실기기·서명 빌드 검증은 포함하지 않는다. 경로별 정책은 [Mobile README](../apps/mobile/README.md#경로와-화면-전환)에도 정리한다.

## 공통 파일 변경 이유

루트 `package.json`에는 Game Feedback 전용 진입 명령만 추가하고 기존 Workspace·photo-contest 명령은 보존한다. `yarn.lock`은 기존 의존성을 유지하며 신규 프로젝트 의존성을 고정한다. 루트 README는 신규 프로젝트 위치·시작 방법만 추가한다. Game Feedback CI는 타입·테스트·빌드·생성 계약을 검사한다.

초기 프로젝트 추가 시 기존 lockfile의 2,012개 descriptor를 유지했으며 기존 항목의 해석 변경·삭제는 0개, 신규 항목은 138개다. 기존 프로젝트 의존성 변경과 신규 프로젝트 추가를 구분해 검토했다.

Web FSD 작업의 `yarn.lock` 변경은 이미 저장소에서 사용하는 overlay-kit·es-toolkit·ts-pattern·ESLint·Vitest와 공통 lint/TypeScript 설정을 Web Workspace에 연결하는 의존성 8줄 추가다. 기존 패키지의 버전 해석은 변경하지 않았다. 집계 scripts의 check/test는 새 Web 검사를 위임하며 루트 테스트 러너나 다른 앱 설정을 추가하지 않는다.

루트 `.prettierignore`는 `projects/game-feedback/docs/mvp-plan-v4.md`를 제외해 사용자 제공 원문의 표현을 보존한다. `projects/game-feedback/apps/api/openapi.json`도 정확한 경로로 제외해 서버 생성 결과가 별도 formatter에 의해 바뀌지 않도록 한다. 다른 신규 소스·문서는 저장소 Prettier 설정으로 검사한다. 기존 photo-contest 소스·DB·개발 서버는 변경하지 않는다.

## 별도 검증이 필요한 항목

| 항목               | 필요한 증거                                                      |
| ------------------ | ---------------------------------------------------------------- |
| 실제 Google 로그인 | 발급 자격 증명과 callback 등록 후 동의·재로그인·닉네임·탈퇴 확인 |
| 실제 Supercell API | 키·등록 IP·배포 출구 IP로 프로필·덱·실패 응답 실측               |
| 게임 계정 소유권   | 현재 UNVERIFIED. 덱/Battle Log 챌린지 POC 후 별도 설계           |
| 제품 수요·공급     | 요청자 10명·제공자 5~10명 모집, 수동 매칭·첫 답변 소요 시간      |
| 공개 운영          | 실제 연락처·연령·약관·개인정보·메시지 보유·신고 정책 검토        |
| 모바일 운영        | dev client·실기기, 실제 Google 앱 복귀, 서명·스토어 검증         |
| 공개 배포          | 운영 DB·HTTPS·비밀·출구 IP·모니터링·관리자 권한 검증             |
| 글로벌·후속 단계   | 영어·일본어 완성, 번역·분석·평판·팔로우·추가 게임                |
