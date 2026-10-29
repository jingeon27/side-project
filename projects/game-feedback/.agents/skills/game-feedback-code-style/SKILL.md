---
name: game-feedback-code-style
description: Implement or review Game Feedback Web and Admin code using the repository's FSD, React Query, form, and shared UI conventions. Use for these apps' code changes, including Admin refactors; exclude API and native bridge implementation.
---

# Game Feedback Code Style

Game Feedback의 공개 Web과 별도 Admin에 같은 코드 품질 기준을 적용한다. 대상 앱의 기존 실행 방식과 도메인 동작을 유지하며 변경에 필요한 파일만 정리한다.

## 적용 전

- 저장소와 프로젝트의 `AGENTS.md`를 읽고, Web은 `apps/web/AGENTS.md`, Admin은 `apps/admin/AGENTS.md`를 추가로 읽는다. 현재 Git 원격·브랜치·사용자 변경을 확인한다.
- 앱의 `eslint.config.ts`와 가까운 구현을 기준으로 삼는다. Admin은 React + Vite이므로 Next 라우터·Server Component·Web 전용 내부 모듈을 가져오지 않는다.

## 책임과 조합

- `_app`은 Provider·인증 게이트·라우트 조합, `_pages/<domain>`은 목적별 화면을 소유한다. 여러 페이지에서 쓸 수 있는 도메인 조합은 `widgets`, 서버 IO·캐시 정책은 `features`, 도메인 비의존 코드는 `shared`에 둔다.
- slice 간에는 named export `index.ts`를 통한다. 페이지끼리 직접 import하거나 UI에서 SDK를 호출하지 않는다. REST와 생성 응답 Zod 검증은 도메인의 `api/*.api.ts` 경계에 유지한다.
- 로그인·문의·신고·사용자 관리 화면과 검색·답변·제재 폼을 구분한다. 목적이 다른 화면이나 생성·수정을 mode 플래그가 늘어나는 하나의 폼으로 합치지 않는다. 같은 책임의 요소만 공유한다.

## 상태와 비동기

- 조회 키와 요청은 `*.options.ts`의 `queryOptions`·`infiniteQueryOptions`로 정의한다. 캐시 갱신도 해당 팩토리를 사용하고 컴포넌트에서 키 배열을 다시 만들지 않는다. 전용 조회 훅으로 useQuery를 감싸지 않는다.
- mutation의 요청·key·캐시 갱신은 `*.mutation-options.ts`에 두고 named public export로 공개한다. 화면이나 기능 흐름의 호출부에서 `useMutation(xMutationOptions(client, …))`로 직접 조립하며 단순히 감싸 반환하는 전용 훅은 만들지 않는다. pending·오류·재시도 변수를 useState/ref로 복제하지 않는다.
- 폼은 `useZodForm`과 목적별 `model/*.schema.ts`를 사용한다. 입력값을 별도 useState에 복제하지 않는다. 실패한 답변 초안·재전송 UUID와 제재 사유는 보존하고 서버 성공 뒤 폼을 초기화한다.
- 로딩과 조회 실패는 영역별 `AsyncBoundary`로 제한한다. 문의 하나가 실패해도 메뉴와 문의 목록을 사용할 수 있어야 한다. 계정 전환은 실행 중 쿼리 취소 → 이전 캐시 삭제 → 새 세션 저장 순서를 유지한다.
- URL이 선택 화면·사용자·문의의 단일 출처다. 외부 구독은 useSyncExternalStore를 사용한다. useRef는 외부 자원 식별 등 실제 필요한 경우에 제한하며 DOM 연결은 정리 가능한 callback ref를 우선한다. QueryClient처럼 수명이 고정된 자원을 만드는 lazy useState는 허용한다.

## UI 라이브러리와 이벤트 수명

