# 밤별 블로그

**개발하며 막힌 지점과, 그때 선택한 이유를 기록합니다.**

김진건의 한국어·영어 기술 블로그입니다. Next.js와 React, next-intl, Shiki를 사용하며 글은 Git 기반 MDX로 관리합니다. 별도 API나 데이터베이스 없이 Vercel에 배포합니다.

[블로그 읽기](https://blog.bambyul.com/ko) · [소개](https://blog.bambyul.com/ko/about) · [English](https://blog.bambyul.com/en) · [배포·도메인 설정](docs/deployment.md)

## 빠른 시작

저장소 루트에서 Node.js 24와 Yarn 4.17.0을 사용합니다. [최초 설치](../../README.md#빠른-시작) 후 실행합니다.

```sh
cp projects/blog/apps/web/.env.example projects/blog/apps/web/.env.local
yarn workspace @blog/web dev
```

로컬 주소는 [localhost:3100/ko](http://localhost:3100/ko)입니다. 홈·글 목록·소개는 `/ko`와 `/en`, RSS는 `/rss/ko`·`/rss/en`에 있습니다. 사이트맵·robots는 언어 경로 밖의 `/sitemap.xml`·`/robots.txt`입니다.

## 검증과 배포

```sh
yarn workspace @blog/web check
yarn workspace @blog/web build
yarn workspace @blog/web exec playwright install chromium
yarn workspace @blog/web test:e2e
```

`check`는 콘텐츠 검증·타입·lint·Vitest를 실행합니다. Playwright는 빌드한 서버를 별도 포트 **3101**에서 시작하고 데스크톱·모바일을 확인합니다. 실행 중인 개발 서버는 재사용하거나 종료하지 않습니다.

운영은 **main → Vercel → blog.bambyul.com**입니다. 기능 브랜치에서 검증하고 develop에 모은 뒤 main으로 병합합니다. Vercel 프로젝트는 [side-project-vttu](https://vercel.com/jingeon27s-projects/side-project-vttu), Node 설정은 24.x입니다. 설치·빌드 명령과 환경변수는 [현재 배포 가이드](docs/deployment.md)를 기준으로 합니다. GitHub 검사와 Vercel 배포는 별도로 결과를 확인합니다.

## 콘텐츠의 기준 위치

| 경로                                      | 내용                                |
| ----------------------------------------- | ----------------------------------- |
| `apps/web/content/posts/<id>/meta.json`   | 공통 ID·카테고리·태그·날짜·커버     |
| `apps/web/content/posts/<id>/{ko,en}.mdx` | 언어별 본문                         |
| `apps/web/seo/{ko,en}.json`               | 제목·고정 slug·설명·검색 메타데이터 |
| `apps/web/messages/{ko,en}.json`          | 메뉴·소개 등 UI 문구                |
| `apps/web/public/images`                  | 커버·본문 이미지                    |

이후 글 수정은 이 프로젝트의 MDX에서 합니다. `resume/blog`는 이전 초안과 이관 자료이며 발행 원본이 아닙니다. 최초 티스토리 이관의 출처와 이미지 보존 내역은 [이관 기록](docs/migration.md)에 남깁니다. 편집한 글에 importer를 덮어 실행하지 않습니다.

## 콘텐츠 작성

1. `apps/web/content/posts/<content-id>/meta.json`에 대표 카테고리, 태그, 발행일을 작성합니다. 날짜는 시간대를 포함한 ISO 시각이나 `YYYY-MM-DD`로 쓰며, 날짜만 쓰면 한국 시간 자정으로 해석해 시각 값과 비교합니다.
2. `ko.mdx` 또는 `en.mdx`를 작성합니다. 두 언어는 독립적으로 발행할 수 있습니다.
3. `apps/web/seo/<locale>.json`의 `posts`에 해당 ID의 제목, 고정 slug, 설명, keywords를 추가합니다.
4. 이미지 파일은 `apps/web/public/images/posts/<content-id>/`에 둡니다.
5. 콘텐츠 검증과 테스트를 실행하고 생성된 registry, index, redirect 변경을 함께 검토합니다.

MDX에는 `Summary`, `Decision`, `Callout`, `Figure`, `CodeBlock`을 사용할 수 있습니다. 그 밖의 JSX, `import`·`export`, `{}` 식과 spread prop은 콘텐츠 검증에서 실패합니다. prop의 식은 `width={640}` 같은 숫자만 허용하며 JSX `src`도 Markdown 이미지처럼 `/images/` 파일 존재나 https 주소를 검사합니다. Markdown 코드 블록은 Shiki로 강조됩니다. `##`·`###` 제목으로 목차를 생성하며 heading과 목차에는 같은 anchor 규칙을 적용합니다.

목록 썸네일은 `meta.json`의 `coverImage`를 우선 사용합니다. 별도 커버가 없으면 `apps/web/src/shared/article/lib/article-thumbnails.ts`에서 지정한 본문 그림이나 주제 도해를, 매핑도 없으면 중립 기본 이미지(`thumbnails/default.svg`)를 표시합니다. 새 글에는 주제에 맞게 만든 전용 이미지를 `coverImage`에 지정하고 본문에도 같은 이미지를 의미 있는 alt와 함께 넣습니다. 대체 썸네일은 기존 글을 위한 호환 처리이며 새 글의 커버를 대신하지 않습니다.

Slug는 제목을 고쳐도 유지합니다. 공개 URL을 변경해야 하면 `apps/web/content/redirects.json`에 `{ "locale": "ko", "from": "old-slug", "to": "new-slug" }`을 추가합니다. 기존 URL에서 새 URL로 301을 반환하며 대상 글이 실제로 존재하는지 생성 단계에서 검사합니다. 공개했던 글 주소가 redirect 없이 사라지면 `content:generate`(커밋된 HEAD와 비교)와 `content:validate`(대상 브랜치와의 merge base와 비교, `CONTENT_BASE_REF` → `origin/$GITHUB_BASE_REF` → `origin/develop` 순)가 실패합니다. shallow clone처럼 기준 브랜치가 없으면 HEAD와 비교합니다.

카테고리는 `engineering`, `til`, `perspectives`, `misc` 네 가지이며 글이 있는 카테고리만 페이지·사이트맵·`hreflang`에 공개합니다. 태그는 두 언어가 함께 쓰므로 영문 소문자 slug(`refactoring`)로 씁니다. UI 문구는 `messages`, SEO는 `seo`, 본문은 `content/posts`에서 관리합니다. 코드 구조는 `app → widgets → features → shared`이며 범용 `components/` 디렉터리는 만들지 않습니다.

[구현 범위와 실제 검증 결과](docs/implementation.md)를 함께 확인할 수 있습니다.

## 환경변수와 외부 서비스

운영 `SITE_URL`은 `https://blog.bambyul.com`입니다. 공개 빌드 변수는 변경 후 재빌드해야 합니다. Sentry·Clarity는 키가 없으면 초기화하지 않습니다. **GA4는 production에서 ID 미설정 시 기본 측정 ID를 사용하므로**, Preview나 검토 빌드에서 수집을 끄려면 `NEXT_PUBLIC_GA_MEASUREMENT_ID`를 명시적으로 빈 값으로 설정합니다.

DNS 연결·실제 배포와 분석 도구의 이벤트 수신은 별개입니다. 확인한 운영 상태와 미검증 범위는 [배포 가이드](docs/deployment.md), 변경·검증 이력은 [구현 기록](docs/implementation.md)을 봅니다.
