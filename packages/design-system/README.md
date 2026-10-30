# @side/design-system

Game Feedback와 Photo Contest 웹이 공유하는 디자인 토큰과 React UI다. 공식 shadcn/ui의 Base UI / base-nova 소스를 공통 토큰과 기존 공개 API에 연결한다. 설치 원본, 조정 범위와 MIT 라이선스는 [shadcn 구성](SHADCN.md)에 정리했다. API 클라이언트, 인증, 도메인 상태, 라우터, overlay-kit provider는 앱이 소유한다. API·모바일 앱에서 이 웹 패키지를 가져오지 않는다.

```tsx
import { Button, cn, Dialog, FormField, TextField } from '@side/design-system';
import { ButtonLink, IconButtonLink } from '@side/design-system/next';
```

기본 진입점은 프레임워크에 의존하지 않는다. Next.js의 `Link`를 사용하는 `ButtonLink`·`IconButtonLink`만 `/next`에서 제공한다. 패키지는 TypeScript 소스를 내보내므로 Next 앱은 `transpilePackages: ['@side/design-system']`로 연결한다. React·React DOM 19가 필요하며 Next peer는 선택 사항이다.

## 스타일 연결

소비 앱의 Tailwind 4 진입점에서 한 번 가져온다.

```css
@import 'tailwindcss' source(none);
@import '@side/design-system/styles.css';

@source '../../**/*.{ts,tsx}';
```

공유 컴포넌트의 소스 검색은 패키지의 `styles.css`가 맡는다. 앱은 자신의 소스만 등록한다. `theme.css`는 색·글자 크기·분기점의 Tailwind 기본값을 초기화하고 흑백·오렌지 semantic palette와 공통 typography·radius·shadow·z-index·터치 크기를 제공한다. 모든 토큰은 `@theme static`으로 내보내므로 앱의 일반 CSS에서도 `var(--color-ink)`처럼 읽을 수 있다. `styles.css`는 이 테마와 공통 base 스타일을 함께 가져온다. shadcn.css는 같은 테마에서 primary/foreground/ring/border/input-border/popover 등의 shadcn 토큰을 파생하며 색을 앱별로 중복 정의하지 않는다. 테마만 필요한 경우 `@side/design-system/theme.css`를 사용할 수 있다.

입력은 16px, 일반 버튼은 44px, 주 버튼은 50px를 기준으로 한다. 공통 base는 키보드 포커스·터치·reduced motion을 포함한다. 전역 포커스 링은 `focus-ring` 토큰으로 그리며 라이트에서는 짙은 오렌지(흰 바탕 5.98:1), 다크에서는 accent를 써서 WCAG 1.4.11의 3:1을 지킨다. ui 컴포넌트는 이 링을 `outline-none`이나 `focus-visible:ring-*`로 바꾸지 않는다(box-shadow 링은 forced-colors에서 사라진다). 포커스를 받는 팝업 컨테이너만 `outline-hidden`으로 숨겨 forced-colors에서는 보이게 두며 `focus-ring.test.ts`가 확인한다. 앱의 `#pc-main`, 토스트 위치, 내비게이션, 화면 레이아웃은 포함하지 않는다. 새 토큰을 더하면 `src/lib/cn.helper.ts`의 tailwind-merge 설정도 함께 갱신한다.

