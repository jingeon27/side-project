# API 도메인

## 구조

- 기능 모듈: `auth`, `group`, `contest`, `submission`(업로드·사진 조회 포함), `like`, `vote`, `moderation`, `analytics`, `maintenance`, `health`. 공통은 `config`(env·limits·paths), `common`(errors·validation·crypto·http·graphql), `database`, `storage`.
- 모듈 하나 = `<name>.graphql` + `<name>.module.ts` + `<name>.resolver.ts` + `<name>.service.ts`. GraphQL 스키마는 모듈별 `.graphql`이 계약이고(웹 codegen 입력), `app.module.ts`가 `src/**/*.graphql`을 합친다.
- resolver·controller는 얇게: 조회자 확인 + service 위임. 규칙과 권한은 service에 둔다. 권한 확인은 `membership.service`(requireMember·requireAdmin·requireOwner·accessibleContest)로만 한다.
- 조회자별 필드(likedByMe, isAdmin, votedSubmissionId, hiddenSubmissions)와 비싼 필드(members, contests, leaderboard)는 field resolver로 선택될 때만 계산하고 N+1을 만들지 않는다.
- 매직 넘버는 `config/limits.ts`, 환경변수는 `config/env.ts`의 getter로 호출할 때마다 읽는다(테스트가 실행 중에 바꾼다). 미디어 저장소는 항상 S3 설정(`S3_*`)을 쓴다.
- 닫힌 집합 분기(Phase, 오류 코드→HTTP, provider)는 ts-pattern `exhaustive()`, 묶기·nil 검사는 es-toolkit. 직접 유틸을 만들지 않는다.

## 비동기 흐름·콜백

- Promise의 성공 값 투영과 오류 처리는 `async`/`await`·`try`/`catch`를 우선한다. 병렬 작업의 `Promise.all`과 오류 전달·추가 오류 보고 순서는 유지한다. 재할당을 피하려고 일회성 async IIFE나 가변 ref 객체를 만들지 않는다.
- 인자를 그대로 전달하는 불필요한 콜백은 함수 참조로 줄인다. 단, 클래스 메서드는 `this`가 필요하므로 타이머·단계 실행 콜백에서 `() => this.method()`를 무작정 제거하지 않는다.
- 스케줄러는 실행을 직렬로 대기하고 이전 실패 뒤에도 다음 실행을 이어 간다. 호출자의 실패 Promise와 종료 대기용 Promise를 구분하며, 완료 시 `this.running`이 자기 Promise일 때만 비운다. 종료 훅은 마지막 대기 작업까지 기다린다.

## 오류

- `fail(message, ERROR_CODE)`는 GraphQLError 호환 `DomainError`를 던진다. 타입 있는 `code`와 기존 `extensions.code`를 함께 유지하고 REST 필터는 같은 상태·본문으로 연결한다. HTTP 매핑: UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, RATE_LIMITED 429, UNAVAILABLE 503, 그 밖 400. REST 오류 본문은 `{ message }`.
- 사용자에게 보이는 한국어 메시지를 바꾸면 웹·테스트도 같이 바꾼다. INTERNAL_SERVER_ERROR는 메시지를 가리고 Sentry로만 보낸다.

## 인증

- 세션은 HttpOnly 쿠키 하나(43자 base64url)이며 이름은 `auth/session/auth-cookie.ts`가 정한다: 운영(https)은 `__Host-contest_session`, 개발·테스트(http)는 `contest_session`. cookie-parser 없이 `common/http/cookie-header.ts`가 `Cookie` 헤더 원문을 파싱한다: 같은 이름은 첫 값, 8KB 초과·깨진 형식·잘못된 길이는 비로그인. DB에는 해시만 저장한다.
- `session.service`가 요청당 한 번만 조회한다(WeakMap). GraphQL·REST 모두 `@Viewer()`/`@OptionalViewer()`를 쓴다. Authorization 헤더는 보지 않는다.
- GET·HEAD·OPTIONS가 아닌 요청은 Origin이 WEB_ORIGIN이어야 한다(인증보다 먼저 403). GraphQL은 csrfPrevention.
- 아이디·비밀번호는 `PasswordCredential`에 scrypt 해시만 저장하고 `registerWithPassword`·`loginWithPassword` mutation으로 가입·로그인한다. 기존 세션을 교체하며 DB 기반 반복 시도 제한과 일반화된 로그인 실패 문구를 유지한다. 자세한 규칙은 API auth 스킬.
- 익명 세션은 `startAnonymousSession` mutation으로만 만든다. 세션이 있으면 그 사용자를 돌려주고, 새로 만들 때는 가입과 같은 IP 한도를 센다. 익명 계정은 공개 그룹만 즉시 가입하고 비공개 그룹 생성·가입 신청은 로그인을 안내한다. 익명 상태에서 가입하면 같은 사용자 행을 회원으로 바꾼다.
- 로그아웃은 `POST /auth/logout`이다. 개발 로그인 엔드포인트는 없고, 격리 테스트만 NODE_ENV=test·ENABLE_TEST_API=true의 `POST /testing/users`로 사용자·세션을 만든다.
- 현재 API에는 소셜(OAuth) 로그인과 앱 로그인 교환(`/auth/<provider>`, `/auth/app/exchange`)이 없다. 관련 Prisma 모델과 브리지 계약은 제거했다.

