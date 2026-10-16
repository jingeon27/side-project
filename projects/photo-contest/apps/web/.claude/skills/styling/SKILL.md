---
name: styling
description: 웹(apps/web)의 Tailwind 4·디자인 토큰, 휴대폰·태블릿·데스크톱 반응형 레이아웃, 안전 영역·고정 요소·오버레이·터치 영역·사진 표시를 다룰 때 사용한다.
---

원칙은 `frontend` 스킬의 "모바일 레이아웃"이다. 아래는 이 앱 설정에서 생기는 함정과 쓰는 값이다.

## Tailwind 4 (설정 파일 없음)

- 진입점은 `src/_app/styles/tailwind.css`(`@import 'tailwindcss' source(none)` + `theme.css` + `globals.css`)이고 `@source '../../**/*.{ts,tsx}'`(= `src`)만 훑는다. 클래스는 소스에 완전한 문자열로 쓴다. `bg-${tone}` 같은 조합은 생성되지 않으니 cva variant나 전체 이름 매핑을 쓴다.
- `src/_app/styles/theme.css`가 기본 색·글자 크기·분기점을 지운다(`--color-*`·`--text-*`·`--breakpoint-*: initial`). `bg-white`·`text-gray-500`·`text-sm`·`md:`는 오류 없이 아무 스타일도 만들지 않는다. 있는 값:
  - 색: `brand`(`-strong`·`-soft`) `accent`(`-soft`·`-ink`) `ink` `muted` `subtle` `line`(`-strong`) `surface` `sunken` `canvas` `background` `danger`(`-soft`) `info`(`-soft`) `neutral-soft` `gold` `silver` `bronze` `kakao` `on-brand` `scrim`
  - 글자: `text-display|title-lg|title|subtitle|body|input|button|label|caption|micro`(크기·줄 높이·굵기·자간 한 묶음)
  - `rounded-badge|control|card|sheet`, `shadow-app|card|sheet|toast`, `h-app-bar`(60) `h-bottom-nav`(76) `h-cta`(50) `size-touch`(44), `max-w-app`(피드·일반 폼 540)·`max-w-web`(웹 1200). 기본 spacing(`p-4`·`gap-2`)은 그대로 있다.
- 토큰을 더하면 `@theme`에 넣고, 글자·모서리·그림자·spacing·z·max-w 토큰이면 `src/shared/lib/cn.helper.ts`의 `extendTailwindMerge`에도 등록하고 `cn.helper.spec.ts`에 케이스를 더한다. 빠지면 tailwind-merge가 `cn('text-title', 'text-ink')`에서 하나를 지운다. `var()`로만 읽는 값은 `@theme static`에 둔다.
- `src/_app/styles/globals.css`는 `@layer base`만, 100줄 이하로 둔다. 화면·컴포넌트 스타일을 넣지 않는다. 앱바 배경(`--color-surface`)을 바꾸면 `src/shared/constants/layout.ts`의 `THEME_COLOR`도 바꾼다.
- 합치기는 `cn()`(`@/shared/lib/cn.helper`, 뒤에 온 값이 이긴다). `!` 유틸(`p-0!`·`!p-0`), 임의 hex(`bg-[#fff]`), 색 inline style은 쓰지 않는다. 토큰이 있는 값(색·글자·모서리·그림자·z·높이)을 임의 값으로 쓰지 않는다.
- Base UI 상태는 `data-*` 변형으로 꾸민다(`data-disabled:`·`data-pressed:`·`data-invalid:`·`data-starting-style:`·`data-ending-style:`). `Button`의 `loading`은 native `disabled`를 걸지 않으므로 `disabled:` 변형이 맞지 않는다.

## 레이아웃

- 화면은 `main#pc-main`(`src/app/layout.tsx`, `max-w-web`) 안에 그린다. 위아래 고정 바는 `sticky`인 `TopAppBar`·`StickyCta`·`BottomNav`를 쓴다. 바텀시트는 데스크톱에서도 화면 하단에 붙이고 화면 너비를 모두 채운다(`w-full`, 최대 폭 제한 없음). 일반 폼·CTA·토스트는 읽기 쉬운 폭을 유지한다. 오버레이 portal은 `getOverlayContainer()`를 쓴다.
- 상시 게시물은 최대 540px의 큰 1열 피드다. 데스크톱(1024px 이상)은 왼쪽 고정 메뉴·중앙 피드·오른쪽 인기 사진이며 하단 탭은 숨긴다. 모바일·태블릿은 하단 탭과 가로 인기 사진을 쓴다. 이전 대회 피드의 격자는 유지한다. `pc:`(540px)는 기존 호환 토큰이다. `w-screen`·`100vw`는 가로 넘침을 만든다.
- 높이는 `dvh`(`min-h-dvh`, `max-h-[90dvh]`)로 쓰고 `h-screen`·`min-h-screen`·`100vh`는 쓰지 않는다.
- 안전 영역: 위 고정 요소는 `pt-(--safe-top)`, 아래 고정 요소는 `pb-[calc(16px+var(--safe-bottom))]`. 앱 WebView에서는 네이티브가 맡아 `env()`가 0이므로 `in-app:`으로 안전 영역을 다시 만지지 않는다. `in-app:`(`html[data-app]`)은 앱 설치 안내 숨김 같은 표면 차이에만 쓴다.
- 입력 중 숨길 하단 요소는 `keyboard-open:hidden`(터치 기기 + 글자 입력 포커스). 새 하단 고정 바를 만들지 말고 `StickyCta`를 쓴다. 토스트 위치(`--toast-bottom`)가 `[data-sticky-cta]`·`[data-bottom-nav]`를 보고 비켜 간다.
- z-index는 토큰만: `z-app-bar`·`z-bottom-nav`·`z-sticky-cta`(20) < `z-sheet`(40) < `z-dialog`(50) < `z-toast`(60). `z-10`·`z-[999]`를 쓰지 않는다.

## 터치

- 누를 영역은 44px 이상이다: `IconButton`(44×44, `label` 필수), `Button` `lg` 50·`md` 44. 작게 보여야 하면 `relative`에 `before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']`로 누르는 영역만 넓힌다(`Button` `sm`·`SegmentedControl` 방식).
- Tailwind 4의 `hover:`는 마우스 기기에서만 동작한다. 누르는 요소에는 모두 `active:` 피드백을 준다(`active:not-data-disabled:bg-sunken`, `active:not-data-disabled:scale-[0.98]`).

## 사진

- 비공개 사진(쿠키 인증)은 `next/image`에 `unoptimized`를 준다(Next 이미지 최적화는 사용자 쿠키 없이 받아 실패한다). `aspect-square` 상자와 실제 열 폭에 맞는 `sizes`를 쓰고 첫 화면 첫 장만 우선 로드한다.

## 확인

- `corepack yarn workspace @photo-contest/web test`(`cn` spec), `corepack yarn workspace @photo-contest/web lint`(side 루트).
- 이미 떠 있는 개발 서버(http://localhost:3200)를 휴대폰 폭(360~430px)과 데스크톱 폭에서 본다. 서버를 끄거나 다시 띄우지 않는다. 가로 스크롤이 생기면 안 된다.
