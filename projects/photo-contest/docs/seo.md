# 피식 공개 소개와 콘텐츠 SEO

서비스 소개 `/about`와 이용 방법 `/about/how-it-works`는 세션 없이 읽고 각 페이지의 canonical과 index 메타데이터를 제공한다. 공개 소개에서는 인증·푸시 API를 호출하지 않는다.

홈과 그룹 등 콘텐츠 화면은 익명 또는 회원 세션이 있어야 진입한다. 세션 없는 요청(크롤러 포함)은 `/sign?next=…`로 이동하며 인증 화면은 noindex다. 아래 메타데이터·서버 HTML 계약은 세션으로 진입한 콘텐츠 화면에 적용한다. 내부 공개 데이터 조회·공유 캐시는 사용자 쿠키 없이 유지한다.

`WEB_ORIGIN`을 실제 HTTPS 서비스 도메인으로 설정한다. canonical·OG/Twitter·JSON-LD·robots·사이트맵은 이 값만 사용하며 요청 Host나 추적 파라미터로 도메인을 바꾸지 않는다. 내부 API 주소는 별도 `API_URL`이다. 운영 Compose는 기존 배포 안내대로 두 값을 전달한다.

## 검색에 공개하는 범위

| 화면                                        | 검색·메타데이터                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 서비스 소개 `/about`                        | 세션 없이 읽는 서비스 설명, 자기 canonical, 브랜드 공유 이미지, WebSite JSON-LD                         |
| 이용 방법 `/about/how-it-works`             | 세션 없이 읽는 사용 안내, 자기 canonical과 브랜드 공유 이미지                                           |
| 홈 `/`                                      | 대표 canonical, 사이트 소개·브랜드 공유 이미지, WebSite JSON-LD                                         |
| 탐색 `/explore`                             | 대표 canonical·공유 정보, 그룹 카드 서버 HTML                                                           |
| 검색 `/explore?q=…`                         | canonical은 `/explore`, 검색 결과는 noindex                                                             |
| 공개 그룹 `/groups/:id`                     | 그룹 이름·멤버 수 설명, 자기 canonical, 실제 공개 사진 OG/Twitter, 게시물 서버 HTML·JSON-LD             |
| 공개 그룹 대회 목록 `/groups/:id/contests`  | 자기 canonical, 공개 대회 일정·목록 서버 HTML, CollectionPage·ItemList·Event JSON-LD                    |
| 공개 대회 `/groups/:id/contests/:contestId` | 대회명·일정·참여작 서버 HTML, canonical·OG/Twitter, Event·CollectionPage·DiscussionForumPosting JSON-LD |
| 공개 명예의 전당 `/groups/:id/hall-of-fame` | 지난 대회·실제 공동 우승작 서버 HTML, 별도 canonical·공유 사진·목록 JSON-LD                             |
| 비공개 그룹                                 | 공통 비공개 안내 메타데이터, noindex/nofollow/noimageindex, JSON-LD·공유 사진 없음                      |
| MY·초대·기존 대회                           | 기본 noindex, 사이트맵 제외                                                                             |

그룹 이름·공개 여부·멤버 수는 비공개 그룹도 탐색할 수 있는 정보다. 비공개 그룹의 게시물·댓글·파일은 승인된 멤버만 읽는다. SEO 서버 조회는 로그인 Cookie를 전달하지 않으며, 비공개 그룹이면 게시물 조회를 실행하지 않는다. 그룹장이 로그인해도 비공개 메타데이터와 JSON-LD 정책은 같다. 개인화된 페이지와 미디어는 공유 캐시에 저장하지 않는다. 사이트맵의 익명 공개 데이터만 서버 캐시에 저장한다.

공개 피드의 최신 24개를 RSC PreloadQuery로 서버 HTML에 표시한다. JSON-LD는 같은 정렬·범위의 실제 공개 게시물을 사용한다. `WebSite`·`BreadcrumbList`·`CollectionPage` 안의 `ItemList`·`DiscussionForumPosting`으로 작성자 닉네임·작성 시각·전체 본문·댓글 수·좋아요 수·실제 미디어 URL을 제공한다. 게시물 URL의 `#post-…`는 화면의 article id와 일치한다. JSON-LD는 `<`와 줄 구분 문자를 이스케이프해 사용자 입력으로 script를 닫을 수 없게 한다.

