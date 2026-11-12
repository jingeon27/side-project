# styling

원칙은 [frontend](architecture.md) 문서의 "모바일 레이아웃"이다. 아래는 이 앱 설정에서 생기는 함정과 쓰는 값이다.

## Tailwind 4 (설정 파일 없음)

- 진입점은 `src/_app/styles/tailwind.css`(`@import 'tailwindcss' source(none)` + `@side/design-system/styles.css` + 앱 `globals.css`)다. 앱은 `@source '../../**/*.{ts,tsx}'`(= `src`)를 훑고, 공통 패키지는 자신의 스타일 진입점에서 소스 스캔을 캡슐화한다. 클래스는 소스에 완전한 문자열로 쓴다. `bg-${tone}` 같은 조합은 생성되지 않으니 cva variant나 전체 이름 매핑을 쓴다.
- 루트 `packages/design-system`의 공통 테마가 기본 색·글자 크기·분기점을 지운다(`--color-*`·`--text-*`·`--breakpoint-*: initial`). 앱에 같은 토큰을 복제하지 않는다. `bg-white`·`text-gray-500`·`text-sm`·`md:`는 오류 없이 아무 스타일도 만들지 않는다. 있는 값:
  - 색: `brand`(`-strong`·`-soft`) `accent`(`-soft`·`-ink`) `ink` `muted` `subtle` `line`(`-strong`) `surface` `sunken` `canvas` `background` `danger`(`-soft`) `info`(`-soft`) `neutral-soft` `gold` `silver` `bronze` `kakao` `on-brand` `scrim`
  - 글자: `text-display|title-lg|title|subtitle|body|input|button|label|caption|micro`(크기·줄 높이·굵기·자간 한 묶음)
  - `rounded-badge|control|card|sheet`, `shadow-app|card|sheet|toast`, `h-app-bar`(60) `h-bottom-nav`(76) `h-cta`(50) `size-touch`(44), `max-w-app`(모바일 폼 540)·`max-w-feed`(데스크톱 피드 680)·`max-w-web`(1440, 화면 셸에는 미사용). 기본 spacing(`p-4`·`gap-2`)은 그대로 있다.
