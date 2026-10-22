# @side/design-system

Game Feedback와 Photo Contest 웹이 공유하는 디자인 토큰과 React UI다. 공식 shadcn/ui의 Base UI / base-nova 소스를 공통 토큰과 기존 공개 API에 연결한다. 설치 원본, 조정 범위와 MIT 라이선스는 [shadcn 구성](SHADCN.md)에 정리했다. API 클라이언트, 인증, 도메인 상태, 라우터, overlay-kit provider는 앱이 소유한다. API·모바일 앱에서 이 웹 패키지를 가져오지 않는다.

```tsx
import { Button, cn, Dialog, FormField, TextField } from '@side/design-system';
import { ButtonLink } from '@side/design-system/next';
```

기본 진입점은 프레임워크에 의존하지 않는다. Next.js의 `Link`를 사용하는 `ButtonLink`만 `/next`에서 제공한다. 패키지는 TypeScript 소스를 내보내므로 Next 앱은 `transpilePackages: ['@side/design-system']`로 연결한다. React·React DOM 19가 필요하며 Next peer는 선택 사항이다.

## 스타일 연결

소비 앱의 Tailwind 4 진입점에서 한 번 가져온다.

```css
@import 'tailwindcss' source(none);
@import '@side/design-system/styles.css';

@source '../../**/*.{ts,tsx}';
```

공유 컴포넌트의 소스 검색은 패키지의 `styles.css`가 맡는다. 앱은 자신의 소스만 등록한다. `theme.css`는 색·글자 크기·분기점의 Tailwind 기본값을 초기화하고 흑백·오렌지 semantic palette와 공통 typography·radius·shadow·z-index·터치 크기를 제공한다. 모든 토큰은 `@theme static`으로 내보내므로 앱의 일반 CSS에서도 `var(--color-ink)`처럼 읽을 수 있다. `styles.css`는 이 테마와 공통 base 스타일을 함께 가져온다. shadcn.css는 같은 테마에서 primary/foreground/ring/border/input-border/popover 등의 shadcn 토큰을 파생하며 색을 앱별로 중복 정의하지 않는다. 테마만 필요한 경우 `@side/design-system/theme.css`를 사용할 수 있다.

입력은 16px, 일반 버튼은 44px, 주 버튼은 50px를 기준으로 한다. 공통 base는 키보드 포커스·터치·reduced motion을 포함한다. 전역 포커스 링은 `focus-ring` 토큰으로 그리며 라이트에서는 짙은 오렌지(흰 바탕 5.98:1), 다크에서는 accent를 써서 WCAG 1.4.11의 3:1을 지킨다. 앱의 `#pc-main`, 토스트 위치, 내비게이션, 화면 레이아웃은 포함하지 않는다. 새 토큰을 더하면 `src/lib/cn.helper.ts`의 tailwind-merge 설정도 함께 갱신한다.

html에 `data-theme="system|light|dark"`를 지정하면 공통 색상 토큰이 기기 설정 또는 명시한 모드를 따른다. 쿠키 저장과 프로필 설정은 앱에서 처리한다. 속성을 지정하지 않은 소비 앱은 기존 기본 테마를 사용한다. 오렌지 accent 위의 글자는 `on-accent`, 메달(gold·silver·bronze) 배경 위의 글자는 `on-medal`로 고정해 다크 모드에서도 대비를 유지한다. 배지 tone은 모든 모드에서 글자 대비 4.5:1 이상을 지키며 `Badge.test.tsx`가 토큰 값으로 계산해 확인한다.

## 공개 UI