## 상시 그룹 게시물

- 현재 제품은 Post·PostUpload·PostLike·PostComment다. 그룹은 종료되지 않으며 대회 없이 여러 번 등록한다.
- galleryPosts의 groupId가 없으면 로그인 후 가입한 모든 그룹, 있으면 readableGroup으로 공개 범위·멤버십을 검사한다. PUBLIC은 익명 읽기, PRIVATE는 승인된 멤버만 허용한다. 최신순은 createdAt·id desc. 이달의 인기는 KST 월 경계·좋아요 desc·createdAt/id desc다.
- 작성자와 OWNER·MODERATOR만 삭제한다. 파일도 매 요청 공개 범위·멤버십을 확인한다. 이관된 사진은 기존 Submission의 숨김도 검사한다.
- 게시물 업로드는 requestPostUpload(groupId, contentType, byteSize) → 저장소 FormData POST → completePostUpload → createPost다. 발급할 때 멤버십·허용 형식·크기를 확인하고 최종 키에 키·Content-Type·정확한 크기·만료를 POST 정책으로 고정한다. 완료는 티켓 소유·만료·용도를 확인하고 HEAD로 크기·형식만 본 뒤 같은 트랜잭션에서 권한을 다시 확인해 stagingKey를 storageKey로 옮긴다. 완료한 storageKey만 게시에 쓴다. uploadPostMedia와 /post-uploads는 제공하지 않는다.
- 게시물 POST 티켓은 15분, 완료 후 등록은 1시간이다. 사진 JPEG/PNG/WebP 10MB, 동영상 MP4/WebM 100MB만 발급한다. 서버는 파일 내용을 읽거나 변환·메타데이터 제거를 하지 않는다(사용자 결정). 동영상 길이는 웹이 올리기 전에만 확인한다. staging 복사가 없으므로 정책 만료 전에는 같은 크기·형식으로 다시 올릴 수 있다. 정리 작업은 만료된 미완료 키와 쓰지 않은 파일을 재시도하며 지운다. 게시물·제출한 대회 사진·현재 그룹 대표·배경 사진에 붙은 PostUpload는 `expiresAt`을 비워(null) 매분 도는 정리의 만료 범위에서 빼고, 글 삭제·사진 삭제·대표 사진 교체 뒤 정리로 떼어 낼 때 지난 시각으로 되돌려 행·용량·파일을 정리한다. 새로 붙이거나 떼는 경로를 더하면 이 규칙을 같이 지킨다.
- /media/:id·/media/:id/download는 readablePost로 권한을 확인한 뒤 `private, no-store` 307로 서명 GET에 보낸다(사진 60초, 최대 100MB 동영상은 재생·탐색이 끊기지 않게 10분. Range·다운로드 이름은 저장소가 처리). 저장소 I/O는 트랜잭션 밖에서 한다. 파일 삭제 실패 시 만료 PostUpload를 남겨 maintenance가 재시도한다.
- 댓글 읽기는 readablePost, 쓰기·삭제는 accessiblePost로 공개 범위·멤버십·숨김 규칙을 적용한다. 본문은 trim 후 1~1000자, 최신순(createdAt·id desc) offset 목록이다. 작성자·관리자만 삭제하며 개수는 게시물 조회의 _count로 함께 구한다. 댓글 내용은 이벤트에 넣지 않는다.
- 생성·좋아요·삭제 도메인 이벤트는 같은 DB 트랜잭션에 ID·종류만 기록한다.

## 그룹 탐색·가입

- createGroup은 PUBLIC/PRIVATE 선택이며 생략하면 PUBLIC이다. DB default PRIVATE는 기존 그룹의 공개 전환을 막기 위한 값이다.
- group·discoverGroups는 익명 메타데이터 조회를 허용한다. 비멤버의 role·inviteToken은 null, members는 빈 배열이다. members는 멤버에게도 페이지(기본·최대 48, 관리자 먼저)로만 주고, 수만 필요하면 memberCount를 쓴다. discoverGroups의 공개 범위 필터와 publicGroupCount는 공개 사이트맵을 지원한다.
- requestGroupMembership과 joinGroup은 같은 규칙: 공개 그룹은 즉시 가입, 비공개 그룹은 GroupJoinRequest만 만든다. 기존 멤버의 역할을 유지하고 동시 신청·가입은 DB unique와 Serializable 재시도로 한 행만 남긴다.
- 신청 목록·수락·거절은 OWNER·MODERATOR만. 수락은 멤버 생성·가입 이벤트·신청 삭제를 한 트랜잭션으로 처리한다.

