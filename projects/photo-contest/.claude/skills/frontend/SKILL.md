---
name: frontend
description: 웃긴순간 웹(apps/web)의 화면·기능 slice 배치, 모바일 레이아웃, Apollo 캐시, 오버레이·폼, 인증 게이트, 앱 브리지 연동을 추가하거나 고칠 때 사용한다.
---

## 레이어 (src 바로 아래, `modules` 단계 없음)

| 폴더 | 역할 | import 별칭 |
| --- | --- | --- |
| `src/app` | Next 라우트 파일만. 화면은 slice 배럴에서 가져온다 | — |
| `src/_app` | providers(Apollo·Bridge·Toast·overlay-kit), styles(tailwind.css·theme.css·globals.css) | `@/_app/…` |
| `src/_pages` | 화면 하나 = slice 하나 | `@/_pages/…` |
| `src/widgets` | 모든 화면에 붙는 UI만(하단 탭) | `@/widgets/…` |
| `src/features` | 서버 도메인 slice(group, contest, submission, like, vote, moderation, invite, share…) | `@/features/…` |
| `src/shared` | 도메인 없는 기반(api, ui/@core, model, lib, constants) | `@/shared/…` |

- 의존 방향은 `_app → _pages → widgets → features → shared`. 위로 import하지 않는다. 다른 slice는 `index.ts`로만, 화면 slice끼리는 import하지 않는다. 저장소 루트의 `packages/eslint-config/src/fsd-boundaries.ts`가 막는다(`types/`·`mocks/`·`*.schema`·`*.server`만 깊은 import 허용).
- `_app`·`_pages`의 밑줄은 Next `app`·`pages` 라우터와 겹치지 않게 하려는 것이다.
- 배치: 한 화면에서만 → `_pages/<screen>`, 도메인 + 두 화면 이상 → `features/<domain>`, 도메인 없음 → `shared`. 두 번째 사용처가 생기기 전에 미리 내리지 않는다.
- 화면 slice: `@page/<Screen>PageTemplate.tsx`가 조립하고, 화면 전용 조각은 `@page/ui`, `@page/bottom-sheet`, `@page/model`, 섹션 폴더(`@page/results/` 등)에 둔다. 하위 화면이 같이 쓰는 것만 `@ui`·`@model`·`@lib`로 올린다.
- feature slice 세그먼트: `api/<domain>.graphql`, `model/<domain>.cache.ts`·`<domain>.type-policies.ts`·`<domain>.schema.ts`·`*.hook.ts`, `lib/*.helper.ts`, `types/`, `ui/`, `index.ts`(쓰는 이름만 명시 export). slice 안에서는 상대 경로로, 자기 배럴을 import하지 않는다.
- 파일 이름: 컴포넌트는 PascalCase(`PhotoCard.tsx`), 나머지는 kebab-case + 역할 접미사(`.hook.ts`, `.helper.ts`, `.schema.ts`, `.cache.ts`, `.type.ts`, `.server.ts`). 시트는 `XxxBottomSheet`.

현재 제품의 갤러리는 상시 게시판이다. 홈은 전체 가입 갤러리의 최신 게시물·이달의 인기, MY는 갤러리 목록·생성이다. post feature가 파일 등록·미디어 카드·좋아요·삭제·정렬별 캐시를 소유한다. 고정 메뉴는 배열 map 대신 JSX로 직접 선언한다.

## 이벤트 핸들러

한 곳에서만 쓰는 핸들러는 `onClick={async () => { … }}`처럼 JSX prop에 인라인으로 선언한다. 폼도 `onSubmit={form.handleSubmit(async (values) => { … })}`로 연결한다. 여러 곳에서 재사용할 때만 `handle*` 함수로 분리한다. 콜백 prop 이름은 `on*`를 쓴다.

## 상태

