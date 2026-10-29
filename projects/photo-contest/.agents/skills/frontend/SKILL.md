---
name: frontend
description: 웃긴순간 웹(apps/web)의 화면·기능 slice 배치, 모바일 레이아웃, Apollo 캐시, 오버레이·폼, 인증 게이트, 앱 브리지 연동을 추가하거나 고칠 때 사용한다.
---

## 레이어 (src 바로 아래, `modules` 단계 없음)

| 폴더 | 역할 | import 별칭 |
| --- | --- | --- |
| `src/app` | Next 라우트 파일만. 화면은 slice 배럴에서 가져온다 | — |
| `src/_app` | providers(Apollo·Bridge·Toast·overlay-kit), shell(레이아웃이 감싸는 공통 틀), styles(tailwind.css·theme.css·globals.css) | `@/_app/…` |
| `src/_pages` | 화면 하나 = slice 하나 | `@/_pages/…` |
| `src/widgets` | 모든 화면에 붙는 UI만(하단 탭·데스크톱 고정 메뉴) | `@/widgets/…` |
| `src/features` | 서버 도메인 slice(group, contest, submission, like, vote, moderation, invite, share…) | `@/features/…` |
| `src/shared` | 도메인 없는 기반(api, ui/@core, model, lib, constants) | `@/shared/…` |

- 의존 방향은 `_app → _pages → widgets → features → shared`. 위로 import하지 않는다. 다른 slice는 `index.ts`로만, 화면 slice끼리는 import하지 않는다. 저장소 루트의 `packages/config/eslint/src/fsd-boundaries.ts`가 막는다(`types/`·`mocks/`·`*.schema`·`*.server`만 깊은 import 허용).
- `_app`·`_pages`의 밑줄은 Next `app`·`pages` 라우터와 겹치지 않게 하려는 것이다.
- 배치: 한 화면에서만 → `_pages/<screen>`, 도메인 + 두 화면 이상 → `features/<domain>`, 도메인 없음 → `shared`. 두 번째 사용처가 생기기 전에 미리 내리지 않는다.
- 화면 slice: `@page/<Screen>PageTemplate.tsx`가 조립하고, 화면 전용 조각은 `@page/ui`, `@page/bottom-sheet`, `@page/model`, 섹션 폴더(`@page/results/` 등)에 둔다. 하위 화면이 같이 쓰는 것만 `@ui`·`@model`·`@lib`로 올린다.
- feature slice 세그먼트: `api/<domain>.graphql`, `model/<domain>.cache.ts`·`<domain>.type-policies.ts`·`<domain>.schema.ts`·`*.hook.ts`, `lib/*.helper.ts`, `types/`, `ui/`, `index.ts`(쓰는 이름만 명시 export). slice 안에서는 상대 경로로, 자기 배럴을 import하지 않는다.
- 파일 이름: 컴포넌트는 PascalCase(`PhotoCard.tsx`), 나머지는 kebab-case + 역할 접미사(`.hook.ts`, `.helper.ts`, `.schema.ts`, `.cache.ts`, `.type.ts`, `.server.ts`). 시트는 `XxxBottomSheet`.

현재 제품의 그룹은 상시 게시판이다. 홈은 전체 가입 그룹의 최신 게시물·이달의 인기, MY는 가입 그룹 목록·생성이며 `/sign`에서 익명·회원 세션을 만든 뒤 `/explore`에서 그룹을 탐색·검색한다. 공개 그룹은 익명 감상, 비공개 그룹은 OWNER·MODERATOR 승인 후 감상이며 가입·글쓰기·반응 상태는 Apollo의 GroupAccess를 읽는다. post feature가 파일 등록·미디어 카드·좋아요·삭제·정렬별 캐시를 소유한다. 고정 메뉴는 배열 map 대신 JSX로 직접 선언한다.

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

## 상수 표와 분기 (satisfies · ts-pattern)

