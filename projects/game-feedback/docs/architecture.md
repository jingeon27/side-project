# 구조

`jingeon27/side-project`의 `develop`을 기준으로 기존 Workspace 안에 `projects/game-feedback`를 추가한다. 저장소의 Node.js 24, Yarn 4.17.0과 `node-modules` linker를 유지한다. 루트 Workspace는 이미 `projects/*`, 하위 앱·패키지, 공용 `packages/*`를 포함한다.

| Workspace                  | 역할                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `@side/game-feedback`      | 안전한 로컬 DB·실행·검증 명령                                                      |
| `@game-feedback/web`       | Next.js App Router, React, Tailwind, Radix Dialog, TanStack Query, React Hook Form |
| `@game-feedback/api`       | NestJS + Express, Zod 검증, Prisma, 외부 제공자 인터페이스                         |
| `@game-feedback/contracts` | 서버 요청 검증 및 공유 데이터 계약                                                 |
| `@game-feedback/sdk`       | OpenAPI에서 Orval로 생성한 클라이언트 및 스키마                                    |

집계 패키지는 `test`, `build`, `typecheck`, `check`를 앱·패키지 명령에 위임한다. API가 DB URL 가드·단위·PostgreSQL 통합 테스트를 소유하고 Web이 Playwright를 소유한다. 테스트 러너와 파일을 루트 또는 프로젝트 집계에 두지 않는다. 실행기는 Corepack이 선택한 저장소 Yarn을 사용하며 버전별 `.yarn/releases` 경로를 가정하지 않는다.

브라우저는 같은 출처의 `/api`를 호출하고 Next의 rewrite가 API로 전달한다. 이 구조로 HttpOnly 세션 쿠키와 OAuth callback이 Web 출처에 머문다. 로컬 Web은 3300, API는 4300이다. 비공개 알파에서는 한국어 콘텐츠를 우선하고 다른 locale의 준비 상태를 안내한다.

## 인증과 도메인

Google 제공자는 OAuth code를 검증해 `sub`를 서비스 계정과 연결한다. scope는 `openid`만 사용하며 공개 이름·사진·이메일을 자동 수집하지 않는다. 닉네임은 서비스 가입 입력으로 정하고 재로그인에도 유지한다. 세션은 HttpOnly 쿠키 `gamefeedback_session`으로 전달한다. production 쿠키는 HTTPS/Secure 설정을 전제로 한다.

Category는 DB에서 관리하고 카테고리 생성은 관리자만 수행한다. 공유 계약인 GameProfile은 정규화한 Player Tag와 게임 데이터를 표현하며 Prisma의 GameAccount는 사용자의 연결 프로필을 저장한다. 초기 소유권은 UNVERIFIED다. 피드백 요청에는 조회 시점 프로필·덱의 스냅샷을 보존해 이후 변경과 분리한다.

사용자 모델의 `isVerified`, `verifiedAt`, `supercellTag`는 DB에 보존한다. 응답의 `isTestAccount`는 서버의 데모 계정 정보로부터 결정하며 클라이언트 입력을 받지 않는다. 서비스 인증은 관리자만 변경하고, 일반 가입·로그인·프로필 입력은 이 권한을 부여하지 않는다. 게임 계정의 `UNVERIFIED` 소유권 상태와 의미를 구분한다. 대표 태그와 GameAccount는 제공자 조회 성공 후 하나의 DB transaction으로 갱신하고 기존 요청 스냅샷을 수정하지 않는다.

고정 테스트 계정 선택은 서버 allowlist의 사용자만 세션에 연결한다. 이 경로는 명시적 데모 모드와 비운영 환경에 한정한다. 정상 Google 세션과 동일한 작성자·참여자 권한 검사를 통과해야 하며 사용자 ID를 임의로 주입해 다른 계정으로 전환할 수 없다. 일반 모드의 테스트 계정 진입점과 데모 데이터는 비노출한다.

API는 `GET /api/auth/test-accounts`, `POST /api/auth/test-login`과 관리자 전용 `PATCH /api/admin/users/:id/verification`을 제공한다. 세션 전환은 이전 세션 토큰을 폐기하고 새 세션을 발급한다. 사용자 인증 변경은 AuditLog에 남긴다. `202610160003_user_test_accounts`는 기존 초기·채팅 Migration 이후에 적용하는 추가 Migration이다.

요청, 답변, 댓글은 작성자 권한을 서버에서 검사한다. 요청자만 자신의 요청에 달린 답변을 도움됨으로 표시한다. 답변 알림은 DB에 저장하며 확인 여부도 서버 상태로 관리한다. 차단 관계와 숨김 상태는 조회 및 작성 흐름에 반영한다.

## 영속 1:1 채팅

