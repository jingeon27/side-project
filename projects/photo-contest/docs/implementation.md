# 피식 구현 기록

날짜가 있는 기록은 오래된 날짜부터 정리했습니다. 같은 날짜의 항목은 기존 순서를 유지하고, 제목에 날짜가 없는 기록은 마지막에 따로 모았습니다. 과거 설정·검증과 현재 운영 방법은 구분하며 최신 실행 방법은 각 README를 따릅니다.

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

## 2026-10-20 그룹 카테고리

그룹장·부관리자는 선택 분류를 최대 20개·이름 20자로 만들고 이름·순서·보관을 관리한다. 사진·동영상·링크와 대회 참여 글 모두 선택할 수 있고 작성자·관리자가 나중에 변경한다. 보관한 분류는 기존 글에 남는다. 필터는 URL과 Apollo keyArgs로 구분하고 잘못된 ID는 전체로 표시한다. canonical은 기본 그룹 주소를 유지하며 필터 주소를 사이트맵에 넣지 않는다.

GroupCategory와 nullable Post.categoryId만 추가한다. 같은 그룹만 연결하는 복합 FK, ON UPDATE NO ACTION, 활성 이름의 lower(name) 부분 unique, Serializable 권한 재검사·상한으로 DB에서도 규칙을 지킨다. 새 migration 20261020040000_group_categories는 이전 데이터·이전 앱 쓰기 호환 테스트를 통과했으며 개발·운영 DB에는 적용하지 않았다.

검증: API 통합 274개(새 카테고리·migration 17개), 웹 unit/UI 324개·실제 API 18개. 실제 build/start에서 데스크톱·Chrome 휴대폰·WebKit 휴대폰의 생성→등록→필터→부관리자 수정→보관과 기존 공개 캐시를 포함한 7개가 통과했다. CI는 브라우저 레인이 실패해도 프로덕션 캐시·카테고리 레인을 실행한다.

## 2026-10-20 가입 그룹이 없는 홈과 공개 캐시

공개 그룹 최신 생성순 6개, 그룹 검색·생성·즉시 가입, 공개 게시물 최신 피드를 제공한다. 비로그인도 공개 피드를 보며 가입 그룹이 생기면 Apollo MyGroups 결과로 기존 피드에 전환한다. 일반 좋아요는 반환 fragment를 갱신하고 댓글 수는 해당 게시물만 다시 읽어 펼친 목록을 유지한다. 관리자는 숨김·복원과 숨긴 목록을 사용할 수 있다.

검증: API unit 102·통합 257, 웹 unit/UI 312·실제 API 18, 새 홈 Chrome/WebKit/데스크톱 e2e 6개. 실제 standalone 캐시 레인은 공개 홈 HIT·무효화·비공개 분리를 포함해 4개를 통과했다. 개발·운영 DB에는 마이그레이션하지 않았다.

## 2026-10-20 서비스와 데이터 접근 구조 정리

Repository 전달 계층을 제거하고 서비스에서 Prisma를 직접 사용한다. UnitOfWork는 기존 트랜잭션·재시도와 한 연결 사용을 유지한다. 트랜잭션 통합 사양은 database 구현 옆에 둔다.

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

## 2026-10-21 게시물 직접 업로드와 완료 복구

게시물 파일은 발급한 presigned POST로 저장소에 직접 보낸 뒤 completePostUpload에서 최종 복사본의 크기·타입·사진 해상도·동영상 코덱과 길이를 검사한다. API의 /post-uploads raw 경로와 uploadPostMedia를 제거했다. 로컬은 본문 전에 URL HMAC을 확인하고 파일을 디스크로 스트리밍한다. 등록 버튼을 누를 때 전송하며 기존 대회 업로드는 유지한다. 사진·영상의 원본 메타데이터가 남을 수 있음을 개인정보와 첨부 문서에 반영했다.

분석 캐시는 최대 4개 블록이며 사진 블록은 128KB, 영상은 1MB다. 동시 완료는 4개로 제한하고 실제 읽기 시작부터 30초·누적 32MB·128회 읽기 상한을 적용한다. 복사 후보를 DB에 먼저 기록하고 완료 경합은 lease와 조건부 갱신으로 확정한다. DB 커밋 응답을 잃으면 게시됐을 수 있는 파일을 삭제하지 않는다. 정리 실패는 항목별로 재시도하고 DB 참조 없는 로컬 staging·임시 파일도 1일 후 배치 정리한다.

검증: Node 24에서 API unit 125개, 전체 integration 292개와 추가 장애 복구 사양 2개를 통과했다. 실제 PostgreSQL 55435의 격리 스키마에서 새 migration을 실행했다. 단위 검사는 실제 AWS SDK의 POST 정책·HEAD/CopyObject/Range 요청과 범위를 무시한 응답 거절, 실제 MediaInfo의 HEVC·338초 영상 거절을 포함한다. 통합 검사는 서명 없는 100MB 요청의 본문 전 거절, 다른 소유자·만료·형식·크기·픽셀 폭탄, 동시 완료·staging 재전송, 커밋 응답 유실·정리 재시도를 확인한다.

웹 unit/UI 346개, 실제 API 문서 18개, Chrome·WebKit·데스크톱 첨부/개인정보 E2E 15개와 Android/iOS WebView seed 시나리오 2개를 통과했다. API/Web/Mobile/test-kit 타입 검사, 프로젝트 lint, 변경 파일 포맷·diff 검사와 웹 production build도 통과했다. test-kit check:cleanup에서 남은 스키마 0개를 확인했다. 개발 DB와 개발 서버는 변경하지 않았다.

실제 S3 버킷/IAM/CORS 적용과 운영 배포는 실행하지 않았다. Photo Contest 전용 CORS·수명 주기 설정과 JPG/PNG 읽기 호환 버전의 선배포, NOT NULL tokenHash 유지, expand migration·API·Web 배포 순서는 [배포 문서](deployment.md)를 따른다. 의존성 추가에 따라 API package.json과 루트 yarn.lock을 함께 변경했다.

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

## 2026-10-22 서버 파일 처리 제거와 test-kit S3 대역

사용자 결정으로 게시물·기존 대회 사진·그룹 대표 사진의 업로드와 조회를 모두 S3 presigned URL로만 처리한다. 발급은 권한·허용 형식·크기를 확인하고 최종 키에 키·Content-Type·정확한 content-length-range를 고정한 POST 정책을 서명한다. 완료는 HEAD로 크기·형식만 확인하며 staging→최종 복사, 완료 lease·후보 추적은 없앴다. 서버가 내용을 검사하지 않으므로 복사본으로 고정할 불변식이 없고, 정책이 끝나기 전(최대 15분)에는 업로더가 같은 크기·형식으로 다시 올릴 수 있다.

`/media/:id`·다운로드·`/photos/:id`·대표 사진 경로는 권한 확인 뒤 `private, no-store` 307로 60초 서명 GET에 보낸다. Range와 다운로드 이름·응답 형식은 저장소가 처리하고 postDownload도 같은 서명 URL을 준다. MediaProcessor(image-size·mediainfo.js)·MediaReader·readRange, 대회 1600px·대표 사진 512px sharp WebP 변환, PNG·움직이는 WebP·코덱·길이 검사와 관련 한도·테스트, 로컬 디스크 저장소·로컬 업로드 서명·STORAGE_BACKEND/STORAGE_DIR을 지웠다. 위치·EXIF 메타데이터는 일부러 유지한다. 동영상 5분 제한은 브라우저가 메타데이터로 읽은 길이로만 확인하고, 대표 사진은 원본 그대로 올린다. 쓰지 않는 `PostUpload.completionKey`·`completionStartedAt`·`PostUploadAttempt`는 파괴적 migration을 피하려고 남겼다.

로컬 개발·테스트는 Docker 없이 `@photo-contest/test-kit`의 S3 호환 대역을 쓴다. 서명 POST 정책, SigV4 헤더·query 서명, 서명 GET의 Range·응답 헤더 덮어쓰기, HEAD·PUT·DELETE, 웹 origin CORS를 디스크 폴더로 처리한다. API 통합·웹/모바일 test:api·test:e2e·test:cache는 빈 포트에 대역을 자동으로 띄우고 dev는 `S3_ENDPOINT`가 로컬이면 4210으로 함께 띄운다. 단독 Compose는 S3 설정을 필수로 받고 미디어 volume·`backup.sh --with-media`를 없앴으며 컨테이너 검증은 대역을 붙여 실행한다. 공통 배포 스모크도 서명 POST → 완료 → 307 서명 GET 흐름으로 바꿨다.

CI의 데스크톱 test:cache 카테고리 사양 실패는 이 전환과 무관한 타이밍 경합이었다. 같은 커밋의 다른 실행은 통과했고, 실패 trace에서는 이달의 인기 경계가 아직 스트리밍 중이고 사이드바가 hydration되기 전에 서버 HTML의 details를 눌러 닫힌 채 남았다. 사양은 브라우저에서만 그리는 카테고리 폼이 붙은 뒤 연다. 같은 사양에서 드러난 카테고리 생성 폼의 경합(다른 목록 재조회가 끝난 뒤 폼을 비워 이어 입력한 이름이 지워짐)은 생성 결과로 바로 비우도록 고쳤다.

## 2026-10-22 전체 파일 업로드 presigned 전환

