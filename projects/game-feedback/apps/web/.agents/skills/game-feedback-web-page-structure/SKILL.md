---
name: game-feedback-web-page-structure
description: Game Feedback 웹(apps/web)에 새 화면·라우트를 추가하거나 `src/app/[locale]` 라우트 어댑터와 페이지별 Topbar 조립, `_pages` slice의 `index.ts`/`index.server.ts` 경계, 첫 문서 데이터(blockUntilReady·initialDocumentData)와 클라이언트 이동 스트리밍, proxy 문서 접근 404, 메타데이터·JSON-LD·사이트맵·OG, 라우트 오류 경계, FSD lint 오류를 다룰 때 사용한다.
---

공통 레이어·이름·React Query 규칙은 프로젝트 `game-feedback-code-style`, 검증은 `game-feedback-test` 스킬을 따른다. 링크·뒤로 가기·locale은 `game-feedback-web-navigation`, 조회 캐시는 `game-feedback-web-server-state` 스킬이다. Next 16.4 API(`next/root-params`, `next/error`의 `catchError`, error 경계의 `retry`, 세그먼트 `instant`)는 `projects/game-feedback/node_modules/next/dist/docs`에서 확인한다.

## 구성

- `next.config.mjs`: `cacheComponents`·`partialPrefetching`·`skipProxyUrlNormalize`가 켜져 있다. 브라우저 REST는 같은 origin `/api/*` rewrite(`GAME_FEEDBACK_API_URL` → `API_ORIGIN` → `http://127.0.0.1:4300`)를 탄다. `headers()`는 모든 경로에 `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`(카메라·마이크·위치 등 미사용 기능 차단)를 붙인다(`e2e/security-headers.spec.ts`). nonce CSP는 PPR 정적 셸과 함께 쓸 수 없어 script/style/connect를 제한하는 CSP는 두지 않는다. 브라우저 기능이나 외부 로드를 추가하면 이 헤더와 충돌하는지 확인한다.
- `src/app/[locale]/layout.tsx`가 `rootLocale()`로 locale을 검증하고 `RootDocument` → `CommunityShell`을 그린다. 라우트의 locale은 `await rootLocale()`, 동적 id는 `params`에서 읽는다.
- `[locale]`은 `children`만 받는다. `CommunityShell`은 채팅 연결·읽지 않은 개수·이동 기록·공통 하단 메뉴를 유지한다. 각 `_pages/<screen>`이 `<CommunityPage locale={locale} topbar={<ScreenTopbar ... />}>`로 자신의 상단바와 본문을 조립한다. 공통 Topbar 요소는 widgets에 두고 페이지별 순서·제목·동작은 해당 페이지가 소유한다. 병렬 `@topbar` 라우트와 헤더 전용 공개 export는 만들지 않는다. 글쓰기는 `topbar={null}`이다.
- `src/proxy.ts`(matcher `/`, `/ko|en|ja/:path*`): `/` 리다이렉트(`q`·`tab`만 유지), `/<locale>/admin` 404, 문서 요청(`rsc` 헤더 없음)은 `documentUnavailable` 검사 후 `/<locale>/unavailable`로 404 rewrite, 그 외에는 `x-game-feedback-navigation` 헤더(RSC 이동이면 `1`)를 붙인다. 게시글 상세 판정(`features/post/api/post-access.server.ts`)은 렌더의 `getServerPost`와 같은 규칙(공개 상세 + 로그인이면 차단 목록)이다. Proxy는 `'use cache'`를 실행하지 못하므로 공개 조회 결과만 프로세스 안에 30초·500개까지 기억하고, 차단 목록은 매번 받는다. 그 사이 삭제·숨김된 글은 렌더가 태그 캐시로 다시 막는다. Proxy에서는 `'use cache'`가 든 `index.server`가 아니라 이 모듈을 직접 가져온다.
- `_app/providers/service-context.server.ts`의 `serviceContext()`(`'use cache: private'`)가 세션·테마·언어·`navigation`을 한 번에 읽는다. 요청 쿠키는 여기와 `shared/api/server.ts`의 `serverRequestOptions()`만 읽는다.

## 첫 문서와 클라이언트 이동

