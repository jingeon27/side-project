# Engineering Blog

한국어·영어 UI와 Git 기반 MDX 콘텐츠를 지원하는 개인 기술 블로그입니다. Next.js 16, React 19, next-intl, Shiki를 사용합니다. 별도 API나 데이터베이스는 필요하지 않습니다.

기존 `resume/blog` 항목과 연결되는 **공개 티스토리 글 27편**을 이관하고, 편집한 한국어 본문을 기준으로 영문 번역 27편을 추가했습니다. 제목·설명·본문·목차·이미지 설명은 언어별로 제공하며, 같은 글에서 언어를 전환할 수 있습니다. 원문 링크와 검증 기록은 [마이그레이션 문서](docs/migration.md)에 있습니다.

이전한 글 외에 [사이드 프로젝트 저장소를 만들고 서비스를 늘려 간 과정](apps/web/content/posts/side-project-design/ko.mdx)을 한국어와 영어로 추가했습니다. 신규 글도 같은 콘텐츠 ID, 언어별 SEO와 본문, 글별 썸네일을 사용합니다.

## 로컬 실행

저장소 루트에서 Node.js 24와 Yarn 4를 사용합니다.

```bash
corepack enable
yarn install --immutable
cp projects/blog/apps/web/.env.example projects/blog/apps/web/.env.local
yarn workspace @blog/web dev
```

`http://localhost:3100/ko`에 접속합니다. `/en/blog`에서 영문 글 목록을 볼 수 있습니다. `/en`, `/ko/blog`, `/ko/about`, `/rss/ko`, `/rss/en`, `/sitemap.xml`, `/robots.txt`도 지원합니다. 사이트맵과 수집 규칙은 빌드할 때 자동 생성하며, 배포 전 `SITE_URL`에 실제 도메인을 설정합니다. GA와 Sentry 환경변수가 없으면 외부 분석·오류 수집을 초기화하지 않습니다.

## 검증

```bash
yarn workspace @blog/web content:validate
yarn workspace @blog/web typecheck
yarn workspace @blog/web lint
yarn workspace @blog/web test
yarn workspace @blog/web build
yarn workspace @blog/web exec playwright install chromium
yarn workspace @blog/web test:e2e
```

Playwright는 빌드한 서버를 별도 포트 `3101`에서 실행합니다. 실행 중인 개발 서버를 재사용하거나 종료하지 않습니다. 콘텐츠 생성기는 메타데이터·SEO·MDX·내부 링크·리다이렉트를 검증하고 정적 import registry를 생성합니다. 번역 테스트는 두 언어의 코드·이미지·제목 구조·표 크기와 언어별 링크를 확인합니다. 번역이 없는 글의 처리도 별도 fixture로 검증합니다.

## 콘텐츠 작성

1. `apps/web/content/posts/<content-id>/meta.json`에 대표 카테고리, 태그, 발행일을 작성합니다.
2. `ko.mdx` 또는 `en.mdx`를 작성합니다. 두 언어는 독립적으로 발행할 수 있습니다.
3. `apps/web/seo/<locale>.json`의 `posts`에 해당 ID의 제목, 고정 slug, 설명, keywords를 추가합니다.
4. 이미지 파일은 `apps/web/public/images/posts/<content-id>/`에 둡니다.
5. 콘텐츠 검증과 테스트를 실행하고 생성된 registry, index, redirect 변경을 함께 검토합니다.

MDX에는 `Summary`, `Decision`, `Callout`, `Figure`, `CodeBlock`을 사용할 수 있습니다. 그 밖의 JSX, `import`·`export`, `{}` 식과 spread prop은 콘텐츠 검증에서 실패합니다. prop의 식은 `width={640}` 같은 숫자만 허용하며 JSX `src`도 Markdown 이미지처럼 `/images/` 파일 존재나 https 주소를 검사합니다. Markdown 코드 블록은 Shiki로 강조됩니다. `##`·`###` 제목으로 목차를 생성하며 heading과 목차에는 같은 anchor 규칙을 적용합니다.

목록 썸네일은 `meta.json`의 `coverImage`를 우선 사용합니다. 별도 커버가 없으면 `apps/web/src/entities/article/lib/article-thumbnails.ts`에서 지정한 본문 그림이나 주제 도해를 표시합니다. 새 글에 맞는 이미지를 지정하려면 `coverImage` 또는 이 매핑을 추가합니다. 도해 파일은 `apps/web/public/images/thumbnails/`에 둡니다.

Slug는 제목을 고쳐도 유지합니다. 공개 URL을 변경해야 하면 `apps/web/content/redirects.json`에 `{ "locale": "ko", "from": "old-slug", "to": "new-slug" }`을 추가합니다. 기존 URL에서 새 URL로 301을 반환하며 대상 글이 실제로 존재하는지 생성 단계에서 검사합니다. 공개했던 글 주소가 redirect 없이 사라지면 `content:generate`(커밋된 HEAD와 비교)와 `content:validate`(대상 브랜치와의 merge base와 비교, `CONTENT_BASE_REF` → `origin/$GITHUB_BASE_REF` → `origin/develop` 순)가 실패합니다. shallow clone처럼 기준 브랜치가 없으면 HEAD와 비교합니다.

카테고리는 `engineering`, `til`, `perspectives`, `misc` 네 가지입니다. UI 문구는 `messages`, SEO는 `seo`, 본문은 `content/posts`에서 관리합니다. 코드 구조는 `app → widgets → features → entities → shared`이며 범용 `components/` 디렉터리는 만들지 않습니다.

[구현 범위와 실제 검증 결과](docs/implementation.md)를 함께 확인할 수 있습니다.

## 운영 설정

[배포·GA4·Search Console·Sentry 설정](docs/deployment.md)을 따릅니다. 저장소 구현과 로컬 검증만으로 외부 계정, 소유권 확인, 도메인 연결, 실제 배포가 완료되지는 않습니다. 환경변수를 설정하고 실제 서비스에서 확인해야 합니다.