- 토큰을 더하면 공통 패키지의 `@theme`에 넣고, 글자·모서리·그림자·spacing·z·max-w 토큰이면 공통 `cn`의 `extendTailwindMerge`에도 등록한다. 공통 패키지 테스트와 앱의 `src/shared/lib/cn.helper.spec.ts`로 실제 연결을 검증한다. 빠지면 tailwind-merge가 `cn('text-title', 'text-ink')`에서 하나를 지운다. `var()`로만 읽는 값은 `@theme static`에 둔다.
- `src/_app/styles/globals.css`에는 `@layer base` 안의 `#pc-main` 토스트 위치만 둔다. 공통 body·입력·포커스·모션 reset은 디자인 시스템이 소유한다. 앱바 배경(`--color-surface`)을 바꾸면 `src/shared/constants/layout.ts`의 `THEME_COLOR`도 바꾼다.
- 합치기는 `@side/design-system`의 `cn()`을 사용한다(`@/shared/lib/cn.helper`는 명시적 re-export, 뒤에 온 값이 이긴다). `!` 유틸(`p-0!`·`!p-0`), 임의 hex(`bg-[#fff]`), 색 inline style은 쓰지 않는다. 토큰이 있는 값(색·글자·모서리·그림자·z·높이)을 임의 값으로 쓰지 않는다.
- Base UI 상태는 `data-*` 변형으로 꾸민다(`data-disabled:`·`data-pressed:`·`data-invalid:`·`data-starting-style:`·`data-ending-style:`). `Button`의 `loading`은 native `disabled`를 걸지 않으므로 `disabled:` 변형이 맞지 않는다.
- 키보드 포커스는 공통 base.css의 전역 `:focus-visible` 링(`focus-ring` 토큰, 3px)을 쓴다. 숨긴 파일 입력은 감싼 요소에 `has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring`을 주고, 흰 바탕에서 2.10:1인 accent 외곽선이나 ring은 쓰지 않는다. 메뉴 항목처럼 실제 포커스가 옮겨 가는 요소에서는 `outline-none`·`outline-hidden`으로 링을 지우지 않는다. 강조 배경(sunken)은 팝업 바탕과 약 1.04:1이라 위치를 알리지 못한다. 팝업 여백에 링이 잘리면 `-outline-offset-3`로 안쪽에 그린다.
- 선택 상태는 다크 모드에서도 3:1 이상 차이가 나게 한다. surface·sunken 바탕(1.07:1)과 ink·muted 글자(1.97:1)만으로는 고른 칸이 구분되지 않으므로 `SegmentedControl`처럼 고른 칸에 `control-border` 테두리를 더한다.
- 버튼 모서리는 공통 `Button`·`ButtonLink`의 `shape`로 고르고 className에 `rounded-full`·`rounded-control`을 쓰지 않는다. 기본값 `rounded`(8px)를 쓰고, `pill`은 만들기 진입(그룹 만들기, 글쓰기, 대회 개최하기), 게시물 카드 아래 행동(좋아요, 댓글, 저장)과 이전 대회 사진의 좋아요 칩, 댓글 더 보기에만 쓴다. 그룹 머리의 가입, 초대와 멤버 보기, 프로필 수정과 댓글 줄의 좋아요는 기본 모서리다.
- 아바타는 그룹(탐색 카드, 그룹 머리, MY 카드, 홈 바로 가기)을 브랜드 그라데이션 머리글자인 `shape="squircle" tone="gradient"`로, MY의 내 프로필을 `tone="gradient"` 원으로, 그 밖의 사람(게시물, 댓글과 입력 줄, 댓글 모달의 원본 게시물, 멤버, 가입 신청, 이전 대회 캡션)을 `tone="accent"` 원으로 쓴다. 모양과 색은 className으로 덮어쓰지 않고 크기, 여백, 위치만 준다. 공개 범위 배지는 `Badge tone="outline"`이다. 같은 이름의 tone은 배지와 아바타에서 같은 색이고, 사진이 비는 자리인 `outline` 아바타만 바탕이 sunken이다(`packages/design-system/README.md`의 Badge·Avatar 항목). 사진을 고르는 미리보기도 같은 모양이다. 그룹 대표 사진은 그룹 만들기(`GroupImagePicker`)와 그룹 프로필 수정(`ImageFileField`의 `shape="squircle"`)에서 squircle이고, 프로필 사진(`ImageFileField` 기본값)은 원이다.

## 레이아웃

