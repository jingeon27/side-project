# Tistory 콘텐츠 마이그레이션

2026-10-16에 공개 상태인 [Tistory 블로그](https://jingeon27.tistory.com/)와 `resume/blog`의 글 목록을 대조해 한국어 글 27편을 옮겼다. 공개 사이트의 sitemap에 실린 URL에서 로그인 없이 본문 전체가 열리고, 로컬에 대응하는 파일이 있는 글만 포함했다.

최초 본문과 제목은 당시 공개된 Tistory HTML을 기준으로 가져왔다. 로컬 수정본은 공개 글과의 대응을 확인하는 데만 사용했다. 수정본의 비공개 변경 내용이나 초안을 본문에 합치지 않았다. 이후 요청받은 문장·이미지 수정은 이 저장소의 MDX에 반영한다. 최초 이관 당시 영어 공개본은 없었다. 2026-10-17에 사용자 요청으로 편집한 한국어 본문을 기준으로 영문 번역 27편과 언어별 SEO를 추가했다. 영문은 Tistory에서 가져온 원문이 아니라 이 저장소에서 작성한 번역이다.

## 저장 구조

- `apps/web/content/posts/{contentId}/meta.json`: 공개 발행 시각, 수정 시각, 분류, 태그와 원문 URL.
- `apps/web/content/posts/{contentId}/ko.mdx`: 공개된 본문 전체. 원문의 코드, 표, 목록, 인용과 그림 설명을 유지했다.
- `apps/web/content/posts/{contentId}/en.mdx`: 같은 글의 영문 번역. 코드 예제·이미지 경로·제목 구조·표 크기를 유지하고 본문과 이미지 대체 텍스트·캡션을 번역했다. 코드 내부의 한국어 주석·문자열과 도표 내부 글자는 원본을 재사용한다.
- `apps/web/seo/ko.json`: 공개 제목과 제목에서 만든 한국어 URL, 설명, 검색어.
- `apps/web/seo/en.json`: 영어 UI와 영문 글 27편의 제목·설명·고정 영문 slug·검색어.
- `apps/web/public/images/posts/{contentId}/`: 처음 가져온 공개 이미지 32장의 원본 보관본. 원격 이미지의 만료되는 서명 URL을 런타임에 사용하지 않는다.
- `apps/web/public/images/thumbnails/`: 글별 기술 도해 SVG 27장. 새 커버의 원본도 여기에 있다.
- `apps/web/public/images/covers/`: 본문·메타데이터에서 사용하는 새 커버 PNG 5장. 해당 SVG를 1280×720으로 렌더링했다.
- `apps/web/content/image-replacements.json`: 기존 이미지 경로와 교체한 커버 경로의 대응표.
- `apps/web/content/code-comment-edits.json`: 사용자 요청으로 바꾼 코드 주석 구두점의 원문과 편집문. 실행 코드는 수정하지 않는다.
- `apps/web/content/code-redactions.json`: 공개 예제에서 조직 식별자를 익명화한 코드 블록의 원본·편집본 SHA-256 대응표. 식별자 원문은 기록하지 않는다.
- [migration-manifest.json](migration-manifest.json): 원문 URL, 콘텐츠 ID, 대응 파일명, 공개 발행 시각, 코드 블록과 이미지의 SHA-256.

최초 이관에서는 Tistory의 `article:published_time`과 `article:modified_time`에 기록된 시간대 포함 ISO 값을 보존했다. 이후 편집한 글은 발행일을 유지하고 `updatedAt`에 편집 시각을 기록한다. 화면의 날짜는 한국 시간을 기준으로 표시한다. 콘텐츠 ID는 파일과 번역의 공통 식별자이며 공개 URL은 언어별 SEO의 slug로 정한다. 기존 글을 합치거나 발행일을 마이그레이션 날짜로 바꾸지 않았다.

2026-10-17에는 앞서 이관한 공개 원문 27편을 다시 조회해 `article:published_time`과 저장된 `publishedAt`, 최초 이관 기록이 모두 일치하는지 확인했다. 한국어와 영어는 같은 최초 발행일을 사용한다. 목록과 상세에는 최초 발행일을 `발행`으로 표시하고, 상세에서는 이후 편집일을 `수정`으로 구분한다. 이 블로그에서 새로 작성한 글의 발행일은 해당 글의 날짜를 사용한다.

## 공개 글 대응표

Tistory 번호와 로컬 수정본 번호는 29번부터 다르다. 아래 표의 번호는 공개 URL을 뜻한다.

| 공개 URL                                | 콘텐츠 ID                       | `resume/blog` 대응 파일                            | 최초 발행일 (한국 시간) |
| --------------------------------------- | ------------------------------- | -------------------------------------------------- | ----------------------- |
| [/4](https://jingeon27.tistory.com/4)   | `puppeteer-event-lifecycle`     | `revised/post-04-puppeteer-closure.md`             | 2024-03-29              |
| [/5](https://jingeon27.tistory.com/5)   | `electron-module-boundaries`    | `revised/post-05-electron-nestjs-inspired.md`      | 2024-04-02              |
| [/6](https://jingeon27.tistory.com/6)   | `query-key-factory`             | `revised/post-06-query-key-factory.md`             | 2024-04-10              |
| [/7](https://jingeon27.tistory.com/7)   | `typescript-patterns`           | `revised/post-07-typescript-patterns.md`           | 2024-05-25              |
| [/8](https://jingeon27.tistory.com/8)   | `nextjs-tanstack-query-ssr`     | `revised/post-08-next-tanstack-query.md`           | 2025-01-22              |
| [/11](https://jingeon27.tistory.com/11) | `reservation-form-state`        | `revised/post-11-reservation-form.md`              | 2025-06-30              |
| [/12](https://jingeon27.tistory.com/12) | `review-like-optimistic-update` | `revised/post-12-review-like-optimistic-update.md` | 2025-07-03              |
| [/14](https://jingeon27.tistory.com/14) | `nextjs-seo-prefetch`           | `revised/post-14-next-seo-prefetch.md`             | 2025-11-20              |
| [/15](https://jingeon27.tistory.com/15) | `review-form-funnel`            | `revised/post-15-review-form.md`                   | 2025-12-13              |
| [/18](https://jingeon27.tistory.com/18) | `typed-program-form`            | `revised/post-18-program-form.md`                  | 2026-02-13              |
| [/19](https://jingeon27.tistory.com/19) | `cross-domain-token-handoff`    | `revised/post-19-cross-domain-token.md`            | 2026-05-29              |
| [/20](https://jingeon27.tistory.com/20) | `chatbot-message-layer`         | `revised/post-20-chatbot-message-layer.md`         | 2026-06-25              |
| [/21](https://jingeon27.tistory.com/21) | `sitemap-api-boundaries`        | `revised/post-21-sitemap-cache.md`                 | 2026-06-16              |
| [/22](https://jingeon27.tistory.com/22) | `payment-coupon-branches`       | `revised/post-22-payment-coupon.md`                | 2026-07-02              |
| [/23](https://jingeon27.tistory.com/23) | `fsd-layer-boundaries`          | `revised/post-23-fsd-2-1.md`                       | 2026-07-01              |
| [/24](https://jingeon27.tistory.com/24) | `prototype-working-rules`       | `revised/post-24-prototype-rules.md`               | 2026-07-12              |
| [/25](https://jingeon27.tistory.com/25) | `testing-standards`             | `revised/post-25-test-suite-rebuild.md`            | 2026-08-08              |
| [/26](https://jingeon27.tistory.com/26) | `declarative-code`              | `revised/post-26-declarative-code.md`              | 2026-08-12              |
| [/27](https://jingeon27.tistory.com/27) | `nextjs-server-client-issues`   | `revised/post-27-next-server-to-client.md`         | 2026-08-16              |
| [/28](https://jingeon27.tistory.com/28) | `error-boundary-recovery`       | `revised/post-28-error-boundary.md`                | 2026-08-17              |
| [/29](https://jingeon27.tistory.com/29) | `low-effort-success`            | `revised/post-33-low-effort-success.md`            | 2026-08-25              |
| [/30](https://jingeon27.tistory.com/30) | `sentry-observability`          | `revised/post-30-sentry-pii-hardening.md`          | 2026-08-25              |
| [/31](https://jingeon27.tistory.com/31) | `plan-gated-ai-workflow`        | `revised/post-34-plan-gated-ai-workflow.md`        | 2026-08-30              |
| [/32](https://jingeon27.tistory.com/32) | `zod-assertion-boundaries`      | `revised/post-35-zod-assertion-boundaries.md`      | 2026-09-05              |
| [/33](https://jingeon27.tistory.com/33) | `bottom-sheet-drag-crash`       | `revised/post-36-sentry-bottom-sheet-crash.md`     | 2026-09-28              |
| [/34](https://jingeon27.tistory.com/34) | `health-check-program`          | `revised/post-new-health-check-program.md`         | 2026-09-30              |
| [/35](https://jingeon27.tistory.com/35) | `reading-ai-code`               | `revised/post-new-reading-ai-code.md`              | 2026-10-05              |

## 제외한 로컬 파일

아래 파일은 대응하는 공개 글을 확인하지 못해 옮기지 않았다. 이 목록은 공개 여부를 다시 확인하기 위한 파일명 기록이며, 내용은 복사하지 않았다.

- `revised/post-29-eslint-rule-fixture.md`
- `revised/post-31-strength-and-blind-spot.md`
- `revised/post-32-convention-to-lint.md`
- `revised/post-new-analytics-integrity.md`
- `revised/post-new-temporary-open-day.md`
- `revised/post-new-dont-rush.md`
- `revised/post-new-product-metrics.md`
- `revised/post-new-crawler-view-seo.md`

`resume/blog` 루트의 작업본, 검토 문서, 디자인 미리보기와 그림 원본도 별도 게시글로 생성하지 않았다. 대응하는 공개 글의 이미지는 공개 페이지에서 내려받았다.

## 변환과 확인

Tistory의 표현용 HTML을 Markdown과 MDX로 바꿨다. 코드 블록은 fence로, 표는 GFM 표로, 인용은 blockquote로 변환했다. 본문의 중괄호와 HTML처럼 보이는 일반 텍스트를 이스케이프하고, 스크립트와 이벤트 속성은 가져오지 않았다. Tistory의 자동 언어 판별은 TypeScript 예제를 다른 언어로 분류한 경우가 많아 코드 형태를 보고 `typescript`, `tsx`, `json`, `yaml`, `bash`, `text` 중에서 지정했다.

이번에 옮긴 공개 글을 가리키는 Tistory 링크만 `/ko/blog/{slug}`로 바꿨다. 외부 자료와 대상에 없는 Tistory 링크는 원래 주소를 유지했다. 공개 태그가 있으면 정규화해 보존하고, 글에서 다루는 기술의 탐색 태그를 보완했다. 태그는 소문자와 하이픈을 사용한다. 대부분 `engineering`이며, 공개 29번과 35번은 `perspectives`로 분류했다.

공개 원문의 문단, 제목, 목록 항목, 표 셀, 코드 블록과 그림 설명을 변환본과 대조해 빠진 본문이 없는지 확인했다. 코드 블록과 이미지 개수도 글별로 대조했다. MDX 컴파일과 콘텐츠 계약 검증은 앱의 콘텐츠 검사에 포함된다.

가져온 MDX는 저장소 루트의 `.prettierignore`에서 제외했다. 코드 예제에 포매터를 적용하면 공개 원문과 달라질 수 있어 들여쓰기와 코드 내부의 빈 줄을 그대로 보존한다. 마이그레이션 무결성 테스트는 코드 블록 180개의 원문 SHA-256과 이미지 32개의 SHA-256을 확인하며, 이미지 대체 텍스트에 HTML 엔티티 표기가 남는 회귀도 검사한다.

## 이관 이후의 본문 편집

현재 편집본은 `apps/web/content/posts`의 MDX다. 공개 글에 대응하는 한국어 27편과 영어판을 함께 다듬었고, 이 블로그에서 작성한 사이드 프로젝트 글의 도입부도 정리했다. 이전 초안을 통째로 덮어쓰지 않고, 현재 본문의 설명과 맞는 문장 수정과 기술 설명만 반영했다. 제외 목록의 미공개 초안은 새 게시글로 만들지 않았다.

제목과 설명은 언어별 SEO에 반영하고 slug와 최초 발행일은 유지했다. 수정 시각은 `updatedAt`으로 구분한다. AI workflow의 검토 방식이 달라진 그림 두 장은 원본 보관본을 수정하지 않고 새 PNG로 추가했으며, `content/image-replacements.json`에 대응 관계를 남겼다.

코드 180개와 원본 이미지 32장의 무결성 검증은 유지한다. 한영판의 코드, 이미지 순서, 제목 수준과 표 크기도 기존 테스트로 비교한다. 추가한 편집 계약 테스트는 최초 발행일과 도입 요약, FSD 글이 AI workflow를 가리키는 링크를 확인한다.

콘텐츠 검증, 타입 검사와 lint를 통과했고, 단위 및 컴포넌트 테스트 97개와 데스크톱 및 모바일 E2E 38개가 성공했다. 프로덕션 빌드는 175개 정적 경로를 생성했다. 연결 가능한 브라우저가 없어 별도의 직접 시각 검수는 하지 못했으며, 이미지 로딩과 가로 넘침, 코드 복사와 번역 이동은 기존 E2E로 확인했다.

## 사이드 프로젝트 글 업데이트

2026-10-26에는 최신 글 `side-project-design`의 한영 본문을 develop `b758d2e8`까지의 코드와 대조했다. 가입과 프로필 수정, 캐시 무효화 실패 후 재시도, S3 직접 업로드, Sentry Web Vitals와 MCP 수신 확인을 반영했다. 배포 설명은 RDS에서 같은 EC2의 PostgreSQL로 바꾼 구성과 백업 책임을 함께 다룬다. 실제 S3의 HTTP/API 검증과 전체 인프라 적용은 구분한다.

AI 활용 포트폴리오에 사용한 최근 화면 모음 두 장과 모니터링 구성도를 `public/images/posts/side-project-design`에 추가했다. 화면 모음은 10월 25~26일 저장한 검증용 UI 캡처에서 가져왔으며 이번에 새로 촬영한 화면은 아니다. 기존 보관 이미지는 교체하지 않았다. 원래 코드 블록과 한영 slug, 최초 발행일은 유지했다.

콘텐츠 검증, 타입 검사, lint와 단위 및 컴포넌트 테스트 102개가 통과했다. 빌드는 정적 경로 177개를 생성했고 데스크톱 및 모바일 E2E 42개가 통과했다. 추가한 E2E는 한영판의 새 이미지 세 장이 로딩되고 화면 너비를 넘지 않는지 확인한다. 구성도는 파일을 열어 검토했으며, 서비스 화면은 자동화 검증으로 확인했다.

## 2026-10-28 문장 정리

사용자 요청으로 한영 본문의 앰대시를 문장이나 콜론으로 정리했다. 코드 예제 안에서도 주석의 구두점 6종만 바꾸고 대응표에 기록했다. 최초 이관한 코드의 SHA-256은 변경하지 않았다. 검증에서는 기록된 주석 구두점만 원문으로 되돌린 뒤 해시를 비교하므로 실행 내용이나 기록되지 않은 부분이 바뀌면 실패한다.

## 2026-10-30 조직 식별자 익명화

공개 본문의 조직 이름을 일반적인 서비스 설명으로 바꾸고, 코드 예제의 조직 식별자는 동작을 유지하는 일반 이름으로 한영판에 함께 반영했다. 최초 이관 기록의 코드 해시는 보존하며, 익명화한 블록 두 개만 `code-redactions.json`의 원본·편집본 해시로 연결한다. 무결성 테스트는 편집본 해시의 실제 사용과 원본 블록의 위치를 확인해 기록하지 않은 코드 변경이나 사용되지 않는 예외가 있으면 실패한다. 원본 이미지와 기존 주석 편집 검증도 유지한다.

## 재실행

아래 스크립트는 최초 가져오기용이다. 재실행하면 이후 수정한 문장, 표 헤더, 이미지 경로와 메타데이터를 덮어쓰므로 편집본 위에서 바로 실행하지 않는다. 별도 임시 경로에서 가져온 뒤 변경 내용을 검토해 필요한 부분만 반영한다.

프로젝트 루트에서 실행한다. Python 3와 `beautifulsoup4`가 필요하다.

```bash
python3 apps/web/scripts/migrate-tistory.py --resume-blog /path/to/resume/blog
```

스크립트에는 검토한 27개의 공개 URL과 대응 파일명만 명시돼 있다. 매번 공개 sitemap에 URL이 있는지와 로컬 대응 파일이 존재하는지를 확인하고, 본문은 공개 페이지에서만 읽는다. 새 글이나 초안을 자동으로 찾거나 발행하지 않는다. 원문이 바뀌면 생성된 MDX, SEO와 이미지 diff를 검토한다. 검토한 공개 HTML 캐시를 재사용하려면 `--cache-dir /path/to/public-html-cache`를 지정할 수 있다. 캐시와 로컬 저장소는 결과물에 포함하지 않는다.

### 화면 캡처 갱신

2026-10-29에 side-project-design의 예전 모바일 화면 모음을 다시 촬영한 화면으로 교체했다. 이전 이미지는 삭제하거나 덮어쓰지 않았다. 제거된 전체 목록 답변 대기 버튼과 그룹 탐색 안내, 바텀시트 프로필 편집이 현재 화면으로 오해되지 않도록 Game Mate 피드, 별사대 그룹 탐색, 공개 프로필과 별도 편집 페이지를 실었다. 캡처에는 격리된 테스트 계정과 가짜 게임 API를 사용했으며 촬영한 코드 revision, 경로, 크기와 이미지 해시는 [screen-captures.json](screen-captures.json)에 기록했다. 실제 화면 픽셀은 수정하지 않고 HTML과 CSS로 두 화면씩 배치해 브라우저에서 저장했다. 교체 경로는 image-replacements.json에 남겼다.