html에 `data-theme="system|light|dark"`를 지정하면 공통 색상 토큰이 기기 설정 또는 명시한 모드를 따른다. 이 전환은 CSS `light-dark()`로 배포하며 패키지는 변환을 가정하지 않는다. 소비 앱은 이를 지원하는 브라우저(Safari 17.5·Chrome 123·Firefox 120 이상)를 대상으로 하거나 빌드(Tailwind 4의 Lightning CSS 등)에서 변환해야 한다. 그보다 오래된 브라우저는 `@supports not (color: light-dark(#000, #fff))` 블록의 hex 대체값으로 같은 색을 받는다. 테마 색 토큰을 바꾸면 두 곳을 함께 고치며 `color-contrast.test.ts`가 값이 같은지 확인한다. 쿠키 저장과 프로필 설정은 앱에서 처리한다. 속성을 지정하지 않은 소비 앱은 기존 기본 테마를 사용한다. `styles.css`는 `@custom-variant dark`를 정의해 `dark:` 유틸리티도 OS 설정이 아니라 data-theme(`dark`, 또는 `system`에서 기기가 다크일 때)을 따르게 한다. data-theme이 없으면 `dark:`는 적용되지 않는다. 오렌지 accent 위의 글자는 `on-accent`, 메달(gold·silver·bronze) 배경 위의 글자는 `on-medal`로 고정해 다크 모드에서도 대비를 유지한다. 배지 tone은 모든 모드에서 글자 대비 4.5:1 이상을 지키며 `Badge.test.tsx`가 토큰 값으로 계산해 확인한다.

## 공개 UI

- `Input`, `Textarea`, `NativeSelect`, `NativeSelectOption`, `NativeSelectOptGroup`: shadcn 폼 컨트롤. native ref/event/aria를 전달하며 입력은 16px을 유지한다. 세 입력은 같은 공통 토큰 상자(`input/input.styles.ts`)를 쓴다. Textarea는 내용에 맞춰 늘고 세로로만 크기를 바꾼다. NativeSelect는 모바일 OS 선택창을 사용한다.
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`: Base UI의 키보드 선택/포털/포커스 복귀를 사용하는 shadcn 드롭다운이다. 트리거와 옵션은 44px 한 크기다.
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`: 작업 메뉴. 삭제·차단 같은 항목은 `variant="danger"`다.

이름은 한 개념에 하나만 쓴다. 되돌리기 어려운 행동은 Button·DropdownMenuItem의 `variant="danger"`, 배지의 `tone="danger"`이고 주 행동 색은 Button·IconButton 모두 `primary`다. registry 원본의 `default`·`outline`·`destructive`·`link` variant와 같은 크기를 두 번 정의한 `default`·`icon-sm` size는 쓰지 않는다.

- `Toaster`, `toast`: Sonner 알림. 공통 색/폰트/모서리/닫기 크기를 적용하며 theme과 번역/위치는 앱이 전달한다.
- `Checkbox`: checked/onCheckedChange를 사용하며 RHF Controller의 boolean 필드를 연결한다. 보이는 상자는 16px이고 누르는 영역은 44×44px이다.
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`: 방향키·포커스·ARIA를 포함한 탭이다. 선택값과 URL은 앱이 소유한다. `TabsList variant="default"`는 채운 칸(segmented), `"line"`은 밑줄 탭이며 공통 토큰(`text-label`, `text-muted`→활성 `text-ink`, `bg-sunken`·`bg-surface`·`shadow-card`, `border-ink`)으로 그린다. 보이는 칸이 36px이어도 누르는 영역은 44px이다.
- `DialogRoot`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogPortal`, `DialogOverlay`: shadcn 조합 API다. 기존 `Dialog`는 이를 조합하며 호출부의 props를 유지한다.

