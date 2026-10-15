---
name: contest-api
description: 웃긴순간 API(apps/api)의 모듈 구조, 그룹·대회·사진·좋아요·투표·신고 규칙, 쿠키 헤더 인증과 소셜 로그인(앱 핸드오프 포함), 오류 매핑을 구현하거나 검토할 때 사용한다.
---

## 구조

- 기능 모듈: `auth`, `group`, `contest`, `submission`(업로드·사진 조회 포함), `like`, `vote`, `moderation`, `analytics`, `maintenance`, `health`. 공통은 `config`(env·limits·paths), `common`(errors·validation·crypto·http·graphql), `database`, `storage`.
- 모듈 하나 = `<name>.graphql` + `<name>.module.ts` + `<name>.resolver.ts` + `<name>.service.ts`. GraphQL 스키마는 모듈별 `.graphql`이 계약이고(웹 codegen 입력), `app.module.ts`가 `src/**/*.graphql`을 합친다.
- resolver·controller는 얇게: 조회자 확인 + service 위임. 규칙과 권한은 service에 둔다. 권한 확인은 `membership.service`(requireMember·requireOwner·accessibleContest)로만 한다.
- 조회자별 필드(likedByMe, isAdmin, votedSubmissionId, hiddenSubmissions)와 비싼 필드(members, contests, leaderboard)는 field resolver로 선택될 때만 계산하고 N+1을 만들지 않는다.
- 매직 넘버는 `config/limits.ts`, 환경변수는 `config/env.ts`의 getter로 호출할 때마다 읽는다(테스트가 실행 중에 바꾼다). 상대 STORAGE_DIR는 프로젝트 루트 기준.
- 닫힌 집합 분기(Phase, 오류 코드→HTTP, provider)는 ts-pattern `exhaustive()`, 묶기·nil 검사는 es-toolkit. 직접 유틸을 만들지 않는다.

## 오류

- `fail(message, ERROR_CODE)`로 GraphQLError를 던진다. HTTP 매핑: UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, RATE_LIMITED 429, UNAVAILABLE 503, 그 밖 400. REST 오류 본문은 `{ message }`.
- 사용자에게 보이는 한국어 메시지를 바꾸면 웹·테스트도 같이 바꾼다. INTERNAL_SERVER_ERROR는 메시지를 가리고 Sentry로만 보낸다.

## 인증

- 세션은 HttpOnly 쿠키 `contest_session` 하나(43자 base64url). cookie-parser 없이 `common/http/cookie-header.ts`가 `Cookie` 헤더 원문을 파싱한다: 같은 이름은 첫 값, 4KB 초과·깨진 형식·잘못된 길이는 비로그인. DB에는 해시만 저장한다.
- `session.service`가 요청당 한 번만 조회한다(WeakMap). GraphQL·REST 모두 `@Viewer()`/`@OptionalViewer()`를 쓴다. Authorization 헤더는 보지 않는다.
- GET·HEAD·OPTIONS가 아닌 요청은 Origin이 WEB_ORIGIN이어야 한다(인증보다 먼저 403). GraphQL은 csrfPrevention.
- OAuth(Google·카카오): state + PKCE, 시도 10분, 콜백은 항상 302. 다른 provider의 이메일로 계정을 합치지 않는다. 개발 로그인은 NODE_ENV=development && ENABLE_DEV_LOGIN=true에서만, 운영은 fail-closed.
- 앱 핸드오프: `/auth/<provider>?app_challenge=<43자>`면 콜백에서 세션 쿠키를 만들지 않고 2분짜리 AppLoginTicket(코드 해시·challenge) 후 `<MOBILE_APP_SCHEME>://auth/callback?code=`로 보낸다. `POST /auth/app/exchange {code, verifier}`는 base64url(SHA-256(verifier))를 timingSafeEqual로 비교하고 한 번만 소비한다. 실패는 모두 403 같은 메시지. 틀린 verifier는 티켓을 소비하지 않는다.

## 상시 갤러리 게시물