- 화면은 `main#pc-main`(`src/app/layout.tsx`, `w-full`로 화면 전체 폭) 안에 그린다. 위아래 고정 바는 `sticky`인 `TopAppBar`·`StickyCta`·`BottomNav`를 쓴다. 입력 오버레이는 768px 미만에서 화면 너비의 하단 시트, 그 이상에서 중앙 모달로 표시한다. 공통 `BottomSheet.Root responsive`의 CSS를 사용하고 화면 크기를 React 상태로 나눠 폼 DOM을 복제하지 않는다. 취소와 주 행동은 하단 flex row에서 같은 너비로 배치한다. 일반 폼·CTA·토스트는 읽기 쉬운 폭을 유지한다. 오버레이 portal은 `getOverlayContainer()`를 쓴다.
- 상시 게시물은 모바일·태블릿 최대 540px, 데스크톱 최대 680px의 1열 피드다. 데스크톱(1024px 이상)은 왼쪽 고정 메뉴·중앙 피드·오른쪽 인기 사진이며 하단 탭은 숨긴다. 모바일·태블릿은 하단 탭과 피드 위의 인기 목록을 쓴다. 인기 목록은 모든 기기에서 순위·64px 사진·내용 순서로 한 줄씩 표시한다. 이전 대회 피드의 격자는 유지한다. `wide:`(1280px)부터 메뉴·인기 영역을 넓히며, `pc:`(540px)는 기존 호환 토큰이다. `w-screen`·`100vw`는 가로 넘침을 만든다.
- 높이는 `dvh`(`min-h-dvh`, `max-h-[90dvh]`)로 쓰고 `h-screen`·`min-h-screen`·`100vh`는 쓰지 않는다.
- 안전 영역: 위 고정 요소는 `pt-(--safe-top)`, 아래 고정 요소는 `pb-[calc(16px+var(--safe-bottom))]`. 앱 WebView에서는 네이티브가 맡아 `env()`가 0이므로 `in-app:`으로 안전 영역을 다시 만지지 않는다. `in-app:`(`html[data-app]`)은 앱 설치 안내 숨김 같은 표면 차이에만 쓴다.
- 입력 중 숨길 하단 요소는 `keyboard-open:hidden`(터치 기기 + 글자 입력 포커스). 새 하단 고정 바를 만들지 말고 `StickyCta`를 쓴다. 토스트 위치(`--toast-bottom`)가 `[data-sticky-cta]`·`[data-bottom-nav]`를 보고 비켜 간다.
- z-index는 토큰만: `z-app-bar`·`z-bottom-nav`·`z-sticky-cta`(20) < `z-sheet`(40) < `z-dialog`(50) < `z-toast`(60). `z-10`·`z-[999]`를 쓰지 않는다.

## 터치

- 누를 영역은 44px 이상이다: `IconButton`(44×44, `label` 필수), `Button` `lg` 50·`md` 44. 작게 보여야 하면 `relative`에 `before:absolute before:inset-x-0 before:top-1/2 before:h-touch before:-translate-y-1/2 before:content-['']`로 누르는 영역만 44px로 넓힌다(`Button` `sm`·`SegmentedControl` 방식). 가상 요소는 테두리 안쪽을 기준으로 놓이므로 테두리가 있는 요소는 위아래 음수 inset 대신 높이를 직접 정한다.
- 넘침을 자르는 요소(`truncate`·`line-clamp-*`·`overflow-hidden`·`overflow-clip`·`overflow-auto`·`overflow-scroll`)에는 가상 요소 넓히기를 쓰지 않는다. 자기 가상 요소까지 잘린다. 말줄임은 안쪽 span(`block truncate`)에 둔다(게시물 카드 그룹 이름 링크).
- 넓힌 영역은 다른 누름 대상과 겹치면 안 된다. 게시물 카드 그룹 이름처럼 줄 높이가 낮은 링크는 위아래로 넓힌 영역이 이웃한 비대화형 줄(작성자·시각)을 덮을 수 있다. 카드 머리 높이를 지키려는 의도된 선택이다.
- Tailwind 4의 `hover:`는 마우스 기기에서만 동작한다. 누르는 요소에는 모두 `active:` 피드백을 준다(`active:not-data-disabled:bg-sunken`, `active:not-data-disabled:scale-[0.98]`).
- 펼침 영역은 `@side/design-system`의 `Disclosure`·`DisclosureTrigger`를 쓰고 `details`·`summary`를 직접 쓰지 않는다. 기본 ▶ 숨김, 44px 누르는 영역, 열림 화살표 회전, 포커스 링은 공통 컴포넌트가 맡는다.
- 접근 이름은 보이는 글자를 그대로 담는다(WCAG 2.5.3, `e2e/accessibility.spec.ts`). 보이는 글자를 줄이거나 다르게 쓰는 `aria-label`은 두지 않고, 숫자 뒤 '개'처럼 덧붙일 말은 숨긴 글자로 넣는다(알림·좋아요). 카드 전체를 누르는 링크는 이름만 링크 글자로 두고 링크의 가상 요소(`after:absolute after:inset-0`)로 카드를 덮으며, 나머지 정보는 `aria-describedby`로 읽는다(`DiscoverGroupCard`).