채팅은 REST로 대화·메시지를 읽고 쓰며, 같은 출처 `/api/chat/events`의 인증된 SSE로 상태 변경을 전달한다. 메시지 원본과 읽음 경계는 PostgreSQL에 보존한다. 서버 변경 이벤트를 받으면 관련 TanStack Query 조회를 갱신하므로 SSE 재연결 이후에도 DB가 진실의 원천이다.

대화 참여자 쌍은 사용자 ID를 정렬한 canonical pair와 DB unique 제약으로 정한다. 동시에 시작해도 같은 두 사람 사이에 방 하나만 생성한다. 모든 대화·메시지 경로에서 참여자와 양방향 차단 관계를 먼저 검사한다. 메시지 재전송은 발신자와 UUID `clientMessageId`로 중복을 막으며, 다른 대화의 기존 메시지를 반환해 정보를 노출하지 않는다.

읽음 요청은 필수 `messageId` 경계를 가진다. 서버는 그 메시지가 해당 대화에 속하는지 확인하고 경계를 앞으로만 이동한다. 요청 처리 중 도착한 더 최신 메시지는 이 경계에 포함하지 않는다. 이벤트 스트림은 세션 쿠키로 인증하고 로그아웃·세션 만료·탈퇴 후 종료한다. 차단 후에는 대화 노출과 전송을 모두 거부한다.

채팅 본문을 제3자 이벤트·오류 로그에 첨부하지 않는다. SSE 상태는 단일 API 프로세스 내에서 전달하므로 다중 인스턴스 배포에는 공유 pub/sub와 재연결·순서·중복 처리를 별도 검증해야 한다. 원본 첫 Migration은 유지하고 `202610160002_chat`의 추가 SQL로 확장한다.

## DB 경계

Prisma schema, Client, Migration은 `apps/api`에만 속한다. 서비스 DB와 역할은 `game_feedback` 전용이다. 테스트는 별도 서버/DB의 `gf_test_` 임시 스키마로 격리한다. PostgreSQL bootstrap 관리자와 앱 역할은 분리하고 앱 역할의 superuser/createdb/createrole 권한을 거부한다.

로컬 DB 관리자는 `.data/postgres-dev`와 `.data/postgres-test`만 관리한다. TCP loopback과 고정 전용 포트를 사용한다. 임의 포트 프로세스를 종료하지 않는다. 시작한 DB 소유 프로세스는 랜덤 토큰으로만 제어하며 관리자 비밀과 제어 메타데이터는 Git에서 제외한다.

Migration 실행 전 URL의 protocol, hostname, port, database, role, schema와 option을 검증한다. 검토된 SQL을 `prisma migrate deploy`로 적용하며 reset/db push를 실행하지 않는다. 원격 운영 Migration은 이 로컬 실행기를 우회해서 임의 실행하지 않고 별도의 운영 절차를 설계한다.

## API 계약과 갱신

Zod 서버 검증 스키마를 OpenAPI에 연결하고 Orval로 SDK와 검증 스키마를 생성한다. 안정적인 `errorCode`를 오류 응답에 포함하고 사용자 문구는 UI에서 선택한다. 생성 결과 차이는 계약 변경의 일부로 검토한다.

초기 사용자 콘텐츠에는 Next.js 데이터 캐시를 적용하지 않는다. Mutation 성공 후 TanStack Query의 관련 query를 갱신하고 재방문·포커스 복귀 때 새 상태를 조회한다. Cache Tags는 실제 성능 측정 후 검토한다.

요청 제한은 60초 단위로 적용한다. 인증된 일반 조회는 userId별 240회, 쓰기는 userId별 60회이며 같은 사용자의 세션·IP 변경으로 한도를 나누지 않는다. 비로그인 일반 요청은 IP별 한도를 사용한다. 로그인·가입·OAuth 시도는 사용자와 무관하게 IP별 30회다. 테스트 계정 목록은 일반 조회, 로그아웃은 일반 쓰기로 분류한다. 세션 조회 전에는 IP별 1,000회의 전체 요청 상한을 적용한다. 한도를 초과하면 `429 RATE_LIMITED`와 `Retry-After`를 반환한다. 이 제한은 API 프로세스 메모리에 있으므로 다중 인스턴스 운영의 공유 한도는 별도 검증이 필요하다.

## 외부 서비스 경계

실제 Google·Supercell 구현과 가짜 제공자를 분리한다. 테스트는 가짜 제공자를 강제하며 데모는 명시적 `GF_DEMO_MODE`와 개발 실행에서만 허용한다. production은 데모를 거부한다. Supercell 키·등록 IP가 없거나 제공자 조회가 실패하면 실제 데이터가 조회된 것처럼 성공 처리하지 않는다. 번역·이메일·분석 연동은 후속 범위다.
