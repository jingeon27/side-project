# 공개 그룹 SEO

`WEB_ORIGIN`을 실제 HTTPS 서비스 도메인으로 설정한다. canonical·OG/Twitter·JSON-LD·robots·사이트맵은 이 값만 사용하며 요청 Host나 추적 파라미터로 도메인을 바꾸지 않는다. 내부 API 주소는 별도 `API_URL`이다. 운영 Compose는 기존 배포 안내대로 두 값을 전달한다.

## 검색에 공개하는 범위

| 화면                    | 검색·메타데이터                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| 홈 `/`                  | 대표 canonical, 사이트 소개·브랜드 공유 이미지, WebSite JSON-LD                             |
| 탐색 `/explore`         | 대표 canonical·공유 정보, 그룹 카드 서버 HTML                                               |
| 검색 `/explore?q=…`     | canonical은 `/explore`, 검색 결과는 noindex                                                 |
| 공개 그룹 `/groups/:id` | 그룹 이름·멤버 수 설명, 자기 canonical, 실제 공개 사진 OG/Twitter, 게시물 서버 HTML·JSON-LD |
| 비공개 그룹             | 공통 비공개 안내 메타데이터, noindex/nofollow/noimageindex, JSON-LD·공유 사진 없음          |
| MY·초대·기존 대회       | 기본 noindex, 사이트맵 제외                                                                 |

그룹 이름·공개 여부·멤버 수는 비공개 그룹도 탐색할 수 있는 정보다. 게시물·댓글·파일은 승인된 멤버만 읽는다. SEO 서버 조회는 로그인 Cookie를 전달하지 않으며, 비공개 그룹이면 게시물 조회를 실행하지 않는다. 그룹장이 로그인해도 비공개 메타데이터와 JSON-LD 정책은 같다. 개인화된 페이지·미디어·사이트맵을 공유 캐시에 저장하지 않는다.

공개 피드의 최신 24개를 RSC PreloadQuery로 서버 HTML에 표시한다. JSON-LD는 같은 정렬·범위의 실제 공개 게시물을 사용한다. `WebSite`·`BreadcrumbList`·`CollectionPage` 안의 `ItemList`·`DiscussionForumPosting`으로 작성자 닉네임·작성 시각·전체 본문·댓글 수·좋아요 수·실제 미디어 URL을 제공한다. 게시물 URL의 `#post-…`는 화면의 article id와 일치한다. JSON-LD는 `<`와 줄 구분 문자를 이스케이프해 사용자 입력으로 script를 닫을 수 없게 한다.

사진이 없는 그룹은 `/opengraph-image`의 브랜드 이미지를 사용한다. 영상에는 실제 미디어 URL을 제공하지만, 구현하지 않은 썸네일·길이를 만들어 VideoObject에 넣지 않는다. 영상 검색 전용 마크업은 실제 poster·메타데이터를 제공하는 시점에 추가한다. 구조화 데이터가 검색 결과의 특별한 표시나 색인을 보장하지는 않는다.

존재하지 않는 그룹은 Next.js `notFound()`와 noindex로 처리한다. Next의 스트리밍이 이미 시작된 응답은 HTTP 200일 수 있으며, 스트리밍 전 응답은 404다. API 장애를 없는 그룹으로 바꾸지는 않는다.

## 크롤링과 사이트맵

- `/robots.txt`는 `/sitemap.xml`을 안내한다. MY·초대·기존 대회·인증·GraphQL·testing 경로를 제외한다. `/groups/*`는 차단하지 않아 검색 엔진이 비공개 그룹의 noindex를 읽을 수 있게 한다.
- `/sitemap.xml`은 사이트맵 인덱스다. 홈·탐색은 `/sitemaps/main.xml`, 그룹은 `/sitemaps/groups/0.xml`부터 48개씩 제공한다.
- 그룹 개수·목록은 API에서 PUBLIC만 조회한다. PRIVATE·알 수 없는 공개 범위는 포함하지 않는다. 데이터가 없는 페이지·잘못된 페이지 번호는 404다.
- 확인되지 않은 수정일을 lastmod로 만들지 않는다. 사이트맵은 실시간 조회·no-store이며 API 장애 시 비어 있는 성공 응답으로 숨기지 않는다.

## 배포 후 확인

1. 실제 도메인의 공개 그룹을 로그아웃 상태로 열고 HTML 소스에서 title·canonical·robots·OG/Twitter·application/ld+json과 게시물 본문을 확인한다.
2. `/robots.txt`와 `/sitemap.xml` 및 하위 사이트맵이 실제 도메인·공개 그룹만 가리키는지 확인한다.
3. 도메인 소유자가 Google Search Console에서 도메인을 인증하고 `/sitemap.xml`을 제출한다. DNS 인증과 실제 서비스 도메인은 운영자가 준비한다.
4. Search Console URL 검사와 Rich Results Test로 배포 URL을 검사한다. 배포 환경에서 공개 미디어가 쿠키 없이 읽히는지, 비공개 미디어는 거부되는지 함께 확인한다.

## 검증

API e2e는 익명 공개 읽기·미디어 Range·댓글·숨김·기존 대회 권한·비공개 승인과 이전 그룹의 PRIVATE 보존을 검사한다. 웹 API 레인은 생성 문서를 실제 API에 실행하고 공개 그룹 49개의 사이트맵 분할·비공개 배제·장애 전파를 확인한다. Playwright는 Chrome·WebKit·데스크톱에서 공개 탐색·서버 HTML·canonical·실제 공유 사진·JSON-LD XSS·사이트맵·비공개 SEO를 검사한다. 운영 컨테이너 smoke도 HTTPS에서 공개 SEO와 비공개 사진 접근 제한을 확인한다.

참고: [Next.js JSON-LD](https://nextjs.org/docs/app/guides/json-ld), [Google discussion forum markup](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum), [Google canonical 가이드](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Schema.org CollectionPage](https://schema.org/CollectionPage).