게시물 사진·동영상과 이전 대회 사진 제출, 그룹 대표 사진을 모두 서명 발급 → 저장소 FormData POST → 완료 검증 → 게시/제출 흐름으로 통일했다. GraphQL에는 JSON 메타데이터만 보내며 uploadSubmissionPhoto·uploadGroupAvatar·Upload scalar·/uploads raw 경로와 graphql-upload·apollo-upload-client를 제거했다. 브라우저 전송 helper는 shared/api에 두고 Apollo는 HttpLink를 사용한다. 앱 WebView와 테스트 seed도 같은 계약을 따른다.

공통 MediaUploadService가 소유권·그룹/대회 권한·만료·정확한 크기/타입·완료 lease·동시성 제한·후보 파일 추적과 커밋 응답 유실 복구를 맡는다. 대회 사진은 5분 서명과 10MB 상한을 유지하고, 이후 서버 디코딩·변환을 없애 HEAD로 크기·형식만 확인하며 EXIF·위치 메타데이터는 일부러 그대로 둔다. 파일 확인 중 대회가 마감돼도 확정하지 않으며 대회용 업로드를 일반 게시물에 쓰지 못하게 검사한다. 제출된 대회 파일은 게시물 임시 파일 정리에서 제외한다. 기존 Upload 행은 nullable mediaUploadId 관계와 추가형 20261022030000_presigned_submission_uploads migration으로 보존한다.

