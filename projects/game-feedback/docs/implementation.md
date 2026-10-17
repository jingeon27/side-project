# 구현 및 검증 기록

갱신일: 2026-10-17. 대상 저장소는 [jingeon27/side-project](https://github.com/jingeon27/side-project)이며 `develop`에서 분리한 `feat/game-feedback` Worktree에 구현한다. 사용자 제공 [MVP Plan v4.0 원문](mvp-plan-v4.md)은 수정하지 않는다.

## 구현 범위

- 한국어 중심 `/ko`, `/ja`, `/en` 경로, 최신순·미답변 피드, cursor pagination과 무한 목록.
- 게임 프로필 조회·연결, 대표 Supercell 태그 저장, 작성 시점의 태그·트로피·아레나를 표시하는 피드백 요청. 덱 카드 UI는 사용자 요청으로 제거했다.
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

## develop 병합 충돌 해결

`feat/game-feedback`의 `209e094`에 최신 `develop`의 `13ca201`을 merge해 PR #4의 충돌을 해결했다. `.prettierignore`에는 블로그 원문 MDX와 Game Feedback 계획 원문·생성 OpenAPI의 제외 규칙을 모두 보존했다. `yarn.lock`은 Yarn 4.17의 충돌 해결과 lockfile 갱신 모드로 두 프로젝트의 의존성을 함께 반영했다. 강제 push나 기본 브랜치 변경은 사용하지 않는다.

병합 전 기능 브랜치의 descriptor 2,132개와 develop의 2,297개를 병합 후 2,417개와 각각 대조해 누락·resolution 변경 0개를 확인했다. npm 항목의 체크섬·의존 관계를 포함한 전체 metadata 변경도 0개다. 블로그 파일은 develop과 동일하고, Game Feedback·공통 패키지 소스는 병합 전 기능 브랜치와 동일하다. Photo Contest의 develop 변경도 merge로 수용했다.

`install --immutable --mode=skip-build`, Game Feedback 집계 타입·Web/Mobile FSD lint, 공통 DS check(9개), Web Vitest 41개·Mobile Vitest 28개·SDK Vitest 32개가 통과했다. 전체 저장소 format과 diff 검사, 별도 `.next/merge-build` 출력의 Web production build, Android/iOS Metro export도 통과했다. 제품 코드·REST 계약·DB 변경이 없어 API DB 테스트와 브라우저 E2E는 이번 충돌 해결에서 반복하지 않았다.

## 언어 설정과 모바일 반응형

서비스 문구와 접근성 이름, SEO 제목의 가운데 점 구분을 문장과 쉼표 또는 제목의 `|`로 정리했다. 닉네임, 게시글, 답변과 메시지 원문은 변경하지 않는다. 테스트 계정의 서버 제공 설명만 화면에서 구분 문자를 정리한다.

`shared/i18n`이 지원 locale과 사전, 기기 설정 감지, 언어 쿠키와 React context를 소유한다. 새 패키지나 계정/DB 필드를 추가하지 않았다. `/` 진입 시 저장한 `gf_language`의 수동 선택을 우선하고 자동 선택이면 `Accept-Language`의 우선순위와 지역 태그에서 ko/en/ja를 선택한다. 지원 언어가 없으면 en이다. 정밀 위치 권한과 IP 조회는 사용하지 않는다. locale이 명시된 공유 경로는 그대로 존중한다. Proxy는 locale을 검증해 요청 헤더에 전달하고 서버 HTML의 lang도 실제 경로와 맞춘다.

로그인 전에도 설정과 상단 지구본에서 자동 선택, 한국어, English, 日本語를 고를 수 있다. 쿠키는 브라우저/WebView별로 저장하며 계정 간 동기화하지 않는다. 경로를 replace로 바꾸고 상세 ID, 검색과 cursor query를 유지한다. 새로고침과 다음 `/` 진입에도 수동 선택이 기기 설정보다 우선한다. 메뉴, 피드, 게시글과 댓글/답변 폼, 프로필, 채팅, 알림, 가입/설정, 오류 복구 등 주요 문구와 날짜 표시를 사전에 연결했다. 사용자 콘텐츠는 번역하지 않으며 가이드/약관 등 긴 안내는 한국어 원문 안내와 `lang="ko"`를 표시한다. 원문 콘텐츠를 기준으로 하던 기존 canonical과 JSON-LD 정책은 보존한다.

Mobile의 최초 주소를 `/ko`에서 `/`로 바꿔 저장한 설정과 기기 언어를 적용한다. 최초 redirect 전의 문서 주소를 한국어로 저장하지 않으며, 이후 복구는 실제 locale과 query를 유지한다. 모바일 채팅 상세는 전용 전체 높이 화면으로 표시하고 공통 상단 메뉴/하단 탭을 숨긴다. 목록으로 돌아가면 탭을 복원한다. visual viewport의 resize와 scroll에 맞춰 높이/상단 좌표를 갱신해 키보드가 차지하는 공간을 제외한다. Safe Area, 16px 입력 글자와 44px 하단 메뉴/언어 선택 영역, 긴 내용 줄바꿈과 유동 레이아웃을 적용했다. 소개 영역은 글과 장식을 별도 grid 열로 나누고 모바일은 장식을 숨겨 번역 문구와 겹치지 않게 한다.

공통 파일 변경은 `packages/design-system` Dialog의 선택적 `closeLabel`과 해당 테스트다. 기본 닫기 이름과 포커스/키보드 동작은 유지하며 Game Feedback만 현재 언어의 닫기 이름을 전달한다. 공통 색, 폰트, 버튼, Dialog 표현을 앱에서 복제하지 않는다. 모바일 Dialog의 visual viewport 배치만 앱에서 조정한다.

집계 타입 검사와 Web/Mobile FSD lint, Web Vitest 51개와 Mobile Vitest 29개, DS check 10개와 Photo Contest Web unit/UI 238개가 통과했다. Photo Web의 기존 `vitest` bin 누락은 선언된 패키지를 Node로 해석해 unit/ui CLI를 실행했으며 앱 설정은 수정하지 않았다. Web Playwright 전체 30개(약 2.1분)와 Android Chromium/iOS WebKit host 전체 12개(40.3초)가 통과했다. 자동 언어의 JS 비활성 최초 진입/필터 유지, 로그인 전 수동 선택/새 문서 복원/자동 재설정, WebView 언어 복원과 320/390/768/1440px의 주요 페이지, 모달 폭, 채팅 입력과 420px 높이 축소, 목록/탭 복귀를 검증했다. 새 화면 테스트는 공개 화면을 먼저 확인하고 private 동작 직전에 실제 테스트 계정으로 로그인해 같은 계정의 불필요한 반복 요청을 줄인다. 제품 요청 제한은 완화하지 않았다.

모바일 캡처에서 영문 소개와 장식의 겹침을 발견해 grid와 모바일 장식 숨김을 보완한 뒤 반응형/모션 6개를 재검증했다(46.5초). 320px 일본어 설정, 390px 영문 피드와 1440px 데스크톱 캡처를 확인했고 브라우저 pageerror도 없었다. 별도 `.next/locale-build`의 Web production build와 Android/iOS Metro export가 통과했다. 잔여 소유 테스트 스키마 0개를 확인하고 소유 테스트 DB를 중지했다. API, REST 계약, DB schema와 의존성은 변경하지 않았다. OS 키보드와 실기기, 서명 빌드는 별도 확인 대상이다.

## WebView 채널과 외부 상태 구독

`_pages/web-shell/model/web-view-channel.ts`의 `WebViewChannel` class가 WebView 참조, 마지막 복구 URL과 history, 로딩/연결 오류/모달/source/key snapshot을 소유한다. `useWebShell`은 셸마다 하나의 채널을 만들고 `useSyncExternalStore`로 구독한다. native host와 OS lifecycle 연결은 훅에 두고 중복된 화면 useState를 제거했다. 채널의 subscribe, getSnapshot과 ref callback은 인스턴스에 바인딩되어 있으며 변경이 없으면 동일한 immutable snapshot을 반환한다. 구독 해제는 React가 관리하고 ref 해제 후에는 네이티브 명령을 보내지 않는다.

준비된 문서의 location은 복구 주소에만 기록해 SPA 탐색을 문서 reload로 바꾸지 않는다. 준비 전 딥링크는 source로 반영한다. 재시도/Android renderer 복구는 마지막 URL과 새 key를 함께 반영하고 교체된 WebView의 history를 지운다. iOS content 종료는 로딩 상태를 복원한 뒤 reload한다. Android back 대기, 모달 우선 처리, hash 이동 구분과 인증 메시지의 origin/세대 검증을 유지한다.

Mobile Vitest는 9개 파일 34개가 통과했다. snapshot 참조 안정성/중복 알림 방지/구독 해제, 채널 인스턴스 분리, warm URL과 문서 source 분리, 복구 상태의 일괄 반영을 검증한다. RN Web UI에서 로딩/모달 상태의 구독 반영, OS listener 중복 설치 방지와 언마운트 후 WebView ref 해제를 확인했다. Mobile 타입 검사와 FSD lint, Android/iOS Metro export, 실제 native host를 연결한 Android Chromium/iOS WebKit E2E 12개 재검증(39.3초)과 전체 저장소 Prettier 검사도 통과했다. 잔여 소유 테스트 스키마 0개를 확인하고 테스트 DB만 중지했다. dev client/실기기 검증은 포함하지 않는다.

## Lifecycle, mutation options와 조회 경계

`ShellLifecycle`이 기기 foreground/background 전환, back 대기와 폐기 상태를 소유한다. `useShellLifecycle`은 let/ref 플래그 없이 OS 구독을 연결하고 해제한다. AbortController로 해제 뒤의 초기 링크와 back 응답을 무시하고, 후속 링크가 먼저 왔다면 늦은 초기 링크로 덮어쓰지 않는다. web back 요청이 거부되어도 history/종료 fallback으로 이어진다. `useWebShell`은 useCallback과 개별 lifecycle 의존성을 사용하며 props에 `satisfies WebViewProps`를 적용해 리터럴과 이벤트 인자 추론을 보존한다.

Web의 useRef 호출은 14곳에서 4곳으로 줄였다. 피드 무한 스크롤은 정리 함수를 반환하는 React 19 callback ref를 사용한다. 채팅은 callback ref와 `ChatScrollController`로 DOM 스크롤, 이전 기록 anchor와 자동 하단 이동을 처리하고 새 메시지 표시는 useSyncExternalStore로 구독한다. 읽음 재시도와 메시지 UUID는 mutation의 variables를 사용한다. 실패한 같은 본문의 재전송은 같은 UUID, 성공 뒤 의도적으로 다시 보낸 같은 본문은 새 UUID를 사용한다. 전송 중 중복 제출은 사용자/대화별 mutationKey로 QueryClient에서 즉시 차단한다. Toast 타이머는 UI 상태와 effect cleanup으로 관리한다. 남은 ref는 경로 전환의 이전 값, 검색 URL 반영 확인, 게시글 읽음의 중복 방지와 모달 해제 식별자이며 외부 동기화에 사용한다. useCallback은 함수 참조를 안정화하며 이 값 보존 역할을 대체하지 않는다.

9개 도메인의 mutation 26개는 `*.mutation-options.ts`의 `mutationOptions` 팩토리로 이동했다. mutationKey, REST IO, 캐시 무효화와 세션 교체 순서를 팩토리에서 관리하고 named public export로 공개한다. 기존 mutation 훅은 옵션을 연결해 원본 결과를 반환한다. query options의 scope/skipToken은 유지하며, 필수 인자가 있는 오버로드는 Suspense에 필요한 실행 함수를 타입 단언 없이 추론한다. 폼 검증, 초안과 예상 가능한 전송 실패는 폼/mutation 상태에서 처리한다.

`AsyncBoundary`는 기존 Next catchError, QueryErrorResetBoundary와 Suspense를 조합한다. 피드 목록, 알림과 대화 목록/대화창의 초기 로딩과 조회 오류를 영역 안에서 처리한다. 공개 게시글/프로필/작성글은 서버에서 받은 초기 데이터를 useQuery로 즉시 표시하고 throwOnError로 오류 경계에 연결한다. 이 서버 렌더 경로에는 불필요한 Suspense를 추가하지 않아 JavaScript 없이도 본문을 읽을 수 있다. 서버 초기 세션은 공통 오류 경계 안에 두고 RSC 슬롯 전체를 최상위 Suspense로 감싸지 않는다. 전체 서비스가 이른 streaming fallback에 숨거나 notFound의 HTTP 상태가 200으로 바뀌지 않도록 한다. 피드 검색과 탭, 채팅 목록 등 정상 형제 영역은 유지한다. 오류에는 안전한 복구 문구와 재시도만 표시하며 상세/대화 오류에는 상위 화면 링크를 제공한다. 서버 초기 데이터가 있는 게시글/프로필은 기존 SSR 원문과 SEO를 유지한다. 초기 데이터 없이 브라우저 쿠키와 상대 REST URL을 사용하는 조회만 clientOnly로 hydration 이후 시작해 서버에서 잘못된 상대 URL 조회나 인증 없는 private fetch를 하지 않는다. refetch 실패로 접근 권한이 달라진 경우에도 오래된 private 화면을 계속 표시하지 않는다.

Web에 dayjs 1.11.18과 utc/timezone plugin을 추가했다. shared/lib/date가 상대 시간, 날짜 구분 key와 읽음 시각 비교를 소유한다. 화면 문구 형식은 Intl을 유지하고 프로필/설정/채팅을 Asia/Seoul 시간대로 일치시킨다. 한국어/영어/일본어 표시는 함수 인자로 전달하며 사용자별 dayjs.locale 전역 변경은 하지 않는다. 루트 yarn.lock 변경은 이 Web Workspace의 직접 의존성과 신규 dayjs descriptor뿐이며 기존 패키지 해석을 변경하지 않았다.

채팅은 기존 REST 전송 + 인증된 SSE 변경 알림을 유지한다. `ChatRealtimeConnection`이 EventSource와 브라우저 이벤트 수명을 소유하고, 사용자별 hook effect가 해제한다. 쿠키 인증과 대상 사용자/대화별 무효화를 유지하며 SSE envelope는 Zod로 확인한다. 잘못된 이벤트는 무시하고 open/reconnect에서 REST를 다시 조회해 놓친 변경을 복구한다. error 후 세션 확인은 5초 간격으로 제한하고 완전히 닫힌 EventSource는 online/visible에서 새로 연결한다. 정상 EventSource의 자체 재연결, 서버 3초 retry와 5초 heartbeat, 연결 불가 중 10초 REST polling을 유지한다. 서버는 메시지 본문을 SSE에 싣지 않고 참여 권한과 live 세션을 다시 확인한다. 여러 API 인스턴스의 이벤트 공유 pub/sub는 여전히 별도 운영 작업이며 이번에 도입하지 않았다. SSE의 단방향 이벤트와 재연결 동작은 [MDN 문서](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), 조회 경계는 [TanStack Suspense 문서](https://tanstack.com/query/latest/docs/framework/react/guides/suspense)를 참고한다.

## 의미 없는 상태와 장식 제거

실제 접속/서버 상태와 연결되지 않았던 피드 LIVE와 게임 ACTIVE를 제거했다. MY PLAYER와 영문 대문자 장식 라벨, 프로필/알파/게임/탭의 점, 히어로의 궤도/별/떠 있는 카드와 장식 번호를 삭제하고 사용하지 않는 CSS도 정리했다. 소개와 빈 채팅 영역은 단순한 배경, 제목, 설명과 동작으로 구성한다. 피드 카드의 자동 진입 모션도 없애고 hover와 키보드 동작만 유지하며 모션 줄이기 변경 시 위치를 원점으로 돌린다. 기존 공통 DS의 색, 컨트롤과 필요한 탐색/게임 아이콘은 유지한다.

알림과 모바일 채팅의 점은 숫자 또는 읽지 않음 문구로 바꾸고 실제 SSE 연결 상태는 텍스트로 표시한다. 한국어/영어/일본어의 서비스 문구에 가운데 점을 사용하지 않는다. 사용자 작성 콘텐츠는 수정하지 않는다. UI 규칙은 Web AGENTS.md에도 기록했다.

이번 변경의 Web Vitest는 18개 파일 65개, Mobile Vitest는 10개 파일 38개가 통과했다. 프로젝트 타입 검사와 FSD lint, immutable install, Next 프로덕션 빌드, Android/iOS Metro export와 전체 저장소 Prettier 검사도 통과했다. Web 전체 E2E 실행에서는 31개 중 28개가 통과했고, 공개 SSR 본문/모션 줄이기 전환/접근 불가 대화의 오류 문구 3개 실패를 수정한 뒤 해당 파일의 8개 시나리오를 모두 재검증했다. 합쳐서 31개 고유 시나리오를 확인했으며 한 번의 전체 실행에서 31개가 통과한 결과로 표현하지 않는다. 공개 본문의 JavaScript 없는 렌더, 404 HTTP 상태와 프로필/게시글 SEO, 조회 실패의 지역 복구와 정상 형제 영역 유지, 계정 변경과 초안, SSE와 반응형 화면을 포함한다. Android Chromium/iOS WebKit의 native host E2E 12개도 통과했다. dev client/실기기 검증은 포함하지 않는다.

1440px 데스크톱과 390px 모바일 피드, 모바일 설정 화면을 직접 캡처해 확인했다. 장식용 점과 가로 넘침이 없고 브라우저 pageerror도 0개였다. 전용 테스트 DB의 잔여 `gf_test_*` 스키마는 0개이며 해당 테스트 DB만 중지했다. 실행 중인 Web 3300과 API 4300은 HTTP 200을 반환하고 고정 테스트 계정 3개와 기존 게시글 6개를 보존했다.

## 클래시 로얄 게임 아이콘

게임 메뉴, 피드의 게임 표시와 프로필 스냅샷의 일반 왕관 아이콘을 Supercell이 배포한 실제 클래시 로얄 앱 아이콘으로 바꿨다. `features/game-profile`의 `ClashRoyaleIcon`과 로컬 JPG를 재사용하고 Next Image로 최적화한다. 외부 이미지 서버에 런타임으로 의존하지 않으며 원본 출처와 확인일은 assets/README.md에 기록했다. 게임 이름이 있는 위치의 이미지 alt는 비워 중복 낭독을 피한다.

Web 타입 검사와 FSD lint, Vitest 65개, 변경 파일 Prettier와 diff 검사, Next 프로덕션 빌드가 통과했다. 실행 중인 개발 서버에서 1440px 데스크톱 피드와 390px 모바일 피드/게시글 상세를 캡처했다. 세 위치 모두 최적화된 로컬 이미지가 로드됐으며 가로 넘침과 브라우저 pageerror는 없었다. API/DB/SDK와 모바일 host 코드는 변경하지 않았다.

## 덱 카드 UI 제거

사용자 요청으로 덱 카드와 레벨 표시를 피드, 공개 프로필의 작성글 목록, 게시글 상세, 설정/프로필 연결 미리보기와 글쓰기에서 모두 제거했다. `Deck` 컴포넌트와 public export, PostCard의 deck 슬롯, 작성 폼의 미리보기 전용 useWatch와 사용하지 않는 전용 CSS/레벨 문구도 삭제했다. 프로필에는 게임 아이콘, 이름, 태그, 트로피와 아레나를 표시한다. 덱 첨부/보관 안내는 한국어/영어/일본어의 프로필 안내로 바꿨다. 기존 사용자 작성 내용과 서버의 저장 데이터/REST 계약은 보존하며 카드 데이터를 화면에 렌더하지 않는다.

Web 타입 검사와 FSD lint, Vitest 65개, Next 프로덕션 빌드와 변경 파일 Prettier/diff 검사가 통과했다. 격리된 Web/API/DB에서 작성/수정/삭제, 검색 복귀와 320/390/768/1440px 반응형 E2E 7개가 통과했다. 개발 화면의 데스크톱/모바일 피드, 상세, 공개 프로필과 글쓰기에서 카드가 없는 것을 확인했고, 설정/프로필 연결 미리보기/글쓰기는 한국어/영어/일본어로도 확인했다. 가로 넘침과 브라우저 pageerror는 없었다. 전용 테스트 스키마는 0개이고 테스트 DB만 중지했으며 고정 계정 3개와 기존 게시글 6개를 보존했다. API/SDK/DB schema와 모바일 host 코드는 변경하지 않았다.

## 게시판, Quill 글쓰기와 채팅 미디어

사용자 요청으로 피드백과 별도로 계정 거래/친선전 모집/친구 추가/일반 판매 게시판을 추가했다. Post.board의 기본값 FEEDBACK으로 기존 글을 보존하고 선택한 게시판만 목록/검색/페이지네이션에 포함한다. 공개 프로필 작성글과 sitemap은 전체 게시판을 포함하며 기존 차단/숨김/삭제 규칙을 유지한다. 게시판 글은 댓글과 작성자 채팅으로 연결한다. 피드백의 답변/도움됨은 기존 라운지에서 사용한다. 공유 appRoutes에 네 게시판 경로와 상세 문맥을 추가하고, 메뉴/모바일 탭/딥링크/직접 열린 상세의 상위 화면 복귀를 연결했다. 게시판마다 title/keywords/canonical과 CollectionPage JSON-LD를 제공한다.

Quill 2.0.3을 작성/수정 모달에 지연 로드한다. 굵게/기울임/밑줄/취소선, 제목 2/3, 순서/글머리 목록, 인용과 HTTP(S) 링크를 지원한다. Quill 수명은 class/callback ref가 관리하며 해제 뒤 import 결과를 무시한다. 초기화 실패는 편집기 영역의 오류 경계와 외부 store로 전달하고 요청 오류를 별도 React 상태로 복제하지 않는다. 편집기를 label 안에 넣어 툴바 버튼이 잘못 실행되는 구조를 피했다. 툴바/링크 입력은 한국어/영어/일본어 문구와 공통 디자인 토큰을 사용한다.

본문은 Zod로 검증한 Delta document와 평문 body를 함께 저장하며 서버에서 두 값의 일치를 확인한다. 허용된 문자열 insert와 서식 속성만 받고 실행 가능한 URL/객체 embed/임의 속성은 거부한다. React 요소로 제목/목록/인용/링크를 렌더해 사용자 HTML을 실행하지 않는다. 검색, 발췌와 SEO 구조화 데이터는 평문을 사용하고 기존 문서는 평문으로 표시한다. 편집 중 지원하지 않는 서식이나 문서 한도를 만나면 폼 검증으로 등록을 막고 초안을 유지한다. 본문을 수정하는 구형 클라이언트가 document를 보내지 않으면 이전 서식을 지워 본문과 엇갈리지 않게 한다. 생성 중 드러난 링크 RegExp 변환 문제는 계약의 원본 패턴에서 수정한 뒤 OpenAPI/Orval을 재생성했다.

채팅은 multipart 업로드 후 첨부 ID와 기존 재전송 UUID로 메시지를 전송한다. 현재 UI는 파일 한 개, 서버는 메시지당 최대 4개와 파일당 25MB를 허용한다. 본문 없는 미디어 메시지와 전송 실패 초안/파일 보존, 같은 UUID의 중복 방지와 SSE 갱신을 지원한다. JPEG/PNG/GIF/WebP/MP4/WebM의 MIME과 파일 signature/실제 크기를 확인한다. 미전송 파일은 올린 사용자만 볼 수 있고 다른 사용자/대화의 파일을 메시지에 연결하지 못한다. 첨부 연결은 대화 lock 안의 메시지 transaction으로 처리한다. 업로드는 사용자별 lock으로 미전송 4개 제한을 지키고 오래된 미전송 파일은 해당 사용자의 다음 업로드 때 24시간 기준으로 정리한다. 화면 해제/선택 변경에서도 미전송 파일 제거를 요청한다.

파일과 메타데이터는 전용 PostgreSQL의 ChatAttachment에 저장한다. 메시지/대화 JSON에는 bytes를 조회하거나 노출하지 않는다. GET은 현재 세션, 대화 참여, 차단과 데모 접근 규칙을 확인하고 인증된 no-store 응답으로 제공한다. 동영상의 206/416 byte range와 UTF-8 파일명을 처리한다. 계정/대화 삭제 때 연결 파일도 cascade로 삭제한다. 대용량 운영의 오브젝트 스토리지는 이번 구현에 포함하지 않았다. 이미지 확대는 공통 Dialog로 열어 WebView의 보호된 API URL을 외부 창으로 보내지 않는다. 동영상은 inline 재생하며 iOS 파일 선택/촬영 용도 문구를 네이티브 설정에 추가했다. 모바일 Enter는 줄바꿈이고 데스크톱 포인터/키보드 조건에서만 Enter 전송 안내를 표시한다.

Migration 202610170005_community_media는 Post의 board/document와 첨부 테이블/인덱스만 추가하며 기존 데이터는 수정/삭제하지 않는다. 계약 → OpenAPI → Orval 경로로 JSON operation 45개를 생성한다. JSON 본문의 제한은 서식 문서를 위해 256KB로 조정하고 파일 크기는 별도로 제한한다. 원래 서비스의 요청 제한과 세션/Origin/권한 검사는 유지한다. E2E의 빠른 공용 계정 반복으로 조회 제한에 도달한 문제는 API 소유 test:server 진입점을 분리해 해결했다. 이 진입점은 NODE_ENV=test, 전용 테스트 DB/schema, 4301/4302와 대응 Web origin, 외부 자격 증명 없음 조건을 확인하고 테스트의 속도 제한만 끈다. 일반 서버의 HTTP 240회 후 429/Retry-After 동작은 별도 API 통합 테스트로 확인한다.

루트 yarn.lock 변경은 Quill의 Web 직접 의존성과 신규 전이 descriptor 7개만 추가하며 기존 resolution은 유지한다. Photo Contest와 공통 DS 제품 코드는 변경하지 않았다. Quill과 WebView 구현은 [Quill Delta](https://quilljs.com/docs/delta), [Quill React 예제](https://quilljs.com/playground/react), [WebView 파일 업로드 가이드](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md#add-support-for-file-upload)를 참고했다. 실기기 파일 선택/권한창과 실제 Google/Supercell 검증은 브라우저/번들 검사와 구분한다.

이번 변경의 최종 검증 결과는 다음과 같다.

| 범위            | 실행 명령과 결과                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 설치/정적 검사  | Node 24에서 `yarn install --immutable`, `yarn workspace @side/game-feedback check`, 루트 `format:check`, `git diff --check` 통과                                                                          |
| API             | `yarn workspace @game-feedback/api test` 10개 파일 66개 통과. 게시판 분리/문서 검증, 미디어 접근 권한/원자적 연결/삭제/Range/실제 HTTP 요청 제한 포함                                                     |
| SDK             | `yarn workspace @game-feedback/sdk test` 3개 파일 33개 통과. multipart boundary와 응답 Zod 검증 포함                                                                                                      |
| Web unit/UI     | `yarn workspace @game-feedback/web test` 20개 파일 70개 통과                                                                                                                                              |
| Mobile unit/UI  | `yarn workspace @game-feedback/mobile test` 10개 파일 38개 통과                                                                                                                                           |
| Web E2E         | `yarn workspace @game-feedback/web test:e2e` 전체 35개 통과(2.7분). 마지막 편집기 폼 검증 보완 뒤 `e2e/community.spec.ts` 2개 재검증 통과(33.2초)                                                         |
| Mobile host E2E | `yarn workspace @game-feedback/mobile test:e2e` Android Chromium/iOS WebKit 전체 12개 통과(45.8초)                                                                                                        |
| 생성/빌드       | `yarn workspace @side/game-feedback codegen` 전후 생성 파일 77개 hash 동일. `NEXT_DIST_DIR=.next/community-build yarn workspace @side/game-feedback build`의 API/Web 빌드와 Android/iOS Metro export 통과 |

Web E2E에서 네 게시판의 Quill 작성/수정/새로고침과 서식 유지, JavaScript 없는 상세 HTML, canonical/JSON-LD, 모바일 320px을 확인했다. 실제 JPEG 업로드와 상대방 이미지 로드/확대/새로고침, 서버 저장 뒤 응답 실패를 가정한 UUID 재전송의 중복 방지, 미디어 전용 메시지를 확인했다. 실제 생성한 WebM은 브라우저 decode와 상대방 쿠키의 Range 206 응답까지 검사했다. 1440/390px 게시판/편집기와 모바일 이미지 채팅 캡처에서 가로 넘침이 없고 수동 브라우저 pageerror는 0개였다.

첫 Mobile host 실행은 10/12가 통과했고, 시간 초과와 개발 소스 갱신 중 Fast Refresh가 발생한 두 사례를 확인한 뒤 소스 갱신 없이 전체 12개를 다시 검증했다. 최종 잔여 테스트 스키마는 0개이며 이번 테스트 DB만 중지했다. 개발 Web 3300/API 4300은 HTTP 200이고 고정 계정 3개와 기존 게시글 6개를 보존했다. 실기기 파일 선택/촬영/OS 권한창과 서명 빌드 검증은 포함하지 않는다.

## 전체 피드, 공통 게시판 5종과 유료 코칭

홈은 피드백 전용 라운지에서 모든 게임/게시판의 글을 모은 피드로 변경했다. 별도 랜딩 소개를 제거하고 제목/글쓰기/검색과 최신 글을 먼저 보여준다. 최신 목록은 board=ALL로 조회하며 답변 대기는 FEEDBACK만 조회한다. 라운지 문구, 메뉴, 글 카드, 프로필 작성글과 SEO를 피드/게시글 기준으로 맞췄다.

모든 게임이 피드백/친추판매/친선전 모집/게임코치/자유게시판을 공통으로 사용한다. `features/board`의 gameBoards는 게임과 독립적인 공통 설정이며 활성 카테고리에서 게임 메뉴를 만든다. 게임별 메뉴/화면을 복제하지 않는다. 기본 클래시 로얄 경로를 보존하고 다른 게임의 종류별 경로에는 game slug query를 전달한다. 서버는 활성 게임을 검증하고 목록의 category, 검색, 글쓰기, 상세/뒤로 가기, WebView 딥링크, canonical/JSON-LD/sitemap에 같은 게임 문맥을 적용한다. 다른 게임의 아이콘에는 기본 게임 아이콘을 사용하고 클래시 로얄 프로필 첨부를 강제하지 않는다.

게임코치는 돈을 받고 가르치는 코치의 수강생 모집과 수강생의 코치 구함을 지원한다. Post.coaching JSON에 COACH/STUDENT 역할과 시간당 원화 수강료/희망 수강료를 저장한다. 1~10,000,000원 정수 또는 null(협의)을 받으며 카드/상세에 실제 저장값을 표시한다. 본문에서 가격/역할을 추측하지 않는다. 코칭 외 글의 코칭 정보, 코칭 글의 필수 정보 누락/제거와 잘못된 금액을 거부한다. 수정은 메타데이터를 유지하며 삭제 때 비운다. 글쓰기에서 게시판을 바꾸면 숨겨진 코칭 입력이 등록을 막지 않게 초기화한다. 코칭 상담은 작성자와 기존 1:1 채팅을 열며 결제/정산/예약 확정 기능은 포함하지 않는다.

사용자가 유지하도록 확인한 친추판매/친선전 구조를 반영하고 계정 거래/기존 친구 추가/일반 판매 경로와 계약을 제거했다. 폐지한 기존 글은 저장소에 유지하되 공개 조회/상세/프로필 집계/알림/사이트맵에서 제외한다. 기존 글 자동 재분류나 삭제는 없다. Migration 202610170006_coaching_details는 coaching JSON 열만 추가한다. 새 의존성과 루트/다른 서비스 제품 코드 변경은 없다.

이번 변경의 검증 결과는 다음과 같다.

| 범위            | 결과                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 타입/린트       | `yarn workspace @side/game-feedback check` 통과. 마지막 GameSlug를 카테고리 입력의 허용 문법과 일치시킨 뒤 전체 타입/Web/Mobile lint 재검사                                                                                                 |
| API             | Vitest+Supertest 10개 파일 69개 통과. 유료 코칭 역할/금액/수정/필수값 검증, 폐지 게시판의 비공개 유지, 두 번째 게임의 5종 생성/목록 분리 포함                                                                                               |
| SDK             | Vitest 3개 파일 33개 통과                                                                                                                                                                                                                   |
| Web unit/UI     | Vitest 20개 파일 72개 통과                                                                                                                                                                                                                  |
| Mobile unit/UI  | Vitest 10개 파일 38개 통과                                                                                                                                                                                                                  |
| Web E2E         | 전체 38개 중 33개 통과. 로딩/영문 글쓰기의 이전 문구를 찾던 5개 시나리오의 선택자를 수정한 뒤 해당 api-response/responsive 파일의 7개 전부 재검증 통과(46.9초). 38개 고유 시나리오를 검증했으며 한 번의 전체 실행 38개 통과로 표현하지 않음 |
| Mobile host E2E | Android Chromium/iOS WebKit 전체 14개 통과(52.6초). 코칭/자유게시판의 다른 게임 딥링크, 금액 표시와 native back 포함                                                                                                                        |
| 생성/빌드       | `codegen` 전후 생성 파일 78개 hash 동일. `.next/five-boards-build`의 API/Web production build와 Android/iOS Metro export 통과                                                                                                               |

브라우저에서 일반 글과 유료 코칭의 전체 피드 합류, 답변 대기의 피드백 한정, 코치의 수강생 모집/수강생의 코치 구함, 시간당 수강료와 협의, 실제 1:1 채팅 문의를 확인했다. 두 번째 게임을 관리자 API로 등록하면 동일한 5개 메뉴가 표시되고 게임별 목록/폼/상세/복귀와 canonical이 분리되는 것도 확인했다. 개발 환경의 1440/390/320px 피드와 코칭 작성 모달을 직접 캡처했고 가로 넘침과 pageerror는 0개였다. 수동 검사는 초안만 작성하며 개발 게시글은 추가하지 않았다. 잔여 테스트 스키마 0개를 확인하고 이번 테스트 DB만 중지했다. 개발 사용자 7명/고정 테스트 계정 3개/기존 게시글 6개를 보존했고 피드/코칭/자유게시판과 API health는 HTTP 200이다. 실제 OS 파일 선택/권한창, 실기기와 외부 Google/Supercell 검증은 포함하지 않는다.

특정 게임이 모든 페이지의 공통 keywords에 섞이지 않도록 기본 키워드를 게임 커뮤니티/게임 피드백/게임코치로 바꾸고 실제 게임 키워드는 페이지별로 전달한다. 이 후속 변경 뒤 SEO Vitest 7개, JavaScript 비활성 SEO E2E 4개(28.9초), Web production 재빌드와 format 검사가 통과했다.

## 친추판매 금액과 API 규격 자동 생성

친추판매 작성/수정에 판매 금액(원)을 추가했다. `friendSale: { price: number | null }` 계약과 JSONB 열에 저장하며 피드·게시판 카드와 상세에서 같은 원화 표시를 사용한다. 1~10,000,000원의 정수만 받고 문자열·소수·0·음수·범위 초과를 거부한다. 빈 입력은 명시적 가격 협의이며 메타데이터가 없는 기존 글은 판매 금액 미등록으로 구분한다. PATCH에서 생략한 금액을 보존하고 다른 게시판의 가격 입력/친추판매 메타데이터 제거를 거부한다. 게시판을 바꾸면 숨겨진 금액/코칭 필드를 초기화해 다른 종류의 등록을 막지 않는다. 금액 오류에는 SDK fallback을 적용하지 않는다. Migration 202610170007_friend_sale_price는 nullable JSONB 열만 추가하고 기존 글이나 사용자 데이터를 수정하지 않는다.

OpenAPI JSON과 SDK는 계속 생성 결과로 관리한다. 공통 prerequisites에 서버 계약 빌드 → 전용 Prisma → OpenAPI → Orval 생성을 연결해 프로젝트의 개발 실행/setup/check/typecheck/test/E2E/build 시작 시 자동 준비한다. 명시적 codegen도 같은 경로를 사용하고 생성 JSON을 수동 편집하지 않는다. 실행 중 계약을 바꾸면 codegen 재실행 또는 서버 재시작이 필요하다. Git에 포함한 생성 결과는 CI의 재생성 diff 검사로 누락을 확인한다. API 규격이 같으면 같은 파일을 다시 만들어도 diff가 없다.

기존 PR의 Game Feedback CI 실행 39009556420은 Web typecheck에서 이미지 모듈 선언이 없어 실패했다. 로컬의 Next 생성 next-env.d.ts가 문제를 가렸으므로 `shared/types/next-image.d.ts`에서 Next의 공식 이미지 선언을 가져오게 했다. next-env.d.ts와 .next 전체를 제외한 별도 TypeScript 설정으로 초기 체크아웃 조건의 typecheck 통과를 확인했다. 생성 next-env.d.ts는 편집하거나 커밋하지 않았다.

| 검증         | 결과                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 정적 검사    | 프로젝트 전체 check/typecheck와 Web/Mobile lint 통과. 이미지 선언 추가 후 Web lint와 next-env/.next 없는 타입 검사 통과                                                             |
| API          | Vitest+Supertest 10개 파일 70개 통과. 금액 저장/목록/수정/협의, 잘못된 타입/범위/다른 게시판 거부와 기존 글 보존 포함                                                               |
| SDK          | Vitest 3개 파일 34개 통과. 금액 누락/협의/실제 금액 보존과 잘못된 응답의 fallback 없는 거부 포함                                                                                    |
| Web / Mobile | Vitest 각각 20개 파일 72개, 10개 파일 38개 통과                                                                                                                                     |
| Web E2E      | community/feed-coaching 6개 통과(53.9초). 데스크톱 실제 가격 등록/수정, 피드·카드 표시와 JS 비활성 HTML, 320px 영문 모바일의 협의 등록/가격 수정/재조회, 코칭과 다른 게임 회귀 포함 |
| 생성 / 빌드  | 프로젝트 build의 API/Web production과 Android/iOS Metro export 통과. 자동 재생성 전후 생성 파일 79개 hash 동일                                                                      |

E2E 최초 실행은 피드의 같은 제목을 먼저 찾는 새 모바일 테스트 선택자가 상세 이동 전에 통과해 실패했다. 상세 h1을 기다리도록 수정한 뒤 관련 6개 전체를 재실행해 통과했다. 개발 화면 1440/390/320px에서도 금액 입력을 확인했고 가로 넘침/pageerror는 0개다. 수동 확인은 저장하지 않은 초안만 사용했다. 개발 사용자 7명, 고정 테스트 계정 3개와 기존 게시글 6개를 보존했다. 잔여 gf_test_ 스키마 0개를 확인하고 소유 테스트 DB만 중지했다. 모바일 네이티브 셸 제품 코드는 변경하지 않았으며 이번 후속 검증에서 실기기나 native host E2E를 다시 실행하지 않았다.

## 글쓰기 분류 변경, OpenAPI 추적 제외와 API 단독 테스트

글쓰기의 게시판 필드명을 분류로 변경했다. 홈과 게임별 메뉴 어디서 열어도 다섯 종류를 선택할 수 있고 진입 메뉴는 기본값으로만 사용한다. 한국어/영어/일본어에서 분류/Category/分類로 표시한다. 작성 모달의 제목을 글쓰기로 통일해 게임코치에서 다른 분류로 바꿔도 이전 분류가 모달 제목에 남지 않도록 했다. 분류 전환 시 제목/서식 본문/게임은 보존하며 친추판매·코칭 입력은 해당 분류에서만 전송한다. 등록 후에는 진입 메뉴가 아니라 서버가 저장한 분류와 게임을 상세 경로에 전달하므로 실제 분류의 목록으로 복귀한다. 이미 등록한 글의 분류를 바꾸는 API는 이번 요청의 범위에 포함하지 않는다.

사용자 요청에 따라 중간 생성물인 apps/api/openapi.json을 Git 추적에서 제거하고 프로젝트 .gitignore에 등록했다. 기존 자동 생성 준비 경로는 유지하며 파일이 없는 초기 체크아웃에서도 Zod와 경로 정의로 다시 생성한다. 생성 SDK는 계속 추적한다. 루트 공통 파일 중 .github/workflows/game-feedback.yml 변경은 추적하지 않는 JSON diff를 제거하고 생성 SDK diff를 검사하도록 이름/범위를 맞추기 위해 필요했다. SDK의 모든 JSON operation에 응답 검증이 연결되는 검사도 유지한다. 위 친추판매 후속 기록의 생성 JSON 추적 정책은 이 요청으로 대체한다.

API에는 Vitest/Supertest 의존성과 HTTP 통합 테스트가 있었으나 API 워크스페이스 test를 직접 실행하면 TEST_DATABASE_URL이 없을 때 DB 통합 테스트를 skip할 수 있었다. API 소유 scripts/test.mjs와 vitest.config.mts를 추가해 API 단독 명령도 Node 24/전용 DB URL 확인 → 계약 빌드 → 전용 Prisma → 소유 테스트 DB 시작 → Vitest/Supertest 실행을 준비한다. 외부 제공자 인증정보를 비우고 개발 DB 연결은 거부한다. Vitest 원시 호출의 테스트 URL 누락도 설정 단계에서 실패한다. 루트 test는 같은 API 명령을 호출하며 중복 DB 시작 코드를 제거했다. API 실행 방법과 격리/정리 범위는 apps/api/README.md에 정리했다. 런타임 API 계약/데이터베이스/새 라이브러리 의존성은 변경하지 않았다.

이번 변경의 검증 결과는 다음과 같다.

| 검증                | 결과                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 초기 생성/정적 검사 | 로컬 openapi.json을 지운 상태에서 프로젝트 check 통과. JSON 재생성 hash 동일, Git 미추적/ignore와 SDK 생성 diff 없음 확인. Web/Mobile lint와 전체 타입 검사 포함 |
| API 단독 실행       | 외부 TEST_DATABASE_URL/DATABASE_URL/NODE_ENV 없이 API test 실행. Vitest+Supertest 10개 파일 70개 전부 통과, skip 없음                                            |
| API 실패 경로       | raw Vitest의 테스트 URL 누락과 API test의 개발 DB URL을 의도적으로 주어 각각 설정/준비 전에 실패함을 확인                                                        |
| SDK / Web unit      | SDK 3개 파일 34개, Web 20개 파일 72개 통과                                                                                                                       |
| Web E2E             | 분류/친추판매/코칭 관련 6개 통과(57.0초). 이후 전체 39개 통과(3.2분), 모바일 분류 전환/본문 보존/목록 복귀와 다른 게임/채팅/SEO 포함                             |
| Web production      | .next/category-build에서 프로덕션 빌드와 타입 검사 통과                                                                                                          |

이전 CI 실행 39010204258은 타입/단위 테스트/API 70개/빌드는 통과했으나 Web E2E 39개 중 한 개가 Next 개발 프록시에 대한 직접 GET의 ECONNRESET으로 실패했다. 해당 Web 시나리오는 중복 직접 API 조회 대신 실제 피드백 목록으로 이동해 검색 결과가 비어 있는지 검증하도록 수정했다. 서버의 게시판 분리 검증은 기존 API Supertest 테스트에서 계속 수행한다. 위 전체 Web 실행은 변경한 사용자 흐름을 포함해 39개 전부 통과했다.

전체 실행 중 공개 프로필의 상대 시간이 SSR과 클라이언트 사이에서 분 경계를 지나며 hydration 차이가 나는 것을 확인했다. 글 카드/상세의 상대 시간 텍스트에만 suppressHydrationWarning을 적용해 화면 전체가 다시 렌더되는 것을 막았다. 전체 39개 실행 이후의 이 작은 후속 변경은 Web production/타입/lint와 브라우저 시계를 서버보다 400일 뒤로 설정한 공개 프로필/상세 검사에서 검증했다. 클라이언트 재조회까지 기다린 결과 pageerror는 0개였다. 다른 본문·사용자·권한 오류를 숨기지 않는다.

개발 사용자 7명/고정 계정 3개/기존 게시글 6개를 보존했다. 잔여 gf_test_ 스키마 0개를 확인한 뒤 소유 테스트 DB만 중지했다. 이번 후속 변경에서는 Mobile 제품 코드/네이티브 host를 바꾸지 않았고 Mobile E2E를 다시 실행하지 않았다.

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