- 현재 제품은 Post·PostUpload·PostLike다. 갤러리는 종료되지 않으며 대회 없이 여러 번 등록한다.
- galleryPosts의 groupId가 없으면 가입한 모든 갤러리, 있으면 해당 멤버십을 검사한다. 최신순은 createdAt·id desc. 이달의 인기는 KST 월 경계·좋아요 desc·createdAt/id desc다.
- 작성자와 OWNER만 삭제한다. 파일도 매 요청 멤버십을 확인한다. 이관된 사진은 기존 Submission의 숨김도 검사한다.
- /post-uploads는 5분 일회용 해시 티켓, 원본 100MB 상한이다. 사진은 기존 sharp 변환을 재사용하고 동영상은 MediaInfo WASM으로 컨테이너·코덱·시간을 검사한다. MP4 H.264/AAC·WebM VP8/VP9+Opus/Vorbis, 5분 이하.
- /media/:id는 비공개 no-store 스트리밍·byte Range 206/416을 지원한다. 저장소 I/O는 트랜잭션 밖에서 한다. 파일 삭제 실패 시 만료 PostUpload를 남겨 maintenance가 재시도한다.
- 생성·좋아요·삭제 도메인 이벤트는 같은 DB 트랜잭션에 ID·종류만 기록한다.

## 기존 대회 호환 규칙

- 그룹 멤버만 그룹·대회·사진·파일에 접근한다(ID를 알아도 불가). 초대 토큰은 모든 멤버가 보고, 재발급은 OWNER만 하며 이전 토큰은 바로 무효다. `invitePreview`는 비로그인도 보지만 그룹 이름·멤버 수·관리자 닉네임·(가입했으면) 그룹 ID만 준다.
- 단계는 저장하지 않고 서버 시각과 마감으로 계산한다(UPCOMING → SUBMISSION → VOTING → COMPLETED).
- 1인 1장 제출·1인 1표는 DB unique + Serializable 재시도로 보장한다. UI 비활성화는 보장 수단이 아니다.
- 자기 사진·숨긴 사진에는 투표할 수 없다. 득표수는 종료 후에만, 좋아요 수는 항상 공개한다.
- 좋아요: 멤버만, 자기 사진 거부, 숨긴 사진은 관리자가 아니면 NOT_FOUND, 두 번 눌러도 하나((submissionId,userId) 키), 안 누른 사진 취소는 그대로.
- 정렬: NEWEST·OLDEST·MOST_LIKED(같으면 최신), limit 1~48. 관리자가 아니면 숨긴 사진을 빼고 센다.
- 결과 순위: 득표수 경쟁 순위(1, 1, 3), 같은 순위 안은 좋아요 desc → 제출 시각 asc. 우승은 최다 득표 > 0인 사진 전부(공동 우승), 무투표는 우승 없음.
- 그룹 순위: 종료된 대회의 숨기지 않은 사진만. 우승 횟수 → 받은 표 → 받은 좋아요 → 닉네임 순, (우승·표)가 같으면 같은 순위.
- 사진: 5분 일회용 업로드 티켓, JPEG/PNG/WebP 실제 디코딩, 40MP·10MB 제한, 1600px WebP로 바꾸고 메타데이터 제거. 비공개 저장소, 매 요청 멤버십 검사, `Cache-Control: private, no-store`.
- 신고는 사람·사진당 1건, 내용은 관리자만. 숨김은 보존, 삭제는 투표·좋아요·신고·파일까지 지운다.

## 이벤트·모니터링

- 도메인 이벤트는 바뀐 데이터와 같은 트랜잭션에서 `AnalyticsEvent`에 기록만 한다. API는 Amplitude로 보내지 않는다(웹·앱이 보낸다). 이벤트에 닉네임·캡션·토큰을 넣지 않는다.
- Sentry는 예상하지 못한 오류(GraphQL 내부 오류, REST 5xx)만 보내고 쿠키·요청 본문·사용자를 지운다. 자세한 규칙은 `monitoring` 스킬.

## 바꿀 때

- 스키마를 바꾸면 Prisma 마이그레이션을 추가한다. 파괴적 변경(컬럼·테이블 삭제)은 피하고, 테스트는 test-kit 격리 스키마에서 마이그레이션을 적용해 확인한다. 개발 DB public 스키마에는 직접 적용하지 않는다.
- GraphQL을 바꾸면 웹 `codegen`과 웹의 계약 테스트(문서 ↔ 스키마 검증)를 같이 돌린다.
- 새 규칙에는 실제 PostgreSQL + supertest 테스트를 붙인다(`testing` 스킬).
