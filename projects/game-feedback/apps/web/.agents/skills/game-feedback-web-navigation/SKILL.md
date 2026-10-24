---
name: game-feedback-web-navigation
description: Game Feedback 웹(apps/web)에서 링크·뒤로 가기·탭 이동을 만들거나, 게시판·게임 문맥을 상세·글쓰기·검색으로 전달하는 appRoutes, URL이 단일 출처인 필터·검색 상태(useBrowserSearch), locale 경로와 문구 번역(shared/i18n), 앱 WebView의 네이티브 뒤로 가기·열기·로그인 연동을 고칠 때 사용한다.
---

공통 코드 규칙은 프로젝트 `game-feedback-code-style`, 검증은 `game-feedback-test` 스킬을 따른다. 새 라우트 파일 배치는 `game-feedback-web-page-structure` 스킬이다. 경로 정의는 Web·Mobile이 함께 쓰는 `@game-feedback/bridge`(`packages/bridge/src/routes.ts`)가 소유한다.

## 경로와 게시판 문맥

- href는 모두 `appRoutes.<screen>(locale, …)`로 만든다. `/ko/...` 문자열을 조립하지 않는다. 게시판 문맥은 query로 전달한다: `appRoutes.post(locale, id, board, game)`, `appRoutes.compose(locale, board, game, { battleMode, coachingRole })`, `appRoutes.search(locale, { board, game, q, … })`. 기본 게임 `clash-royale`은 query에서 생략된다.
- `resolveAppRoute(path)`가 `{ path, screen, tab, parent, game }`을 돌려준다. `parent`가 논리적 상위 화면이다(게시판에서 연 상세 → 그 게시판, 검색 → 게시판/피드). 중복 query 키·맞지 않는 필터 조합(예: friendly 외의 `battleMode`)은 null이다.
- 게시판 이름·slug·kind는 `features/board`의 `gameBoards`·`boardBySlug`·`boardByKind`, 게임은 활성 카테고리(`getPublicCategories`/`categoryOptions`)에서 온다. 게임별 메뉴를 복제하거나 게임을 하드코딩하지 않는다.
- 상세는 로드 후 실제 게시판·게임과 URL 문맥이 다르면 `PostPage`가 `router.replace(appRoutes.post(…), { scroll: false })`로 맞춘다. canonical 직접 진입도 논리적 상위 게시판으로 돌아가게 하는 장치다.

## 뒤로 가기·탭

- `_app/providers/NavigationHistory.tsx`가 `installBrowserNavigation()`으로 `history.pushState`/`replaceState`를 감싸 `{ index, previous, feed, parent? }`를 state에 남긴다. 화면에서 history state를 직접 만지지 않는다.
- 화면의 돌아가기는 `BackLink`(`@/shared/navigation`)다. `backNavigation()`은 상세류(`post`·`compose`·`profile`·`conversation`)에 앱 안 이전 기록이 있으면 `router.back()`, 없으면(콜드 링크) `parent`로 `router.replace`한다. 피드로 돌아갈 때는 `feedDestination`이 마지막 피드 필터를 복원한다.
- 라우트 정의보다 정확한 상위(글쓰기를 연 게시판·필터)는 `<BackLink logicalParent={parent}>`로 등록한다(`registerLogicalParent`, 언마운트 때 해제). `parentOnly`는 이전 기록이 그 parent일 때만 back한다.
- 링크를 누른 화면이 상위인 목적지(프로필 → 가이드)는 `ChildLink`로 연다. `registerNextLogicalParent`가 다음 push 기록에 `parent`를 남겨, 상세가 아닌 화면도 뒤로 가기(브라우저·앱)가 그 기록으로 돌아간다(`back`). 같은 경로의 replace(필터)는 `parent`를 유지하고 다른 화면으로 replace하면 버린다. 이후 push한 기록은 물려받지 않는다.
- 루트 탭(feed·messages·settings·notifications)은 화면 안의 바로가기에서도 `TabLink`로 연다. 기본 `replace`라 탭 이동이 기록을 쌓지 않고, 피드 탭은 마지막 피드 필터로 돌아간다. 일반 `Link` push로 열면 브라우저·iOS 스와이프는 이전 화면으로, Android 뒤로 가기는 parent로 가서 서로 어긋난다.
- 근거 spec은 `src/shared/navigation/browser-navigation.spec.tsx`다. 이동 규칙을 바꾸면 이 spec과 `e2e/navigation.spec.ts`를 함께 고친다.

## URL 상태