## 사진

- 비공개 사진(쿠키 인증)은 `next/image`에 `unoptimized`를 준다(Next 이미지 최적화는 사용자 쿠키 없이 받아 실패한다). 게시물 틀은 올릴 때 저장한 가로·세로의 비율을 4:5~1.91:1로 제한해 쓰고, 크기가 없는 예전 게시물만 `aspect-square`(데스크톱 4:3) 상자를 쓴다. 실제 열 폭에 맞는 `sizes`를 쓰고 첫 화면 첫 장만 우선 로드한다.

## 확인

- `yarn workspace @side/design-system check`와 `yarn workspace @photo-contest/web test`(기존 UI·`cn` 통합 spec), `yarn workspace @photo-contest/web lint`(side 루트).
- `src/_app/styles/accessible-classes.test.ts`가 앱 소스 클래스로 `placeholder:text-subtle`, accent 포커스 외곽선, 넘침 자르기에 잘린 넓힌 누름 영역, 다른 포커스 표시 목록 밖의 `outline-none`·`outline-hidden`을 막는다. 같은 파일이 TypeScript 구문 트리로 JSX를 읽어 직접 그린 `summary`, `Button`·`ButtonLink` className(그 안에서 부르는 cva 문자열 포함)의 `rounded-full`·`rounded-control`, `tone` 없는 `Avatar`, `Avatar`·`Badge` className의 바탕·모서리·테두리·글자색도 막는다. 목록과 실제 일치가 정확히 같아야 통과하므로 고치거나 더하면 목록도 함께 바꾼다.
- 화면 단위 접근성은 `e2e/accessibility.spec.ts`가 실제 브라우저에서 axe-core로 확인한다(홈, 댓글 시트, 그룹, 글쓰기, 탐색, MY, 알림, 그룹 대회 투표·결과를 라이트·다크로). WCAG 2.x A·AA의 serious·critical 위반이 있으면 실패한다. 빼야 하는 결과는 파일 안의 허용 목록에 규칙, 조건, 이유, 발견 ID를 함께 적는다.
- 이미 떠 있는 개발 서버(http://localhost:3200)를 휴대폰 폭(360~430px)과 데스크톱 폭에서 본다. 서버를 끄거나 다시 띄우지 않는다. 가로 스크롤이 생기면 안 된다.

데스크톱 글쓰기는 2열 안에서 미디어·내용을 함께 보고, 댓글은 게시물 미디어·대화를 나란히 본다. 그룹의 글쓰기는 멤버용 플로팅 링크로 제공하며 초대·멤버 정보는 인기 목록 아래에 둔다. 홈·탐색과 표시·스크롤 수명을 공유하지만 그룹 상세는 현재 그룹 작성으로 바로 이동한다. 하단 메뉴가 없는 상세에서는 안전 영역 위 24px(데스크톱 32px)에 두고 본문·토스트 간격을 확보한다. GalleryFeed의 sidebar 슬롯은 모바일에서 피드 아래로 내려가며 DOM을 복제하지 않는다.

검색 필드는 `labelSuffix={null}`로 필수·선택 표시를 숨긴다. 실제 데이터 입력 폼의 필수·선택 표시는 유지한다. 카드·CTA의 화면 이동은 Game Feedback과 같은 `ArrowUpRight`를 쓰고, 뒤로 가기는 `ChevronLeft`, 경로 구분은 `>`로 구분한다.

그룹 소개·탭·카테고리는 `max-w-6xl`로 정렬한다. 긴 소개는 아바타 아래의 전체 폭을 쓰며 카테고리와 초대 버튼은 확대된 글자에서도 폭을 넘지 않게 줄바꿈한다. 소개의 `초대와 멤버 보기`가 기존 sidebar details를 열고 포커스를 옮기므로 관리 DOM을 복제하지 않는다. 빈 인기 안내는 한 문장으로 줄이고 첫 게시물 작성 행동은 `EmptyState.action` 안에 둔다.
