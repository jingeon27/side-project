---
name: game-feedback-admin-screen
description: Admin(apps/admin)에 관리자 화면·탭을 추가하거나 hash 경로·딥링크, `_pages`·`widgets`·`features` 배치, 관리자 REST endpoint(`/api/admin/*`)와 SDK 연결, 조회·mutation 캐시 갱신을 바꿀 때 사용한다.
---

FSD 레이어·명명·폼·React Query 일반 규칙은 프로젝트 `game-feedback-code-style` 스킬, 경계 요약은 `AGENTS.md`를 따른다. 여기서는 Admin에서 무엇을 어디에 어떤 순서로 두는지만 다룬다.

## 화면 한 장의 경로

- `src/main.tsx` → `src/_app/App.tsx`(`QueryProvider` → 최상위 `AsyncBoundary`) → `src/_app/AdminRouter.tsx`.
- `AdminRouter`는 `useSuspenseQuery(sessionOptions())`의 `session.user?.role !== 'ADMIN'`이면 `LoginPage`만 그린다. 화면 분기일 뿐 권한 검사가 아니다. 모든 `/api/admin/*`는 API controller의 `@UseGuards(AdminGuard)`(`../api/src/common/http/session.guard.ts`)와 서비스의 `requireAdmin(req)`가 401/403으로 막는다. 화면에 role 기반 권한 로직을 더하지 않는다.
- 관리자면 `AdminShell`(`src/widgets/admin-shell`) 안에서 `match(route.tab)…exhaustive()`로 화면을 고르고 `AsyncBoundary key={route.tab}`로 감싼다.
- REST는 `@game-feedback/sdk` → 같은 Origin `/api` → Vite 프록시 → API다(`game-feedback-admin-session`).

## hash 경로 (`src/shared/lib/admin-route.ts`)

- 형식은 `#<tab>?<param>=<id>`다. `tabSchema`(`.catch('support')`)는 모르는 탭을 문의함으로, `idSchema`(`^[A-Za-z0-9_-]{1,100}$`, 실패 시 `''`)는 잘못된 ID를 빈 값으로 바꾼다. hash 값을 이 검증 없이 SDK 인자로 넘기지 않는다.
- 선택 상태(문의 `thread`, 사용자 `user`)의 단일 출처는 hash다. 링크는 `adminSupportPath(id)`·`adminUserPath(id)`, 폼 제출 이동은 `window.location.hash = adminUserPath(id)`(`src/_pages/users/ui/UserSearchForm.tsx`)로 한다. `useAdminRoute()`가 `useSyncExternalStore`로 `hashchange`를 구독하므로 라우터 라이브러리나 선택 상태 useState를 더하지 않는다.
- 새로고침 복원은 hash 값을 초기값으로 받고 `key`로 다시 마운트한다(`UsersPage`의 `<UserSearchForm key={userId} initialUserId={userId} />`).

## 새 관리자 화면 순서

1. API에 endpoint가 없으면 먼저 만든다. SDK에 이미 있고 Admin이 쓰지 않는 함수(예: `createCategory` → `POST /api/admin/categories`)면 2로 간다.
   - `../../packages/contracts/src/index.ts`: 입력·응답 Zod 스키마, `schemas` 항목, `operations`에 `{ method, path: '/api/admin/...', id, body?, response }`. `id`가 SDK 함수 이름이 된다.
   - `../api/src/admin/<domain>/`: controller는 `@UseGuards(AdminGuard)` + `@Controller('api/admin/...')`, DTO는 `static readonly contract = <Schema>`와 class-validator 데코레이터, 본문은 `@ValidatedBody(Dto)`. 서비스는 `requireAdmin(req)` 뒤 `this.transactions.run` 안에서 변경과 `auditLog.create`를 함께 한다. `../api/src/admin/admin.module.ts`에 controller·provider를 등록한다.
   - side 루트에서 `codegen`을 실행하고 `../../packages/sdk/src/generated/*` diff를 확인한 뒤, 손으로 관리하는 `../../packages/sdk/src/index.ts` export 목록에 함수를 더한다. 생성 파일은 고치지 않는다. Admin은 contracts의 `dist`를 읽으므로 contracts를 바꾸면 `codegen`(contracts build 포함) 전에는 Admin typecheck가 새 타입을 보지 못한다.
