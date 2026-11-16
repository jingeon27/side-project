# page-structure

폴더·이름·공개 진입점은 [Game Feedback의 _pages](../../../../../game-feedback/apps/web/src/_pages)를 기준으로 맞춘다. 조회·폼·권한 동작은 피식의 Apollo 계약을 유지한다.

레이어·배치·파일 이름은 [frontend](architecture.md) 문서을 따른다. Next API는 side 루트 `node_modules/next/dist/docs`에서 확인한다(Next 16: `params`는 Promise, middleware 대신 `src/proxy.ts`, error 경계는 `reset`이 아니라 `retry` prop).

## 새 화면 순서

1. `src/shared/constants/routes.ts`의 `ROUTES`에 경로를 더한다(파라미터는 `encodeURIComponent`하는 함수). 링크·이동·`backHref`는 모두 `ROUTES`로 만든다.
2. `src/_pages/<screen>/` 루트에는 `index.ts`·`index.server.ts`와 필요한 `ui`·`model`·`lib`만 둔다. `ui/<Screen>Page.tsx`가 화면을 조립하며, 클라이언트 훅이 필요한 경계만 `'use client'`로 표시한다. 화면 전용 조각은 `ui/<책임>`, 주소 쿼리 검증·타입은 `model`, 순수 보조 함수는 `lib`, 서버 SEO 조회·변환은 `model/seo`에 둔다.
3. 라우트 `src/app/<경로>/page.tsx`는 `await params` → (첫 화면 데이터가 있으면) `PreloadQuery` → 템플릿만 한다. 화면·입력 스키마는 slice의 `index.ts`, 서버 조회·메타데이터는 `index.server.ts`로만 가져온다. `index.server.ts`에는 `import 'server-only'`를 두고 `index.ts`에서 서버 코드를 재수출하지 않는다(`@/_pages/<screen>/ui/…`는 `fsd/slice-public-api` 오류). 아래 이름은 예시다.

```tsx
import { ContestPage } from '@/_pages/contest';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { ContestDocument } from '@/shared/api/generated';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PreloadQuery query={ContestDocument} variables={{ id }}>
      <ContestPage id={id} />
    </PreloadQuery>
  );
}
```

4. 조회 부모는 같은 Document·variables로 `useBackgroundQuery`를 시작하고 `refetch`를 소유한다. 섹션 자식은 `QueryRef`를 받아 `useReadQuery`로 읽고, 둘 사이의 `AsyncBoundary`가 로딩·실패·재시도를 처리한다. 홈 그룹 목록·그룹 순위·대회 피드/결과처럼 독립 조회는 경계도 나누어 상단바와 다른 기능을 유지한다([apollo](apollo.md) 문서). 인증은 `ViewerBoundary`를 쓰며, 만료 세션·권한 없음·잘못된 초대처럼 예상되는 응답은 `errorPolicy: 'all'`과 `getErrorCode(error)`로 읽는 컴포넌트에서 처리한다. React 오류 경계는 SSR 예외를 잡지 못하므로 예상 오류를 던지지 않는다.
5. 화면 뼈대: 루트 `flex flex-1 flex-col`(`main#pc-main`이 이미 `min-h-dvh flex-col`) → `TopAppBar` → 본문 `flex-1` → 마지막 자식으로 `StickyCta` 또는 `BottomNav`.

## 로그인이 필요한 화면

- 세션 여부로 경로를 막는 proxy를 두지 않는다. 세션 없는 요청도 모든 콘텐츠 경로를 그대로 연다. 새 화면은 `ViewerBoundary`의 `guest`로 공개 데이터나 제자리 `LoginPanel`을 직접 그리고 `/sign`으로 자동 이동시키지 않는다.
- 세션이 필요한 사전 조회가 세션 없는 요청에서 실패해도 화면은 guest 상태로 그린다. 그룹의 내용 접근은 API 공개 범위·멤버십과 화면의 GroupAccess로 결정한다.
- 세션 없는 방문자를 인증 화면으로 보내는 링크는 `buildLoginRedirectPath`로 돌아올 경로를 싣고, 클릭을 `sign_entry_clicked`로 기록한다.

## 공개 소개

- 메인은 `/`를 유지한다. `/about`와 `/about/how-it-works`는 각각 `landing`, `how-it-works` 화면 slice에서 조립하고 `widgets/public-layout`을 공유한다.
- `PUBLIC_LANDING_PATHS`의 소개 페이지에서 AppProviders는 인증·푸시 동기화를 시작하지 않고 데스크톱 메뉴도 제외한다. 시작 링크는 메인으로 바로 이동하며 `prefetch={false}`를 둔다.
- 이용 방법의 상위 화면은 `/about`다. 소개 화면을 앱에서 바로 열었을 때 뒤로 가기는 네이티브의 종료 확인으로 연결하고 메인으로 강제 이동시키지 않는다.

