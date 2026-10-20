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
- mutation의 요청·key·캐시 갱신은 `*.mutation-options.ts`, React 연결은 `*.hook.ts`에 둔다. mutation 훅은 원래 useMutation 결과를 반환한다. pending·오류·재시도 변수를 useState/ref로 복제하지 않는다.
- 폼은 `useZodForm`과 목적별 `model/*.schema.ts`를 사용한다. 입력값을 별도 useState에 복제하지 않는다. 실패한 답변 초안·재전송 UUID와 제재 사유는 보존하고 서버 성공 뒤 폼을 초기화한다.
- 로딩과 조회 실패는 영역별 `AsyncBoundary`로 제한한다. 문의 하나가 실패해도 메뉴와 문의 목록을 사용할 수 있어야 한다. 계정 전환은 실행 중 쿼리 취소 → 이전 캐시 삭제 → 새 세션 저장 순서를 유지한다.
- URL이 선택 화면·사용자·문의의 단일 출처다. 외부 구독은 useSyncExternalStore를 사용한다. useRef는 외부 자원 식별 등 실제 필요한 경우에 제한하며 DOM 연결은 정리 가능한 callback ref를 우선한다. QueryClient처럼 수명이 고정된 자원을 만드는 lazy useState는 허용한다.

## 표현과 타입

- 컴포넌트는 PascalCase 파일의 named function, 나머지 파일은 kebab-case로 작성한다. interface는 `I`, type alias는 `T`, 내부 이벤트는 `handle*`, 전달 prop은 `on*`을 사용한다. any·non-null assertion·enum·else를 추가하지 않는다.
- const와 순수 변환을 우선한다. 유니온 분기는 ts-pattern의 exhaustive match, 중복 제거 등 컬렉션 처리는 es-toolkit을 사용한다. 단순한 두 상태 표현까지 억지로 추상화하지 않는다. 외부 응답의 열린 문자열은 임의로 기존 상태라고 단정하지 않는다.
- 객체 타입은 타입 추론을 유지하는 `satisfies`를 우선한다. 상태를 가진 외부 채널·수명 관리는 가변 let 클로저 대신 class로 캡슐화한다. UI 데이터 변환을 위해 class를 추가하지 않는다.
- 버튼·입력·모달·토큰은 `@side/design-system`의 shadcn + Base UI를 사용한다. 앱에서 기본 컨트롤과 타이포를 다시 정의하지 않는다. 고정 메뉴·상태 선택지는 JSX로 명시하고 서버 목록은 map으로 렌더링한다.

## 완료 확인

- 대상 앱의 lint·typecheck·기존 테스트를 실행한다. 탐색·캐시·폼 동작을 변경했다면 사용자 동작을 검증하는 테스트를 추가하고 관련 E2E를 실행한다. 코드 배치나 문구를 그대로 복사하는 테스트는 만들지 않는다.
- 커밋과 PR 제목은 `refactor(game-feedback): ...`처럼 서비스 scope를 넣는다. 검증과 커밋 절차는 프로젝트의 `game-feedback-test`, `game-feedback-commit` 스킬을 따른다. 외부 검증을 로컬 성공으로 대체하지 않는다.
