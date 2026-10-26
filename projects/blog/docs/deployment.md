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

`SITE_URL` 미설정 시 개발은 `http://localhost:3100`, production은 `https://blog.bambyul.com`을 사용합니다. 운영 설정 예시는 `apps/web/.env.production.example`입니다. URL의 경로·쿼리·fragment는 제거하여 원점 하나를 사용합니다. `NEXT_PUBLIC_*`는 빌드 시 브라우저 번들에 들어가므로 값을 변경하면 재빌드합니다.

## Vercel

1. GitHub `jingeon27/side-project`를 Vercel에 연결합니다.
2. Framework를 Next.js, Root Directory를 `projects/blog/apps/web`, Node.js를 24로 설정합니다. 모노레포에서 루트 외부 파일을 포함하도록 설정합니다.
3. 설치 명령은 저장소 루트 기준 `yarn install --immutable`입니다. 앱 디렉터리에서 명령을 실행하는 설정이라면 `cd ../../../.. && yarn install --immutable`을 사용합니다.
4. 빌드 명령은 `yarn workspace @blog/web build`, 출력 디렉터리는 기본 `.next`를 사용합니다.
5. Production·Preview 환경변수를 분리합니다. Preview에는 운영 GA ID를 넣지 않아 통계 혼합을 피할 수 있습니다. 각 공개 배포의 canonical 정책에 맞는 `SITE_URL`을 지정합니다.
6. Production branch를 `main`으로 정하고 `blog.bambyul.com` 도메인·HTTPS를 연결한 뒤 실제 페이지와 canonical을 확인합니다.

GitHub Actions의 `Blog / verify`는 콘텐츠 검증, 타입, lint, Vitest, production build, Chromium 데스크톱·모바일 E2E를 수행합니다. Vercel은 Git 연결을 통해 별도로 빌드·배포하므로 Actions에 중복 배포 job은 두지 않았습니다. GitHub Actions 실패가 Vercel Preview를 자동 차단한다는 가정은 하지 않습니다. `main` 보호 규칙에 이 검증을 필수로 추가하고 검증을 통과한 PR만 병합하도록 설정하세요. Vercel 자체 빌드 실패는 해당 배포를 차단합니다.

모든 응답에는 `apps/web/security-headers.ts`의 보안 헤더(`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`)를 붙입니다. 인라인 테마 스크립트·JSON-LD·RSC payload에 hash나 nonce를 적용하기 전까지 `script-src`는 제한하지 않습니다.

## GA4

