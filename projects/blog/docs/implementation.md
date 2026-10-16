# 구현과 검증 기록

## 범위와 결정

- `jingeon27/side-project`의 `feat/blog-mdx-migration` 브랜치와 별도 Git worktree에서 구현했다. 앱은 `projects/blog/apps/web`, 집계 workspace는 `@side/blog`다.
- 기존 Yarn 4 workspace 패턴과 공용 TypeScript 설정을 사용했다. 다른 프로젝트의 소스와 실행 중인 서버는 변경하지 않았다.
- Next.js 16.4·React 19·TypeScript 5.9·Tailwind 4·next-intl·`@next/mdx`·Shiki를 사용한다. UI와 도메인은 FSD 레이어로 나누고 ESLint로 상위 레이어 import를 제한한다.
- 이번 요청에 따라 개발 계획의 마이그레이션 제외 조건을 변경했다. 티스토리에 공개되어 있고 `resume/blog`에 대응 파일이 있는 27편만 가져왔다. 공개 원문이 정본이며 비공개 수정본과 미발행 초안은 복사하지 않았다.
- 한국어·영어 UI는 제공하지만 실제 영어 글은 없다. 영어 목록은 빈 상태를 표시하고 한국어 상세에서 언어를 바꾸면 번역 없음 안내와 영어 목록 링크를 제공한다.

## 구현한 기능

- Home / Blog / About, 카테고리 4종, 제목·태그 통합 검색과 카테고리 필터, 최신순 목록
- inline cmdk combobox, Cmd/Ctrl+K 검색 포커스와 키보드 탐색. 입력 중 태그를 최대 5개 제안하고, 태그 선택은 `#tag` 정확 필터를 적용하며 글 선택은 상세로 이동
- 독립적인 언어별 MDX와 SEO JSON, 안정적인 콘텐츠 ID와 고정 slug
- 메타데이터·SEO·번역 존재·MDX 컴파일·내부 링크·이미지·301 대상 검증
- 정적으로 분석 가능한 MDX import registry와 빌드 시 생성한 검색 인덱스
- 서버 코드 강조, 코드 복사, H2/H3 목차와 anchor·현재 섹션, 모바일 접이식 목차
- 테마 유지, 키보드 본문 이동, 공유, 관련 글과 이전·다음 글
- 다운로드한 이미지 32장의 원본 크기 정보를 이용한 Next Image 렌더링
- Canonical / 실제 번역의 hreflang / OG / Twitter / JSON-LD / sitemap / robots / 언어별 RSS
- 새 도메인의 기존 숫자 경로 27개와 명시적 slug 변경의 301 지원
- 동의 전 로드하지 않는 GA4, 검색어 원문을 제외한 이벤트, 선택적 Sentry와 개인정보 필터
- 블로그 범위 GitHub Actions와 Vercel·분석·모니터링 설정 문서

## 검증

2026-10-16에 Node.js 24.19.0, Yarn 4.17.0으로 확인했다.

- `yarn install --immutable`: 통과
- `content:validate`, TypeScript, ESLint(FSD 포함), Prettier: 통과
- Vitest: 34개 통과. 번역 fixture, SEO, 검색·필터·테마·목차·복사, 분석 실패와 개인정보 필터, 이미지·코드 원문 체크섬 포함
- Production build: 정적 페이지 98개 생성. 한글 slug와 태그의 정상 본문 생성 확인
- 마이그레이션: 27편·코드 블록 180개·표 10개·이미지 32장·목차 240개를 공개 원문과 대조. 코드 블록과 이미지 SHA-256을 테스트로 고정
- 데스크톱·모바일 화면을 열어 확인. 본문 폭, 다크모드, 긴 코드와 표의 블록 내부 스크롤을 검증

- Playwright: 데스크톱·모바일 Chromium 24개 통과. 글 탐색, 한글 slug·태그, 27편 전체 본문 응답, 카테고리·검색, 번역 없음, 목차 이동, 원문 전체 코드 복사, 코드 스크롤, 테마, 숫자 주소 301, 미존재·잘못된 escape 주소 404, Canonical·글별 OG·JSON-LD·RSS·sitemap 포함

### Lighthouse 최종 확인

Lighthouse 13.5.0으로 로컬 production 서버를 검사했다. 모바일 412×823, 기본 simulated network·CPU 4배 slowdown 조건이며 분석·오류 수집 DSN은 설정하지 않았다.

| 페이지               | 성능 | 접근성 | 권장사항 | SEO |    LCP | CLS |
| -------------------- | ---: | -----: | -------: | --: | -----: | --: |
| 한국어 홈            |   99 |    100 |      100 | 100 | 2.18초 |   0 |
| 건강검진 프로그램 글 |   98 |    100 |      100 | 100 | 2.32초 |   0 |

파비콘 누락과 다크모드 코드 주석의 대비를 수정했다. DSN이 없을 때 초기 번들에서 선택적 Sentry SDK를 제외하고 글 목록의 과도한 자동 prefetch를 줄였다. 로컬 검사에서는 목표 LCP와 CLS를 만족했으며, 이 결과가 운영 사용자의 INP와 75번째 백분위 성능을 증명하지는 않는다.

## 외부 설정

Vercel 프로젝트 생성·도메인 연결·Git 연동 배포와 GA4 속성·Search Console 소유권 확인·Sentry 실제 이벤트 수신은 외부 계정 설정이 필요하다. 이번 작업에서 실제 운영 배포를 수행하지 않았다. [설정 절차](deployment.md)에 필요한 환경변수와 검증 방법을 정리했다. 운영 사용자의 Core Web Vitals는 실제 배포 후 확인해야 한다.

## PR 준비 재검증 (2026-10-17)

최신 `develop`에 재기반하고 Yarn이 양쪽 lockfile을 병합한 뒤 immutable 설치를 확인했다. 블로그 앱의 `hoistingLimits: workspaces` 설정으로 ESLint·Vitest 실행 경로를 격리했다. Sentry 11의 `dataCollection`과 `beforeSendSpan`에 맞춰 설정하고, 서버·Edge·브라우저의 DSN 유무별 초기화와 streaming span 개인정보 필터를 검증했다.

콘텐츠·TypeScript·ESLint·Prettier, Vitest **41개**, Production build(정적 페이지 **98개**), Playwright **24개**를 다시 통과했다. 위 Lighthouse 수치는 2026-10-16의 화면 검증 결과다. 외부 서비스 연결과 실제 배포는 수행하지 않았다.

## 통합 검색 검증 (2026-10-17)

제목 검색과 태그 드롭다운을 하나의 cmdk combobox로 합쳤다. 제목이나 태그 일부로 글을 찾고, 입력 중 제안하는 태그를 선택하면 해당 태그와 정확히 일치하는 글만 남긴다. 태그 제안은 최대 5개로 제한하며 글 제안보다 먼저 표시한다. Cmd/Ctrl+K, 방향키, Enter, Escape와 입력 지우기를 지원한다.

Immutable 설치, 콘텐츠·TypeScript·ESLint·Prettier, Vitest **55개**, Production build(정적 페이지 **98개**), 데스크톱·모바일 Playwright **28개**를 통과했다. 기존 검색·카테고리·태그 범위와 제목에 없는 태그 검색, 한글 조합 중 Enter, 키보드 초기화, 제안 개수와 ARIA 연결을 확인했다. 원문 MDX와 게시글 SEO는 변경하지 않았다.