- 공개 목록(피드·게시판·검색): 라우트가 `blockUntilReady={!(await isClientNavigation())}`를 넘기고 `<Screen>Route`(server)가 `initialDocumentData(snapshot(), blockUntilReady)`로 값 또는 Promise를 만든다. 첫 문서는 목록까지 완성된 HTML(JavaScript 없이 읽힘), RSC 이동은 Promise를 넘겨 목록만 스켈레톤으로 스트리밍한다.
- 클라이언트 화면은 `initial: T | Promise<T>`를 받아 `'then' in initial ? use(initial) : initial`로 읽고, 감싸는 `AsyncBoundary`에 `suspense={'then' in initial}`를 준다(`FeedPage`·`BoardsPage`·`SearchPage`). blocking 중 snapshot이 실패하면 rejected Promise가 넘어가 그 영역 경계만 실패한다.
- snapshot 타입은 `_pages/<screen>/model/`(`feed-snapshot.type.ts`, `board-snapshot.type.ts`, 검색은 `search-query.ts`의 `ISearchSnapshot`)에 두고 `viewerId`를 넣는다. 클라이언트 조회의 `initialData` 조건은 `server-state` 스킬.
- 공개 상세/프로필(`posts/[id]`, `users/[id]`)은 `DocumentContent`로 감싼다: 첫 문서는 Suspense 없이 완성하고 이동 때만 `fallback`을 쓴다. 상세의 `PostDocument`는 본문 경계 밖에서 헤더를 조립하고 `streamHeader={await isClientNavigation()}`를 받아 이동 때만 `Suspense fallback={<PostTopbarPlaceholder locale={locale} />}`로 실제 게시판 경로를 기다린다. 첫 문서는 헤더도 Suspense 없이 실제 게시판 경로를 완성한다. 동적 `params`는 헤더·본문의 비동기 자식 안에서 읽고 페이지 프레임을 그리기 전에 기다리지 않는다. `ProfileDocument`도 본문 경계 밖에서 프로필 헤더를 조립한다.
- 첫 문서를 의도적으로 완성해서 보내는 라우트(피드·게시판 5종·상세·프로필·가이드·약관·개인정보·문의, `[locale]/layout.tsx`)는 `export const instant = false`로 instant 검증 피드백에서 뺀다. 이동 셸은 `test:prefetch`의 `instant()`가 따로 검증한다.
- 나머지 화면은 `async function RouteContent(…)`를 `<Suspense fallback={<LoadingState />}>`로 감싼 default export다. `searchParams`·`rootLocale()`을 Suspense 밖에서 기다리지 않는다.
- 쿠키에 의존하고 서버 초기 데이터가 없는 영역(알림·채팅·내 글·팔로우·글쓰기 폼)은 `AsyncBoundary clientOnly`다. 로그인 여부는 화면에서 `useSession()`으로 분기한다. proxy에 로그인 게이트를 두지 않는다.

## 새 화면 순서

