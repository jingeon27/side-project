---
name: page-structure
description: 웹(apps/web)에 새 화면·라우트를 추가하거나 화면 slice 폴더, 첫 화면 데이터(PreloadQuery), 멤버 전용 게이트, 상단 뒤로 가기·하단 탭 배치, FSD import 경계 lint 오류를 고칠 때 사용한다.
---

레이어·배치·파일 이름은 `frontend` 스킬을 따른다. Next API는 side 루트 `node_modules/next/dist/docs`에서 확인한다(Next 16: `params`는 Promise, middleware 대신 `src/proxy.ts`, error 경계는 `reset`이 아니라 `retry` prop).

## 새 화면 순서

1. `src/shared/constants/routes.ts`의 `ROUTES`에 경로를 더한다(파라미터는 `encodeURIComponent`하는 함수). 링크·이동·`backHref`는 모두 `ROUTES`로 만든다.
2. `src/_pages/<screen>/` 루트에는 `index.ts`(화면 컴포넌트 `<Screen>PageTemplate`와 라우트에 필요한 서버 SEO 진입점만 export)와 `@` 폴더만 둔다. `@page/<Screen>PageTemplate.tsx`('use client')가 조립하고, 화면 전용 조각은 `@page/ui/`·`@page/bottom-sheet/`·`@page/model/`(주소 쿼리 zod `*.schema.ts`)·`@page/<섹션>/`에 둔다.
3. 라우트 `src/app/<경로>/page.tsx`는 `await params` → (첫 화면 데이터가 있으면) `PreloadQuery` → 템플릿만 한다. 화면은 배럴에서만 가져온다(`@/_pages/<screen>/@page/…`는 `fsd/slice-public-api` 오류). 아래 이름은 예시다.

```tsx
import { ContestPageTemplate } from '@/_pages/contest';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { ContestDocument } from '@/shared/api/generated';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PreloadQuery query={ContestDocument} variables={{ id }}>
      <ContestPageTemplate id={id} />
    </PreloadQuery>
  );
}
```

4. 조회 부모는 같은 Document·variables로 `useBackgroundQuery`를 시작하고 `refetch`를 소유한다. 섹션 자식은 `QueryRef`를 받아 `useReadQuery`로 읽고, 둘 사이의 `AsyncBoundary`가 로딩·실패·재시도를 처리한다. 홈 그룹 목록·그룹 순위·대회 피드/결과처럼 독립 조회는 경계도 나누어 상단바와 다른 기능을 유지한다(`apollo` 스킬). 인증은 `ViewerBoundary`를 쓰며, 만료 세션·권한 없음·잘못된 초대처럼 예상되는 응답은 `errorPolicy: 'all'`과 `getErrorCode(error)`로 읽는 컴포넌트에서 처리한다. React 오류 경계는 SSR 예외를 잡지 못하므로 예상 오류를 던지지 않는다.
5. 화면 뼈대: 루트 `flex flex-1 flex-col`(`main#pc-main`이 이미 `min-h-dvh flex-col`) → `TopAppBar` → 본문 `flex-1` → 마지막 자식으로 `StickyCta` 또는 `BottomNav`.

## 멤버 전용 화면

- 세 곳을 함께 바꾼다: `src/proxy.ts`의 `config.matcher`(빌드 때 정적으로 읽으므로 상수 import 없이 문자열 그대로), `src/shared/lib/auth-gate.helper.ts`의 `isSessionRequiredPath`, `src/shared/constants/routes.ts`의 `SESSION_PATH_PREFIXES`·`SESSION_PATHS`. 그리고 `src/proxy.spec.ts`(matcher 목록 단언)와 `src/shared/lib/auth-gate.helper.spec.ts`를 고친다.
- proxy는 쿠키가 있는지만 본다. 만료 세션은 화면이 처리한다(`frontend` 스킬 "인증·이동"). 홈·탐색·그룹·초대도 익명 또는 회원 세션이 필요하다. 세션이 없으면 `/sign?next=…`로 보내고 인증·정책·콜백·API·정적 파일은 제외한다. 그룹의 내용 접근은 API 공개 범위·멤버십과 화면의 GroupAccess로 결정한다.

## 뒤로 가기·이동·하단 탭

- `TopAppBar`의 `backHref`는 상위 화면이다(대회 → `ROUTES.GROUP(groupId)`, 그룹 → `ROUTES.EXPLORE`, 초대 → `ROUTES.HOME`). 안의 `useBackNavigation`이 앱 안 기록(`routeHistoryStore`)이 있으면 `router.back()`, 없으면(카카오톡 링크로 바로 들어옴) `backHref`로 가고, 같은 값을 안드로이드 뒤로 가기(`navigation.back`)의 상위 화면으로 등록한다. 등록하지 않은 화면의 상위는 홈이다. 홈은 `BrandAppBar`를 쓴다.
- 코드로 이동할 때는 `useAppRouter()`(`@/shared/model/router`)만 쓴다. `next/navigation`의 `useRouter`로 replace하면 push로 세어져 뒤로 가기가 앱 밖으로 나갈 수 있고, 열린 시트의 history 항목도 어긋난다. 단순 링크는 `<Link>`·`ButtonLink`.
- 정렬 같은 화면 상태는 `replaceSearchParams({ sort })`로 주소에 남긴다(기록을 쌓지 않고 열린 시트 표시를 지킨다). 읽을 때는 `useSearchParams` 값을 `@page/model/*.schema.ts`로 파싱해 잘못된 값은 기본값으로 바꾼다.
- 기록 깊이는 `RouteHistoryTracker`(`src/_app/providers/navigation`)만 센다. 화면에서 `routeHistoryStore`를 바꾸지 않는다.
- `BottomNav`(`@/widgets/bottom-nav`)는 홈·탐색·MY 템플릿에만 마지막 자식으로 둔다(레이아웃에 두지 않는다). 키보드가 열리면 스스로 숨는다. 한 화면에 `StickyCta`와 함께 두지 않는다.

## FSD lint 오류 고치기

| 규칙 | 뜻 | 고치는 법 |
| --- | --- | --- |
| `fsd/layer-imports` | 위 레이어 import. 라우트(`src/app/**`, `src/proxy.ts`, `src/instrumentation*.ts`)는 `_app`·`_pages`·`shared`만 | feature·widget은 화면 slice가 감싸서 쓴다 |
| `fsd/slice-public-api` | 다른 slice 내부 파일 import, 또는 자기 slice 배럴 import | 그 slice `index.ts`에 export를 더한다(예외 `types/`·`mocks/`·`*.schema`·`*.server`). 같은 slice 안은 상대 경로 |
| `fsd/no-cross-page` | 화면 slice끼리 import | 도메인이면 `features`, 아니면 `shared`로 내린다 |

- `shared`·`_app`은 slice가 없어 `@/shared/ui/@core/button`처럼 깊게 import한다. FSD 규칙은 저장소 `packages/config/eslint/src/rules`에 구현하며 규칙 옆의 RuleTester spec을 함께 관리한다.

## 확인 (side 루트)

```sh
yarn workspace @photo-contest/web lint
yarn workspace @photo-contest/web typecheck
yarn workspace @photo-contest/web test
```