- 서버 상태는 Apollo 정규화 캐시가 단일 출처다. 받은 데이터를 useState로 복제하지 않는다. 자식에는 DTO 대신 id를 넘기고 같은 Document/fragment로 다시 읽는다.
- 쿼리 식별자는 codegen Document(+ variables)다. 문자열 `refetchQueries`, `cache.modify`의 필드명 문자열은 `model/*.cache.ts` helper 밖에서 쓰지 않는다(typed `cache.updateQuery`·`cache.evict`).
- typePolicies는 도메인 파일에 두고 shared에서 Query 필드까지 깊게 합친다. 사진 목록은 `contestId`+`sort`별로 나누고 offset으로 이어 붙인다. 목록에서 빼려면 `cache.evict`(updateQuery는 merge가 되살린다).
- 조건부 쿼리는 `skipToken`. 
- **오버레이 열림·mutation 오류를 useState로 들지 않는다(ESLint가 막는다).** 시트·다이얼로그는 `overlay.open(({ isOpen, close, unmount }) => <XxxBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} />)`로 열고, 진행·실패는 `useMutation`의 `loading`/`error`와 공통 ErrorLink 토스트로 보여 준다. `mutate()`는 try/catch로 감싸고 토스트가 이미 났으면 catch를 비운다.
- 폼은 `useZodForm(schema)` + `model/*.schema.ts`. 렌더에서 값을 읽을 때는 `useWatch`, 핸들러에서는 `getValues`.
- 단계(Phase)처럼 닫힌 집합 분기는 ts-pattern `match(...).exhaustive()`, nil 검사는 es-toolkit.

## 모바일 레이아웃

- 화면은 `#pc-root` > `main#pc-main`의 반응형 웹 영역(`max-w-web` 1200px)에 그린다. 상시 게시물은 모든 화면에서 최대 540px의 큰 1열 피드다. `desktop:`(1024px)부터 왼쪽 고정 메뉴·중앙 피드·오른쪽 인기 사진을 쓰며, 그보다 좁으면 하단 탭과 피드 위의 가로 인기 사진을 쓴다. 이전 대회 피드의 격자는 유지한다. 오버레이는 `#pc-main` 안에 띄우고 시트·폼은 `max-w-app`(540px)로 제한한다.
- 높이는 dvh(100vh·min-h-screen 금지). 안전 영역은 브라우저에서 웹이 `env(safe-area-inset-*)`로, 앱 WebView에서는 네이티브가 맡는다(웹이 따로 하지 않는다).
- 누를 영역 44px 이상(주 버튼 50px), 탭 피드백은 `active:`. 입력 글자 16px 이상(iOS 확대 방지). 확대(pinch)는 막지 않는다.
- 공통 조각: `TopAppBar`(뒤로 가기·제목·액션), `StickyCta`(하단 고정 주 버튼, safe-bottom), `BottomNav`(홈·MY 화면에만, 입력 중 숨김), `BottomSheet`, `ConfirmDialog`, `Toast`, `Skeleton`·`EmptyState`·`ErrorState`.
- 색·글자·그림자·z-index는 `theme.css` 토큰만 쓴다(임의 hex·`!` 유틸 금지).

## 인증·이동

- `src/proxy.ts`가 요청 쿠키에 `contest_session`이 없으면 `/groups/*`·`/contests/*`·`/me`를 `/?next=<경로>`로 보낸다. 쿠키가 있어도 만료일 수 있으니 화면은 Me가 없으면 로그인 패널을 보여 준다.
- 로그인·로그아웃 뒤에는 `navigateDocument`(문서 이동)로 Apollo 캐시를 버린다. `next`는 `getSafeNextPath`를 거친 같은 origin 상대 경로만 쓴다.
- 서버 데이터는 라우트 RSC의 `PreloadQuery`(`shared/api/apollo-client.server.ts`, 요청 Cookie 헤더를 API로만 전달)로 받는다. Cookie 원문을 props·캐시·로그에 넣지 않는다.
- 내부 경로는 `ROUTES`, 백엔드 경로는 `BACKEND_ROUTES`만 쓴다. 앱 안 기록이 없으면(카톡 링크로 바로 들어온 경우) 뒤로 가기는 상위 화면으로 간다.

## 앱 WebView 연동

- `useBridge()`·`useNativeApp()`(hydration 안전)·`useShareLink()`(앱 → Web Share → 복사)·`useHaptics()`·`useExternalLink()`를 쓴다. 앱이 지원하지 않는 기능(`supports` false)은 웹 기능으로 대신한다.
- 앱 감지(`html[data-app]`, User-Agent `PhotoContestApp/x.y.z`)는 화면 모양에만 쓰고 권한 판단에 쓰지 않는다.
- 메시지를 추가·변경할 때는 `bridge` 스킬을 따른다.