- 설정·조회 표로 쓰는 모듈 상수(경로, 메뉴, 상태·단계 → 문구, 한도, 선택지, Apollo type policy, cva 옆 표)는 `const X: T = { … }` 대신 `const X = { … } satisfies T`로 모양만 검사하고 선언한 타입을 남긴다. 리터럴 타입이 필요하면 `as const satisfies T`, `as const`만 있는 상수에도 의도한 모양을 붙인다.
- 유니온·enum을 키로 하는 표는 `satisfies Record<TUnion, V>`로 두어 빠지거나 남는 키가 타입 검사에서 걸리게 한다(예: `MEDAL_CLASS_NAME`, `PHOTO_SORT`).
- 타입 있는 인자·JSX prop에 바로 넘기는 객체, 테스트 fixture, 호출자가 기대는 export 타입(넓은 키로 색인하는 `Record<number, …>`, 상태 초기값)은 그대로 둔다. Next가 읽는 라우트 export(`config`, `metadata`, `viewport`)도 프레임워크 타입 주석을 유지한다.
- 같은 판별값(대회 단계·역할·공개 범위·상태·종류·오류 코드)으로 3갈래 이상 나누는 if·삼항, 중첩 삼항, 닫힌 유니온의 switch는 `match(x).with(…).exhaustive()`로 쓴다. 우선순위가 있는 여러 조건은 `match({ selected, mine })`처럼 객체 패턴을 위에서부터 고르고 마지막 갈래까지 패턴으로 적는다. `.otherwise()`는 문자열·숫자·배열 같은 열린 입력이나 '나머지 전부'가 의도일 때만 쓴다.
- 단순 가드·조기 반환, 조건 하나짜리 if, 터치 이동처럼 매 프레임 도는 경로, 루프 안 `continue`·`return` 흐름은 일반 코드로 둔다.
- 앱(`apps/mobile`)과 앱 번들에 함께 들어가는 `packages/bridge`에는 ts-pattern을 넣지 않는다(mobile 스킬). 그쪽 닫힌 분기는 `satisfies Record<…>` 표나 판별 유니온 좁히기로 검사한다.

## 모바일 레이아웃

- 화면은 `#pc-root` > `main#pc-main`의 화면 전체 폭을 사용하는 반응형 웹 영역에 그린다. 데스크톱 셸에 `max-w-web`을 적용하지 않으며 홈·탐색·MY 목록은 남은 콘텐츠 폭을 채운다. 상시 게시물은 모바일·태블릿 최대 540px, 데스크톱 최대 680px의 1열 피드다. `desktop:`(1024px)부터 왼쪽 고정 메뉴·중앙 피드·오른쪽 인기 사진을 쓰며, 그보다 좁으면 하단 탭과 피드 위의 인기 목록을 쓴다. 인기 목록은 모든 기기에서 순위·64px 사진·내용 순서로 한 줄씩 표시한다. 이전 대회 피드의 격자는 유지한다. 오버레이 portal은 `#pc-main`에 둔다. 입력 오버레이는 같은 DOM을 CSS 미디어 쿼리로 768px 미만에서는 하단 시트, 그 이상에서는 중앙 모달로 표시한다. 헤더 X 대신 하단에 취소·제출 버튼을 같은 너비의 가로 행으로 둔다. 일반 화면의 로그인 폼은 `max-w-app`(540px)을 쓴다.
- 높이는 dvh(100vh·min-h-screen 금지). 안전 영역은 브라우저에서 웹이 `env(safe-area-inset-*)`로, 앱 WebView에서는 네이티브가 맡는다(웹이 따로 하지 않는다).
- 누를 영역 44px 이상(주 버튼 50px), 탭 피드백은 `active:`. 입력 글자 16px 이상(iOS 확대 방지). 확대(pinch)는 막지 않는다.
- 공통 조각: `TopAppBar`(뒤로 가기·제목·액션), `StickyCta`(하단 고정 주 버튼, safe-bottom), `BottomNav`(홈·MY 화면에만, 입력 중 숨김), `BottomSheet`, `ConfirmDialog`, `Toast`, `Skeleton`·`EmptyState`·`ErrorState`.
- 색·글자·그림자·z-index는 `theme.css` 토큰만 쓴다(임의 hex·`!` 유틸 금지).

## 클래스 variant (class-variance-authority)

- 켜짐/꺼짐 하나(좋아요·읽음·내 것)는 cva를 만들지 않고 `cn('…', liked && 'fill-current')`처럼 조건으로 쓴다. 접근성 상태가 있으면 `aria-pressed:`·`data-*:` 변형으로 꾸민다.
- 앱 전용 컴포넌트가 variant 축이 2개 이상이거나 한 축에 값이 3개 이상이고 여러 곳에서 쓰이면 컴포넌트 옆 `*.variants.ts`에 cva로 두고 `VariantProps` 타입을 export한다. 본보기는 `shared/ui/@core/like-toggle/like-toggle.variants.ts`(자리별 density)다. 동작(mutation·낙관적 응답·진동)은 variant 컴포넌트에 넣지 않고 쓰는 쪽에 둔다.
- 버튼·칩·배지·아이콘 버튼처럼 도메인 없는 일반 모양은 앱에서 cva로 다시 만들지 않고 `@side/design-system`에 variant를 더한다. 앱이 디자인 시스템 primitive를 갈라 쓰지 않는다.