## 뒤로 가기·이동·하단 탭

- `TopAppBar`의 `backHref`는 상위 화면이다(대회 → `ROUTES.GROUP(groupId)`, 그룹 → `ROUTES.EXPLORE`, 초대 → `ROUTES.HOME`). 안의 `useBackNavigation`이 앱 안 기록(`routeHistoryStore`)이 있으면 `router.back()`, 없으면(카카오톡 링크로 바로 들어옴) `backHref`로 가고, 같은 값을 안드로이드 뒤로 가기(`navigation.back`)의 상위 화면으로 등록한다. 등록하지 않은 화면의 상위는 홈이다. 홈은 `HomeAppBar`(`@/shared/ui/@core/top-app-bar`)를 쓴다.
- 초안을 잃기 쉬운 전용 폼은 입력이 바뀐 동안(`formState.isDirty`이고 제출 중이 아닐 때) `registerLeaveGuard(pathname, confirmLeave)`(`@/shared/model/router`)를 effect에서 등록한다. 앱바의 `useBackNavigation`과 앱(안드로이드) 뒤로 가기가 이동 전에 이 확인을 부르고, 확인은 `overlay.openAsync`로 연 ConfirmDialog로 묻는다. 버리기를 고르면 Activity에 남는 초안을 `form.reset`으로 비운다. 묻는 대화상자의 history 항목을 걷어 낸 뒤에 이동하는 일은 `leaveAfterConfirm`이 맡는다. 브라우저 뒤로 가기, iOS 스와이프, 링크 이동은 막지 않고 Activity 보존에 맡기며 성공한 제출 뒤의 `replace`도 묻지 않는다. 지금은 그룹 글쓰기만 등록한다.
- 코드로 이동할 때는 `useAppRouter()`(`@/shared/model/router`)만 쓴다. `next/navigation`의 `useRouter`로 replace하면 push로 세어져 뒤로 가기가 앱 밖으로 나갈 수 있고, 열린 시트의 history 항목도 어긋난다. 단순 링크는 `<Link>`·`ButtonLink`.
- 정렬 같은 화면 상태는 `replaceSearchParams({ sort })`로 주소에 남긴다(기록을 쌓지 않고 열린 시트 표시를 지킨다). 읽을 때는 `useSearchParams` 값을 `model/*.schema.ts`로 파싱해 잘못된 값은 기본값으로 바꾼다.
- 기록 깊이는 `RouteHistoryTracker`(`src/_app/providers/navigation`)만 센다. 화면에서 `routeHistoryStore`를 바꾸지 않는다.
- `BottomNav`(`@/widgets/bottom-nav`)는 홈·탐색·MY 템플릿에만 마지막 자식으로 둔다(레이아웃에 두지 않는다). 키보드가 열리면 스스로 숨는다. 한 화면에 `StickyCta`와 함께 두지 않는다.
- 데스크톱 고정 메뉴(`@/widgets/desktop-nav`)는 루트 레이아웃의 `_app/shell` `AppShell`이 한 번만 그린다. 화면·`loading.tsx`·`TopAppBar`에 다시 두지 않아야 로딩 중에도 메뉴와 본문 위치가 유지된다.

## FSD lint 오류 고치기

| 규칙 | 뜻 | 고치는 법 |
| --- | --- | --- |
| `fsd/layer-imports` | 위 레이어 import. 라우트(`src/app/**`, `src/instrumentation*.ts`)는 `_app`·`_pages`·`shared`만 | feature·widget은 화면 slice가 감싸서 쓴다 |
| `fsd/slice-public-api` | 다른 slice 내부 파일 import, 또는 자기 slice 배럴 import | 그 slice `index.ts`에 export를 더한다(예외 `types/`·`mocks/`·`*.schema`·`*.server`). 같은 slice 안은 상대 경로 |
| `fsd/no-cross-page` | 화면 slice끼리 import | 도메인이면 `features`, 아니면 `shared`로 내린다 |

- `shared`·`_app`은 slice가 없어 `@/shared/ui/@core/button`처럼 깊게 import한다. FSD 규칙은 저장소 `packages/config/eslint/src/rules`에 구현하며 규칙 옆의 RuleTester spec을 함께 관리한다.

## 확인 (side 루트)

```sh
yarn workspace @photo-contest/web lint
yarn workspace @photo-contest/web typecheck
yarn workspace @photo-contest/web test
```