## 그룹 게시물 대회·운영 권한

- Contest.format=POST인 새 대회는 groupContest·groupContests·groupContestResults 계약을 쓴다. LEGACY는 기존 API만 사용하고 새 대회는 이전 제출 API로 접근하지 못하게 막는다.
- OWNER·MODERATOR만 같은 그룹에서 개최한다. Post.contestId는 선택이며 접수 중 같은 그룹 POST 대회만 허용한다. 일반 게시물과 사진·동영상·복수 참여작을 구분한다.
- 공개 대회·결과는 익명 읽기, 비공개는 멤버만. 투표는 VOTING 중 회원 멤버만, 본인·숨긴 글은 거부한다. 익명 계정은 IP당 여러 개를 바로 만들 수 있어 멤버여도 그룹 대회·기존 대회 모두 투표하지 못한다(UNAUTHENTICATED `ERROR_MESSAGE.ANONYMOUS_VOTE_FORBIDDEN`, `canVote` false). 좋아요는 익명도 그대로 누른다. (contestId,voterId) unique와 (postId,contestId) 복합 FK로 대회당 1표·다른 대회 투표를 DB에서도 보장한다.
- 종료 후 보이는 참여작으로 득표수 경쟁 순위(1,1,3)를 계산한다. 동률 표시는 작성 시각 asc·id asc이며 일반 좋아요가 수상 순위를 바꾸지 않는다. 최다 득표 > 0이면 공동 우승, 0표는 우승 없음이다. 완료 이벤트는 형식에 맞는 참여작·투표를 집계한다.
- removeGroupMember는 OWNER·MODERATOR만: OWNER는 내보낼 수 없고 MODERATOR는 MEMBER만, OWNER는 MODERATOR도 내보낸다. leaveGroup은 본인 탈퇴이며 OWNER는 양도한 뒤에만 나간다. 남긴 게시물·댓글은 지우지 않는다.
- OWNER만 setGroupModerator·transferGroupOwnership을 실행한다. 대상은 같은 그룹의 멤버이고 OWNER 역할은 임명 API로 바꾸지 않는다. 양도는 원 OWNER→MEMBER와 대상→OWNER를 하나의 Serializable 트랜잭션에서 처리한다.
- publicGroupContests·publicGroupContestCount는 PUBLIC/POST만 포함한다. winners는 siblingLoader로 묶어 득표 집계(groupBy)로 우승작만 읽고(참여작 전체를 불러오지 않는다) private 결과·미디어를 SEO에 섞지 않는다.

## 기존 대회 호환 규칙

- 기존 Contest·Submission·순위·사진 파일은 공개 그룹이어도 멤버만 접근한다(ID를 알아도 불가). 초대 토큰은 모든 멤버가 보고, 재발급은 OWNER만 하며 이전 토큰은 바로 무효다. `invitePreview`는 비로그인도 보지만 그룹 이름·멤버 수·관리자 닉네임·(가입했으면) 그룹 ID만 준다.
- 단계는 저장하지 않고 서버 시각과 마감으로 계산한다(UPCOMING → SUBMISSION → VOTING → COMPLETED).
- 1인 1장 제출·1인 1표는 DB unique + Serializable 재시도로 보장한다. UI 비활성화는 보장 수단이 아니다.
- 자기 사진·숨긴 사진에는 투표할 수 없다. 득표수는 종료 후에만, 좋아요 수는 항상 공개한다.
- 좋아요: 멤버만, 자기 사진 거부, 숨긴 사진은 관리자가 아니면 NOT_FOUND, 두 번 눌러도 하나((submissionId,userId) 키), 안 누른 사진 취소는 그대로.
- 정렬: NEWEST·OLDEST·MOST_LIKED(같으면 최신), limit 1~48. 관리자가 아니면 숨긴 사진을 빼고 센다.
- 결과 순위: 득표수 경쟁 순위(1, 1, 3), 같은 순위 안은 좋아요 desc → 제출 시각 asc. 우승은 최다 득표 > 0인 사진 전부(공동 우승), 무투표는 우승 없음.
- 그룹 순위: 종료된 대회의 숨기지 않은 사진만. 우승 횟수 → 받은 표 → 받은 좋아요 → 닉네임 순, (우승·표)가 같으면 같은 순위.
- 사진: requestUploadUrl(contestId, contentType, byteSize) → 저장소 POST → completeSubmissionUpload → createSubmission이다. 5분 서명, JPEG/PNG/WebP 10MB이며 서버 변환은 없다. 공용 MediaUploadService가 게시물·대회·대표 사진의 발급·HEAD 완료·용도 분리를 소유하며 대회 사진을 게시물 업로드로 사용할 수 없다. `/photos/:id`는 매 요청 멤버십을 확인하고 `private, no-store` 307로 서명 GET에 보낸다.
- 신고는 사람·사진당 1건, 내용은 관리자만. 숨김은 보존, 삭제는 투표·좋아요·신고·파일까지 지운다.