- 메뉴·선택·시트·대화상자의 outside-click, focus 이동/복원, Escape, ARIA 상태는 기존 `@side/design-system`/Base UI primitive에 맡긴다. 직접 DOM listener·role·펼침 상태를 복제하지 않는다. 네이티브 back을 Base UI의 Escape 처리에 연결하는 어댑터와 Quill 전용 DOM은 별도 외부 경계다.
- effect가 소유하는 전역/OS 구독에서 최신 props·콜백만 읽어야 하면 `useEffectEvent`로 이벤트 처리와 구독 수명을 분리한다. Effect Event는 effect가 설치한 콜백에서만 호출하고 JSX 이벤트·일반 외부 공개 API로 전달하지 않는다.
- 계정·대화 ID, 구독 대상/활성 여부, DOM 노드처럼 자원의 수명을 바꾸는 값은 reactive dependencies에 유지한다. URL·테마·visibility·채널 snapshot은 `useSyncExternalStore`를 유지한다. 비React 채널은 자체 bind/dispose·취소·큐 수명을 유지하며 일괄 변환하지 않는다.
- cleanup은 OS listener·observer·타이머를 해제하고 늦은 promise 응답을 취소 가드로 버린다. 콜백 교체, StrictMode 재구독, unmount 후 응답, 진행 중 back/초기 링크 경합을 동작 테스트로 확인한다.

## 표현과 타입

- 컴포넌트는 PascalCase 파일의 named function, 나머지 파일은 kebab-case로 작성한다. interface는 `I`, type alias는 `T`, 내부 이벤트는 `handle*`, 전달 prop은 `on*`을 사용한다. any·non-null assertion·enum·else를 추가하지 않는다.
- 컴포넌트 내부 콜백은 `const` arrow로 선언한다. 실제 재사용·구독 해제에 필요한 named callback은 유지한다.
- const와 순수 변환을 우선한다. 유니온 분기는 ts-pattern의 exhaustive match, 중복 제거 등 컬렉션 처리는 es-toolkit을 사용한다. 단순한 두 상태 표현까지 억지로 추상화하지 않는다. 외부 응답의 열린 문자열은 임의로 기존 상태라고 단정하지 않는다.
- 객체 타입은 타입 추론을 유지하는 `satisfies`를 우선한다. 상태를 가진 외부 채널·수명 관리는 가변 let 클로저 대신 class로 캡슐화한다. UI 데이터 변환을 위해 class를 추가하지 않는다.
- 버튼·입력·모달·토큰은 `@side/design-system`의 shadcn + Base UI를 사용한다. 앱에서 기본 컨트롤과 타이포를 다시 정의하지 않는다. 고정 메뉴·상태 선택지는 JSX로 명시하고 서버 목록은 map으로 렌더링한다.

## 생성자 parameter property

Game Feedback의 authored TypeScript(apps·packages·scripts)에 적용한다. 생성한 코드는 직접 수정하지 않는다.

- 먼저 실행 경로를 확인한다. 변환기 없이 `node file.ts`로 실행하는 strip-only 스크립트는 parameter property를 지원하지 않으므로 명시적 필드·대입을 유지한다. 이를 줄이기 위해 실행기·CI를 변경하지 않는다.
- 생성자 인자를 그대로 필드에 저장하면 별도 필드 선언과 `this.field = field` 대신 TypeScript parameter property를 쓴다. 기존 접근 수준·readonly·인자 순서·기본값·호출 시그니처를 유지하고, 변경 가능한 필드에 readonly를 임의로 붙이지 않는다.
- class field initializer와 arrow handler의 즉시 평가, super 호출, 다른 필드 참조의 초기화 순서를 확인한다. 지연 실행 콜백의 참조와 생성 중 즉시 읽기를 구분하며 초기화 순서가 달라지면 명시적 대입을 유지한다. 매개변수 기본값에서 아직 초기화되지 않은 arrow 필드를 참조하지 않는다.
- 인자를 검증·가공하거나 다른 자원을 만드는 초기화는 그대로 둔다. 필드 기본값을 옮기기 위해 불필요한 생성자 인자를 추가하지 않는다. 순수 구문 정리는 기존 타입·lint·관련 테스트로 확인하고 새 테스트를 억지로 만들지 않는다.

## satisfies와 ts-pattern

이 절은 Web·Admin과 함께 API·contracts·SDK·bridge를 포함한 Game Feedback TypeScript 전체에 적용한다.