- `Input`, `Textarea`, `NativeSelect`, `NativeSelectOption`, `NativeSelectOptGroup`, `Label`: shadcn 폼 컨트롤. native ref/event/aria를 전달하며 입력은 16px을 유지한다. NativeSelect는 모바일 OS 선택창을 사용한다.
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`: Base UI의 키보드 선택/포털/포커스 복귀를 사용하는 shadcn 드롭다운이다. 기본 트리거와 옵션은 44px이다.
- `Toaster`, `toast`: Sonner 알림. 공통 색/폰트/모서리/닫기 크기를 적용하며 theme과 번역/위치는 앱이 전달한다.
- `Checkbox`: checked/onCheckedChange를 사용하며 RHF Controller의 boolean 필드를 연결한다.
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`: 방향키·포커스·ARIA를 포함한 제어형 탭이다. 선택값과 URL은 앱이 소유한다.
- `DialogRoot`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogPortal`, `DialogOverlay`: shadcn 조합 API다. 기존 `Dialog`는 이를 조합하며 호출부의 props를 유지한다.

- `Button`: `variant="primary|secondary|ghost|danger|accent"`, `size="lg|md|sm"`, `fullWidth`, `loading`. 진행 중 재클릭을 막으면서 포커스를 유지한다. `buttonVariants`와 `IButtonProps`도 공개한다.
- `ButtonLink`: 같은 표현 API와 Next `Link` props를 `/next`에서 제공한다. 이동에는 링크, 제출·조작에는 버튼을 사용한다.
- `IconButton`: `label`이 필수이며 `variant="ghost|soft|brand"`를 지원한다.
- `TextField`, `TextArea`: `label`, `description`, `error`, `labelSuffix`, native input/textarea props와 ref를 받는다. labelSuffix는 앱이 제공하는 필수/선택 등 보조 표시다. RHF의 `{...register('name')}`를 그대로 전달한다.
- `FormField`: 기존 native `<label>` 폼용 `label`, `children`, `hint`, `error`. `Input`·`Textarea`·`NativeSelect`는 context로 연결하므로 memo·래퍼·서버 컴포넌트를 거쳐도 레이블·도움말·오류가 붙는다. native `input`·`textarea`·`select`는 직접 자식일 때만 연결한다. 소비자가 넘긴 `aria-labelledby`·`aria-label`은 유지하고 `aria-describedby`에는 도움말·오류를 덧붙이며 ref는 그대로 전달한다. label 안에 들어가므로 NativeSelect 래퍼는 `span`이다. 단독 native 입력은 `.ds-input`, `.ds-textarea`, `.ds-select`로 같은 공통 스타일을 사용할 수 있다.
- `Badge`, `Avatar`, `Spinner`: 상태 글자·이름 fallback·진행 표시를 제공한다. `Avatar`는 이름 옆 장식이며 스크린 리더에서 숨긴다. `Spinner`에 `label`을 주면 진행 상태로 읽힌다.
- `Dialog`: `open`, `onOpenChange`, `title`, `description`, `children`, `dismissible`, `container`, `onOpenChangeComplete`, `className`. Base UI가 포커스와 중첩 대화상자를 관리한다. `dismissible={false}`는 닫기 버튼·Esc·바깥 클릭을 막으며 앱이 명시적인 완료 동작으로 `open`을 바꾼다.
- `BottomSheet`: Base UI [Drawer](https://base-ui.com/react/components/drawer)를 사용하는 입력 시트다. 위쪽 핸들을 끌어 화면의 60%와 전체 높이 사이를 이동하고 아래로 끌어 닫는다. 핸들의 방향키·Home·End·Enter·Space 조작도 지원한다. 제목과 핸들은 고정되고 본문은 별도로 스크롤하며 소프트 키보드는 `VirtualKeyboardProvider`로 처리한다. `resizeLabel`·`closeLabel`은 소비 앱에서 번역한다. 나머지 제어 props는 Dialog와 동일하며, `onOpenChangeComplete(false)` 뒤 unmount하면 닫힘 전환도 유지된다. 기존 `Dialog placement="bottom"`은 제스처가 없는 하단 배치 API로 유지한다.

컴포넌트는 모두 `className`을 지원한다. 클래스 병합은 공통 `cn`을 사용하며 뒤의 같은 종류 값이 우선한다. 공개 props 타입은 `I` 접두사, 배지 tone 타입은 `TBadgeTone`으로 내보낸다.

Photo Contest의 `AlertDialog`·바텀시트는 앱에 남는다. 그 앱은 `dialogStyles.backdrop|viewport|popup|title|description`을 재사용하면서 history·portal·비동기 확인 동작을 유지한다. 일반 `Dialog`도 뒤로 가기나 라우트 변경을 직접 관리하지 않는다. 그런 흐름은 앱에서 연결한다.

## Storybook

저장소 루트에서 실행한다.

```sh
corepack yarn storybook
```

`http://localhost:6006`에서 공통 토큰과 UI의 기본·오류·로딩·비활성 상태를 확인한다. Controls로 props를 바꾸고 테마 툴바에서 light·dark·system을 전환할 수 있다. Accessibility 패널은 각 예제의 접근성 점검 결과를 보여 준다.

React + Vite와 Tailwind 4를 사용하며 앱과 같은 `src/styles.css`를 가져온다. 테마는 iframe의 html에 적용해 다이얼로그·메뉴 같은 포털에도 전달한다. Next 전용 `ButtonLink`는 소비 앱에서 검증한다.

스토리는 컴포넌트 옆의 `*.stories.tsx`에 CSF 형식으로 추가한다. 자동 문서와 타입 검사를 공통 적용하며 상태가 필요한 예제는 이름 있는 함수 컴포넌트로 작성한다.

```sh
corepack yarn build:storybook
```

정적 결과는 `packages/design-system/dist/storybook`에 생성된다. 기존 `check`에도 정적 빌드를 포함해 CI에서 설정과 스토리 빌드를 함께 검증한다.

## 검사

저장소 루트에서 Node.js 24와 저장소 Yarn을 사용한다.

```sh
corepack yarn workspace @side/design-system check
```

패키지가 Vitest·jsdom 테스트를 소유한다. 실제 Base UI와 RHF를 사용해 loading 중 포커스, 검증 오류와 첫 오류 포커스, native ref와 ARIA 연결, 클래스 병합, 중첩 대화상자와 필수 확인 동작을 확인한다. 각 앱의 history·오버레이·도메인 통합 검사는 앱에 남긴다.