2. `src/features/<domain>/`
   - `api/<domain>.api.ts`: SDK 호출과 인자 모양 변환만 둔다. ESLint가 `@game-feedback/sdk` import를 `src/features/*/api/**`에만 허용한다. 화면 타입은 `Awaited<ReturnType<typeof fetchX>>`로 여기서 만든다(`TAdminReport`, `TAdminUser`, `TSupportThread`).
   - `model/<domain>.options.ts`: `queryOptions`·`infiniteQueryOptions`. 기존 key는 `admin-` 접두사(`['admin-reports']`, `['admin-user', id]`)다. 주기 갱신은 여기의 `refetchInterval`에 둔다(문의 목록 10초, 메시지 5초).
   - `model/<domain>.mutation-options.ts`: `xMutationOptions(client: QueryClient)`가 `mutationOptions({ mutationKey, mutationFn, onSuccess })`를 반환하고, 갱신은 `client.invalidateQueries(xOptions(...))`처럼 options 팩토리를 넘긴다. `useMutation`·`mutationOptions` import는 `src/features/*/model/**`에서만 허용된다.
   - `model/<domain>.hook.ts`: `use<Action>Mutation()`이 `useMutation(xMutationOptions(useQueryClient()))` 결과를 그대로 반환한다.
   - `index.ts`: options·mutation 훅·타입만 export한다.
3. 독립 조회나 폼을 가진 재사용 영역은 `src/widgets/<name>/`(`ui/`, 폼 스키마 `model/*.schema.ts`), 한 화면 전용은 `src/_pages/<domain>/ui/`·`model/`에 둔다. `src/_pages/<domain>/index.ts`는 `<Domain>Page`만 export한다.
4. 탭이면 세 곳을 함께 바꾼다.
   - `admin-route.ts`의 `tabSchema`. 선택 ID가 있으면 `idSchema`로 읽는 파라미터와 `admin<X>Path`를 더하고 `src/shared/lib/index.ts`에서 export한다.
   - `src/widgets/admin-shell/ui/AdminNavigation.tsx`에 `AdminNavigationLink`를 JSX로 명시한다.
   - `AdminRouter.tsx`에 `.with('<tab>', …)`를 더한다. 빠지면 `exhaustive()`가 타입 오류를 낸다.
5. 화면 안의 독립 조회는 선택 ID를 key로 한 `AsyncBoundary`로 나눈다(`SupportPage`의 `key={selected.id}`, `UsersPage`의 `key={userId}`). mutation 오류는 카드·폼마다 `ErrorNotice`(`role="alert"`)로 보인다.
6. `game-feedback-admin-test`대로 단위·E2E 테스트를 고친다.

## 지킬 것

- 로그인·로그아웃의 `replaceSession`(`src/features/auth/model/auth.mutation-options.ts`)이 세션 외 모든 쿼리와 mutation 캐시를 지운다. 관리자 데이터는 React Query 캐시에만 두고 모듈 변수·localStorage·sessionStorage에 두지 않는다. 그렇지 않으면 계정을 바꿔도 남는다.
- 컨트롤은 `@side/design-system`, 배치 class는 `src/_app/styles.css`의 `admin-card`·`admin-actions`·`form-stack`·`admin-inbox`를 재사용한다.
- E2E가 찾을 수 있게 목록 카드에는 `data-<entity>-id`(`data-thread-id`, `data-report-id`, `data-user-id`), 영역에는 `aria-label`(`문의 대화`, `사용자 관리`, `신고함`)을 둔다.

## 확인 (side 루트)

```sh
corepack yarn workspace @side/game-feedback codegen   # contracts·API를 바꿨을 때
corepack yarn workspace @game-feedback/admin typecheck
corepack yarn workspace @game-feedback/admin lint
corepack yarn workspace @game-feedback/admin test
corepack yarn workspace @game-feedback/admin build
```