1. GA4 속성과 웹 데이터 스트림을 만들고 측정 ID를 `NEXT_PUBLIC_GA_MEASUREMENT_ID`에 지정합니다.
2. **향상된 측정의 Page views → 고급 설정 → 브라우저 방문 기록 이벤트에 기반한 페이지 변경을 끕니다.** 앱은 `send_page_view: false`로 초기화하고 경로 변경마다 수동 `page_view`를 한 번 전송합니다. GA4의 이 설정이 켜져 있으면 중복 페이지뷰가 발생할 수 있습니다. [공식 페이지뷰 문서](https://developers.google.com/analytics/devguides/collection/ga4/views?hl=ko)
3. 향상된 측정의 사이트 검색 수집도 끕니다. 앱 검색은 로컬 제목·태그 필터이며 `search_performed`에는 `has_query`만 보냅니다. 외부 링크 측정은 링크 URL에 민감한 정보가 포함되지 않는지 확인한 뒤 활성화합니다.
4. 동의 배너는 두지 않습니다. 모든 방문자에게서 GA4 방문 통계와 Clarity를 수집하고(opt-out), 방문자는 `/ko/privacy`·`/en/privacy`의 ‘수집 끄기’로 이 브라우저의 수집을 끄거나 다시 켭니다. 끄면 GA 쿠키를 지우고 전송을 멈추며 Clarity도 멈춥니다.
5. DebugView·실시간 보고서에서 첫 진입과 클라이언트 경로 전환마다 한 번만 `page_view`가 발생하는지 확인합니다.

페이지 URL과 referrer는 query·fragment를 제거해 전송합니다. 광고 관련 저장·개인화·Google signals는 비활성화합니다. 커스텀 이벤트는 `language_changed`, `article_shared`, `category_selected`, `tag_selected`, `search_performed`이며 이벤트별 허용 속성만 전송합니다. 브라우저 차단이나 SDK 실패가 글 읽기 기능을 막지 않도록 처리합니다.

수집 범위, 처리 위탁과 국외 이전, 끄는 방법은 푸터에서 연결한 개인정보 처리 안내에 있습니다. 보관 기간은 GA4·Clarity의 실제 데이터 보관 설정을 확인해 문구에 반영합니다. GA4는 유럽(EEA·영국·스위스) 방문자에게도 사전 동의 없이 쿠키를 쓰므로 해당 지역 규정상 위반 소지가 남습니다. 이 안내는 법률 검토를 거친 문서가 아니므로 운영 전에 검토합니다.

## Search Console

`/sitemap.xml`과 `/robots.txt`는 언어 경로 밖의 루트에서 제공합니다. Next.js의 `app/sitemap.ts`, `app/robots.ts`가 빌드 시 생성하므로 `public`에 별도 파일을 복사할 필요는 없습니다. `SITE_URL`을 바꾸면 다시 빌드해야 두 파일에도 새 도메인이 반영됩니다.

- 사이트맵은 한국어·영어 홈, 목록, 소개, 글이 있는 카테고리, 태그와 실제 본문이 있는 글을 포함합니다. 글이 없는 카테고리 페이지는 만들지 않고(404) `hreflang`에도 넣지 않습니다. 현재 글은 한국어 28편·영어 28편이며, 글별 `lastmod`와 실제 번역의 `hreflang`을 제공합니다. 새 글과 번역은 콘텐츠 생성·빌드 후 반영됩니다.
- robots.txt는 공개 페이지와 렌더링에 필요한 `/_next/`의 JS·CSS·이미지 접근을 허용하고 `/api/`만 제외합니다. `Sitemap`에는 같은 `SITE_URL`의 `/sitemap.xml`을 지정합니다. [Google의 JavaScript 수집·렌더링 안내](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics#how-google-processes-javascript)

1. 실제 도메인을 등록하고 DNS TXT로 소유권을 확인합니다. URL-prefix 방식이라면 HTML tag의 verification 값만 `GOOGLE_SITE_VERIFICATION`에 지정할 수 있습니다.
2. `https://blog.bambyul.com/sitemap.xml`을 제출합니다.
3. `/robots.txt`, 한국어·영어 홈과 대표 글 URL을 URL 검사로 확인합니다.
4. Canonical이 자기 언어 URL인지, `hreflang`이 실제 존재하는 번역만 가리키는지 확인합니다. 두 언어가 모두 있는 페이지는 `x-default`로 한국어 버전을 가리키며 글 페이지에도 RSS `alternate`가 남아 있어야 합니다. 영어 본문이 없는 한국어 글의 영어 상세 URL은 제공하지 않습니다.
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
- 첫 방문부터 단일 페이지뷰와 Clarity 로드, 개인정보 처리 안내의 ‘수집 끄기’ 뒤 전송 중단, ‘다시 켜기’ 뒤 재개
- Sentry 테스트 이벤트와 source map, Search Console 소유권·sitemap 접수

확인한 날짜·배포 URL·commit·실제 결과를 배포 기록에 남깁니다.

## 밤별 블로그 도메인

Vercel 프로젝트에 `blog.bambyul.com`을 추가하고 콘솔에서 안내하는 DNS 레코드를 등록한다. 운영 `SITE_URL=https://blog.bambyul.com`으로 canonical·JSON-LD·OG·RSS·사이트맵을 통일한다. 작성자 이름은 김진건, 제품명은 밤별 블로그(Bambyul Blog)다. 별도 API 서버가 없어 `api.blog.bambyul.com`은 현재 연결하지 않는다.

## 클릭·스크롤 히트맵과 글 이탈 분석

행동 분포는 Microsoft Clarity, 참여·이탈 지표는 기존 GA4를 사용한다. Clarity의 Settings → Setup에서 받은 공개 project ID를 Vercel 빌드 환경 `NEXT_PUBLIC_CLARITY_PROJECT_ID`에 넣고 다시 빌드한다. ID를 비우거나 방문자가 개인정보 처리 안내에서 수집을 끄면 스크립트를 로드하지 않는다. 처음에는 동의 신호를 보내지 않아 EEA·영국·스위스 방문자에게는 Clarity의 기본 동의 모드가 쿠키를 만들지 않으며, 끄기를 되돌릴 때만 동의 신호와 함께 재개한다. 동의 신호를 보낼 때 광고 저장은 항상 denied로 보낸다. 수집을 끄면 consentv2 denied와 stop으로 수집을 종료하고 다른 탭의 동의 변경도 반영한다. 검색 입력은 명시적으로 마스킹하고 검색어·사용자 ID·개인 속성을 커스텀 이벤트로 보내지 않는다. SDK 설치 성공을 실제 대시보드 수신으로 취급하지 않는다.

1. Clarity Heatmaps에서 글 URL별 클릭·스크롤·attention 분포를 모바일/데스크톱으로 나누어 본다. Recordings의 방문·진입·이탈 URL 필터로 중단한 지점을 확인한다.
2. GA4의 페이지/화면 보고서에서 글별 참여 시간·참여율·이탈률을 추가한다. 이탈률은 참여하지 않은 세션 비율이며, 글을 다 읽고 닫은 정상 방문까지 무조건 실패로 해석하지 않는다.
3. 제목·첫 문단·목차·예제 위치 중 한 요소씩 수정하고, 같은 글·기기·유입 경로·비슷한 기간의 지표로 비교한다. 적은 표본과 측정 범위(수집을 끄지 않은 방문자, Clarity는 동의 신호가 없는 EEA·영국·스위스 방문자 제외)를 함께 기록한다.
4. Preview에서 첫 방문의 GA·Clarity 한 번 로드, SPA 이동, ‘수집 끄기’ 뒤 중단과 ‘다시 켜기’ 뒤 재개를 검사하고 운영 대시보드에서 실제 세션을 확인한다. 계정·실제 project ID·운영 데이터가 없으므로 외부 수신과 실제 글의 이탈 원인은 아직 검증하지 않았다.

공식 문서: [히트맵](https://learn.microsoft.com/en-us/clarity/heatmaps/heatmaps-overview), [설치](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup), [Consent V2](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2), [수집 모듈 stop](https://github.com/microsoft/clarity/blob/master/packages/clarity-js/src/clarity.ts), [GA4 참여율과 이탈률](https://support.google.com/analytics/answer/12195621).
