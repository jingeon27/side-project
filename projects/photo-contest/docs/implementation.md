## 2026-10-21 사전 조회하지 않은 조회의 브라우저 시작

가입 신청·카테고리·숨긴 게시물 관리, 대회 결과, 홈의 첫 개인 피드와 비공개 그룹 피드를 ClientOnly로 통째로 감싸지 않는다. 조회 부모가 `useIsSSR`이면 `skipToken`을 넘기고, QueryRef가 없는 동안 경계와 같은 fallback을 그린다. 제목·접힌 관리 메뉴·피드 틀·사이드바는 서버 HTML에 남는다. 재시도는 부모의 refetch가 소유한다. 자식의 `useSuspenseQuery`는 실패한 참조가 suspense 캐시에 남아 경계 리셋만으로 다시 요청하지 않으므로 쓰지 않는다. ClientOnly는 GroupContentFrame의 비공개 본문에만 남긴다. Promise `.catch`는 try/catch로 바꿨다.

검증: 웹 unit/UI 343개(useIsSSR, 가입 신청, 홈·비공개 그룹·대회 결과의 SSR→hydration 사양 포함), typecheck·lint·format, 커밋별 typecheck 통과. skipToken을 되돌리면 SSR→hydration 사양이 실패하는 것을 확인했다. Playwright Chrome·Safari·데스크톱 관련 36개 통과. 앞선 실행에서 레거시 대회의 시작 예정→투표 전환(30초 polling·35초 대기)이 한 번 실패했고 단독 2회 재실행은 통과했다.

로컬 주의: test-kit이 프로젝트 `.env`를 읽으므로 `.env.example`의 `NODE_ENV=development`가 e2e 웹 빌드에 들어가 `/_global-error` prerender가 실패한다. 로컬 e2e는 `NODE_ENV=production`으로 실행했다.

## 2026-10-21 첫 그룹 가입 후 개인 피드 시작

WebKit CI trace에서 가입 직후 처음 나타난 개인 피드의 hydration 오류를 확인했다. 홈 RSC는 개인 피드의 사전 조회 여부를 전달하며, 미리 받지 않은 개인 쿼리만 기존 ClientOnly 경계로 시작한다. 공개 홈과 기존 가입자의 개인 피드는 계속 SSR한다. 서버 HTML 검사는 그룹이 없는 홈뿐 아니라 가입 그룹의 실제 게시물까지 확인한다.

검증: 웹 unit/UI 333개, Safari 신규 홈 5회 반복 10개, Chrome·Safari·데스크톱 홈 전환/서버 HTML 8개와 lint·typecheck·format 통과.

## 2026-10-21 Apollo SSR 스트림 취소 회귀

