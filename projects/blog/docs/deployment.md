# 배포와 외부 서비스 설정

이 문서는 운영자가 수행할 외부 설정을 정리합니다. 이 저장소 작업에서는 Vercel 프로젝트 생성, 도메인 연결, GA4 속성 생성, Search Console 인증, Sentry 이벤트 수신을 수행하지 않았습니다.

## 환경변수

`apps/web/.env.example`을 기준으로 설정합니다. 실제 secret을 Git에 추가하지 않습니다.

| 변수                                                   | 용도                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `SITE_URL`                                             | Canonical, sitemap, RSS, OG, JSON-LD의 공개 원점. 운영에서는 실제 HTTPS 도메인을 반드시 설정 |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`                        | 선택 사항. `G-...` GA4 웹 데이터 스트림 ID                                                   |
| `GOOGLE_SITE_VERIFICATION`                             | 선택 사항. Search Console URL-prefix 방식의 HTML verification 값                             |
| `NEXT_PUBLIC_SENTRY_DSN`                               | 선택 사항. 브라우저 오류 전송                                                                |
| `SENTRY_DSN`                                           | 선택 사항. 서버·edge 오류 전송. 없으면 공개 DSN 사용                                         |
| `SENTRY_AUTH_TOKEN`                                    | 선택 사항. 빌드 중 source map 업로드용 비공개 토큰                                           |
| `SENTRY_ORG`, `SENTRY_PROJECT`                         | Source map 업로드 대상                                                                       |
| `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | 서버·브라우저 환경 이름                                                                      |
| `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_RELEASE`         | 동일 빌드의 release 식별자. 업로드와 런타임에서 일치시킬 것                                  |

`SITE_URL` 미설정 시 로컬 빌드 검증을 위해 `http://localhost:3100`을 사용합니다. 배포 환경에서는 이 기본값을 사용하지 마세요. URL의 경로·쿼리·fragment는 제거하여 원점 하나를 사용합니다. `NEXT_PUBLIC_*`는 빌드 시 브라우저 번들에 들어가므로 값을 변경하면 재빌드합니다.

## Vercel

1. GitHub `jingeon27/side-project`를 Vercel에 연결합니다.
2. Framework를 Next.js, Root Directory를 `projects/blog/apps/web`, Node.js를 24로 설정합니다. 모노레포에서 루트 외부 파일을 포함하도록 설정합니다.
3. 설치 명령은 저장소 루트 기준 `yarn install --immutable`입니다. 앱 디렉터리에서 명령을 실행하는 설정이라면 `cd ../../../.. && yarn install --immutable`을 사용합니다.
4. 빌드 명령은 `yarn workspace @blog/web build`, 출력 디렉터리는 기본 `.next`를 사용합니다.
5. Production·Preview 환경변수를 분리합니다. Preview에는 운영 GA ID를 넣지 않아 통계 혼합을 피할 수 있습니다. 각 공개 배포의 canonical 정책에 맞는 `SITE_URL`을 지정합니다.
6. Production branch를 `main`으로 정하고 도메인·HTTPS를 연결한 뒤 실제 페이지와 canonical을 확인합니다.

GitHub Actions의 `Blog / verify`는 콘텐츠 검증, 타입, lint, Vitest, production build, Chromium 데스크톱·모바일 E2E를 수행합니다. Vercel은 Git 연결을 통해 별도로 빌드·배포하므로 Actions에 중복 배포 job은 두지 않았습니다. GitHub Actions 실패가 Vercel Preview를 자동 차단한다는 가정은 하지 않습니다. `main` 보호 규칙에 이 검증을 필수로 추가하고 검증을 통과한 PR만 병합하도록 설정하세요. Vercel 자체 빌드 실패는 해당 배포를 차단합니다.

## GA4