S3_KEY_PREFIX를 선택적으로 지원한다. S3_BUCKET=jingeon-side-project, S3_KEY_PREFIX=game-feedback/photo-contest이면 새 임시·최종 객체가 기존 game-feedback/* IAM 범위에 들어간다. DB에 전체 키를 기록해 기존 루트 경로의 파일도 계속 읽고 로컬 파일 경로는 유지한다. Compose와 .env 예시에 전달을 연결했으며 실제 AWS 설정은 변경하지 않았다.

최신 develop(#31)을 반영한 뒤 그룹 대표 사진도 requestGroupAvatarUpload → 저장소 POST → completeGroupAvatarUpload → updateGroupProfile로 전환했다. 완료 전 지정·다른 소유자·다른 업로드 목적을 거절하고 처리 중 관리 권한 회수를 트랜잭션에서 재확인한다. 현재 대표 사진은 보존하며, 이후 서버 512px 변환을 없애 원본(메타데이터 포함)을 그대로 저장한다. nullable GroupAvatar.mediaUploadId와 20261022152000_presigned_group_avatars migration을 추가했다. MembershipModule을 분리해 공통 업로드 서비스와 GroupModule의 순환을 피했다.

검증: API unit 130개·실제 PostgreSQL 통합 325개, Web unit/UI 349개·실제 API 문서 20개, production build/start의 Chrome·WebKit·데스크톱 E2E 21개와 Android/iOS WebView seed 회귀 2개가 통과했다. 이전 대회 제출의 전송 실패 후 초안 보존·재시도, GraphQL JSON 전송, 새로고침 후 사진 표시와 기존 게시물 사진/동영상 업로드·다운로드를 확인했다. API/Web/Mobile/test-kit 타입 검사와 프로젝트 lint도 통과했다. 최신 develop 반영 전 첫 브라우저 실행에서 업로드 전 페이지 진입이 한 번 시간 초과됐고 전체 18개 재실행은 모두 통과했다. 최신 develop 반영 후 21개 검증은 첫 실행에서 모두 통과했고 대표 사진 전송 실패 후 미리보기·입력 유지와 재시도까지 확인했다. 실제 S3/IAM/CORS 송수신과 운영 배포는 미실행이며 개발 DB·개발 서버를 변경하지 않았다.

## 2026-10-23 소셜 가입 프로필 확인과 S3 개인 프로필

신규 소셜 계정은 제공자의 이름·사진을 기본값으로 두고 `/onboarding`에서 닉네임 수정, 사진 제거·직접 선택, 약관 동의를 마친다. 동의 전에는 인증이 필요한 커뮤니티 쓰기를 막고 원래 목적지로 돌아가는 경로를 보존한다. 직접 선택한 사진은 5분 presigned POST로 비공개 S3에 전송하고 API는 HEAD로 형식·크기·소유권·만료만 확인한다. 선택한 파일은 고정 프로필 경로가 현재 참조를 확인한 뒤 60초 서명 GET으로 이동시킨다. 만료된 미사용 파일은 정리하고 현재 사진은 보존한다. MY에서 사진·닉네임을 다시 변경하거나 사진을 제거할 수 있다. 재로그인 시 소셜 제공자의 값으로 사용자 선택을 덮어쓰지 않는다.

인증·프로필·테스트 fixture 입력은 class-transformer/class-validator DTO와 전역 ValidationPipe로 변환·검증한다. 비밀번호 원문 공백은 보존하고 기존 로그인 오류 코드·Origin 검사·DB 반복 시도 제한을 유지한다. 가입·로그인 횟수는 DTO 검증 전에 guard에서 센다. 20261023040000_profile_uploads_and_onboarding migration은 새 테이블과 nullable 열·기본 false 플래그를 추가하며 기존 계정을 재가입 상태로 바꾸지 않는다. Prisma client와 GraphQL 문서는 정식 생성 명령으로 갱신했다.

검증: API unit 120개, 격리 PostgreSQL/S3 대역의 API integration 350개, Web unit/UI 421개와 실제 API 문서 20개가 통과했다. production build/start의 Chrome·WebKit·데스크톱 E2E 9개가 최종 한 번에 통과했다(아이디 가입·로그인 회귀, 소셜 기본값·동의·닉네임 변경·사진 제거, S3 업로드·재조회·삭제). 프로젝트 전체 타입 검사·lint도 통과했다. 제공자 응답과 S3 경계는 테스트 대역이며 실제 OAuth·AWS 송수신·운영 배포 성공을 주장하지 않는다. 개발 DB/서버는 변경하지 않았다. 적용할 개발 환경에서는 프로젝트 환경변수를 준비한 뒤 `yarn workspace @side/photo-contest db:migrate`가 필요하다.

## 2026-10-23 Prisma 7 업그레이드

API와 test-kit의 Prisma를 7.10.1로 맞추고 API에 같은 버전의 @prisma/adapter-pg와 @prisma/driver-adapter-utils를 추가했다. 루트 yarn.lock은 이 의존성 해석을 반영한다. prisma.config.ts가 프로젝트 .env를 명시적으로 읽고 CLI에 URL을 전달하며, test-kit은 작업 디렉터리와 관계없이 API의 config를 지정해 격리 migration을 적용한다. 운영 이미지에도 config를 포함한다. 기존 CommonJS 빌드·생성 경로와의 호환을 위해 prisma-client-js 생성기를 유지하며 런타임은 pg 어댑터를 사용한다.

API·운영 migration/서비스 검사·test-kit이 같은 어댑터를 사용한다. schema는 ORM과 raw SQL search_path 양쪽에 전달하고 connection_limit은 풀 최대 연결 수로 옮긴다. pg는 풀 대기와 연결에 같은 timeout을 쓰므로 pool_timeout을 우선하고 없으면 connect_timeout(기본 5초)을 쓴다. 운영 sslcert는 서버 CA로 읽어 엄격한 인증서 검증을 유지한다. DB 모델과 기존 migration SQL은 변경하지 않았다.

통합 검증에서 Prisma 7의 커밋 충돌이 P2034가 아닌 DriverAdapterError(TransactionWriteConflict)로 직접 전달되어 동시 좋아요 요청이 간헐적으로 내부 오류가 되는 문제를 재현했다. 어댑터 충돌도 기존 4회 재시도·CONFLICT 정책으로 처리하며, 다른 어댑터 오류는 그대로 전파한다. 단위 회귀 5개를 추가하고 기존 동시 좋아요 통합 사양에서 내부 오류 보고가 없고 실패 7건 모두 한도 안내인지 확인한다. 운영 모드 통합 하네스에는 WEB_ORIGIN과 일치하는 앱 로그인 콜백 기본값을 더해 최신 운영 설정을 충족시켰다.

Node 24.18.0에서 API·test-kit typecheck, API build, API 단위 127개, test-kit 단위 35개와 변경 파일 ESLint가 통과했다. 사용자 승인 후 이 Worktree에 UTF-8 테스트 DB(55434/photo_contest_test)를 새로 기동해 PostgreSQL/Supertest 통합 55개 파일·346개를 모두 통과했다(skip 없음). 동시 좋아요 사양은 수정 후 8회 연속 통과했다. test-kit check:cleanup으로 남은 테스트 스키마가 0개임을 확인하고 이번 Worktree의 테스트 DB를 종료했다. 기존 개발 DB·서버는 변경하지 않았다. 실제 RDS TLS 연결·컨테이너 빌드·배포는 실행하지 않았다.

## 2026-10-23 sharp·GraphQL Tools 보안 업데이트

테스트킷의 sharp를 ^0.35.5로 올려 0.34.5와 해당 네이티브 바이너리를 lockfile에서 제거했다. 웹은 GraphQL Codegen CLI 7.4.6·typescript-operations 6.1.10·typed-document-node 7.2.0으로 올려 GraphQL Tools utils 11.2.2를 제거했다. 공식 v6 생성 파이프라인에 맞춰 중복 typescript 플러그인을 빼고 enumType: const·문자열 ID·기존 Apollo __typename 정책으로 재생성했다. 생성 JavaScript를 이전 버전과 비교해 모든 GraphQL 문서·enum 값이 동일함을 확인했고 재생성 결과도 동일하다.

추가 audit에서 NestJS GraphQL 14.0.3이 정확히 고정한 utils 12.0.1에도 GHSA-c4qx-w738-7hr3이 적용됨을 확인했다. 상위 패키지의 수정 릴리스가 없어 루트 package.json의 해당 버전 descriptor에만 12.0.3 resolution을 적용했다. 이 보안 패치를 모든 설치·CI에서 일치시키기 위해 루트 manifest와 yarn.lock을 함께 변경했다. 최종 utils는 12.0.3·12.1.0만 남는다. Yarn의 24시간 게이트(1440분)는 유지했다.

Node 24.18.0에서 immutable install, Web·API·test-kit typecheck, Web·API·test-kit lint, API의 별도 .data 출력 경로 빌드가 통과했다. Web unit/UI 440개·API unit 127개·test-kit 35개·실제 생성 문서 API 계약 20개, 총 622개가 통과했다. 계약 테스트는 새 web_api 스키마·전용 55434 DB와 S3 대역에서 실제 sharp 이미지의 업로드·조회도 확인했다. 최초 계약 실행은 TEST_DATABASE_URL 누락으로 시작하지 못했고, 전용 URL을 명시한 뒤 통과했다. 최종 Yarn audit에서 sharp·utils 항목은 0개이며 다른 의존성의 기존 항목 때문에 전체 audit 종료 코드는 1이다. 남은 테스트 스키마 0개와 이번 Worktree의 테스트 DB 종료를 확인했다. 개발 DB·서버는 변경하지 않았다. 전체 브라우저 E2E·Web production build·컨테이너·배포 검증은 실행하지 않았다.

## 2026-10-24 MY 게시물과 공통 추가 조회

## 2026-10-25 루트 .env만 사용하는 설정 계약

사용자 지정에 따라 프로젝트 루트 `.env`에 정의된 키만 앱 설정으로 유지했다. Web·API·Admin·Mobile·테스트 실행기의 별도 환경변수와 모바일 env 템플릿을 제거했다. OS·Node·Next·CI가 제공하는 실행 변수와 저장소 공용 배포 도구의 이미지·네트워크·DDL 계정 입력은 앱 설정과 구분한다. 마이그레이션 컨테이너는 전용 계정 URL을 DATABASE_URL로 받으며 런타임 앱에는 DDL 계정을 주지 않는다. RDS 호스트는 DATABASE_URL에서 확인하고 기존 TLS·역할 검증을 유지한다.

소셜·개발 닉네임 로그인과 앱 로그인 교환을 제거했다. 제품 인증은 아이디·비밀번호·익명 세션이다. NODE_ENV=test만으로 fixture API를 등록하지 않으며 격리 실행기의 createApp({ testFixtures: true })가 필요하다. 테스트 밖에서 등록하면 시작을 거부한다. TEST_DATABASE_URL은 기존 전용 DB 규칙과 실행별 스키마 격리를 유지한다. API 포트는 API_URL에서, 프록시 신뢰는 운영의 고정 1단계에서 정한다. 모바일은 WEB_ORIGIN과 공개 관측 키만 받으며 스토어 주소·강제 버전·App Link 설정을 제거했다.

검증: API unit 123개·통합 338개, Web 430개, Mobile 133개·실제 API 3개, test-kit 34개를 통과했다. 실제 AWS에서 게시물 PNG·MP4, 프로필 JPEG, 그룹 WebP, 기존 대회 사진 PNG의 presigned 업로드·완료·권한·GET·Range·CORS를 재검증했다. 생성한 5개 객체는 DELETE 204로 정리했다.

브라우저에서 비밀번호 가입·로그아웃·재로그인과 WebView 가입·공유·뒤로 가기를 확인했고 Android 개발 번들도 생성했다.

두 앱의 확인용 PNG는 upload-verification 경로에 따로 남겼다. 개발 서버를 직접 종료·재시작하거나 개발 DB·Terraform·운영 배포를 변경하지 않았다. Docker 실행기가 없어 컨테이너 재시작·배포 smoke는 실행하지 않았다. 이전 날짜별 기록은 당시 설정을 설명하며 현재 환경변수 계약은 루트 .env.example을 따른다.

MY에 참여 그룹과 내가 올린 게시물을 표시하고 전체·참여 그룹 필터를 URL로 관리한다. 인증된 myGalleryPosts 조회는 세션의 작성자만 선택하며 숨김·탈퇴한 비공개 그룹·다른 사용자 게시물을 제외한다. 기존 게시물 카드를 재사용해 댓글·수정·삭제를 제공하고 생성·수정·삭제·숨김·복원 뒤 MY를 포함한 목록을 갱신한다. 그룹 필터 URL로 새로고침할 때 라우트에서 사전 조회한 전체 목록과 다른 쿼리가 SSR의 직접 요청 금지 경계를 넘지 않도록 기존 useIsSSR/skipToken 방식으로 조회를 지연한다.

공통 useInfiniteQuery는 Apollo의 QueryRef와 정규화 캐시를 그대로 사용하며 추가 조회·목록 끝·동시 요청을 관리한다. 게시물·그룹 탐색·가입 신청·댓글·답글·대회 목록의 중복 페이지 처리와 기존 offset 전용 훅을 교체했다. 도메인별 카운트와 숨김 사진 규칙은 호출부가 전달한다.

최신 develop 6d858497의 https 앱 링크·Prisma 7.10.1·보안 의존성을 반영했다. 전체 타입 검사와 lint, API 단위 131개·통합 351개, Web 444개·Mobile 156개·Bridge 36개가 통과했다. MY 권한·그룹·숨김·페이지 경계·탈퇴 검증 3개와 변경된 페이지네이션/게시물 단위 28개도 통과했다. production build/start에서 소셜 가입·S3 프로필 Chrome/WebKit/데스크톱 6개, MY 필터·새로고침·수정·삭제와 기존 더보기 4개가 통과했다. 실제 외부 OAuth·AWS·운영 배포는 실행하지 않았으며 알림 도메인·RN push는 이 변경에 포함하지 않는다. 테스트는 전용 55434의 격리 스키마와 S3 대역을 사용했다.

## 2026-10-25 익명 참여·활동 알림·화면 모드와 RN 푸시

익명으로 시작하기는 HttpOnly 세션을 만들고 공개 그룹 가입·참여만 허용한다. 비공개 그룹 생성·가입 신청·초대 참여에는 정식 로그인이 필요하다. 익명 사용자가 비밀번호 회원으로 등록하면 같은 사용자 ID를 보존해 기존 공개 그룹과 게시물을 유지하고 세션을 교체한다. 로그인 화면의 로컬 체험/개발 로그인 UI와 미사용 프런트 호출을 제거했고 테스트용 개발 인증은 환경 제한을 유지한다.

활동 알림은 내 글 댓글·내 댓글 답글·대회 시작/종료·가입 승인/거절·관리자 가입 신청이다. 개인 팔로우·1:1 채팅은 추가하지 않는다. 관리자 신청 알림은 현재 OWNER/MODERATOR에게만 보이며 처리 시 사라진다. 숨긴 콘텐츠·삭제·탈퇴·권한 변경은 목록/배지/푸시에서 다시 확인하고 본인/반복 요청 알림은 제외한다. 홈/MY 벨과 알림함은 실제 미읽음 수·무한 목록·개별/전체 읽음을 연결했다. 원댓글 작성자 멘션은 공통 Mention 테두리 UI를 사용한다.

웹 화면 모드는 system/light/dark를 쿠키와 SSR에 반영하고, 브리지로 RN 안전 영역·WebView·오류 화면·상태 표시줄도 동기화한다. RN 푸시는 설치 UUID와 Expo token을 현재 WebView 세션에 등록하며 OS 권한은 알림함의 켜기에서 요청한다. 알림 트랜잭션의 큐 기록, DB 임대, 전송 전 가시성/만료/읽음 확인, 재시도와 티켓/영수증 구분, 로그아웃·계정 전환 정리를 구현했다. 개인정보 없는 잠금화면 안내·앱 배지·foreground 갱신·중복 탭 제거·문서 준비 후 알림함 이동을 지원한다. [공통 패키지와 운영 설정](../../../packages/toolkit/src/push-notifications/README.md)에 실제 EAS/FCM/APNs 준비 과정을 기록했다. 기본 API 발송은 false이고 앱 기능이 준비되지 않으면 권한 지원을 광고하지 않는다.

API 전체 DB 통합 369개, Web unit/UI 446개, Mobile unit/UI 162개, Bridge 37개, native host Android/iOS E2E 전체 26개가 통과했다. 댓글·대회·가입 신청 알림과 익명 세션·비공개 차단·회원 전환은 API 검증에 포함된다. Web은 전체 117개 사양을 전 실행에서 확인했고 기존 홈 벨 선택자 3개를 현재 링크로 고쳐 별도 재검증했다. 최신 develop의 다크모드 모달 검증을 보존해 충돌을 해결했다. 이번 푸시 경계는 실제 세션·트랜잭션·권한·로그아웃·부분 실패 테스트와 실제 웹/API·네이티브 호스트 왕복으로 검증했다. 실제 원격 푸시 수신은 자격 증명과 dev client 실기기가 필요하며 로컬 브라우저 성공으로 대체하지 않는다.

## 2026-10-25 환경변수 예제 정리와 실제 AWS 업로드 확인

현재 아이디·비밀번호/익명 로그인에 필요하지 않은 소셜 제공자 키를 로컬·운영 예제와 운영 Compose에서 제거했다. 소셜 인증 구현 자체를 제거한 변경은 아니다. 포트·프록시의 로컬 기본값과 비어 있는 운영 앱 링크 설정을 로컬 예제에서 빼고, 루트 실행기가 전달하지 않는 네이티브 Sentry·Amplitude 키는 apps/mobile의 개발·운영 예제로 옮겼다. 실제 `.env`의 자격 증명·새로 입력된 관측 키·기존 DB 포트/URL을 보존하고 변경 전 파일을 Git 제외 경로에 백업했다.

실제 `.env`는 AWS 키만 바뀌고 버킷·endpoint가 로컬 S3 대역을 가리키고 있었다. 사용자 지정 버킷 jingeon-side-project, ap-northeast-2, photo-contest/local prefix와 빈 endpoint로 맞췄다. 격리 api_test_ 스키마에 migration을 실행하고 아이디·비밀번호 가입 세션으로 게시물 PNG·MP4, 프로필 JPEG, 그룹 대표 WebP, 기존 대회 PNG 제출을 검증했다. 각 흐름의 presigned POST 204 → HEAD 완료 → 게시/프로필 적용/제출 → 서명 GET 200 및 원본 바이트 일치, 게시물 다운로드·Range 206·미로그인/외부인 거부·크기 초과 거절이 통과했다. localhost:3200의 CORS preflight와 실제 POST·GET 응답 허용 헤더도 확인했다. 마지막 실행의 S3 객체 5개는 DELETE 204로, DB 스키마는 DROP으로 정리했다. 브라우저 연결이 없어 이번 확인은 HTTP/API 기준이다.

콘솔 확인 요청에 따라 upload-verification/2026-10-25T11-41-50-004Z.png 한 개(525바이트)는 별도로 남겼다. 실제 AWS 업로드 204·HEAD 200·서명 GET 200과 원본 일치를 확인했다. 기존 개발 서버는 재시작하지 않았으므로 해당 프로세스의 새 업로드 설정은 다음 시작 때 반영된다. IAM·Terraform·버킷 정책·CORS는 변경하지 않았다.

검증: API 환경 설정 단위 11개와 웹 저장소 업로드 helper 7개, 검증용 API 빌드가 통과했다. 미정의 환경변수의 코드 참조를 어디까지 제거할지는 운영·모바일·테스트 내부 설정의 범위를 확인 중이다.

## 2026-10-26 공통 EC2의 PostgreSQL 컨테이너 전환

현재 인증은 아이디·비밀번호와 익명 세션만 제공한다. 아래 과거 검증 기록의 외부 인증·앱 로그인 항목은 제거된 구현에 대한 이력이다.

외부 RDS 대신 공통 EC2 안의 PostgreSQL 18 컨테이너를 Game Feedback과 함께 쓴다. RDS는 만든 적이 없어 옮길 데이터는 없다. [공통 배포 가이드](../../../deploy/shared-instance/README.md)가 현재 기준이며 2026-10-19 기록의 RDS·PITR 내용을 대신한다.

- `photo_contest` DB와 `photo_contest`/`photo_contest_migrator` role 분리는 유지한다. API·ops·migrate만 내부 DB 네트워크에서 `shared-postgres`로 연결하고 Web은 연결하지 않는다. 운영 URL은 `sslmode=disable`이어야 하며 RDS 호스트·CA 검사를 제거했다.
- 배포마다 migration 직전에 `pg_dump`를 backup 버킷에 올리고 실패하면 멈춘다. 데이터 볼륨은 DLM 일일 스냅샷 7개를 보존한다. 배포 도구 테스트는 `test/deployment/database-backup.spec.ts`로 옮겼다.
- 호스트가 멈추면 Sentry도 신호를 보내지 못하므로 CloudWatch 알람을 추가했다. 인스턴스 상태 검사가 3분 연속 실패하면 재부팅하고, CPU 크레딧 부족을 알린다(`alarm_email`이 있을 때 메일).

| 실제 로컬 실행      | 결과                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| GF API unit 레인    | 186개 통과(공용 DB URL 검사 포함)                                                          |
| PC API unit 레인    | 127개 통과(공용 DB URL 검사 포함)                                                          |
| PC 배포 도구 Vitest | 50개 통과: 배포 전 덤프·업로드 실패 시 migration 차단, 볼륨 미마운트·backup 버킷 설정 거부 |
| 타입 검사           | GF API, PC API, PC Web 통과                                                                |
| Terraform 1.16.6    | fmt, backend 비활성 init, validate, mock provider plan 13개 통과                           |
| shellcheck 0.11.0   | 공용 배포 스크립트와 렌더링한 user-data 통과                                               |

실제 Docker로 두 서비스와 공용 DB를 띄우는 shared-instance smoke(Game Feedback API의 `scripts/shared-instance-smoke.ts`)는 로컬에 Docker가 없어 실행하지 않았으며 CI에서 확인해야 한다. 실제 AWS apply, 첫 부팅의 볼륨 포맷·마운트, 스냅샷·덤프 복원은 미검증이다.

## 2026-10-26 로컬·자동 테스트 S3 대역 제거

개발 실행기의 S3 동시 기동, test-kit S3 서버·CLI·대역 전용 사양과 컨테이너 검증의 storage 서비스를 제거했다. API·웹·모바일 테스트는 기존 AWS S3 설정을 사용하고 tests/<격리 스키마 또는 실행 ID>/ 객체만 정리한다. 버킷은 만들거나 지우지 않는다. 네트워크 없는 서명 정책 단위 사양은 유지하고 HEAD·POST·DELETE 검증은 integration 레인으로 옮겼다. 실제 임시 AWS 자격 증명의 session token도 SDK·컨테이너에 전달한다. 공용 CI·공유 배포 smoke는 Game Feedback과 함께 사용하므로 관련 설정만 함께 수정했다.

검증: API unit 127개와 test-kit 34개, API·test-kit·웹 TypeScript 검사, 변경 파일 ESLint, shellcheck·actionlint가 통과했다. Game Feedback API unit도 187개 통과했다. `yarn install --immutable --mode=skip-build`는 성공했고 기존 peer dependency 경고는 남아 있다.

실제 AWS의 새 실행 prefix에 ListObjectsV2(MaxKeys=1)만 요청했으나 AccessDenied였고 객체는 쓰거나 지우지 않았다. 통합 실행기는 데이터 쓰기 전 해당 경로의 ListBucket 접근을 확인하도록 했다. 실제 S3·브라우저·컨테이너 통합 검사는 필요한 경로별 권한·CORS와 Docker가 준비된 환경에서 별도로 실행해야 한다. 기존 버킷·객체·로컬 파일·.env 자격 증명·개발 서버·DB·IAM·GitHub 설정은 변경하지 않았다.

## 2026-10-28 게시물 메뉴의 Portal 경계

PostActionsMenu는 Trigger를 서버 HTML에 유지하고 useIsSSR 분기를 제거했다. DOM selector로 컨테이너를 정하는 메뉴·확인창·바텀시트·토스트 네 곳은 공통 OverlayPortal로 감쌌다. 컨테이너 선택과 Portal 생성은 래퍼의 dynamic ssr:false 경계 안에서만 실행하며, 바텀시트처럼 Portal을 내장한 컴포넌트도 같은 콜백에서 생성한다. 이 패턴은 overlay 스킬에 기록했다.

검증: Portal·오버레이·카드 관련 단위·UI 테스트 20개와 업로드·대회 생성·알림 설정·댓글·알림 화면의 관련 테스트 22개, Web typecheck와 변경 파일 ESLint 통과. DOM이 없는 서버에서 래퍼가 주변 콘텐츠만 렌더하는지, hydration 후 지정된 컨테이너에서 Enter로 메뉴가 열리는지, 시트·확인창·토스트의 컨테이너와 닫기·포커스 복귀가 유지되는지 확인했다.

## 2026-10-30 웹 기능별 폴더 정리

페이지 레이어 이동 후 한 ui·model 폴더에 섞여 있던 기능을 다시 구분하고, 관련 파일 22개를 기능별 하위 폴더로 옮겼다. 페이지 진입·조립과 slice의 공개 API는 유지하며 주 컴포넌트와 직접 쓰는 하위 UI·테스트를 함께 둔다. 기존 위치의 호환 re-export는 추가하지 않았다.

그룹 화면은 categories·join-requests·hidden-posts·header·access로, 파일 입력·미리보기는 fields/media로 구분했다. 도메인 댓글의 작성·좋아요·헤더도 기능별로 묶었다.

검증: 두 웹의 타입·lint·운영 빌드, 피식 569개·Game Mate 291개 단위/UI 테스트, Chromium·Safari 컴포넌트 14개와 루트 knip를 통과했다. 소스·테스트 138개를 비교해 모듈 경로와 import 정렬 외의 코드 변경이 없음을 확인했고, 바뀐 스킬 7개의 형식과 문서의 이전 파일 경로·상대 링크를 검사했다. DB·S3를 쓰는 전체 서비스 E2E는 이번 폴더 정리에서 실행하지 않았다.

## 2026-10-30 웹 페이지 소유권 정리와 Lottie

웹의 features·widgets UI 사용처와 책임을 점검하고, 페이지 전용 UI와 스키마·하위 필드·테스트 33개 파일을 해당 `_pages` slice로 옮겼다. 그룹 가입 신청·카테고리·숨긴 게시물 관리, 공개 홈 피드, 그룹·게시물 작성 폼, 알림 설정, 대회 피드 더 보기와 결과 안내가 대상이다. 도메인 카드·반응·편집 동작과 요청·캐시는 features에 유지하고, 이전 위치의 호환 re-export는 남기지 않았다.

가입 신청은 조회 부모의 useBackgroundQuery·재시도와 자식의 QueryRef 읽기를 유지한다. 사전 조회하지 않은 관리자 전용 쿼리는 SSR에서 skipToken으로 지연하고, 새로고침은 transition에서 실행해 기존 목록을 보존한다. 레이어 이동 때문에 이 동작을 별도 useSuspenseQuery로 바꾸지 않았다.

공통 디자인 시스템에 직접 작성한 벡터 Lottie 7종과 SVG light 플레이어를 추가했다. 피식 웹의 버튼 진행 표시·당겨서 새로고침·로딩·빈 목록·오류·성공/실패 알림과 소개 고양이에 연결했다. 첫 HTML과 모션 감소 설정에서는 정지 그림을 유지하고, 화면 밖·숨긴 탭에서는 멈추며 unmount 때 외부 자원을 정리한다. 이번 변경은 웹과 공통 웹 패키지에 한정한다.

검증: 피식 Web 569개, Game Mate Web 291개, 공통 UI 170개 단위/UI 테스트와 두 웹 앱의 타입·lint·운영 빌드, Storybook 빌드, 루트 knip를 통과했다. Chromium·Safari의 웹 컴포넌트 사양 14개가 피드·당겨서 새로고침·모션을 검사하며, 모션 사양은 실제 SVG 프레임 변화, 390/1440px 배치, 모션 감소 전환, 키보드·버튼 상태와 unmount를 확인한다. DB·S3를 쓰는 전체 서비스 E2E는 이번 변경에서 실행하지 않았다.

## 2026-10-30 피식 브랜딩·피드·공개 랜딩

`origin/develop`의 `225edfe3`에서 시작하고 최신 `eaf692c5`를 병합한 브랜치에서 이름을 피식으로 바꾸고 웹 로고·공유 이미지·모바일 아이콘을 맞췄다. 기존 사진·동영상·링크 피드의 카드·반응 버튼·인기 게시물 영역을 정리하고, 인기 제목의 장식 아이콘을 제거했다. 공감 카드 기능이나 실제 사용자 게시물은 추가하지 않았다.

후속 정리에서 README와 기능·개발·SEO 안내, 저장소 스킬, 공통 운영 문서와 블로그의 서비스 표기를 현재 이름으로 맞췄다. 푸시 제목과 다운로드의 ASCII 대체 파일명도 피식과 `pisik`으로 바꿨고, 쓰이지 않는 소셜 로그인 경로 상수와 테스트의 이전 인증 설정을 제거했다. 앱 ID·스킴·DB·워크스페이스 이름은 기존 설치와 데이터 연결에 쓰이는 기술 식별자로 유지한다.

홈 피드는 기존 `/`에서 세션 확인과 공개·개인 피드 분기를 유지한다. `/about`와 `/about/how-it-works`는 메인과 별도로 추가한 소개·이용 방법 페이지다. 공개 소개는 인증·푸시 조회를 실행하지 않으며, 시작 링크의 사전 로딩도 꺼서 로그인 전 API 의존성을 없앴다. 기존 메타데이터와 사이트맵의 홈 계약을 유지하고 소개 문서를 추가했다.

저장소 공통 `ui-design` 스킬에 정보 밀도, 정렬과 여백, 자연스러운 문구, 모바일 확인 기준을 추가하고 루트 AGENTS에 연결했다. 2016년 이후 출시와 지속적인 업데이트를 확인한 유사 도메인 서비스를 참고하되, 특정 서비스의 화면을 복제하지 않는다. 장식용 영문 소제목과 반복 CTA, 가운데 점 구분자를 덜어냈다.

이번 레퍼런스 후보는 친구끼리 사진을 나누는 [Retro](https://apps.apple.com/us/app/retro-photos-with-friends/id6443709020)와 [Yope](https://apps.apple.com/us/app/yope-friends-only-photos/id1600195477)다. 2026-10-30에 Apple lookup의 최초 출시 메타데이터(Retro 2023-07-13, Yope 2022-06-01)와 App Store의 연속된 버전 기록을 확인했다. 최근 버전은 KST 기준 Retro 2026-10-24, Yope 2026-10-30이다. 사진 공유와 그룹이라는 사용 맥락을 참고하며 브랜드나 화면을 복제하지 않는다.

추가 화면 정리에서는 모바일의 반복 안내와 기본 그룹 설명을 덜어내 최신 게시물이 더 일찍 보이게 했다. 등록한 그룹 설명만 표시하고 멤버 수를 명확하게 쓴다. 넓은 화면의 제목과 그룹 목록, 소개 페이지의 머리글과 본문, 바닥글은 같은 시작선에 맞췄다. 이용 방법의 중첩 카드와 장식 아이콘을 줄이고 모바일의 소개 예시는 기울이지 않는다. 관련 단위/UI 35개와 WebView 메인 2개, 피드 브라우저 2개를 통과했다. 모바일 360/390px와 데스크톱 1440/1920px, 공개 소개 320/390/1440px에서 가로 넘침과 정렬을 확인했다.

검증: 웹 단위/UI 569개, 모바일 단위/UI 141개, 디자인 시스템 160개, Chrome과 Safari의 공개 진입 E2E 4개와 피드 컴포넌트 브라우저 2개를 통과했다. 웹 운영 빌드와 Storybook 빌드, 타입, lint, 전체 knip도 통과했다. 운영 빌드에서도 메인의 인증 이동과 별도 소개 두 페이지의 HTTP 200, 인증 API 요청 0건, 런타임 오류 0건과 가로 넘침 없음을 확인했다. 모바일 Android와 iOS의 Metro 번들을 확인했다. 표준 모바일 E2E는 S3 설정 부재로 기동하지 못했으며, 업로드를 쓰지 않는 별도 격리 API에서 같은 WebView 대역 사양 14개를 통과하고 Android 전용인 2개는 iOS에서 건너뛰었다. 컨테이너 배포, 전체 E2E와 네이티브 실기기 검증은 실행하지 않았다.

최신 develop 병합 후 프로젝트 `check`가 통과했다(API 209개, 웹 569개, 모바일 141개, bridge 37개, test-kit 46개). 블로그의 한국어·영어 서비스 이름과 관련 글 표기도 함께 정리하고 콘텐츠·타입·lint 검사, 단위/컴포넌트 122개, 프로덕션 빌드와 데스크톱·모바일 브라우저 48개를 통과했다. 루트 knip, 변경 문서의 상대 링크와 스킬 7개의 유효성을 확인했다.

## 2026-10-30 전체 감사의 운영 위험 수정

API의 압축 JSON을 415로 거절하고 공통 body-parser를 2.4.0으로 고정했다. 업로드 서명은 트랜잭션 밖에서 준비하고, 권한·개인 한도·IP 예산 증가·티켓 저장을 같은 Serializable 트랜잭션으로 처리한다. 서명 실패·권한 거절·롤백은 발급 예산을 남기지 않으며, 발급 후 포기·만료·재발급의 비용 정책은 유지한다.

다른 탭의 계정 변경은 fresh Me 확인 뒤 이전 요청을 취소하고 개인 캐시를 지운다. 화면이 예상한 viewer ID를 mutation 헤더로 보내 실제 쿠키 세션과 대조하므로, 오래된 화면의 쓰기가 새 계정으로 성공하지 않는다. 의도적인 로그인·가입은 예외이며 기존 헤더 없는 API는 호환된다. 계정 전환 중에는 같은 문서의 새 요청도 막고 RSC·폼·오버레이를 포함해 문서를 강제로 다시 연다.

공통 푸시는 영수증의 일시적 제한을 백오프로 재전송하고, 작업 임대도 재시도 시각을 확인한다. 정상 종료에서는 Sentry 버퍼 전송을 최대 2초 기다린다. S3 HEAD의 확인된 NotFound/NoSuchKey 404만 사용자 미전송으로 처리하고 나머지는 원인을 보존한 서버 오류로 올린다. AWS HEAD의 403은 객체 미존재와 권한 장애를 구분할 수 없어 보수적으로 서버 오류로 처리하며, List/IAM 권한을 확대하지 않았다. 원인 종류·코드·프레임만 Sentry로 보내고 메시지·키·쿠키 원문은 제거한다.

검증: API 단위 209개와 타입 검사, Web 단위/UI 557개, 관련 lint·프록시 헤더 전달 회귀를 로컬에서 확인했다. 새 DB 회귀는 발급 예산 6개·HEAD 오류 2개·viewer 대조 3개·푸시 임대 1개·압축 JSON 3개를 기존 integration 레인이 수집한다. 로컬 테스트 DB 55434는 응답하지 않아 기동·재시작하지 않았다. 실제 두 탭의 계정 변경 브라우저 사양도 CI에서 실행하며, 로컬 통과로 기록하지 않는다.

## 2026-10-30 API p95와 GraphQL 성능 계측

오류 수집에 수동 HTTP·GraphQL 최상위 resolver 추적(10%)과 샘플링에 독립인 Sentry Application Metrics를 추가했다. HTTP 지연·요청 수는 라우트 템플릿·상태별로, GraphQL 지연·실행 필드 수는 서버 스키마의 필드와 업무 거절/내부 실패로 나눈다. HTTP 200의 GraphQL 오류도 성능 outcome으로 구분한다. health probe는 제외하며 API release도 연결한다.

operationName·alias·문서·변수·쿠키·ID는 성능 데이터에 넣지 않는다. SDK가 metric hook 뒤 합치는 scope 정보도 최종 envelope에서 제거한다. 실제 Apollo 실행과 메모리 transport로 이 제거 정책과 오류 분류를 확인했다. Web Vitals는 기존 브라우저 계측을 유지하며 Sentry MCP에서 최근 7일 LCP 저장 표본을 확인했다.

검증: 기존 API 단위 195개와 새 Apollo 플러그인 검사 1개, API 타입·변경 파일 ESLint 통과. 실제 Nest HTTP·DB 통합 사양도 추가했으나 로컬 테스트 DB(55434)가 응답하지 않아 로컬 실행은 완료하지 못했다. 해당 검사는 CI integration 레인에서도 수집한다. 개발 DB·실행 중인 서버·운영 배포는 변경하지 않았다.

실제 수집 확인: `test` 환경·`api-metrics-verification-20261030-81607000` release의 DB 없는 Apollo probe를 실행하고 `photo-contest-server`에서 `api.graphql.duration` 저장을 Sentry MCP로 확인했다. 운영 부하나 DB 포함 API 지연을 측정한 값은 아니다. SDK 11 stream 모드에서 무시되는 beforeSendTransaction은 제거하고 beforeSendSpan을 사용한다.

CI의 실제 Nest 통합 검사에서 인증 거절이 `ok`로 기록되는 경로를 확인했다. GraphQL 예외 필터가 업무 오류를 값으로 반환하므로 Apollo resolver 완료 콜백의 오류 인자와 반환값을 함께 판별하도록 수정했다. 실제 Apollo에서 동기 업무 오류 반환·비동기 내부 오류 반환의 분류를 검증하며, Nest 통합 검사는 실제 응답의 `UNAUTHENTICATED`도 확인한다.

## 2026-10-31 모바일 그룹 시작 흐름

- 그룹 생성은 이름과 공개 범위를 먼저 두고 소개 다음에 선택 사진 영역을 접어 뒀다. 사진을 접었다 펼쳐도 선택과 미리보기를 보존하며, 사진 없이도 생성할 수 있다. 업로드 실패 시 이미 생성한 그룹을 재사용하는 동작은 유지한다. 390px 로컬 화면에서 이름 입력의 시작은 약 549px에서 111px로 올라왔다.
- 가입 그룹이 없는 홈은 그룹 찾기와 만들기를 먼저 안내한다. 공개 게시물이 비었으면 사진 영역과 첫 업로드 안내를 표시하지 않는다. 실제 공개 게시물의 감상과 그룹 가입, 회원 홈으로의 전환은 유지한다. 그룹과 공개 피드의 로딩·오류 경계는 각각 유지한다.
- 검증: Web 단위/UI 593개, Chrome·WebKit·데스크톱 관련 E2E 20개와 WebView 대역 E2E 1개 통과. 필수 입력 순서, 접은 사진 선택 보존과 사진 없는 생성, 실제 S3 사진 저장, 공개 피드 감상·검색·가입 전환, 비밀번호 로그인과 서버 HTML을 확인했다. 타입·lint와 운영 빌드를 통과했고 남은 테스트 스키마는 0개다. 테스트는 3320/4320과 전용 DB의 격리 스키마·S3 객체 경로를 사용했다. 네이티브 실기기와 운영 배포는 수행하지 않았다.

## 2026-10-31 그룹 프로필 수정 페이지와 빈 화면 아이콘

- 그룹 프로필 수정 시트를 없애고 `/groups/[id]/edit` 페이지로 옮겼다. 그룹 헤더는 관리자·부관리자에게만 수정 링크를 표시하며, 직접 접근도 서버에서 같은 역할을 검사한다. 세션이 없으면 기존 로그인 게이트를 거친다. 페이지 전용 폼과 입력 변환·테스트는 `group-edit`가 소유하고 공통 사진 입력·검증은 group feature에 유지한다.
- 그룹 만들기와 같은 읽기 폭으로 이름·소개를 먼저 배치하고 선택 사진은 접어 뒀다. 취소·상단 뒤로 가기·저장 후 해당 그룹으로 돌아간다. 기존 사진의 미리보기·교체·삭제와 업로드 실패 후 초안·재시도, 화면 이탈 시 업로드 취소를 유지한다.
- 빈 화면의 지정 아이콘이 hydration 후 공통 Lottie로 덮이던 구성을 고쳤다. 게시물은 사진 묶음, 내 콘텐츠는 이미지 문서, 그룹은 사람, 탐색은 나침반, 대회·순위는 트로피, 지난 결과는 메달로 표시한다. 별도 아이콘이 없는 기본 상태와 로딩·오류의 상태 모션은 유지한다.
- 검증: Web 단위/UI 601개와 모바일 Chrome·WebKit·데스크톱 E2E 15개 통과. 새로고침·취소·뒤로 가기·저장, 회원/관리자/부관리자/미로그인 접근, 실제 S3 사진 저장·삭제·실패 재시도, 수정 취소 후 글쓰기 스크롤과 맥락별 아이콘을 확인했다. 타입·lint·운영 빌드·루트 Knip 검사 통과. 테스트는 3320/4320과 전용 DB의 격리 스키마를 사용했고 남은 테스트 스키마는 0개다. 운영 배포와 네이티브 실기기는 검증하지 않았다.

## 2026-10-31 페이지 폼의 하단 행동

- 그룹 만들기, 그룹 프로필 수정, 게시물 작성과 가입 설정의 입력 본문만 스크롤하고 취소·저장·제출 영역은 화면 하단에 유지한다. 공통 FormActions와 VisualViewport를 사용해 화면 높이, 안전 영역과 키보드로 줄어든 보이는 영역을 따른다. 전용 폼에는 사이트 푸터를 두지 않는다.
- 긴 폼은 별도 페이지로 만들고 짧은 입력·선택·확인만 시트로 제공하는 기준을 루트 AGENTS.md와 공통 UI 디자인 스킬에 명시했다. 인라인 댓글·검색은 하단 고정 대상으로 확대하지 않았다.
- 검증: Web 단위/UI 601개, 공통 디자인 시스템 176개 통과. 그룹 생성·수정·글쓰기·가입 관련 E2E 18개를 나누어 실행해 Chrome·WebKit·데스크톱에서 확인했다. 화면 높이 420~900px와 visualViewport 높이·offset 대역에서 하단 배치, 본문 스크롤, 취소 후 이동, 실제 S3 프로필 사진 저장을 확인했다. 타입·lint·운영 빌드, 루트 Knip과 Storybook 빌드도 통과했다. 실제 휴대폰 키보드와 운영 배포는 검증하지 않았다.

## 제목에 날짜 없는 기록

### 제품과 구조

홈은 가입한 모든 그룹의 사진·동영상을 최신순으로 모으고 이달의 인기를 따로 조회한다. MY에서 내 그룹을 보고 새로 만든다. 그룹은 종료일 없이 유지되며 한 사람이 제목·내용과 파일을 여러 번 올릴 수 있다. 직접 찍은 사진·동영상·합성을 모두 환영한다.

작성자와 그룹 관리자(그룹장·부관리자)는 게시물을 삭제할 수 있다. 초대 링크 공유는 모든 멤버, 재발급은 그룹장만 허용한다. 초대·멤버 정보는 그룹에서 펼쳐 볼 수 있다.

Post·PostUpload·PostLike를 추가했다. 기존 Contest·Submission은 데이터와 이전 URL 호환을 위해 유지한다. 새 작성 흐름에는 대회·마감일·1인 1장 제약이 없다. 마이그레이션은 기존 사진·숨김 상태·작성 시각·파일 키·좋아요를 새 모델에 보존하며, 실제 이전 스키마에 데이터를 넣은 뒤 SQL을 적용해 검증했다.

### 공개 탐색·가입 승인·SEO

`/sign`에서 익명 또는 회원 세션을 만든 뒤 `/explore`에서 그룹 이름을 검색한다. 세션 없는 콘텐츠 화면은 인증 화면으로 보낸다. 그룹 생성은 로그인 후 공개·비공개를 선택하며 기본값은 공개다. 기존 그룹은 새 마이그레이션의 PRIVATE default로 비공개를 유지한다. 익명 세션도 공개 그룹의 게시물·미디어·댓글을 읽고 바로 가입한다. 비공개 그룹은 익명 이용 불가 모달을 확인한 뒤 로그인한다. 비공개 그룹은 GroupJoinRequest를 만들고 OWNER·MODERATOR가 수락·거절한다. 초대 토큰도 같은 정책을 적용하므로 비공개 승인을 우회하지 않는다. 이름·공개 여부·멤버 수는 탐색에 표시하지만 비멤버의 inviteToken·role은 null, members는 빈 배열이다.

가입·신청은 복합 unique와 Serializable 트랜잭션으로 중복을 막고 역할을 유지한다. 수락은 멤버 생성·가입 이벤트·신청 삭제를 함께 처리한다. 읽기 권한은 readableGroup/readablePost, 활동과 기존 대회는 기존 멤버 전용 권한으로 나눈다. 대기 중인 그룹은 MY에 넣지 않는다. 승인 상태 조회는 부모의 useBackgroundQuery refetch가 소유하여 Suspense QueryRef를 갱신하고, 승인 뒤 처음 등장하는 비공개 피드와 관리자 신청 목록은 ClientOnly로 조회한다.

탐색은 1·2·3열 카드이고 메뉴는 홈·탐색·MY를 JSX로 선언한다. 그룹의 정체성·초대/멤버·가입 안내는 각각 컴포넌트로 나누며 공개·비공개 배지는 ts-pattern으로 분기한다.

공개 그룹마다 canonical·OG/Twitter·JSON-LD와 실제 게시물 서버 HTML을 제공한다. SEO 서버 조회는 인증 Cookie를 전달하지 않는다. 비공개 그룹은 공통 noindex 메타데이터와 빈 게시물 스냅샷을 사용하며 그룹장에게도 JSON-LD를 출력하지 않는다. 공개 그룹만 48개씩 분할하는 사이트맵 인덱스와 robots를 제공하고 실제 공개 사진을 공유 이미지로 쓴다. 사용자 입력은 JSON-LD script 탈출을 막도록 이스케이프한다. 도메인 설정·구조화 데이터 범위·검증은 [SEO 안내](seo.md)를 따른다.

### 피드와 미디어

`galleryPosts`는 groupId를 지정하면 해당 그룹, 생략하면 가입한 그룹 전체를 조회한다. 최신순은 createdAt·id desc이고, 인기순은 KST 이번 달에 작성한 게시물의 좋아요 desc·createdAt/id desc다. 숨긴 사진은 홈·그룹 목록에서 제외하며 이관된 게시물은 기존 사진의 숨김도 확인한다.

서버는 사진·동영상을 열거나 변환하지 않는다. 발급할 때 JPEG·PNG·WebP 10MB, MP4·WebM 100MB만 허용하고 완료할 때 HEAD로 크기·형식만 확인한다. 브라우저는 읽을 수 있는 사진을 줄여 JPEG로 보내며 변환할 수 없으면 지원 형식 원본을 보낸다. 동영상은 브라우저가 읽은 길이로 5분 이하만 올린다. 서버는 위치정보 등 메타데이터를 제거하지 않는다. 파일은 비공개 버킷에 저장한다.

`/media/:id`는 요청마다 그룹의 공개 범위와 멤버십을 검사하고 `private, no-store` 307로 60초 서명 GET에 보낸다. Range는 저장소가 처리한다. 파일 삭제가 일시 실패하면 만료 PostUpload를 남겨 maintenance가 다시 시도한다. 미사용 업로드도 정리한다.

웹의 게시물 전송은 등록 클릭 후 requestPostUpload → 저장소 FormData POST → completePostUpload → createPost다. API는 파일 바이트를 받지 않고 소유자·만료·멤버십과 HEAD의 크기·형식만 확인한다. 저장소 전송 실패는 RHF 미디어 필드에 표시하며 입력을 유지한다. 로컬과 테스트는 test-kit S3 대역으로 같은 계약을 쓴다. [상세 계약](post-attachments.md)을 따른다.

글쓰기에서 파일을 선택하면 선택 버튼 영역을 미리보기로 대체한다. 사진은 비율을 유지해 표시하고 동영상은 시트 안에서 재생한다. 파일 이름 옆의 바꾸기·제거로 선택을 관리하며 제거하면 원래 선택 영역으로 돌아온다. 파일 선택 취소는 기존 선택을 유지하며 같은 파일 재선택·다른 파일로 교체를 지원한다. 제출 중에는 선택·교체·제거를 막는다. 형식·크기 오류는 선택 즉시 알리고 디코드 실패는 미리보기 안에서 안내한다. 임시 Blob URL은 교체·제거·시트 해제 때 정리하고 재생 중인 영상도 멈춘다. HEIC의 MIME이 비어 있으면 확장자로 사진 여부를 판별한다.

### 웹의 조회와 상태

최신·인기·그룹 정보는 각각 QueryRef와 Suspense/오류 경계를 갖는다. RSC PreloadQuery가 같은 문서와 변수로 미리 준비한다. 그룹 정보는 대회 필드가 없는 GalleryDocument로 조회한다. 인증은 ViewerBoundary, 닫힌 상태 분기는 ts-pattern을 사용한다.

Apollo는 `offsetLimitPagination(['groupId', 'sort'])`으로 목록을 분리한다. 추가 조회·새로고침은 transition으로 기존 글을 유지한다. 가입·작성·삭제 뒤 목록을 비우고 첫 페이지부터 받는다. 삭제로 캐시가 첫 페이지로 줄어들면 추가 조회 상태도 복원한다. 카드는 ID를 받아 정규화 fragment를 읽으므로 최신·인기 목록에서 같은 게시물의 반응이 함께 바뀐다.

폼은 실제 RHF/Zod·Base UI, 시트와 삭제 확인은 overlay-kit을 쓴다. 고정 메뉴와 정렬 선택지는 JSX로 직접 선언한다. 웹은 최대 1440px이며 상시 게시물은 모바일·태블릿 최대 540px, 데스크톱 최대 680px의 1열 피드로 보여 준다. 흑백 토큰·얇은 구분선·여백으로 정리하고 프로필은 장식 테두리 없이 표시한다. 제목은 사진 위에, 본문은 사진 아래에 접지 않고 보여 주며 좋아요·작성 시각은 하단에 둔다. 인기 게시물은 사각형 미리보기·순위·그룹 이름으로 구분한다. 인기 목록은 기기와 관계없이 순위·64px 사진·제목과 그룹·좋아요 순서로 한 줄씩 표시한다. 검은 바탕·흰 숫자의 순위는 사진 왼쪽에, 기존 대회 순위는 사진 아래에 두어 사진을 가리지 않는다. 데스크톱은 왼쪽 고정 메뉴·중앙 피드·오른쪽 인기 사진, 모바일·태블릿은 하단 메뉴·피드 위의 인기 목록으로 구성한다. 프로필과 그룹 헤더, 로그인 폼도 같은 톤으로 맞춘다. 바텀시트는 모든 기기에서 화면 아래에 붙어 화면 너비를 채우고 본문만 스크롤한다. 필수·선택 표시는 실제 검증 조건과 required/aria-required에 맞춘다.

윙크하며 웃는 얼굴을 흑백 SVG favicon으로 만들고 Next.js의 `app/icon.svg` 규약으로 제공한다. 모바일 상단·데스크톱 메뉴의 BrandIcon도 같은 `/icon.svg`를 사용해 브랜드 이미지가 함께 바뀐다. 이름이 옆에 있으므로 아이콘은 장식 이미지로 처리한다. `/terms`·`/privacy`는 공개 라우트이며 본문이 서버 HTML에 포함된다. 로그인·MY·데스크톱 메뉴에서 정책 링크를 제공하고 운영자 김진건·문의 이메일 jingeon27@gmail.com·작성일을 한 설정에서 관리한다. 정책은 현재 구현을 반영한 검토용 초안이다. 실제 운영 환경의 위탁·국외 이전, 문의·운영 이력·백업 보관 기간과 아동 개인정보 처리 기준은 정식 공개 전에 확정해야 한다.

댓글은 PostComment에 저장하고 게시물·사용자 삭제 시 함께 지운다. 댓글 조회는 MembershipService.readablePost로 공개 범위·숨김을, 작성·삭제는 accessiblePost로 멤버십·숨김을 확인한다. 작성자·관리자만 삭제하며 내용은 trim 후 1~1000자다. 최신순(createdAt·id desc) offset 조회이며 댓글 수는 게시물 조회의 _count로 계산한다. 댓글 시트는 독립 QueryRef·Suspense/오류 경계를 사용하고 작성·삭제 뒤 댓글과 피드 개수를 갱신한다.

댓글 시트의 헤더·목록·입력창은 각각 PostCommentsHeader·PostCommentList·PostCommentComposer가 맡는다. 시트는 화면 너비를 채우고 높이 약 75%로 열린다. 배경은 기본 상태에서 검정 15%, 전체 높이에서는 검정 35%로 어두워지며 Base UI의 스와이프 진행률로 두 단계 사이를 연결한다. 위로 끌면 상단 안전 여백·키보드를 제외한 전체 높이로 펼쳐지고 아래로 끌면 기본 크기로 돌아간다. 헤더의 확장·축소 버튼으로 키보드에서도 조절할 수 있다. Base UI의 snapPoints와 스냅 오프셋에 맞춘 하단 패딩으로 크기와 드래그 중에도 입력창을 화면 안에 둔다. 헤더·하단 입력 영역의 여백을 줄여 목록이 더 많이 보이게 하고, 모바일의 본문·입력은 최대 768px로 제한하며 데스크톱은 왼쪽 원본 게시물·오른쪽 대화를 최대 1152px의 2열로 보여 준다. 내 댓글은 오른쪽의 검은 말풍선, 다른 멤버는 왼쪽의 옅은 말풍선으로 구분하며 게시물 작성자도 표시한다. 본문 아래에 시각과 삭제 조작을 모은다. 하단 입력창은 내용에 따라 최대 높이까지 늘어나고 전송 버튼을 옆에 둔다. 필수 표시·글자 수·오류 안내·제출 잠금은 실제 RHF/Zod 상태와 연결한다. 로그인 사용자는 기존 Me 캐시에서 읽으며 댓글 조회와 작성·삭제 계약은 유지한다.

피드의 일반 새로고침 버튼은 당겨서 새로고침으로 바꿨다. 문서 맨 위에서 단일 손가락으로 충분히 아래로 당겼다 놓으면 최신·인기를 함께 refetch한다. 짧은 당김·가로 이동·취소·여러 손가락·입력·내부 스크롤은 제외하고 요청이 끝날 때까지 중복 갱신을 막는다. 키보드·스크린 리더 사용자는 포커스 시 나타나는 조작으로 갱신한다.

### 인증·모바일·모니터링

직접 정한 아이디·비밀번호로 가입·로그인할 수 있다. 아이디는 소문자로 정규화하고 PasswordCredential에 salt를 쓴 scrypt 해시만 저장한다. 등록·로그인은 GraphQL mutation으로 같은 HttpOnly 세션을 발급하며 이전 요청 세션을 폐기한다. AuthAttempt의 DB 증가로 반복 요청을 제한하고 만료 버킷을 정리한다. 없는 아이디와 틀린 비밀번호는 같은 오류·해시 검증 비용으로 처리한다. 구글·카카오 OAuth state/PKCE와 앱의 일회용 로그인 교환도 유지한다. 로컬에 OAuth 키는 없으므로 실제 제공자 계정 인증은 키 설정 후 검증한다. 파일과 글의 접근 권한은 서버가 확인한다. 도메인 이벤트는 같은 트랜잭션에 ID·종류만 기록한다. API는 Sentry, 웹·앱은 Sentry·Amplitude를 사용하며 키가 없으면 전송하지 않는다.

Expo WebView는 네이티브 로그인·공유·클립보드·햅틱·딥링크·뒤로 가기·복귀를 연결한다. 모바일의 공유·복사 테스트는 펼침 영역을 열고, 햅틱 테스트는 새 그룹 게시물의 좋아요를 사용한다.

### 데스크톱 이용 흐름

웹 셸은 최대 1440px이며 피드는 모바일·태블릿 540px, 데스크톱 680px이다. 1280px부터 메뉴와 인기 목록의 폭을 늘린다. 데스크톱의 게시물은 카드로 구분하고 사진·영상은 4:3 영역과 화면 높이의 60% 이내에서 비율을 유지해 표시한다. MY는 프로필·그룹을 좌우로 나눈다.

그룹의 글쓰기 버튼은 상단바에 있어 피드를 내려도 사용할 수 있다. 초대·멤버 정보는 GalleryFeed의 sidebar 슬롯으로 오른쪽에 배치하며 모바일에서는 피드 아래로 내려간다. 동일한 DOM을 CSS로 재배치하므로 초대·멤버 상태를 복제하지 않는다.

글쓰기 시트는 외곽 너비를 채우고 내부는 최대 1152px로 제한한다. 데스크톱은 왼쪽 미디어·오른쪽 제목과 내용, 오른쪽 하단 제출 버튼으로 구성한다. 등록 뒤 목록 위로 이동한다. 댓글도 원본 미디어·대화를 나란히 보여 주며 PostMedia가 피드와 댓글의 사진·동영상 표시를 함께 맡는다.

### 공용 린트와 오버레이

저장소 packages/config/eslint의 base·next·expo preset이 공통·프레임워크 규칙과 테스트 예외를 관리한다. 앱별 eslint.config.ts는 preset과 경로만 조합한다. 커스텀 규칙은 src/rules/<분류>/<규칙>/<규칙>.ts의 표준 TSESLint.RuleModule로 구현하고, 같은 폴더의 <규칙>.spec.ts가 그 규칙의 **fixtures** 파일을 읽어 RuleTester로 검증한다. FSD 규칙은 각각 분리하고 공통 import·경로 분석은 src/rules/fsd/fsd.helper.ts가 맡는다. 웹의 오버레이·오류 useState 금지도 독립 규칙이며 앱 설정에 긴 selector나 안내문을 넣지 않는다. 규칙·설정은 TypeScript이고 Jiti로 로드한다. 프로젝트 루트 설정도 tsconfig.lint.json으로 검사한다. 한 번 쓰는 이벤트는 JSX에서 선언하며 재사용 핸들러만 분리한다.

시트는 overflow-hidden으로 데스크톱 하단 모서리까지 자르고, 본문만 스크롤하며 Footer는 고정한다. 모바일 Chrome에서 입력 → 제출 포커스 전환 때 하단 메뉴가 클릭을 가로채는 문제를 실제 브라우저로 확인했다. 메뉴 공간을 유지하고 폼 안에 포커스가 있는 동안 숨겨 첫 클릭부터 제출되게 했다. 휴대폰·데스크톱에서 짧은 화면, 스크롤, 닫기·재열기·포커스 복귀와 실제 가입 흐름을 검증한다.

### 검증

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

### 운영 배포 준비

앱별 Dockerfile과 Next.js standalone 산출물, 운영 Compose·Caddy·배포/백업/앱 복구 스크립트를 추가했다. Oracle A1의 ARM64를 대상으로 하며 웹·API·PostgreSQL을 같은 VM에 둔다. Caddy가 HTTPS와 `/backend/*`를 맡고 DB·API 포트는 외부에 열지 않는다. API의 TRUST_PROXY_HOPS 기본값은 0이며 운영 Compose만 1로 지정해 Caddy 뒤의 가입 제한을 사용자 주소별로 분리한다. prisma CLI는 운영 migrate deploy를 위해 production dependency로 옮겼다.

GitHub Actions는 운영 컨테이너에서 직접 가입·비공개 사진/영상·댓글·재시작·DB 백업 복원을 검증한다. 배포 대상에서는 검증한 동일 이미지를 artifact로 옮겨 GHCR에 게시하고 digest로 고정해 배포한다. 운영 브랜치와 활성화 값이 모두 없으면 게시·서버 접속을 하지 않는다. SSH 호스트 키를 확인하고 GHCR 작업 토큰은 stdin·임시 Docker 설정으로만 사용한다. VM 작업 잠금·공개 헬스 체크·이전 앱 복구를 제공하며 DB 스키마·미디어·백업은 자동으로 되돌리거나 지우지 않는다.

CI에서 ARM64 운영 이미지 두 개를 빌드하고 격리한 HTTPS 컨테이너의 직접 가입·Secure/HttpOnly 세션·비공개 사진/영상·댓글·앱 재시작 후 데이터 유지를 확인했다. 실제 DB 백업을 별도 DB로 복원해 댓글이 남는 것도 확인했다. 배포 스크립트의 실패 복구·잠금 12개와 기존 웹·API·모바일 검증도 통과했다.

운영 VM은 아직 연결하지 않았다. 실제 운영 DNS·공개 인증서·VM 접근·GHCR 다운로드·R2 권한은 사용자 설정 후 확인한다. 준비할 값과 실행 순서는 [배포 안내](deployment.md)에 둔다.

### 개발 환경 반영

그룹 마이그레이션은 앞선 전체 실행 요청에 따라 개발 환경에 반영했다. 직접 가입 기능은 `20261016090000_password_login`으로 PasswordCredential·AuthAttempt 테이블만 추가하며 기존 사용자와 게시물을 보존한다. 실행 요청에 따라 개발 DB에도 적용해 현재 웹에서 직접 가입할 수 있다. 새 환경에서는 db:migrate 후 실행한다. 테스트 DB는 개발 DB와 다른 55434의 photo_contest_test이며 각 레인이 임시 스키마를 만들고 정리한다.

댓글 마이그레이션 `20261017010000_post_comments`는 PostComment 테이블·인덱스·cascade 외래 키만 추가한다. 개발 DB에도 적용하고 기존 게시물·사용자 유지와 최신·인기 피드 및 댓글 조회를 확인했다. 격리 테스트 DB에도 전체 마이그레이션을 적용해 검증한다.

공개 그룹 마이그레이션 `20261019010000_public_groups`는 Group.visibility와 GroupJoinRequest·인덱스·cascade 외래 키만 추가한다. 기존 그룹·사진·영상·좋아요를 보존하며 이전 스키마에 마이그레이션을 적용하는 테스트로 PRIVATE 유지도 확인한다. 이번 작업은 별도 worktree·테스트 DB 55435에서 수행했으며 사용자의 개발 DB나 실행 중인 서버에는 적용하지 않았다. 개발 반영 시 db:generate·db:migrate 후 서버를 다시 실행한다.

운영 컨테이너 검증은 공개 그룹 canonical·JSON-LD와 비공개 사진의 익명 거부를 포함한다. 재시작 복구 확인은 API 헬스·웹 문서 응답·기존 댓글 표시를 함께 제한 시간 안에 재확인하여 Docker 네트워크 전환 중의 일시적인 브라우저 연결 오류를 처리한다.

최신 develop의 테스트 위치 변경을 반영한 최종 검사: 전체 check, API integration 274개, Web API 18개, 신규 홈 E2E 6개, 기존 탐색·공개 SEO·비공개 가입 E2E 6개와 프로덕션 cache/category E2E 7개가 통과했다. Android 뒤로 가기 2개도 통과했다(iOS 하드웨어 뒤로 가기 2개는 설계상 제외). 새 홈에도 검색 폼과 그룹 생성 버튼이 있어 전환 전의 화면을 조작하던 기존 브라우저 검사를 목적 화면이 나타난 뒤 실행하도록 고쳤다. 검색은 JS 준비 전에도 GET /explore?q=로 제출된다. 전체 Prettier 검사와 앱 lint/typecheck를 확인했다.

전체 브라우저 회귀 검사에서 좋아요 수 정규화만으로는 인기 목록 순서가 바뀌지 않는 문제를 확인했다. 활성 MONTHLY_POPULAR 쿼리만 다시 조회하고, NEWEST의 추가 페이지는 유지한다. 기존 사진/동영상/인기/삭제 흐름과 페이지네이션 E2E 4개가 통과했다.