`@apollo/client-react-streaming` 0.14.5가 취소된 스트림에 늦게 enqueue하면서 `ERR_INVALID_STATE`를 처리하지 않는 [상류 이슈 #561](https://github.com/apollographql/apollo-client-integrations/issues/561)를 실제 서버 스택에서 확인했다. Yarn patch로 Node 스트림 컨트롤러의 해당 TypeError만 처리하며 API/GraphQL 오류와 다른 예외는 숨기지 않는다. ESM/CJS의 RSC·SSR·브라우저 빌드 8개에 같은 보정을 적용한다. 정식 수정 버전으로 올릴 때 패치 제거와 회귀 검사를 함께 검토한다.

읽기 경로의 거절된 Promise와 구독 해제 시 cancel 실패도 처리한다. 브라우저의 활성 쿼리는 실제 오류를 받고 SSR은 기존 오류 원문 비공개 정책을 따른다. 앱이 소유하는 실제 Apollo link + ReadableStream 검사에서 수정 전 쓰기 2개 실패·미처리 예외 3개와 읽기 오류 누출을 재현했고 수정 후 7개가 통과했다. 테스트용 직접 의존성, 루트 resolution·lock과 패치 파일을 함께 관리한다. Git/Docker ignore는 `.yarn/patches`만 허용해 immutable install과 운영 이미지에서도 동일한 코드가 적용된다. 임시로 시도한 홈 렌더 우회는 제거하고 기존 SSR·Suspense 구성을 유지한다.

## 2026-10-21 전체 브라우저 회귀 검증

브라우저 E2E는 격리 API와 실제 production build/standalone 서버로 실행한다. 개발 서버의 지연 컴파일과 화면 이동 중 devtools 오류가 결과에 섞이지 않게 하며, pageerror 검사는 유지한다. Chrome 휴대폰·Safari 휴대폰·데스크톱·가짜 WebView 전체 66개, 웹 unit/UI 326개와 타입·lint·포맷 검사를 통과했다.

검색 폼은 브라우저가 복원한 실제 FormData를 RHF/Zod로 검증한다. change 이벤트 없이 복원된 검색어가 빠지는 회귀를 수정 전 실패·수정 후 통과로 확인했다. 파일 저장은 서버의 한글 이름 계약과 실제 바이트를 검사하며 Linux WebKit의 공백 치환을 허용한다. 공개 캐시 HIT·쓰기 무효화·개인화 분리는 별도 production cache/category 7개로 확인했다.

## 2026-10-20 그룹 카테고리

그룹장·부관리자는 선택 분류를 최대 20개·이름 20자로 만들고 이름·순서·보관을 관리한다. 사진·동영상·링크와 대회 참여 글 모두 선택할 수 있고 작성자·관리자가 나중에 변경한다. 보관한 분류는 기존 글에 남는다. 필터는 URL과 Apollo keyArgs로 구분하고 잘못된 ID는 전체로 표시한다. canonical은 기본 그룹 주소를 유지하며 필터 주소를 사이트맵에 넣지 않는다.

GroupCategory와 nullable Post.categoryId만 추가한다. 같은 그룹만 연결하는 복합 FK, ON UPDATE NO ACTION, 활성 이름의 lower(name) 부분 unique, Serializable 권한 재검사·상한으로 DB에서도 규칙을 지킨다. 새 migration 20261020040000_group_categories는 이전 데이터·이전 앱 쓰기 호환 테스트를 통과했으며 개발·운영 DB에는 적용하지 않았다.

검증: API 통합 274개(새 카테고리·migration 17개), 웹 unit/UI 324개·실제 API 18개. 실제 build/start에서 데스크톱·Chrome 휴대폰·WebKit 휴대폰의 생성→등록→필터→부관리자 수정→보관과 기존 공개 캐시를 포함한 7개가 통과했다. CI는 브라우저 레인이 실패해도 프로덕션 캐시·카테고리 레인을 실행한다.

## 2026-10-20 가입 그룹이 없는 홈과 공개 캐시

공개 그룹 최신 생성순 6개, 그룹 검색·생성·즉시 가입, 공개 게시물 최신 피드를 제공한다. 비로그인도 공개 피드를 보며 가입 그룹이 생기면 Apollo MyGroups 결과로 기존 피드에 전환한다. 일반 좋아요는 반환 fragment를 갱신하고 댓글 수는 해당 게시물만 다시 읽어 펼친 목록을 유지한다. 관리자는 숨김·복원과 숨긴 목록을 사용할 수 있다.

검증: API unit 102·통합 257, 웹 unit/UI 312·실제 API 18, 새 홈 Chrome/WebKit/데스크톱 e2e 6개. 실제 standalone 캐시 레인은 공개 홈 HIT·무효화·비공개 분리를 포함해 4개를 통과했다. 개발·운영 DB에는 마이그레이션하지 않았다.

# 2026-10-20 서비스와 데이터 접근 구조 정리

Repository 전달 계층을 제거하고 서비스에서 Prisma를 직접 사용한다. UnitOfWork는 기존 트랜잭션·재시도와 한 연결 사용을 유지한다. 트랜잭션 통합 사양은 database 구현 옆에 둔다.

# 웃긴순간 구현 기록

## 2026-10-20 링크 첨부와 사진·동영상 저장

사진·동영상 없이 유튜브·일반 HTTP/HTTPS 링크만 게시하거나 파일과 링크를 함께 등록한다. Post.uploadId를 nullable로 확장하고 linkUrl과 첨부 필수 CHECK를 추가해 기존 파일과 FK 동작을 보존했다. 링크 글도 기존 그룹 공개 범위·멤버십·대회·댓글·반응·삭제 규칙을 따르고, 서버가 사용자 링크의 외부 메타데이터를 가져오지 않는다.

PostLinkField·PostAttachments·PostLink·PostDownloadButton으로 작성·파일·링크 표시·저장을 분리했다. 유튜브는 정확한 호스트와 ID만 사용하며 클릭 후 재생한다. 일반 링크는 외부 브라우저로 열고 복사할 수 있다. 공개 링크는 JSON-LD citation으로 제공하고 파일 없는 글에 사진·MediaObject를 만들지 않는다. 약관·개인정보 안내에도 링크와 외부 영상 재생을 반영했다.

postDownload는 readablePost로 권한·숨김·파일을 확인한 뒤 S3 최대 60초 presigned GET 또는 로컬 attachment 다운로드 경로를 반환한다. 한글 파일명·no-store·Range를 지원하며 웹은 Apollo no-cache로 매번 발급받는다. 앱의 link.open은 8KB까지 긴 서명 URL을 허용한다. 서명 검증은 테스트용 임시 자격 증명으로 실제 AWS SDK를 실행하며 운영 S3 객체·IAM에 접속한 검증과 구분한다.

로컬 검증: API unit 102·실제 PostgreSQL 통합 245(첨부 사양 8개 포함), 웹 unit/UI 307·실제 API 문서 18, bridge 36·모바일 unit/UI 137, 실제 standalone 캐시 3, 모바일 WebView 24가 통과했다(기존 조건부 2개 제외). 웹 전체 60개 실행은 57개 통과 후 장시간 중단된 권한 검사 1개와 WebKit의 한글 파일명 NFD 비교 2개가 실패했다. 파일명 비교를 NFC로 보정하고 재실행의 반복 컴파일을 막도록 격리 e2e에만 Turbopack 디스크 컴파일 캐시를 끈 뒤 실패 항목·저장·약관 10개를 Chrome/WebKit/데스크톱에서 재확인해 모두 통과했다. 프로젝트 check·lint·타입 검사도 통과했다.

20261020030000_post_links는 개발·운영 DB에 아직 적용하지 않았다. 앱·Web·API 반영 순서와 발급한 S3 주소의 권한 유지 시간, 투네이션 페이지의 실제 확인 범위는 [첨부·저장 계약](post-attachments.md)에 기록했다. 자체 영상 주소가 투네이션의 영상 후원에서 재생된다는 주장은 하지 않는다.

## 2026-10-20 공개 서버 캐시와 Codex 지침 정리

Next fetch Data Cache에 익명 SEO 콘텐츠는 30초, 사이트맵 데이터는 60초의 재검증 주기를 적용했다. 공개 여부·대회 소속·일정은 매 요청 확인하고 개인화된 SSR/Apollo는 no-store를 유지한다. 캐시는 query 문서만 허용하며 API URL·Origin·문서·변수별로 분리된다. 일반 GraphQL 실행 오류는 HTTP 200을 유지하고 캐시용 공개 query 오류만 400으로 구분해 실패 응답을 성공 데이터로 저장하지 않는다.

Next /backend/graphql은 Cookie·Origin과 multipart 스트림을 전달하며 JSON mutation의 성공·부분 성공 뒤 공개 태그를 expire:0으로 만료시킨다. Caddy의 GraphQL 경로도 Web을 거치게 하고 PC 내부 경로 차단 순서를 고정했다. 실제 Caddy 2.10.2와 두 HTTP 업스트림으로 단독·공통 설정의 GraphQL/일반 API 라우팅·경로 정규화·쿼리 문자열 보존·공통 내부 경로 차단을 확인했다. 운영에는 프록시 설정 갱신과 validate/reload가 필요하며 실제 운영 서버 변경은 하지 않았다.

앱 소유 test:cache가 별도 dist의 실제 standalone Web·격리 API/DB에서 요청 간 캐시 재사용, 정상·부분 성공 쓰기 뒤 만료, 사이트맵, 비공개 제외, Origin·본문 한도, 쿠키와 multipart 업로드를 검증한다. 외부 API에 직접 넣은 데이터로 HIT를 확인하고 웹 mutation으로 무효화를 확인하므로 가짜 캐시를 쓰지 않는다. 일반 브라우저 fixture의 제품 요청도 실제 서비스와 같은 웹 경로를 사용한다. API 통합 237개·웹 unit/UI 303개·문서 API 17개·운영 캐시 3개가 통과했다. 웹 전체 실행은 49개 통과 뒤 개발 빌드 반복 새로고침과 시각 경계로 2개가 실패했고, 격리한 개발 빌드 산출물을 지운 뒤 해당 2개를 재실행해 통과했다. 모바일 WebView 24개가 통과했고 기존 조건부 2개는 제외했다. 프로젝트 check·앱 lint·타입·포맷 검사도 통과했다.

저장소 스킬 23개를 Codex의 .agents/skills로 옮기고 AGENTS.md의 경로를 갱신했다. 기존 전용 경로와 참조는 제거했으며 모든 스킬 링크가 실제 파일로 연결된다. Markdown 지침에서 외부 회사 언급을 제거하고 별도 MDX 블로그 글은 보존했다.

## 2026-10-20 그룹 대회·명예의 전당·운영 권한·SEO

origin/develop의 bc97cad에서 별도 worktree·기능 브랜치를 만들고 최종 검증 중 추가된 9f5d9af의 저장소 검증도 반영했다. 기존 대회는 format=LEGACY로 보존하고 새 그룹 대회는 format=POST와 Post.contestId로 연결한다. 일반 게시물과 대회 참여를 선택하며 같은 그룹의 접수 중인 대회에 사진·동영상·합성을 여러 번 올린다. 시작→접수 마감→투표 마감과 90일 제한은 API·폼에서 검사한다.

OWNER·MODERATOR가 대회를 개최하고 게시물/댓글 삭제·비공개 가입 승인을 한다. OWNER만 부관리자 임명/해제·관리자 양도·초대 재발급을 할 수 있다. 양도는 이전 OWNER→MEMBER와 대상→OWNER를 Serializable 트랜잭션 하나로 처리한다. 역할 변경·투표 이벤트는 성공한 쓰기와 같은 트랜잭션에 개인정보 없이 남긴다.

투표는 VOTING 중 멤버당 한 표이며 본인·숨긴 글·다른 대회 참여작을 거부한다. PostContestVote의 unique와 복합 FK로 동시·교차 대회 투표를 막는다. 종료 후 득표수 경쟁 순위(1,1,3)와 최다 득표 공동 우승을 계산하며 0표는 우승이 없다. 일반 좋아요가 대회 순위를 바꾸지 않는다. 명예의 전당은 종료된 대회와 현재 공개 가능한 우승작·결과를 모으며 순위는 사진을 가리지 않는다. 삭제한 참여작은 결과·수상작에서 제외한다. 완료 기록은 기존/새 형식에 맞는 실제 참여작·투표·참여자를 센다.

그룹 메뉴의 대회·명예의 전당과 상세는 독립 QueryRef·Suspense/오류 경계다. 공개 화면은 RSC PreloadQuery로 HTML을 제공한다. 비공개 내용은 canViewPosts·ClientOnly로 승인 후 조회하고 SEO는 cookie 없이 별도 조회한다. 목록·명예의 전당·상세 canonical·OG/Twitter·JSON-LD를 만들고 PUBLIC/POST 대회만 48개씩 사이트맵에 넣는다. 비공개는 그룹장에게도 공통 noindex, 공유 사진·JSON-LD 없음이다. [SEO 계약](seo.md)을 따른다.

새 단위·통합·웹 API·브라우저 사양은 `.spec.ts(x)`로 추가했다. API 실제 DB 테스트는 대상 구현 파일 옆 `src/**/*.integration.{spec,test}.ts`에 두고 Vitest integration 프로젝트·test:integration 명령을 사용한다. test:e2e는 호환 위임으로 남겼다. API 개발 서버·개발 DB는 변경하지 않고 별도 테스트 PostgreSQL과 임시 스키마만 사용했다. 마이그레이션 20261020010000_group_contests는 개발·운영 DB에 아직 적용하지 않았다.

로컬 검증: API unit 98개, 웹 unit/UI 297개·실제 API 문서 17개·Playwright 51개, 모바일 unit/UI 137개·API 9개·WebView Playwright 24개(기존 조건부 2개 제외)가 통과했다. Chrome·iPhone WebKit·데스크톱에서 대회 개최→사진/영상 참여→1회 투표→수상작·공개 SSR·비공개 SEO·관리자 양도를 확인했다. 웹 프로덕션 빌드와 타입·lint 검사도 통과했다. API 실제 PostgreSQL 통합 234개와 포맷·프로젝트 check·앱 lint가 통과했고 남은 테스트 스키마는 0개다. 원격 CI는 PR에서 별도로 확인한다.

## 2026-10-20 Repository 단위·통합 테스트 보강

- 트랜잭션 오류 정책을 순수 함수로 분리해 ts-pattern으로 분기한다. 기존 P2034의 최대 4회 시도, P2002의 즉시 CONFLICT, 나머지 오류의 원형 전파를 유지하고 let/for 반복을 재귀 호출로 바꿨다.
- 단위 테스트 12개를 추가해 재시도 경계·unique 충돌·FK/미존재/연결 풀 오류·Prisma 오류가 아닌 값을 검증한다. API unit은 총 86개 통과했다.
- 실제 PostgreSQL 통합 테스트 6개를 추가했다. 단일 연결의 사용자·그룹·멤버십·이벤트 커밋, lazy 배열 쿼리 순서·롤백, atomic unique의 재시도 금지, 실제 직렬화 충돌 재시도·이벤트 중복 방지와 4회 충돌 후 완전 롤백을 확인한다. API integration은 총 217개 통과했다.
- DB 목이나 고정 지연 없이 barrier로 두 실제 트랜잭션의 읽기를 동기화해 충돌을 재현한다. 별도 임시 PostgreSQL과 api_test_* 스키마를 사용하고 종료 후 정리했다. 기존 개발 DB·서버·dist에는 변경이 없다.
- API typecheck와 ESLint를 통과했다. DB 스키마·GraphQL/REST 계약과 외부 서비스 설정은 변경하지 않는다.

## 2026-10-19 공통 EC2·RDS·S3와 Repository

운영 대상은 두 서비스를 묶은 서울 EC2 한 대, 외부 AWS RDS PostgreSQL, 서비스별 비공개 S3다. [공통 배포 가이드](../../../deploy/shared-instance/README.md)가 현재 기준이다. 아래 과거 단독 배포 기록과 구분한다.

- 두 API의 도메인 Service에서 DB 직접 접근을 Repository로 옮겼다. UnitOfWork가 같은 트랜잭션 client를 전달하며 권한·미디어·이벤트도 같은 연결을 사용한다. DB 스키마와 API 계약은 유지했다.
- 런타임 DML과 일회성 DDL 자격 증명을 분리하고 RDS hostname·TLS CA·role·pool 한도를 검증한다. 두 DB와 버킷을 분리하고 Caddy만 공유한다. GF 작성 중 가시성 조회가 다른 연결을 기다리던 경로도 수정했다.
- CI가 함께 검증한 AMD64 이미지를 그대로 게시·digest 배포한다. 공통 호스트 lock, provider PITR 검사, 이전 앱 롤백, current/previous 이미지 보호를 적용했다. Web liveness와 API DB readiness를 분리했다.

| 실제 로컬 실행            | 결과                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GF API Vitest·Supertest   | 134개 통과, 연결 1개로 글 작성 3건·세션 조회 3건 동시 처리와 구독 알림 포함                                                                                              |
| PC API Vitest / Supertest | 74개 / 211개 통과, 도메인 간 단일 연결·전체 롤백 포함                                                                                                                    |
| PC 프로젝트 check         | 통과, Web 단위 테스트 287개 포함                                                                                                                                         |
| GF 프로젝트 check         | 통과                                                                                                                                                                     |
| 운영 도구 테스트          | 14개 통과: PITR 잘못된 설정·시각 거부, 양쪽 current/previous 이미지 보존·범위 밖 삭제 거부                                                                               |
| 실제 운영 이미지 통합     | 두 API/Web AMD64 build, 공통 HTTPS Caddy·PostgreSQL TLS·별도 DML/DDL·S3/Range·SSE·오래된 PITR 거부·보호된 릴리스 덮어쓰기 거부·독립 롤백·재시작 보존·생존/준비 상태 통과 |
| PC 운영 이미지 Playwright | 1개 통과: 가입·사진/동영상·댓글·공개 SEO·비공개 미디어·재시작 보존과 DB 백업의 새 DB 복원                                                                                |
| 계약·정적 검사            | 두 서비스 codegen 결과 변경 없음, format·actionlint·shellcheck 통과                                                                                                      |

실제 AWS 리소스는 생성·변경하지 않았고 운영 CD·공인 DNS/ACME·실제 RDS PITR 복원·S3 IAM 분리는 미검증이다. 통합 검사의 S3 HTTP 경계와 RDS Describe 응답·registry 매핑은 fixture이며 앱·DB·TLS·프록시는 실제로 실행했다. 제공된 계획의 전체 캐시 개편과 나머지 제품 결함은 이번 변경의 완료 범위가 아니다. 테스트는 전용 DB·격리 스키마·별도 Docker profile에서 실행했다.

2026-10-19 기준. 현재 제품은 기간 없는 그룹 커뮤니티다. 실사용·전환율·재방문 성과는 아직 측정하지 않았다.

화면·초대 공유·오류 안내의 공간 명칭은 그룹으로 통일한다. 기존 GraphQL 문서·타입의 Gallery 이름과 /groups URL은 유지한다.

## 제품과 구조

홈은 가입한 모든 그룹의 사진·동영상을 최신순으로 모으고 이달의 인기를 따로 조회한다. MY에서 내 그룹을 보고 새로 만든다. 그룹은 종료일 없이 유지되며 한 사람이 제목·내용과 파일을 여러 번 올릴 수 있다. 직접 찍은 사진·동영상·합성을 모두 환영한다.

작성자와 그룹 관리자는 게시물을 삭제할 수 있다. 초대 링크 공유는 모든 멤버, 재발급은 관리자만 허용한다. 초대·멤버 정보는 그룹에서 펼쳐 볼 수 있다.

Post·PostUpload·PostLike를 추가했다. 기존 Contest·Submission은 데이터와 이전 URL 호환을 위해 유지한다. 새 작성 흐름에는 대회·마감일·1인 1장 제약이 없다. 마이그레이션은 기존 사진·숨김 상태·작성 시각·파일 키·좋아요를 새 모델에 보존하며, 실제 이전 스키마에 데이터를 넣은 뒤 SQL을 적용해 검증했다.

## 공개 탐색·가입 승인·SEO

`/explore`에서 로그인 없이 그룹 이름을 검색한다. 그룹 생성은 로그인 후 공개·비공개를 선택하며 기본값은 공개다. 기존 그룹은 새 마이그레이션의 PRIVATE default로 비공개를 유지한다. 공개 그룹의 게시물·미디어·댓글은 익명으로 읽고 로그인 후 바로 가입한다. 비공개 그룹은 GroupJoinRequest를 만들고 OWNER가 수락·거절한다. 초대 토큰도 같은 정책을 적용하므로 비공개 승인을 우회하지 않는다. 이름·공개 여부·멤버 수는 탐색에 표시하지만 비멤버의 inviteToken·role은 null, members는 빈 배열이다.

가입·신청은 복합 unique와 Serializable 트랜잭션으로 중복을 막고 역할을 유지한다. 수락은 멤버 생성·가입 이벤트·신청 삭제를 함께 처리한다. 읽기 권한은 readableGroup/readablePost, 활동과 기존 대회는 기존 멤버 전용 권한으로 나눈다. 대기 중인 그룹은 MY에 넣지 않는다. 승인 상태 조회는 부모의 useBackgroundQuery refetch가 소유하여 Suspense QueryRef를 갱신하고, 승인 뒤 처음 등장하는 비공개 피드와 관리자 신청 목록은 ClientOnly로 조회한다.

탐색은 1·2·3열 카드이고 메뉴는 홈·탐색·MY를 JSX로 선언한다. 그룹의 정체성·초대/멤버·가입 안내는 각각 컴포넌트로 나누며 공개·비공개 배지는 ts-pattern으로 분기한다.

공개 그룹마다 canonical·OG/Twitter·JSON-LD와 실제 게시물 서버 HTML을 제공한다. SEO 서버 조회는 인증 Cookie를 전달하지 않는다. 비공개 그룹은 공통 noindex 메타데이터와 빈 게시물 스냅샷을 사용하며 그룹장에게도 JSON-LD를 출력하지 않는다. 공개 그룹만 48개씩 분할하는 사이트맵 인덱스와 robots를 제공하고 실제 공개 사진을 공유 이미지로 쓴다. 사용자 입력은 JSON-LD script 탈출을 막도록 이스케이프한다. 도메인 설정·구조화 데이터 범위·검증은 [SEO 안내](seo.md)를 따른다.

## 피드와 미디어

`galleryPosts`는 groupId를 지정하면 해당 그룹, 생략하면 가입한 그룹 전체를 조회한다. 최신순은 createdAt·id desc이고, 인기순은 KST 이번 달에 작성한 게시물의 좋아요 desc·createdAt/id desc다. 숨긴 사진은 홈·그룹 목록에서 제외하며 이관된 게시물은 기존 사진의 숨김도 확인한다.

사진은 sharp 실제 디코딩·크기 검사 후 최대 1600px WebP로 저장한다. 동영상은 mediainfo.js WASM으로 실제 컨테이너·영상/음성 코덱·길이를 검사한다. MP4(H.264/AAC), WebM(VP8·VP9/Opus·Vorbis), 100MB·5분 이하를 지원한다. 영상은 변환하지 않고 비공개로 저장한다.

`/media/:id`는 요청마다 그룹의 공개 범위와 멤버십을 검사하고 no-store·nosniff와 byte Range 206/416을 지원한다. 로컬·S3 저장소에서 스트리밍해 탐색할 때 파일 전체를 메모리에 올리지 않는다. 파일 삭제가 일시 실패하면 만료 PostUpload를 남겨 maintenance가 다시 시도한다. 미사용 업로드도 정리한다.

웹의 파일 전송은 requestPostUpload → uploadPostMedia → createPost mutation이다. Apollo UploadHttpLink가 Blob/File을 multipart로 전송한다. 이전 사진 제출도 uploadSubmissionPhoto mutation을 사용한다. API는 Origin·세션·티켓 소유/만료·멤버십을 확인하고 크기가 제한된 스트림을 실제 사진/동영상 검사로 넘긴다. REST 업로드는 호환용으로 같은 저장 로직을 쓴다.

글쓰기에서 파일을 선택하면 선택 버튼 영역을 미리보기로 대체한다. 사진은 비율을 유지해 표시하고 동영상은 시트 안에서 재생한다. 파일 이름 옆의 바꾸기·제거로 선택을 관리하며 제거하면 원래 선택 영역으로 돌아온다. 파일 선택 취소는 기존 선택을 유지하며 같은 파일 재선택·다른 파일로 교체를 지원한다. 제출 중에는 선택·교체·제거를 막는다. 형식·크기 오류는 선택 즉시 알리고 디코드 실패는 미리보기 안에서 안내한다. 임시 Blob URL은 교체·제거·시트 해제 때 정리하고 재생 중인 영상도 멈춘다. HEIC의 MIME이 비어 있으면 확장자로 사진 여부를 판별한다.

## 웹의 조회와 상태

최신·인기·그룹 정보는 각각 QueryRef와 Suspense/오류 경계를 갖는다. RSC PreloadQuery가 같은 문서와 변수로 미리 준비한다. 그룹 정보는 대회 필드가 없는 GalleryDocument로 조회한다. 인증은 ViewerBoundary, 닫힌 상태 분기는 ts-pattern을 사용한다.

Apollo는 `offsetLimitPagination(['groupId', 'sort'])`으로 목록을 분리한다. 추가 조회·새로고침은 transition으로 기존 글을 유지한다. 가입·작성·삭제 뒤 목록을 비우고 첫 페이지부터 받는다. 삭제로 캐시가 첫 페이지로 줄어들면 추가 조회 상태도 복원한다. 카드는 ID를 받아 정규화 fragment를 읽으므로 최신·인기 목록에서 같은 게시물의 반응이 함께 바뀐다.

폼은 실제 RHF/Zod·Base UI, 시트와 삭제 확인은 overlay-kit을 쓴다. 고정 메뉴와 정렬 선택지는 JSX로 직접 선언한다. 웹은 최대 1440px이며 상시 게시물은 모바일·태블릿 최대 540px, 데스크톱 최대 680px의 1열 피드로 보여 준다. 흑백 토큰·얇은 구분선·여백으로 정리하고 프로필은 장식 테두리 없이 표시한다. 제목은 사진 위에, 본문은 사진 아래에 접지 않고 보여 주며 좋아요·작성 시각은 하단에 둔다. 인기 게시물은 사각형 미리보기·순위·그룹 이름으로 구분한다. 인기 목록은 기기와 관계없이 순위·64px 사진·제목과 그룹·좋아요 순서로 한 줄씩 표시한다. 검은 바탕·흰 숫자의 순위는 사진 왼쪽에, 기존 대회 순위는 사진 아래에 두어 사진을 가리지 않는다. 데스크톱은 왼쪽 고정 메뉴·중앙 피드·오른쪽 인기 사진, 모바일·태블릿은 하단 메뉴·피드 위의 인기 목록으로 구성한다. 프로필과 그룹 헤더, 로그인 폼도 같은 톤으로 맞춘다. 바텀시트는 모든 기기에서 화면 아래에 붙어 화면 너비를 채우고 본문만 스크롤한다. 필수·선택 표시는 실제 검증 조건과 required/aria-required에 맞춘다.

윙크하며 웃는 얼굴을 흑백 SVG favicon으로 만들고 Next.js의 `app/icon.svg` 규약으로 제공한다. 모바일 상단·데스크톱 메뉴의 BrandIcon도 같은 `/icon.svg`를 사용해 브랜드 이미지가 함께 바뀐다. 이름이 옆에 있으므로 아이콘은 장식 이미지로 처리한다. `/terms`·`/privacy`는 공개 라우트이며 본문이 서버 HTML에 포함된다. 로그인·MY·데스크톱 메뉴에서 정책 링크를 제공하고 운영자 김진건·문의 이메일 jingeon27@gmail.com·작성일을 한 설정에서 관리한다. 정책은 현재 구현을 반영한 검토용 초안이다. 실제 운영 환경의 위탁·국외 이전, 문의·운영 이력·백업 보관 기간과 아동 개인정보 처리 기준은 정식 공개 전에 확정해야 한다.

댓글은 PostComment에 저장하고 게시물·사용자 삭제 시 함께 지운다. 댓글 조회는 MembershipService.readablePost로 공개 범위·숨김을, 작성·삭제는 accessiblePost로 멤버십·숨김을 확인한다. 작성자·관리자만 삭제하며 내용은 trim 후 1~1000자다. 최신순(createdAt·id desc) offset 조회이며 댓글 수는 게시물 조회의 _count로 계산한다. 댓글 시트는 독립 QueryRef·Suspense/오류 경계를 사용하고 작성·삭제 뒤 댓글과 피드 개수를 갱신한다.

댓글 시트의 헤더·목록·입력창은 각각 PostCommentsHeader·PostCommentList·PostCommentComposer가 맡는다. 시트는 화면 너비를 채우고 높이 약 75%로 열린다. 배경은 기본 상태에서 검정 15%, 전체 높이에서는 검정 35%로 어두워지며 Base UI의 스와이프 진행률로 두 단계 사이를 연결한다. 위로 끌면 상단 안전 여백·키보드를 제외한 전체 높이로 펼쳐지고 아래로 끌면 기본 크기로 돌아간다. 헤더의 확장·축소 버튼으로 키보드에서도 조절할 수 있다. Base UI의 snapPoints와 스냅 오프셋에 맞춘 하단 패딩으로 크기와 드래그 중에도 입력창을 화면 안에 둔다. 헤더·하단 입력 영역의 여백을 줄여 목록이 더 많이 보이게 하고, 모바일의 본문·입력은 최대 768px로 제한하며 데스크톱은 왼쪽 원본 게시물·오른쪽 대화를 최대 1152px의 2열로 보여 준다. 내 댓글은 오른쪽의 검은 말풍선, 다른 멤버는 왼쪽의 옅은 말풍선으로 구분하며 게시물 작성자도 표시한다. 본문 아래에 시각과 삭제 조작을 모은다. 하단 입력창은 내용에 따라 최대 높이까지 늘어나고 전송 버튼을 옆에 둔다. 필수 표시·글자 수·오류 안내·제출 잠금은 실제 RHF/Zod 상태와 연결한다. 로그인 사용자는 기존 Me 캐시에서 읽으며 댓글 조회와 작성·삭제 계약은 유지한다.

피드의 일반 새로고침 버튼은 당겨서 새로고침으로 바꿨다. 문서 맨 위에서 단일 손가락으로 충분히 아래로 당겼다 놓으면 최신·인기를 함께 refetch한다. 짧은 당김·가로 이동·취소·여러 손가락·입력·내부 스크롤은 제외하고 요청이 끝날 때까지 중복 갱신을 막는다. 키보드·스크린 리더 사용자는 포커스 시 나타나는 조작으로 갱신한다.

## 인증·모바일·모니터링

직접 정한 아이디·비밀번호로 가입·로그인할 수 있다. 아이디는 소문자로 정규화하고 PasswordCredential에 salt를 쓴 scrypt 해시만 저장한다. 등록·로그인은 GraphQL mutation으로 같은 HttpOnly 세션을 발급하며 이전 요청 세션을 폐기한다. AuthAttempt의 DB 증가로 반복 요청을 제한하고 만료 버킷을 정리한다. 없는 아이디와 틀린 비밀번호는 같은 오류·해시 검증 비용으로 처리한다. 구글·카카오 OAuth state/PKCE와 앱의 일회용 로그인 교환도 유지한다. 로컬에 OAuth 키는 없으므로 실제 제공자 계정 인증은 키 설정 후 검증한다. 파일과 글의 접근 권한은 서버가 확인한다. 도메인 이벤트는 같은 트랜잭션에 ID·종류만 기록한다. API는 Sentry, 웹·앱은 Sentry·Amplitude를 사용하며 키가 없으면 전송하지 않는다.

Expo WebView는 네이티브 로그인·공유·클립보드·햅틱·딥링크·뒤로 가기·복귀를 연결한다. 모바일의 공유·복사 테스트는 펼침 영역을 열고, 햅틱 테스트는 새 그룹 게시물의 좋아요를 사용한다.

## 데스크톱 이용 흐름

웹 셸은 최대 1440px이며 피드는 모바일·태블릿 540px, 데스크톱 680px이다. 1280px부터 메뉴와 인기 목록의 폭을 늘린다. 데스크톱의 게시물은 카드로 구분하고 사진·영상은 4:3 영역과 화면 높이의 60% 이내에서 비율을 유지해 표시한다. MY는 프로필·그룹을 좌우로 나눈다.

그룹의 글쓰기 버튼은 상단바에 있어 피드를 내려도 사용할 수 있다. 초대·멤버 정보는 GalleryFeed의 sidebar 슬롯으로 오른쪽에 배치하며 모바일에서는 피드 아래로 내려간다. 동일한 DOM을 CSS로 재배치하므로 초대·멤버 상태를 복제하지 않는다.

글쓰기 시트는 외곽 너비를 채우고 내부는 최대 1152px로 제한한다. 데스크톱은 왼쪽 미디어·오른쪽 제목과 내용, 오른쪽 하단 제출 버튼으로 구성한다. 등록 뒤 목록 위로 이동한다. 댓글도 원본 미디어·대화를 나란히 보여 주며 PostMedia가 피드와 댓글의 사진·동영상 표시를 함께 맡는다.

## 공용 린트와 오버레이

저장소 packages/eslint-config의 base·next·expo preset이 공통·프레임워크 규칙과 테스트 예외를 관리한다. 앱별 eslint.config.ts는 preset과 경로만 조합한다. 커스텀 규칙은 src/rules/<규칙>.ts의 표준 TSESLint.RuleModule로 구현하고, 바로 옆 <규칙>.spec.ts에서 실제 **fixtures** 파일을 읽어 RuleTester로 검증한다. FSD 규칙은 각각 분리하고 공통 import·경로 분석은 src/lib가 맡는다. 웹의 오버레이·오류 useState 금지도 독립 규칙이며 앱 설정에 긴 selector나 안내문을 넣지 않는다. 규칙·설정은 TypeScript이고 Jiti로 로드한다. 프로젝트 루트 설정도 tsconfig.lint.json으로 검사한다. 한 번 쓰는 이벤트는 JSX에서 선언하며 재사용 핸들러만 분리한다.

시트는 overflow-hidden으로 데스크톱 하단 모서리까지 자르고, 본문만 스크롤하며 Footer는 고정한다. 모바일 Chrome에서 입력 → 제출 포커스 전환 때 하단 메뉴가 클릭을 가로채는 문제를 실제 브라우저로 확인했다. 메뉴 공간을 유지하고 폼 안에 포커스가 있는 동안 숨겨 첫 클릭부터 제출되게 했다. 휴대폰·데스크톱에서 짧은 화면, 스크롤, 닫기·재열기·포커스 복귀와 실제 가입 흐름을 검증한다.

## 검증

- 공개 그룹 변경은 API unit 66·실제 DB e2e 210, 웹 unit/UI 273·실제 문서 API 11, Chrome·WebKit·데스크톱·가짜 WebView Playwright 42개로 검증했다. SEO 생성·비공개 데이터 배제·49개 공개 그룹의 사이트맵 분할·JSON-LD script 탈출·가입 신청 거절/재신청/수락을 포함한다. 코드 생성·타입 검사·lint·포맷·별도 dist의 프로덕션 빌드도 통과했다.

- Vitest 786개: API unit 66·실제 PostgreSQL/supertest 210, 웹 unit/UI 273(배포 스크립트 12개 포함)·실제 문서 계약 11, 모바일 unit/UI 137·API 9, bridge 35, 공용 lint RuleTester fixture 45.
- CI에서 웹 Playwright 42개·모바일 WebView 24개가 통과했다. Android 하드웨어 뒤로 가기 2개는 iOS에서 제외한다. 운영 이미지의 HTTPS 검증은 웹 앱이 소유하는 별도 Playwright 설정으로 실행한다.
- 기존 Playwright 56개(웹 32·모바일 24)가 통과했고 공개 정책·문의 링크·서버 HTML·favicon 검사 3개(Chrome·WebKit·데스크톱)를 추가했다. 이번 변경은 웹 unit/UI 251개, 웹 주요 흐름·홈 피드·정책 9개와 모바일 24개로 검증했다. Android 하드웨어 뒤로 가기 2개는 iOS에서 제외한다. 웹 Chrome·WebKit·데스크톱·가짜 앱과 모바일 Android/iOS 가짜 WebView에서 그룹 생성·초대·사진/동영상 등록·좋아요·인기 정렬·관리자 삭제, 댓글 작성·삭제·페이지·개수, 당겨서 새로고침, 접근 제한·반응형·SSR·앱 기능을 검사한다. Chrome 새로고침은 CDP 실제 터치, WebKit은 Playwright의 호환 터치 이벤트로 확인한다. 실제 MP4를 재생하고 currentTime·탐색을 확인한다.
- codegen·타입 검사·lint와 웹 프로덕션 빌드를 검사한다. 테스트 러너와 설정은 각 앱이 소유하고 전용 DB의 임시 스키마·별도 서버 포트를 사용한다.
- 파일 선택 영역을 미리보기로 대체하는 변경은 기존 폼 테스트 5개와 Chrome·WebKit·데스크톱의 미리보기·시트 검사 6개로 확인했다. 실제 파일 선택·교체·제거·재열기·동영상 재생·업로드까지 검사한다.
- 데스크톱 변경은 웹 unit/UI 251개와 Playwright 36개 시나리오로 확인했다. 전체 실행 뒤 수정한 흐름은 Chrome·WebKit·데스크톱 10개를 다시 실행했다. 1024·1280·1440·1920px의 피드 폭·가로 넘침, MY의 좌우 배치, 그룹 초대, 스크롤한 위치에서 글쓰기·등록 뒤 새 글 표시, 원본 게시물을 보며 댓글 작성을 검사한다. 타입 검사·lint·웹 프로덕션 빌드도 통과했다.
- 댓글 높이 조절은 웹 unit/UI 252개와 Chrome·WebKit·데스크톱의 댓글·시트·글쓰기 Playwright 8개로 검증했다. 기본 75%·드래그로 전체 높이 확장과 축소·버튼/키보드 조작·다시 열기, 짧은 화면의 입력창 유지와 댓글 작성·삭제·페이지 이동을 확인했다. 타입 검사·lint·웹 프로덕션 빌드와 테스트 스키마 정리도 통과했다.
- 기존 대회 API·이전 URL의 단계·정렬·권한 테스트도 유지한다. 새 그룹에는 이 흐름을 노출하지 않는다.

테스트용 사용자·세션·기존 대회 단계·로그인 티켓은 `/testing/*`로 준비한다. 개발·운영에서 활성화하면 서버가 시작을 거부한다. 실제 OAuth 계정, S3/R2 연결, 외부 모니터링 수신, 네이티브 스토어 빌드·실기기 촬영/업로드·공유 시트는 해당 환경에서 확인할 단계다.

남은 테스트 스키마가 없는 것도 확인했다.

## 운영 배포 준비

앱별 Dockerfile과 Next.js standalone 산출물, 운영 Compose·Caddy·배포/백업/앱 복구 스크립트를 추가했다. Oracle A1의 ARM64를 대상으로 하며 웹·API·PostgreSQL을 같은 VM에 둔다. Caddy가 HTTPS와 `/backend/*`를 맡고 DB·API 포트는 외부에 열지 않는다. API의 TRUST_PROXY_HOPS 기본값은 0이며 운영 Compose만 1로 지정해 Caddy 뒤의 가입 제한을 사용자 주소별로 분리한다. prisma CLI는 운영 migrate deploy를 위해 production dependency로 옮겼다.

GitHub Actions는 운영 컨테이너에서 직접 가입·비공개 사진/영상·댓글·재시작·DB 백업 복원을 검증한다. 배포 대상에서는 검증한 동일 이미지를 artifact로 옮겨 GHCR에 게시하고 digest로 고정해 배포한다. 운영 브랜치와 활성화 값이 모두 없으면 게시·서버 접속을 하지 않는다. SSH 호스트 키를 확인하고 GHCR 작업 토큰은 stdin·임시 Docker 설정으로만 사용한다. VM 작업 잠금·공개 헬스 체크·이전 앱 복구를 제공하며 DB 스키마·미디어·백업은 자동으로 되돌리거나 지우지 않는다.

CI에서 ARM64 운영 이미지 두 개를 빌드하고 격리한 HTTPS 컨테이너의 직접 가입·Secure/HttpOnly 세션·비공개 사진/영상·댓글·앱 재시작 후 데이터 유지를 확인했다. 실제 DB 백업을 별도 DB로 복원해 댓글이 남는 것도 확인했다. 배포 스크립트의 실패 복구·잠금 12개와 기존 웹·API·모바일 검증도 통과했다.

운영 VM은 아직 연결하지 않았다. 실제 운영 DNS·공개 인증서·VM 접근·GHCR 다운로드·R2 권한은 사용자 설정 후 확인한다. 준비할 값과 실행 순서는 [배포 안내](deployment.md)에 둔다.

## 개발 환경 반영

그룹 마이그레이션은 앞선 전체 실행 요청에 따라 개발 환경에 반영했다. 직접 가입 기능은 `20261016090000_password_login`으로 PasswordCredential·AuthAttempt 테이블만 추가하며 기존 사용자와 게시물을 보존한다. 실행 요청에 따라 개발 DB에도 적용해 현재 웹에서 직접 가입할 수 있다. 새 환경에서는 db:migrate 후 실행한다. 테스트 DB는 개발 DB와 다른 55434의 photo_contest_test이며 각 레인이 임시 스키마를 만들고 정리한다.

댓글 마이그레이션 `20261017010000_post_comments`는 PostComment 테이블·인덱스·cascade 외래 키만 추가한다. 개발 DB에도 적용하고 기존 게시물·사용자 유지와 최신·인기 피드 및 댓글 조회를 확인했다. 격리 테스트 DB에도 전체 마이그레이션을 적용해 검증한다.

공개 그룹 마이그레이션 `20261019010000_public_groups`는 Group.visibility와 GroupJoinRequest·인덱스·cascade 외래 키만 추가한다. 기존 그룹·사진·영상·좋아요를 보존하며 이전 스키마에 마이그레이션을 적용하는 테스트로 PRIVATE 유지도 확인한다. 이번 작업은 별도 worktree·테스트 DB 55435에서 수행했으며 사용자의 개발 DB나 실행 중인 서버에는 적용하지 않았다. 개발 반영 시 db:generate·db:migrate 후 서버를 다시 실행한다.

운영 컨테이너 검증은 공개 그룹 canonical·JSON-LD와 비공개 사진의 익명 거부를 포함한다. 재시작 복구 확인은 API 헬스·웹 문서 응답·기존 댓글 표시를 함께 제한 시간 안에 재확인하여 Docker 네트워크 전환 중의 일시적인 브라우저 연결 오류를 처리한다.

최신 develop의 테스트 위치 변경을 반영한 최종 검사: 전체 check, API integration 274개, Web API 18개, 신규 홈 E2E 6개, 기존 탐색·공개 SEO·비공개 가입 E2E 6개와 프로덕션 cache/category E2E 7개가 통과했다. Android 뒤로 가기 2개도 통과했다(iOS 하드웨어 뒤로 가기 2개는 설계상 제외). 새 홈에도 검색 폼과 그룹 생성 버튼이 있어 전환 전의 화면을 조작하던 기존 브라우저 검사를 목적 화면이 나타난 뒤 실행하도록 고쳤다. 검색은 JS 준비 전에도 GET /explore?q=로 제출된다. 전체 Prettier 검사와 앱 lint/typecheck를 확인했다.

전체 브라우저 회귀 검사에서 좋아요 수 정규화만으로는 인기 목록 순서가 바뀌지 않는 문제를 확인했다. 활성 MONTHLY_POPULAR 쿼리만 다시 조회하고, NEWEST의 추가 페이지는 유지한다. 기존 사진/동영상/인기/삭제 흐름과 페이지네이션 E2E 4개가 통과했다.