사진이 없는 그룹은 `/opengraph-image`의 브랜드 이미지를 사용한다. 영상에는 실제 미디어 URL을 제공하지만, 구현하지 않은 썸네일·길이를 만들어 VideoObject에 넣지 않는다. 영상 검색 전용 마크업은 실제 poster·메타데이터를 제공하는 시점에 추가한다. 구조화 데이터가 검색 결과의 특별한 표시나 색인을 보장하지는 않는다.

존재하지 않는 그룹은 Next.js `notFound()`와 noindex로 처리한다. Next의 스트리밍이 이미 시작된 응답은 HTTP 200일 수 있으며, 스트리밍 전 응답은 404다. API 장애를 없는 그룹으로 바꾸지는 않는다.

## 크롤링과 사이트맵

- `/robots.txt`는 `/sitemap.xml`을 안내한다. MY·초대·기존 대회·인증·GraphQL·testing 경로를 제외한다. `/groups/*`는 차단하지 않아 검색 엔진이 비공개 그룹의 noindex를 읽을 수 있게 한다.
- `/sitemap.xml`은 사이트맵 인덱스다. 홈·탐색·공개 소개 두 페이지는 `/sitemaps/main.xml`, 그룹은 `/sitemaps/groups/0.xml`부터 48개씩 제공한다.
- 그룹 개수·목록은 API에서 PUBLIC만 조회한다. PRIVATE·알 수 없는 공개 범위는 포함하지 않는다. 데이터가 없는 페이지·잘못된 페이지 번호는 404다. 분할 파일은 인덱스와 같은(캐시된) 개수로 최대 번호를 계산해, 범위 밖 번호는 목록을 조회하지 않고 404로 끝낸다(번호마다 빈 결과가 데이터 캐시에 쌓이지 않게).
- 확인되지 않은 수정일을 lastmod로 만들지 않는다. 사이트맵 HTTP 응답은 no-store이고 공개 데이터는 서버에서 60초 주기로 재검증한다. API 장애를 비어 있는 성공 응답으로 바꾸지 않는다.

그룹 사이트맵은 각 공개 그룹의 게시물·대회 목록·명예의 전당 URL을 제공한다. 공개 POST 대회 상세는 `/sitemaps/contests/0.xml`부터 48개씩 별도로 나누고 인덱스에 연결한다. LEGACY·PRIVATE 대회는 포함하지 않는다. 비공개 그룹에서는 대회·결과·참여작 SEO 쿼리를 실행하지 않고 로그인한 그룹장에게도 공통 noindex·사진 없음·JSON-LD 없음 정책을 적용한다. 다른 그룹의 대회 ID를 끼워 넣은 공개 URL은 없는 페이지로 처리한다.