1. GA4 속성과 웹 데이터 스트림을 만들고 측정 ID를 `NEXT_PUBLIC_GA_MEASUREMENT_ID`에 지정합니다.
2. **향상된 측정의 Page views → 고급 설정 → 브라우저 방문 기록 이벤트에 기반한 페이지 변경을 끕니다.** 앱은 `send_page_view: false`로 초기화하고 경로 변경마다 수동 `page_view`를 한 번 전송합니다. GA4의 이 설정이 켜져 있으면 중복 페이지뷰가 발생할 수 있습니다. [공식 페이지뷰 문서](https://developers.google.com/analytics/devguides/collection/ga4/views?hl=ko)
3. 향상된 측정의 사이트 검색 수집도 끕니다. 앱 검색은 로컬 제목 필터이며 `search_performed`에는 `has_query`만 보냅니다. 외부 링크 측정은 링크 URL에 민감한 정보가 포함되지 않는지 확인한 뒤 활성화합니다.
4. 배포 후 분석 동의 배너에서 동의합니다. 동의 전에는 Google script 자체를 로드하지 않습니다. 거부하거나 동의를 철회하면 전송을 멈춥니다. 하단의 통계 설정 버튼으로 다시 선택할 수 있습니다.
5. DebugView·실시간 보고서에서 첫 진입과 클라이언트 경로 전환마다 한 번만 `page_view`가 발생하는지 확인합니다.

페이지 URL과 referrer는 query·fragment를 제거해 전송합니다. 광고 관련 저장·개인화·Google signals는 비활성화합니다. 커스텀 이벤트는 `language_changed`, `article_shared`, `category_selected`, `tag_selected`, `search_performed`이며 이벤트별 허용 속성만 전송합니다. 브라우저 차단이나 SDK 실패가 글 읽기 기능을 막지 않도록 처리합니다.

분석 쿠키 고지 문구와 동의 동작은 구현되어 있습니다. 실제 운영 지역과 정책에 맞는 고지 내용을 검토해 적용합니다.

## Search Console

1. 실제 도메인을 등록하고 DNS TXT로 소유권을 확인합니다. URL-prefix 방식이라면 HTML tag의 verification 값만 `GOOGLE_SITE_VERIFICATION`에 지정할 수 있습니다.
2. `https://<domain>/sitemap.xml`을 제출합니다.
3. `/robots.txt`, 한국어·영어 홈과 대표 글 URL을 URL 검사로 확인합니다.
4. Canonical이 자기 언어 URL인지, `hreflang`이 실제 존재하는 번역만 가리키는지 확인합니다. 영어 본문이 없는 한국어 글의 영어 상세 URL은 제공하지 않습니다.
5. 검색 실적과 Core Web Vitals는 실제 운영 데이터가 쌓인 뒤 확인합니다. LCP 2.5초·INP 200ms·CLS 0.1은 목표이며 로컬 빌드 성공이 이를 보장하지 않습니다.

티스토리 원본은 기존 서비스에서 계속 공개됩니다. 원본 플랫폼에서의 canonical 변경이나 redirect는 이 저장소에서 제어할 수 없으므로 필요하면 원문에 새 주소를 안내하고 각 플랫폼의 지원 범위를 별도로 확인합니다.

## Sentry

1. Next.js 프로젝트를 만들고 브라우저·서버 DSN과 environment를 설정합니다. DSN이 없으면 초기화·전송하지 않습니다.
2. 소스맵 업로드가 필요하면 비공개 `SENTRY_AUTH_TOKEN`, org, project를 배포 secret에 설정합니다. 토큰 미설정 시 source map 업로드를 비활성화합니다.
3. 브라우저·서버·source map에 같은 release 식별자를 사용합니다. 서버는 명시적 release가 없으면 Vercel commit SHA를 사용합니다.
4. Preview에서 의도적인 테스트 오류를 발생시켜 브라우저와 서버 이벤트 수신을 확인한 뒤 테스트 코드를 제거합니다. 사용자 데이터가 포함되지 않는지 이벤트 payload를 확인합니다.

오류 이벤트에서 user, request body·headers·cookies·query string을 제거합니다. 이메일, Bearer 값, URL query·fragment와 민감한 이름의 속성을 필터링합니다. Sentry 11의 `dataCollection`에서 사용자 정보·쿠키·양방향 HTTP 헤더/본문·URL query·AI 입력/출력·DB 데이터·큐·GraphQL 문서/변수·stack 변수와 소스 문맥 수집을 명시적으로 끕니다. 기본 span streaming을 사용하며 `beforeSendSpan`으로 개별 span도 필터링합니다(`beforeSendTransaction`은 streaming에서 호출되지 않음). Replay는 비활성화하고 운영 trace sampling은 10%로 설정합니다. 예상 가능한 Next.js 404 오류는 전송 대상에서 제외합니다. [Sentry 11 마이그레이션](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#senddefaultpii-is-replaced-by-datacollection)

## 배포 후 확인

- `/ko`, `/en`, 글·카테고리·태그·About, 없는 주소의 404
- Canonical, `hreflang`, OG 이미지, JSON-LD, sitemap, 두 언어의 RSS
- 모바일 가로 넘침, 테마 유지, 검색, 목차, 공유와 코드 복사
- 동의 전 외부 GA 요청 없음, 동의 후 단일 페이지뷰, 동의 철회
- Sentry 테스트 이벤트와 source map, Search Console 소유권·sitemap 접수

확인한 날짜·배포 URL·commit·실제 결과를 배포 기록에 남깁니다.