## 인증·이동

- `src/proxy.ts`가 콘텐츠 화면에서 세션 쿠키(운영 `__Host-contest_session`, 개발 `contest_session`)가 없으면 `/sign?next=<경로>`로 보낸다. AuthSessionSync는 만료된 세션도 같은 화면으로 보낸다. `/sign`은 첫 방문에 익명 시작·로그인·회원가입, 기존 익명 사용자에게는 세션을 유지해 홈으로 돌아가는 익명 계속하기를 제공한다. 비공개 그룹은 익명으로 이용할 수 없다는 모달을 확인한 뒤 로그인한다.
- 로그인·로그아웃 뒤에는 `navigateDocument`(문서 이동)로 Apollo 캐시를 버린다. `next`는 `getSafeNextPath`를 거친 같은 origin 상대 경로만 쓴다.
- 서버 데이터는 라우트 RSC의 `PreloadQuery`(`shared/api/apollo-client.server.ts`, 요청 Cookie 헤더를 API로만 전달)로 받는다. Cookie 원문을 props·캐시·로그에 넣지 않는다.
- 내부 경로는 `ROUTES`, 백엔드 경로는 `BACKEND_ROUTES`만 쓴다. 앱 안 기록이 없으면(카톡 링크로 바로 들어온 경우) 뒤로 가기는 상위 화면으로 간다.

## 앱 WebView 연동

- `useBridge()`·`useNativeApp()`(hydration 안전)·`useShareLink()`(앱 → Web Share → 복사)·`useHaptics()`·`useExternalLink()`를 쓴다. 앱이 지원하지 않는 기능(`supports` false)은 웹 기능으로 대신한다.
- 앱 감지(`html[data-app]`, User-Agent `PhotoContestApp/x.y.z`)는 화면 모양에만 쓰고 권한 판단에 쓰지 않는다.
- 메시지를 추가·변경할 때는 `bridge` 스킬을 따른다.

그룹 안 새 대회는 group-contests(목록·명예의 전당)와 group-contest(상세) 화면으로 나눈다. PostContestField는 일반 게시물/대회 참여 선택을 RHF로 소유하고 접수 중 같은 그룹 대회를 조회한다. 공개 화면은 cookie 없는 SEO와 일치하는 PreloadQuery로 SSR, 비공개는 canViewPosts·ClientOnly로 보호한다. 단일 대회 갱신으로 완료 상태가 되면 사전 조회하지 못한 결과는 `useIsSSR`·`skipToken`으로 브라우저에서 받는다.

## 사용자 피드백: primitive와 이벤트 수명

- outside-click·포커스 이동/복귀·Escape·키보드 탐색·ARIA 연결은 기존 `@side/design-system`/Base UI primitive에 맡긴다. 앱은 overlay-kit·history·portal·업무 비동기 동작만 조합하고 직접 DOM 리스너로 같은 기능을 복제하지 않는다.
- Effect가 설치하는 외부 이벤트/observer의 콜백에서 최신 props·상태만 읽어야 하면 `useEffectEvent`로 분리한다. Effect에는 구독 대상·활성 조건 등 실제 수명 의존성을 남기며, 의존성 검사를 피하려고 값을 감추지 않는다. 반환 함수를 JSX 핸들러·다른 훅·렌더 중 만든 채널에 넘기지 않는다.
- 렌더에 쓰는 외부 상태는 `useSyncExternalStore`, 사용자 조작은 일반 핸들러, 값 변화에 동기화하는 Effect는 reactive dependency를 유지한다. PullToRefresh의 거리·복귀 애니메이션은 Motion에 맡긴다. 전체 피드에 `drag="y"`나 `touch-action: none/pan-x`를 적용해 기본 스크롤·핀치를 막지 않는다. passive:false·중첩 스크롤·핀치 취소를 위한 최소 터치 중재는 유지하고 실제 브라우저 터치 입력으로 스크롤을 확인한다.
- `else`·`else if`는 새로 쓰지 않는다. 기존 공통 no-else lint와 가드/조기 반환·ts-pattern 기준을 유지한다.

- `let`을 피하려고 `const state = { value: ... }`의 속성을 재할당하는 임시 가변 객체를 만들지 않는다. `useRef`로 기계적으로 옮기는 것도 피한다. 순수 계산·파생 값, state/reducer, 기존 외부 store·구독 API를 우선한다. 실제 이벤트 이력·취소·동시 실행처럼 React 렌더와 별도인 수명은 해당 자원을 소유하는 구독 객체나 AbortController·라이브러리 Mutex에 맡긴다. 단지 가변 변수를 숨기기 위한 class를 추가하지 않는다. `useRef`는 대안이 부적절하고 비렌더 값을 보존할 필요가 명확한 경우에만 쓴다.