- `Button`: `variant="primary|secondary|ghost|danger|accent"`, `size="lg|md|sm|icon|icon-lg"`, `fullWidth`, `loading`, `icon`. 진행 중 재클릭을 막으면서 포커스를 유지하고 `aria-busy`를 알린다. 글자 앞 아이콘은 `icon`으로 넘기면 진행 중에 같은 자리를 진행 표시가 대신하므로 `{!pending && <Icon />}` 분기가 필요 없다. children 안에 직접 넣은 아이콘은 진행 중에도 남고 진행 표시는 그 앞에 붙는다. `buttonVariants`와 `IButtonProps`도 공개한다.
- `ButtonLink`: 같은 표현 API와 Next `Link` props를 `/next`에서 제공한다. 이동에는 링크, 제출·조작에는 버튼을 사용한다.
- `IconButton`: `label`이 필수이며 `variant="ghost|soft|primary|accent"`와 `loading`을 지원한다. 진행 중에는 아이콘 자리를 진행 표시가 대신하고 포커스를 유지한다. 링크 등 다른 요소에 같은 모양을 입힐 때는 `iconButtonVariants({ variant })`를 쓴다.
- `IconButtonLink`: 같은 표현 API와 Next `Link` props를 `/next`에서 제공한다(`label` 필수).
- `TextField`, `TextAreaField`: `FormField`에 `Input`·`Textarea`를 넣은 조합이다. `label`, `description`, `error`, `labelSuffix`, native input/textarea props와 ref를 받고 `className`은 필드 전체에 붙는다. labelSuffix는 앱이 제공하는 필수/선택 등 보조 표시이며 접근성 이름에서 빠진다. `TextAreaField`는 내용에 따라 늘지 않고 `rows`(기본 4줄) 높이를 유지한다. RHF의 `{...register('name')}`를 그대로 전달한다.
- `FormField`: native `<label>` 폼용 `label`, `children`, `description`, `error`, `labelSuffix`. 도움말 prop은 TextField와 같은 `description` 하나다. `Input`·`Textarea`·`NativeSelect`는 context로 연결하므로 memo·래퍼·서버 컴포넌트를 거쳐도 레이블·도움말·오류가 붙는다. native `input`·`textarea`·`select`는 직접 자식일 때만 연결한다. 소비자가 넘긴 `aria-labelledby`·`aria-label`은 유지하고 `aria-describedby`에는 도움말·오류를 덧붙이며 ref는 그대로 전달한다. label 안에 들어가므로 NativeSelect 래퍼는 `span`이다. 직접 자식인 native 요소에는 스타일을 입히지 않으므로 공통 모양은 Input·Textarea·NativeSelect로 얻는다.
- `Badge`, `Avatar`, `Spinner`, `Mention`: 상태 글자·이름 fallback·진행 표시·@멘션을 제공한다. 각 요소의 native props(`id`·`title`·`aria-*`·`data-*`)와 ref를 그대로 전달한다. `Avatar`는 이름 옆 장식이며 스크린 리더에서 숨긴다. `Spinner`에 `label`을 주면 `role="status"` 안의 숨긴 글자로 넣어 live region이 진행 상태를 읽는다(aria-label만으로는 읽히지 않는다).
- `Dialog`: `open`, `onOpenChange`, `title`, `description`, `children`, `closeLabel`(필수), `dismissible`, `container`, `onOpenChangeComplete`, `className`. Base UI가 포커스와 중첩 대화상자를 관리한다. `dismissible={false}`는 닫기 버튼·Esc·바깥 클릭을 막으며 앱이 명시적인 완료 동작으로 `open`을 바꾼다.
- `BottomSheet`: Base UI [Drawer](https://base-ui.com/react/components/drawer)를 사용하는 입력 시트다. 기본은 위쪽 핸들을 끌어 화면의 60%와 전체 높이 사이를 이동하고 아래로 끌어 닫는다. 핸들의 방향키·PageUp·PageDown·Home·End·Enter·Space 조작도 지원하며 현재 높이를 `aria-valuetext`(60%·100%)로 알린다. 제목과 핸들은 고정되고 본문은 별도로 스크롤하며 소프트 키보드는 `VirtualKeyboardProvider`로 처리한다. `resizeLabel`·`closeLabel`은 필수이며 소비 앱에서 번역한다. `snapPoints`로 높이 단계를 바꿀 수 있고 나머지 제어 props는 Dialog와 동일하다. `onOpenChangeComplete(false)` 뒤 unmount하면 닫힘 전환도 유지된다. 제스처가 없는 `Dialog placement="bottom"`은 없앴으므로 하단 시트는 BottomSheet만 쓴다.

`BottomSheet`의 `footer`는 스크롤 본문 밖 하단에 작업 버튼을 가로로 배치한다. 본문 폼에 `id`를 주고 제출 버튼의 `form`에 연결하면 기본 폼 검증·Enter 제출도 유지된다. `responsive`를 켜면 CSS 미디어쿼리로 768px부터 같은 팝업을 중앙 모달로 표시한다. 화면 크기가 바뀌어도 입력과 포커스는 같은 인스턴스에 남는다. `showCloseButton={false}`는 상단 X를 숨기며, Esc·바깥 클릭의 허용 여부는 `dismissible`로 정한다. Game Feedback은 반응형 표시와 하단 작업 버튼을 쓰고 상단 X를 숨긴다.

배치·슬롯을 바꿔야 하면 같은 부품을 조합한다. 위의 `BottomSheet`도 이 조합이다.

```tsx
<BottomSheet.Root
  open={open}
  onOpenChange={setOpen}
  onOpenChangeComplete={(next) => !next && unmount()}
  snapPoints={[0.75, 1]}
>
  <BottomSheet.Handle label={t('시트 높이 조절')} />
  <BottomSheet.Header title={title} description={description}>
    <BottomSheet.Close label={t('닫기')} />
  </BottomSheet.Header>
  <BottomSheet.Content className="px-5">{children}</BottomSheet.Content>
  <BottomSheet.Footer>{actions}</BottomSheet.Footer>
</BottomSheet.Root>
```

- `Root`: `open`, `onOpenChange`, `onOpenChangeComplete`, `snapPoints`, `snapPoint`·`onSnapPointChange`(생략하면 내부 상태이고 닫힌 뒤 첫 값으로 돌아간다), `dismissible`, `responsive`, `container`, `className`. `snapPoints`는 작은 값부터 적는 화면 비율(0~1)이나 px이며 첫 값으로 연다. 생략하면 내용 높이로 열고 넘치면 본문만 스크롤한다. 값이 하나면 그 높이에 고정한다. 고정 높이 시트에는 Root가 장식용 손잡이를 그린다.
- `Handle`: `label` 필수. `snapPoints`가 둘 이상일 때만 높이 조절 slider로 그린다. 모두 비율이면 높이 %를, px가 섞이면 단계(1~n)를 값으로 알린다.
- `Header`: `title`(ReactNode), `description`, 제목 옆에 둘 `children`. `Close`: `label` 필수인 X 버튼이며 `dismissible={false}`이면 그리지 않는다.
- `Content`·`Footer`: 스크롤 본문과 고정 하단 영역. 기본 여백은 `className`으로 바꾼다.

뒤로 가기로 닫기(history), overlay unmount 같은 앱 흐름은 `onOpenChange`·`onOpenChangeComplete`에 앱이 연결한다.

패키지는 여러 언어 앱이 함께 쓰므로 접근성 이름에 한국어 기본값을 두지 않는다. Dialog·DialogContent·BottomSheet의 `closeLabel`, BottomSheet의 `resizeLabel`, BottomSheet.Handle·Close의 `label`은 필수이고 빠지면 타입 오류다. 닫기 버튼을 숨긴 `DialogContent showCloseButton={false}`만 이름 없이 쓸 수 있다.

컴포넌트는 모두 `className`을 지원한다. 클래스 병합은 공통 `cn`을 사용하며 뒤의 같은 종류 값이 우선한다. 공개 props 타입은 `I` 접두사, 배지 tone 타입은 `TBadgeTone`으로 내보낸다. 루트 진입점의 값은 `@side/design-system/ui/<폴더>` 하위 경로에서도 같은 객체로 가져올 수 있으며 모든 `src/ui/*` 폴더는 `index.ts`를 둔다(`package-exports.spec.ts`).

Photo Contest의 `AlertDialog`는 앱에 남는다. 그 앱은 `dialogStyles.backdrop|viewport|popup|title|description`을 재사용하면서 history·portal·비동기 확인 동작을 유지한다. 바텀시트는 이 패키지의 조합 부품을 `responsive`로 쓰고 앱의 Root가 history·portal·overlay unmount를, Footer가 하단 취소 버튼을 연결한다. 일반 `Dialog`도 뒤로 가기나 라우트 변경을 직접 관리하지 않는다. 그런 흐름은 앱에서 연결한다.

## 상태 모션

`StatusAnimation`은 직접 작성한 벡터 Lottie 7종(`loading`, `success`, `error`, `empty`, `offline`, `game`, `cat`)을 제공한다. `className`, 의미 있는 그림의 `label`, 반복 여부 `loop`, 정지 대체 그림 `fallback`을 받는다. 주변 글자와 같은 의미면 label을 생략해 장식으로 둔다.

```tsx
<StatusAnimation variant="empty" className="size-16" />
```

첫 HTML에는 정지 그림을 렌더하고 브라우저에서 SVG 전용 `lottie-web` light 플레이어를 지연 로드한다. 모션 감소 설정에서는 정지 그림을 유지하고, 화면 밖이나 숨긴 탭에서는 재생을 멈추며 unmount 때 플레이어와 observer·listener를 정리한다. 기본 반복은 loading과 cat뿐이며 나머지는 한 번 재생한다. 외부 이미지·서비스 요청·애니메이션 자산 라이선스 의존은 없다.

공통 Spinner와 버튼 진행 표시, Toaster 성공·실패가 이 컴포넌트를 쓴다. 앱은 빈 목록·연결 상태·대표 그림에 필요할 때 연결하고, 피드 카드나 레이아웃을 유지하는 skeleton을 전부 애니메이션으로 바꾸지 않는다. jsdom은 외부 SVG 플레이어만 대체하고 실제 렌더·모션 설정 전환은 Photo Contest 웹이 소유하는 Chromium·Safari 브라우저 검사에서 확인한다.

## Storybook

저장소 루트에서 실행한다.

```sh
yarn storybook
```

`http://localhost:6006`에서 공통 토큰과 UI의 기본·오류·로딩·비활성 상태를 확인한다. Controls로 props를 바꾸고 테마 툴바에서 light·dark·system을 전환할 수 있다. Accessibility 패널은 각 예제의 접근성 점검 결과를 보여 주며 `a11y.test`는 `'error'`라 위반을 실패로 다룬다. `yarn test`의 `src/stories/stories-a11y.spec.tsx`가 모든 스토리를 jsdom에서 axe로 검사한다. jsdom은 스타일을 계산하지 않으므로 색 대비는 토큰 대비 테스트(`color-contrast.test.ts`, `Badge.test.tsx`)가 맡는다.

React + Vite와 Tailwind 4를 사용하며 앱과 같은 `src/styles.css`를 가져온다. 테마는 iframe의 html에 적용해 다이얼로그·메뉴 같은 포털에도 전달한다. Next 전용 `ButtonLink`·`IconButtonLink`는 Storybook에 두지 않고 소비 앱과 단위 테스트에서 검증한다.

스토리는 컴포넌트 옆의 `*.stories.tsx`에 CSF 형식으로 추가한다. 자동 문서와 타입 검사를 공통 적용하며 상태가 필요한 예제는 이름 있는 함수 컴포넌트로 작성한다.

```sh
yarn build:storybook
```

정적 결과는 `packages/design-system/dist/storybook`에 생성된다. 기존 `check`에도 정적 빌드를 포함해 CI에서 설정과 스토리 빌드를 함께 검증한다.

## 검사

저장소 루트에서 Node.js 24와 저장소 Yarn을 사용한다.

```sh
yarn workspace @side/design-system check
```

패키지가 Vitest·jsdom 테스트를 소유한다. 실제 Base UI와 RHF를 사용해 loading 중 포커스, 검증 오류와 첫 오류 포커스, native ref와 ARIA 연결, 클래스 병합, 중첩 대화상자와 필수 확인 동작을 확인한다. 각 앱의 history·오버레이·도메인 통합 검사는 앱에 남긴다.