- `satisfies`는 설정·조회표로 쓰는 모듈 수준 상수(라우트·게시판·메뉴 정의, 라벨·상태 문구 표, 제한값, 선택지 목록, variant 표)에 쓴다. 리터럴을 넓히는 `const X: T = { … }`는 `const X = { … } satisfies T`로 바꾸고, 모양 검사 없는 `as const`에는 `as const satisfies readonly IBoardConfig[]`처럼 의도한 모양을 붙인다. `as const`는 리터럴 타입을 쓰는 곳이 있을 때만 남긴다. 유니온을 키로 쓰는 표는 `satisfies Record<TUnion, V>`(일부러 일부만 두면 `Partial<…>`)로 빠지거나 남는 키를 타입 검사에서 막는다.
- 타입이 있는 매개변수에 바로 넘기는 객체, JSX props, 테스트 fixture, 임의 문자열로 조회하는 `Record<string, …>` 사전처럼 선언 타입이 일부러 넓은 값, 프레임워크가 선언 타입으로 검사하는 export(Next `metadata`·`viewport`·`config`)는 바꾸지 않는다. 내보낸 타입이 좁아져 호출부가 깨지면 호출부를 고치거나 그대로 둔다.
- 같은 판별 값(상태 유니온, `kind`·`type`·`board`, 오류 코드)에 대한 3갈래 이상의 if 나열·삼항, 중첩 삼항, exhaustiveness 없는 switch는 `match(x).with(…).exhaustive()`로 쓰고 남은 값은 `P.union(…)`으로 명시한다. `.otherwise()`는 서버 오류 코드 같은 열린 문자열·unknown 입력에만 쓴다. 반환 타입 추론이 string으로 넓어져 otherwise가 필요해 보이면 먼저 타입을 유니온으로 좁힌다.
- 단순한 가드·이른 반환, 조건 하나인 if, 두 상태 삼항, 뜨거운 반복문은 일반 코드로 둔다. 판별 값이 아닌 불리언 조건이 겹친 삼항은 이른 반환으로 풀고, 게시판별 필터처럼 서로 독립된 조건부 JSX 영역은 JSX에 명시한다.

## 상태 스타일과 variant

- 화면은 주로 CSS 파일과 class 이름으로 꾸민다. 도움됨·읽지 않음·내 글·답변 있음처럼 켜짐/꺼짐 하나인 상태는 modifier class를 문자열로 이어 붙이지 않고 `data-*` 속성(뜻이 맞으면 `aria-current`·`aria-pressed` 같은 `aria-*`)으로 표시해 CSS 속성 선택자(`.comment[data-mine]`, `.side-link[aria-current='page']`)로 꾸민다. 꺼짐은 `undefined`로 속성을 빼고(`data-mine={mine || undefined}`), 값이 여럿인 상태는 `data-connection={connection}`처럼 값을 넣는다. Web lint가 `className`의 표현식 template literal을 막는다.
- class-variance-authority는 앱 전용 컴포넌트가 variant 축 2개 이상이거나 값 3개 이상을 여러 곳에서 다시 쓸 때만 쓴다. 컴포넌트 옆 `*.variants.ts`에 두고 `VariantProps` 타입을 함께 export한다.
- 버튼·칩·배지·아이콘 버튼 같은 범용 모양은 `@side/design-system`의 variant로 더한다. 앱에 복제본을 만들지 않는다.

## 완료 확인

- 대상 앱의 lint·typecheck·기존 테스트를 실행한다. 탐색·캐시·폼 동작을 변경했다면 사용자 동작을 검증하는 테스트를 추가하고 관련 E2E를 실행한다. 코드 배치나 문구를 그대로 복사하는 테스트는 만들지 않는다.
- 커밋과 PR 제목은 `refactor(game-feedback): ...`처럼 서비스 scope를 넣는다. 검증과 커밋 절차는 프로젝트의 `game-feedback-test`, `game-feedback-commit` 스킬을 따른다. 외부 검증을 로컬 성공으로 대체하지 않는다.

- `let`을 없애기 위해 `const` 임시 객체 속성을 재할당하거나 `useRef`로 기계적으로 옮기지 않는다. 순수 계산·state/reducer·외부 store·기존 구독 API를 먼저 검토하고, 실제 수명과 취소를 소유하는 자원 객체만 분리한다. DOM 연결은 정리 가능한 callback ref를 우선하며 ref는 대안이 부적절한 imperative 자원에만 제한한다.