Event는 실제 시작·투표 마감과 VirtualLocation을 가진 온라인 대회다. 종료 후에는 실제 수상작에만 award를 붙이고 공동 우승을 유지한다. 표가 없으면 수상을 만들지 않으며 영상 poster·평점·입장권·물리적 장소를 지어내지 않는다. 구조화 데이터는 화면에 표시되는 공개 참여작·결과와 같은 데이터를 사용한다. [Schema.org Event](https://schema.org/Event)의 온라인 행사 속성을 따른다.

## 서버 캐시와 무효화

Next.js fetch Data Cache에 공개 게시물·대회 목록·결과는 30초, 공개 사이트맵 목록·개수는 60초의 재검증 주기를 설정한다. 이 값은 stale-while-revalidate 주기이며 모든 요청이 정확히 그 시각에 새 API 응답을 기다린다는 뜻은 아니다. HTML·미디어·사이트맵의 HTTP 공유 캐시와 구분한다. Next의 Cache Components 전역 옵션을 켜지 않고 현재 동적 SSR과 요청별 Apollo 캐시를 유지한다.

그룹 공개 여부·대회 소속·일정은 매 요청 no-store로 확인한 뒤 공개 콘텐츠 캐시에 접근한다. 비공개면 콘텐츠 조회 자체를 하지 않는다. 캐시용 fetch는 Cookie를 제거하고 문서·변수·API URL·Origin이 Next 캐시 키에 반영된다. 로그인 사용자별 SSR·Apollo 요청은 계속 no-store다. React cache는 같은 렌더 요청 안의 중복 제거를 맡는다.

웹·WebView의 `/backend/graphql`은 Next Route Handler를 거친다. JSON mutation의 성공 응답을 받은 뒤 `revalidateTag('photo-contest:public:v1', { expire: 0 })`로 공개 캐시를 만료시킨다. 여러 mutation 중 앞선 쓰기가 커밋된 뒤 뒤쪽 non-null 필드가 실패해 data=null이 되어도 무효화한다. 단일 인증·입력 실패와 query는 캐시를 비우지 않는다. 파일 multipart는 버퍼링하지 않고 전달하며 게시물 생성 JSON mutation에서 무효화한다.

캐시용 API 요청의 `x-photo-contest-public-query: true`는 오류의 HTTP 상태만 구분한다. 성공은 200, 실행 오류는 400으로 보내 Next Data Cache가 GraphQL 오류 JSON을 성공 데이터로 저장하지 않게 한다. 일반 GraphQL 실행 오류는 기존 HTTP 200 계약을 유지하며 이 헤더가 인증·공개 범위를 우회하지는 않는다.

현재 배포는 서비스별 Web 인스턴스 하나를 사용한다. API를 직접 호출하는 관리 작업·외부 배치는 웹 무효화 경로를 거치지 않으므로 시간 재검증으로 반영된다. Web을 여러 인스턴스로 늘릴 때는 공유 cache handler와 무효화 전달을 함께 구성한다.

`test:cache`는 개발 서버 대신 별도 dist의 실제 standalone 운영 빌드와 격리 API/DB를 실행한다. 반복 요청의 캐시 재사용, 정상·부분 성공 쓰기 뒤 즉시 만료, 사이트맵, 비공개 제외, Origin·본문 한도, 쿠키와 multipart 전달을 검사한다. 앱 CI의 web 브라우저 레인에서 실행한다.

링크 첨부는 공개 게시물의 citation으로 제공한다. kind=LINK에는 사진·MediaObject·썸네일을 만들지 않고 비공개 링크는 SEO에 넣지 않는다. 파일 저장용 presigned URL은 공개 SEO·사이트맵 쿼리에 포함하지 않는다.

## 배포 후 확인

1. 로그아웃 상태에서 `/about`와 `/about/how-it-works`의 서버 HTML, canonical, index 메타데이터와 인증 API 요청이 없는지 확인한다. 홈과 공개 그룹은 세션 없이 `/sign?next=…`로 이동하는지 확인하고, 익명 세션을 만든 뒤 title·canonical·robots·OG/Twitter·application/ld+json과 게시물 본문을 확인한다.
2. `/robots.txt`와 `/sitemap.xml` 및 하위 사이트맵이 실제 도메인·공개 그룹만 가리키는지 확인한다.
3. 도메인 소유자가 Google Search Console에서 도메인을 인증하고 `/sitemap.xml`을 제출한다. DNS 인증과 실제 서비스 도메인은 운영자가 준비한다.
4. Search Console URL 검사와 Rich Results Test로 배포 URL을 검사한다. 배포 환경에서 공개 미디어가 쿠키 없이 읽히는지, 비공개 미디어는 거부되는지 함께 확인한다.

## 검증

API e2e는 익명 공개 읽기·미디어 Range·댓글·숨김·기존 대회 권한·비공개 승인과 이전 그룹의 PRIVATE 보존을 검사한다. 웹 API 레인은 생성 문서를 실제 API에 실행하고 공개 그룹 49개의 사이트맵 분할·비공개 배제·장애 전파를 확인한다. Playwright는 Chrome·WebKit·데스크톱에서 공개 탐색·서버 HTML·canonical·실제 공유 사진·JSON-LD XSS·사이트맵·비공개 SEO를 검사한다. 운영 컨테이너 smoke도 HTTPS에서 공개 SEO와 비공개 사진 접근 제한을 확인한다.

참고: [Next.js JSON-LD](https://nextjs.org/docs/app/guides/json-ld), [Google discussion forum markup](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum), [Google canonical 가이드](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Schema.org CollectionPage](https://schema.org/CollectionPage).

가입 그룹이 없는 사용자의 `/` 화면에서 공개 그룹 6개·최신 게시물 24개는 익명 Next Data Cache(30초)를 사용한다. RSC에서 현재 사용자·가입 그룹은 no-store로 먼저 확인해 공개 목록과 개인 피드의 사전 조회를 나눈다. publicPreloadContext는 쿠키 없는 공개 조회에만 지정하며 같은 문서·변수로 브라우저 캐시에 사전 조회한다. 쓰기·숨김·복원 뒤 공통 공개 태그를 즉시 만료시킨다. 개인 피드는 캐시하지 않는다.

`?category=` 필터의 canonical은 그룹 기본 URL이다. 활성 카테고리 ID는 fresh 그룹 메타데이터로 확인하고 잘못되거나 보관된 ID는 전체 목록으로 처리한다. 필터별 캐시는 categoryId로 구분하며 공개 SEO·사이트맵 태그는 카테고리 쓰기에도 즉시 무효화한다.