- 생성자 인자를 같은 이름의 필드에 그대로 저장하면 별도 필드 선언과 `this.x = x` 대신 TypeScript parameter property(`private readonly x: T`, `readonly code: T`)로 합친다. 기존 접근 범위·readonly·인자 순서를 보존하고 단순 초기값은 매개변수 기본값을 검토한다. 변환·검증·자원 생성까지 억지로 기본 인자로 옮겨 API를 늘리지 않는다. 기본 인자에서는 아직 초기화되지 않은 인스턴스 필드·화살표 핸들러를 참조하지 않으며, 필드 초기화 순서와 상속 클래스의 `super()` 순서를 확인한다.

- 추가 처리·인자 변환이 없는 콜백은 `() => fn()`·`(value) => fn(value)`로 감싸거나 별도 별칭을 만들지 않고 함수 참조를 직접 넘긴다. 단, DOM 이벤트가 refetch/mutate의 옵션으로 들어가는 경우, this 바인딩·인자 제한·지연 평가·반환형 조정이 필요한 경우는 래퍼를 유지한다. `useEffectEvent` 자체는 최신 값 연결이라는 역할이 있으므로 불필요한 래퍼와 구분한다.
- 비동기 흐름은 `.then()` 체인보다 `async`/`await`와 필요한 `try/catch/finally`를 우선한다. 상위에서 처리할 오류는 그대로 전파하고 빈 catch를 기계적으로 추가하지 않는다. 병렬 실행·취소·정리·실행 순서와 기존 오류 처리 범위는 보존한다.

## 화면·조회·입력 경계에 관한 사용자 피드백

- 역할·모드별로 서로 다른 훅·조회·mutation이 실행되면 맥락별 로컬 컴포넌트로 나누고 부모는 선택한다. 같은 상태를 공유하며 모양만 다른 갈래, 로딩·오류·빈 상태를 억지로 분리하지 않는다.
- 페이지는 섹션과 경계를 조립한다. 목록의 로딩·실패가 필터·탭·별도 상세를 가리지 않게 조회 구획별 `AsyncBoundary`를 두고, 조회 조건이 바뀌면 해당 경계만 초기화한다. Apollo의 `useBackgroundQuery` 부모·`QueryRef`·정규화 캐시·RSC `PreloadQuery` 계약은 유지하며 페이지의 조회를 일괄 금지하지 않는다.
- URL 입력은 화면 경계에서 필드별 스키마·허용 목록으로 검증한다. 잘못된 필드 하나만 기본값으로 되돌리고, 갱신은 원본 URL에 소유한 키만 병합해 다른 필터·상세 키·중복 키·hash를 보존한다.
- 사진 유지/삭제/교체처럼 의미 있는 DTO→폼 초기값·검증된 폼→요청 변환은 호출부 가까운 순수 helper로 검증한다. File·표시 URL을 JSON에 섞지 않고, 업로드·취소·mutation·캐시 갱신은 실행 흐름에 남긴다. 단순 일대일 복사를 전부 helper로 만들지 않는다.
- 등록·수정처럼 요청과 초기값이 다른 맥락은 각자 폼을 소유하고 실제 공통 입력 primitive만 조합한다. 한 곳을 위한 범용 모드 prop·공통 훅·전역 추상화를 추가하지 않는다. 기존 RHF/Zod·Base UI를 유지한다.

- 직접 작성해 이벤트 prop·리스너·observer에 등록하는 내부 함수와 Effect Event는 `const handle* = …`로 선언한다. 클래스 이벤트 필드는 `private readonly handle* = …`로 receiver를 보존한다. 기존 라이브러리·부모 prop 함수 참조는 이름을 바꾸거나 `handle*` 별칭으로 감싸지 않으며 순수 계산 함수에는 이 접두사를 강제하지 않는다.
- 래퍼 감사는 TypeScript AST로 typed arrow·단일 return 블록·함수 선언까지 확인한다. 직접 참조로 바꾸기 전에 전달 인자, `this`, 반환값, 실행 시점과 참조 수명을 검토한다. `AbortController.abort()`의 무인자 호출은 receiver와 취소 reason을 지키므로 이벤트에 메서드를 그대로 넘기지 않는다.

- 명명 규칙과 기존 함수 직접 전달이 충돌하면 ESLint를 통째로 끄지 않는다. 직접 작성한 핸들러와 기존 함수 참조를 구분하도록 검사 범위를 조정하고 오탐·미탐 회귀 테스트로 지킨다.