그룹 만들기는 `/groups/new`의 별도 페이지다. `CreateGroupForm`에서 이름·공개 범위·소개와 프로필·배경 사진을 선택한다. 업로드 실패 후 재시도는 이미 생성한 그룹 ID를 재사용한다. 그룹 페이지 헤더의 알림 진입을 유지하고, 대회 상세는 `그룹명 > 대회명` 헤더와 대회 목록으로 돌아가는 경로를 사용한다. 게시물·대회·명예의 전당 탭은 그룹의 최상위 화면에서만 보여 준다. 홈은 가입한 그룹의 한 줄 바로 가기와 통합 피드를 보여 주고(그룹 카드 목록은 MY) 그룹명 옆 글쓰기 바로가기를 만들지 않는다.

서버에서 아는 헤더 제목은 `initialTitle`로 전달해 첫 렌더링을 고정한다. hydration 중 Apollo fragment의 완전성으로 제목을 바꾸지 않고, 이후 갱신은 hydration이 끝난 뒤 반영한다.

## 페이지 내부 폴더

- 특정 페이지의 조회 구획·폼 제출·탐색 조합과 하위 UI·스키마·테스트는 `_pages/<screen>`이 소유한다. 재사용할 도메인 표시·동작·IO·캐시와 여러 페이지의 공유 조합은 [웹 구조](architecture.md) 문서의 features·widgets 경계를 따른다.
- 모든 화면에서 `ui/<책임>` 기준을 쓴다. 예를 들어 홈은 `ui/member`·`ui/no-group`, MY는 `ui/profile`·`ui/groups`·`ui/posts`, 그룹은 `ui/categories`·`ui/join-requests`, 기존 대회는 `ui/feed`·`ui/results`다. 화면마다 `@page/feed`, `@page/ui/feed`, `@page/posts`처럼 같은 책임의 깊이를 달리하지 않는다.
- 파일 입력과 미리보기는 `group-write/ui/fields/media`에서 함께 관리한다. 대응하는 모델은 `model/categories`처럼 같은 책임 이름으로 묶고 테스트는 대상 구현 옆에 둔다. 파일 하나마다 폴더를 만들거나 이름만 다른 중계 컴포넌트를 추가하지 않는다.
- 그룹 대회 개최 흐름은 `group-contests/ui/create`, 기존 대회의 사진 제출 폼은 `contest/ui/submission`이 소유한다. 대회 일정 규칙과 Submission 캐시 갱신은 도메인 로직이므로 features에 남기고 공개 API로 가져온다. 홈과 탐색이 함께 쓰는 그룹 검색 폼·카드는 한 페이지로 옮기지 않는다.
- 페이지 진입·조립 파일과 기능별 하위 폴더의 import를 직접 연결한다. 이전 위치의 호환 re-export나 같은 slice 안의 중간 index를 만들지 않는다.

## 화면 slice

- Game Feedback처럼 `_pages/<screen>/ui/<Screen>Page.tsx`가 화면을 조립한다. 하위 UI와 모델은 같은 책임 이름으로 묶고, 테스트는 구현 옆에 둔다.
- 그룹 조회·생성·수정·글쓰기는 각각의 화면 slice가 소유한다. 진행·완료 대회 목록은 `group-contests`, 개별 그룹 대회는 `group-contest`, 기존 Submission 대회는 `contest`가 맡는다.
- 루트 `index.ts`는 UI·입력의 공개 API, `index.server.ts`는 서버 조회·메타데이터의 공개 API다. 페이지끼리 import하거나 서버 코드를 클라이언트 배럴에 섞지 않는다.

## 즉시 탐색

- Next의 `cacheComponents`·`partialPrefetching`을 사용한다. `instant`는 전환 속도를 켜는 스위치가 아니라 준비된 UI를 검증하는 설정이다. 그룹·대회와 홈·탐색·MY는 `instant = true`로 검증한다.
- 요청별 Apollo `PreloadQuery`·인증 조회를 시작하는 라우트는 먼저 `await connection()`으로 요청 시점에 렌더한다. 서버의 QueryRef·개인화 데이터를 공유 캐시에 넣지 않는다.
- 각 화면의 `loading.tsx`는 해당 `_pages`의 `ui/<Screen>PendingPage.tsx`를 쓴다. 홈은 `(home)` 라우트 그룹으로 로딩 경계를 한정해 작성·수정 화면에 하단 메뉴가 나타나지 않게 한다. 루트 레이아웃은 최초 테마·앱 환경을 먼저 결정하기 위해 `instant = false`를 유지한다.
- 그룹 로딩 UI는 Apollo 캐시에 접근 권한이 확인된 경우만 그룹 메뉴를 표시하며 새 요청을 시작하지 않는다. 실제 페이지의 권한 확인과 비공개 게시물의 클라이언트 조회 경계는 유지한다.
- `e2e/instant-navigation.spec.ts`는 production 빌드에서 Chrome은 `@next/playwright`의 `instant()`, Safari는 실제 RSC 요청 보류로 헤더·메뉴·선택 상태와 응답 재개를 검증한다. 테스트 API는 기존 loopback 격리 포트 빌드에서만 노출한다.
