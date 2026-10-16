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

`@side/game-feedback`는 `test`, `build`, `typecheck`, `check`를 앱·패키지에 위임한다. DB URL 가드·단위·PostgreSQL 통합 테스트는 API가 소유하고 브라우저 테스트는 Web이 소유한다. 루트·프로젝트 집계에는 테스트 파일·러너 설정·러너 의존성을 두지 않는다.

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

## 공통 파일 변경 이유

루트 `package.json`에는 Game Feedback 전용 진입 명령만 추가하고 기존 Workspace·photo-contest 명령은 보존한다. `yarn.lock`은 기존 의존성을 유지하며 신규 프로젝트 의존성을 고정한다. 루트 README는 신규 프로젝트 위치·시작 방법만 추가한다. Game Feedback CI는 타입·테스트·빌드·생성 계약을 검사한다.

기존 lockfile의 2,012개 descriptor를 유지했으며 기존 항목의 해석 변경·삭제는 0개, 신규 항목은 138개다. 기존 프로젝트 의존성 변경과 신규 프로젝트 추가를 구분해 검토했다.

루트 `.prettierignore`는 `projects/game-feedback/docs/mvp-plan-v4.md`를 제외해 사용자 제공 원문의 표현을 보존한다. `projects/game-feedback/apps/api/openapi.json`도 정확한 경로로 제외해 서버 생성 결과가 별도 formatter에 의해 바뀌지 않도록 한다. 다른 신규 소스·문서는 저장소 Prettier 설정으로 검사한다. 기존 photo-contest 소스·DB·개발 서버는 변경하지 않는다.

## 별도 검증이 필요한 항목

| 항목               | 필요한 증거                                                      |
| ------------------ | ---------------------------------------------------------------- |
| 실제 Google 로그인 | 발급 자격 증명과 callback 등록 후 동의·재로그인·닉네임·탈퇴 확인 |
| 실제 Supercell API | 키·등록 IP·배포 출구 IP로 프로필·덱·실패 응답 실측               |
| 게임 계정 소유권   | 현재 UNVERIFIED. 덱/Battle Log 챌린지 POC 후 별도 설계           |
| 제품 수요·공급     | 요청자 10명·제공자 5~10명 모집, 수동 매칭·첫 답변 소요 시간      |
| 공개 운영          | 실제 연락처·연령·약관·개인정보·메시지 보유·신고 정책 검토        |
| 공개 배포          | 운영 DB·HTTPS·비밀·출구 IP·모니터링·관리자 권한 검증             |
| 글로벌·후속 단계   | 영어·일본어 완성, 번역·분석·평판·팔로우·모바일·추가 게임         |
