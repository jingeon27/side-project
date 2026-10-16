# Engineering Blog

한국어·영어 UI와 Git 기반 MDX 콘텐츠를 지원하는 개인 기술 블로그입니다. Next.js 16, React 19, next-intl, Shiki를 사용합니다. 별도 API나 데이터베이스는 필요하지 않습니다.

기존 `resume/blog` 항목과 연결되는 **공개 티스토리 글**을 이관했습니다. 공개된 본문과 발행 시각을 기준으로 가져왔으며, 원문 링크와 검증 기록은 [마이그레이션 문서](docs/migration.md)에 있습니다. 영어 본문은 작성되지 않았으므로 영어 목록에 빈 상태를 표시하며 한국어 본문을 영어 URL로 공개하지 않습니다.

## 로컬 실행

저장소 루트에서 Node.js 24와 Yarn 4를 사용합니다.

```bash
corepack enable
yarn install --immutable
cp projects/blog/apps/web/.env.example projects/blog/apps/web/.env.local
yarn workspace @blog/web dev
```

`http://localhost:3100/ko`에 접속합니다. `/en`, `/ko/blog`, `/ko/about`, `/rss/ko`, `/rss/en`, `/sitemap.xml`도 지원합니다. GA와 Sentry 환경변수가 없으면 외부 분석·오류 수집을 초기화하지 않습니다.

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

Playwright는 빌드한 서버를 별도 포트 `3101`에서 실행합니다. 실행 중인 개발 서버를 재사용하거나 종료하지 않습니다. 콘텐츠 생성기는 메타데이터·SEO·MDX·내부 링크·리다이렉트를 검증하고 정적 import registry를 생성합니다. 단위 테스트에는 실제 번역이 있는 임시 콘텐츠 fixture를 사용하고, 공개 콘텐츠의 영어 버전은 만들지 않습니다.

## 콘텐츠 작성

1. `apps/web/content/posts/<content-id>/meta.json`에 대표 카테고리, 태그, 발행일을 작성합니다.
2. `ko.mdx` 또는 `en.mdx`를 작성합니다. 두 언어는 독립적으로 발행할 수 있습니다.
3. `apps/web/seo/<locale>.json`의 `posts`에 해당 ID의 제목, 고정 slug, 설명, keywords를 추가합니다.
4. 이미지 파일은 `apps/web/public/images/posts/<content-id>/`에 둡니다.
5. 콘텐츠 검증과 테스트를 실행하고 생성된 registry, index, redirect 변경을 함께 검토합니다.

MDX에는 `Summary`, `Decision`, `Callout`, `Figure`, `CodeBlock`을 사용할 수 있습니다. Markdown 코드 블록은 Shiki로 강조됩니다. `##`·`###` 제목으로 목차를 생성하며 heading과 목차에는 같은 anchor 규칙을 적용합니다.

Slug는 제목을 고쳐도 유지합니다. 공개 URL을 변경해야 하면 `apps/web/content/redirects.json`에 `{ "locale": "ko", "from": "old-slug", "to": "new-slug" }`을 추가합니다. 기존 URL에서 새 URL로 301을 반환하며 대상 글이 실제로 존재하는지 생성 단계에서 검사합니다.

카테고리는 `engineering`, `til`, `perspectives`, `misc` 네 가지입니다. UI 문구는 `messages`, SEO는 `seo`, 본문은 `content/posts`에서 관리합니다. 코드 구조는 `app → widgets → features → entities → shared`이며 범용 `components/` 디렉터리는 만들지 않습니다.

[구현 범위와 실제 검증 결과](docs/implementation.md)를 함께 확인할 수 있습니다.

## 운영 설정

[배포·GA4·Search Console·Sentry 설정](docs/deployment.md)을 따릅니다. 저장소 구현과 로컬 검증만으로 외부 계정, 소유권 확인, 도메인 연결, 실제 배포가 완료되지는 않습니다. 환경변수를 설정하고 실제 서비스에서 확인해야 합니다.