- 피드 탭·검색어·게시판 필터는 URL이 단일 출처다. 피드 탭과 검색어는 `window.history.replaceState`로 RSC 요청 없이 바꾸고(`_pages/feed/model/use-feed-filters.ts`, `_pages/search/model/use-post-search.ts`), 게시판 필터 칩은 `BoardFilterLink`(`TabLink replace`)로 이동한다.
- 목록 화면은 필터를 `useBrowserSearch(initialSearch, pathname)`로 읽는다. 서버 HTML과 hydration은 snapshot으로 만든 `initialSearch`를 써서 URL 때문에 suspend하지 않고, 다른 pathname에 남은 화면은 자기 초기값을 유지한다(`use-browser-search.spec.tsx`). `next/navigation`의 `useSearchParams`는 셸(`CommunityShell`)·`NativeBridge`·`PostPage`에만 있다.
- 잘못된 값은 클라이언트에서 `parseBattleMode`·`parseCoachingRole`·`parseFeedbackStatus`로 기본값 처리하고, 서버 라우트(`BoardsRoute`·`ComposeRoute`·`SearchRoute`)에서는 `notFound()`한다.

## locale·문구

- 지원 locale `ko`·`en`·`ja`는 여러 곳에 고정돼 있다: `shared/i18n/locale.ts`, `[locale]/layout.tsx`의 `generateStaticParams`, `proxy.ts`(matcher·admin 정규식), `_app/seo/document-access.server.ts`, `_app/seo/discovery.server.ts`, `shared/seo/config.ts`·`metadata.ts`, bridge `routes.ts`. 하나만 바꾸지 않는다.
- 첫 진입 언어는 `gf_language` 쿠키(`LANGUAGE_COOKIE`) → `Accept-Language` → en(`preferredLocale`)이다. 선택은 `setLanguagePreference`, 경로 전환은 `localePath(path, locale)`로 상세 경로·query·cursor를 보존한다.
- 문구는 `useI18n().t('<한국어 원문>', { name })`이다. 한국어 원문이 키이며 `shared/i18n/messages.ts`(안내 `info-messages.ts`, 프로필 `profile-messages.ts`)에 `[en, ja]`를 더한다. 빠지면 한국어로 보인다. 서버 메타데이터는 `translate(locale, …)`(`@/shared/i18n/index.server`). 닉네임·글·메시지 원문은 번역하지 않는다.
- e2e는 한국어 접근성 이름으로 찾는다. 원문을 바꾸면 `e2e/*.spec.ts`와 `apps/mobile/e2e/*.spec.ts`(같은 웹 화면을 연다)를 함께 고친다.

## 앱 WebView 연동

- `src/instrumentation-client.ts`가 `nativeBridgeChannel.start()`를 문서 시작 때 부르고 `_app/providers/NativeBridge.tsx`가 경로·overlay 상태와 핸들러를 `bind()`한다. bind 전에 온 `open`·`active`는 보관했다가 처리한다.
- `isNativeApp()`은 `window.__GAME_FEEDBACK_APP__.protocol === 1`과 `ReactNativeWebView`가 모두 있을 때만 true다. 메시지는 bridge의 `WebMessageSchema`·`NativeMessageSchema`로만 주고받는다.
- 네이티브 back 처리 순서: 열린 Select·DropdownMenu 팝업에 Escape → 열린 overlay 닫기(`needsOnboarding`이면 닫지 않음) → `backNavigation()` 결과(back/replace/root/unhandled). 새 팝업 종류를 만들면 `shared/native/native-bridge-channel.ts`의 `data-slot` 선택자에 걸리는지 확인한다.
- 앱 복귀(`state: active`)는 `useRefreshSession`으로 세션을 다시 읽고 계정이 바뀌었으면 캐시를 교체한다. 앱 소셜 로그인은 `requestNativeLogin`(auth-request → auth-result, 180초 제한) → `postAppExchange`다. 앱은 코드를 검증된 https 앱 링크 `/app-auth/callback`으로 받는다. 이 경로는 화면 경로(`appRoutes`)가 아니며 웹에서 링크하지 않는다.
- 데스크톱 키보드 판정(`useDesktopKeyboard`)은 앱 안에서 항상 false다. 앱 Enter는 줄바꿈이다.
- 단위 테스트는 `src/shared/native/native-bridge-channel.spec.tsx`, 실제 WebView 흐름은 `apps/mobile` e2e(Web 3302)가 검증한다.

## 확인 (side 루트)

```sh
corepack yarn workspace @game-feedback/web test src/shared/navigation src/shared/i18n src/shared/native
corepack yarn workspace @game-feedback/bridge test
corepack yarn workspace @game-feedback/web test:e2e e2e/navigation.spec.ts e2e/language.spec.ts
```