1. `packages/bridge/src/routes.ts`의 `appRoutes`·`resolveAppRoute`(경로 정규식·`TAppScreen`·parent)에 화면을 더하고 `routes.spec.ts`를 고친다. 등록하지 않은 경로는 셸 메뉴 활성, 뒤로 가기, 네이티브 `location` 보고에서 인식되지 않는다.
2. `src/_pages/<screen>/`에 `ui/<Screen>Page.tsx`('use client'), 필요하면 `ui/<Screen>Topbar.tsx`와 `model/`을 둔다. `index.ts`는 클라이언트 export만, 서버 조회·메타데이터는 `index.server.ts(x)`(`import 'server-only'`)에서만 공개하고 `index.ts`에 재수출하지 않는다.
3. `src/app/[locale]/<path>/page.tsx`는 어댑터만 둔다: locale·`params`·`searchParams`를 읽어 `_pages` 진입점에 넘긴다. 라우트는 `_app`·`_pages`·`shared`만 import한다(`fsd/layer-imports`). features 서버 조회는 `_pages/<screen>/index.server.ts` 안에서 `@/features/<d>/index.server`로 부른다(`.server`·`.schema`·`types/`는 slice deep import 허용). 게시판 5종처럼 여러 라우트가 같은 조합을 쓰면 `_app/routing/BoardDocument.tsx`처럼 `_app/index.server.ts`로 공개한다.
4. 페이지 slice 안에서 `CommunityPage`에 전용 Topbar와 본문을 함께 선언한다. 본문 대기·오류 경계가 Topbar를 가리지 않도록 배치하고, 대화 목록·대화 상세처럼 화면 수명이 이어지는 경우 페이지 slice의 layout이 조립을 소유한다.
5. 메타데이터: 고정 화면은 `shared/seo/metadata.ts`의 `pageContent`에 항목을 더하고 `staticPageMetadata(kind, locale)`, 동적 화면은 `createPageMetadata`. 로그인 전용·검색은 `privatePage: true`(noindex). 크롤 차단 경로는 `_app/seo/discovery.server.ts`의 `robots`.
6. 동적 id 공개 문서를 추가하면 `_app/seo/document-access.server.ts`의 경로 정규식에도 넣는다. PPR이 `notFound()`보다 HTML 헤더를 먼저 보낼 수 있어 render 안의 판정만으로는 404 상태를 보장하지 못한다(render는 권한을 다시 확인한다). 서버 조회는 `features/<d>/api/*.server.ts`에서 React `cache()`로 감싸 page와 `generateMetadata`가 같은 요청을 쓰게 한다(`getServerPost`: id 형식·404 → `notFound()`).
7. 새 문구는 `messages.ts`에 번역을 더한다(`navigation` 스킬). `typecheck`(`next typegen` 포함)·`lint`와 관련 e2e를 돌린다.

## 오류 경계

- 라우트 `error.tsx`는 `RouteError`(`_app/errors`)를 재수출하며 Next의 `retry` prop을 쓴다. 문서 부트스트랩 실패는 `_app/ui/BootstrapBoundary.tsx`(`catchError`)가 자체 `<html>`·QueryClient로 그린다.
- 화면 안은 `ServiceErrorBoundary`(`title`, `resetKey`, `refreshOnRetry`)·`AsyncBoundary`로 영역을 나눈다. `resetKey`에 사용자 id와 조회 조건을 넣어 계정·필터가 바뀌면 리셋되게 한다. `CommunityPage`가 상단바·탐색 메뉴·본문을, `CommunityShell`이 공통 하단을 각각 감싸므로 화면 하나의 실패가 셸을 지우지 않는다.
- 서버 컴포넌트의 예상 실패는 `notFound()`로 처리한다(잘못된 board·game·필터 조합, id `^[A-Za-z0-9_-]{1,100}$` 위반).

## SEO·발견

- origin은 `GAME_FEEDBACK_SITE_URL`(없으면 `WEB_ORIGIN`)이다. 색인은 production + `GAME_FEEDBACK_INDEXING=true` + 데모 아님 + HTTPS 비로컬일 때만 켠다(`shared/seo/config.ts`). canonical은 guide·terms·privacy·contact만 locale을 유지하고 나머지는 `/ko`다.
- JSON-LD는 `JsonLd`·`PublicPageJsonLd`(`shared/seo`), `/og`는 `_app/seo/ShareImage.tsx`, 사이트맵은 `dailySitemap`(`'use cache'`)을 `connection()` 뒤에 부른다. 테스트 계정 글·작성자는 사이트맵과 색인에서 빠진다.
- `/health-check/live`는 `src/app/health-check/live/route.ts`다. 배포 compose healthcheck와 공용 인스턴스 배포 스크립트가 쓴다. 라우트 폴더는 `_` 접두나 URL 인코딩 이름 없이 kebab-case로 짓는다(`_` 접두 폴더는 private).

## 확인 (side 루트)

```sh
corepack yarn workspace @game-feedback/web typecheck
corepack yarn workspace @game-feedback/web lint
corepack yarn workspace @game-feedback/web test src/shared/seo src/_app/seo
corepack yarn workspace @game-feedback/web test:e2e e2e/seo.spec.ts e2e/error-boundary.spec.ts
corepack yarn workspace @game-feedback/web test:prefetch   # 피드·게시판·안내 이동 셸을 바꿨을 때
```