## 이벤트·모니터링

- 도메인 이벤트는 바뀐 데이터와 같은 트랜잭션에서 `AnalyticsEvent`에 기록만 한다. API는 Amplitude로 보내지 않는다(웹·앱이 보낸다). 이벤트에 닉네임·캡션·토큰을 넣지 않는다.
- Sentry는 예상하지 못한 오류(GraphQL 내부 오류, REST 5xx)만 보내고 쿠키·요청 본문·사용자를 지운다. 자세한 규칙은 [monitoring](../../photo-contest-monitoring/SKILL.md) 스킬.

## 바꿀 때

- 스키마를 바꾸면 Prisma 마이그레이션을 추가한다. 파괴적 변경(컬럼·테이블 삭제)은 피하고, 테스트는 test-kit 격리 스키마에서 마이그레이션을 적용해 확인한다. 개발 DB public 스키마에는 직접 적용하지 않는다.
- GraphQL을 바꾸면 웹 `codegen`과 웹의 계약 테스트(문서 ↔ 스키마 검증)를 같이 돌린다.
- 새 규칙에는 실제 PostgreSQL + supertest 테스트를 붙인다([testing](../../photo-contest-testing/SKILL.md) 스킬).

Service에서 Database(Prisma)를 직접 사용한다. Repository 전달 계층을 만들지 않으며 UnitOfWork.atomic의 tx를 모든 권한·읽기·쓰기·이벤트에 전달한다.

게시물은 파일 또는 linkUrl 중 하나 이상을 요구한다. uploadId가 없는 링크 글도 반응·댓글·대회·삭제 권한은 동일하며 파일 정리를 실행하지 않는다. postDownload는 기존 읽기 권한을 먼저 검사하고 같은 수명(사진 60초, 동영상 10분)의 presigned GET(attachment)을 돌려준다. URL·파일명·만료를 반환하고 다운로드 주소를 공개 SEO·영구 상태에 넣지 않는다.

## 책임별 경로

- 인증은 `auth/session/`, `auth/password/`, `auth/anonymous/`에 구현과 테스트를 함께 둔다. 그룹은 `group/membership/`, `profile/`, `categories/`, `administration/`, `ranking/`, 게시물은 `post/comments/`, `categories/`, `moderation/`, `media/`로 응집된 책임을 묶는다.
- 그룹 대회는 `contest/group-contest/`, 기존 대회 순위는 `contest/ranking/`, 종료 집계는 `analytics/completion/`을 사용한다. 도메인 루트 module·GraphQL 계약·Prisma 경로를 유지하고 이동 시 소비자 import와 상대 파일 URL도 갱신한다.

## DI 전략과 오류 경계

- 서로 다른 데이터 경로를 선택하는 책임만 전략으로 나눈다. `analytics/completion`의 POST·LEGACY 조회는 `COMPLETION_READERS` 토큰과 Nest factory가 각 Injectable 구현을 연결하며, 호출자가 전달한 동일 tx로 조회한다. 이벤트·완료 시각 쓰기는 조립 서비스에 남긴다. 기존 문자열 format의 POST 외 fallback도 유지한다.
- 비밀번호·익명 인증처럼 이미 서비스로 분리된 고정 진입점과 단순 권한 가드는 전략 계층으로 다시 감싸지 않는다. 기존 클래스 토큰과 factory 인스턴스·provider override 계약을 보존한다.
- 새 업무 오류는 `DomainError`/`fail`을 사용하고 기존 한국어 메시지·GraphQL code·HTTP 상태·REST `{ message }`를 바꾸지 않는다. 예상하지 못한 오류와 Nest 예외·외부 GraphQLError의 기존 필터 경로도 유지한다.
- HTTP/DB 통합은 `*.integration.spec.ts`에만 둔다. 네트워크 없는 DI 조합은 `createApplicationContext`, 정책·GraphQL 오류 직렬화는 unit으로 확인하고 DB/S3 미설정을 가짜 HTTP 앱으로 우회하지 않는다.
