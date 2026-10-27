# shadcn/ui 구성

공식 shadcn/ui의 **Base UI / base-nova** registry 소스를 수동 설치하고 저장소의 공통 토큰·컴포넌트 이름·공개 API에 맞게 조정했다. shadcn/ui는 런타임 패키지를 추가하는 방식이 아니라 컴포넌트 소스를 프로젝트가 소유하는 방식으로 사용한다.

- 공식 registry: `https://ui.shadcn.com/r/styles/base-nova/<component>.json`
- 설치 구성: Button, Input, Textarea, NativeSelect, Label, Checkbox, Tabs, Dialog, Select, DropdownMenu, Sonner
- 원본/라이선스: [shadcn-ui/ui](https://github.com/shadcn-ui/ui), [보존한 MIT 라이선스](SHADCN-LICENSE.md)
- [공식 모노레포 가이드](https://ui.shadcn.com/docs/monorepo), [Base UI Button](https://ui.shadcn.com/docs/components/base/button), [Native Select](https://ui.shadcn.com/docs/components/base/native-select)

Web과 이 패키지의 components.json은 base-nova/neutral/lucide 설정을 공유한다. ui와 utils alias는 이 공통 패키지를 가리킨다. 소스는 저장소 규칙대로 PascalCase 컴포넌트와 named export를 사용하며 ui 하위 공개 경로는 폴더 index에서 노출한다. 추가 registry 소스도 같은 이름/경로/공개 API 규칙으로 조정한다. CLI가 생성한 원본을 기존 래퍼 위에 바로 덮어쓰지 않는다.

## 공통 적용

- Button의 공식 CVA/invalid/disabled 기반에 기존 primary/secondary/ghost/danger/accent, fullWidth/loading/icon props를 연결한다. registry의 default/outline/destructive/link variant와 default/icon-sm size는 같은 뜻의 이름이 겹쳐 지웠다. 기존 서비스의 API와 loading 중 포커스 동작을 유지한다. IconButton과 Next ButtonLink도 이 기반을 사용한다.
- Dialog는 공식 Root/Trigger/Portal/Close/Content/Header/Footer/Title/Description 구성을 제공한다. 기존 Dialog props는 이를 조합한다. Base UI Viewport, 포털 컨테이너, 중첩 모달, dismissible 정책과 앱이 정한 번역된 닫기 레이블을 유지한다.
- Input, Textarea, NativeSelect는 ref와 native 이벤트를 전달하고 registry 원본의 색 대신 공통 입력 상자(`input.styles.ts`)를 공유한다. TextField·TextAreaField는 FormField에 이 컨트롤을 넣어 조립한다. FormField는 context로 이 컨트롤의 레이블/설명/오류를 연결하므로 RHF register를 그대로 사용할 수 있다. NativeSelect 래퍼는 label 안에 둘 수 있게 원본의 div 대신 span을 쓴다. Checkbox의 boolean 필드는 RHF Controller로 연결한다.
- Tabs는 Base UI의 방향키/포커스/ARIA 동작을 제공한다. registry의 `text-sm font-medium text-foreground/60`·`shadow-sm` 대신 공통 토큰으로 default(채운 칸)·line(밑줄) 모양을 그린다. 선택값은 앱 URL에서 제어한다.
- 스타일은 공통 theme.css에서 파생한 shadcn.css가 primary/ring/border/input-border/foreground/popover 토큰을 연결한다. 기존 text-input 글자 크기와 text-input 색상 유틸리티가 충돌하지 않게 input 색 토큰은 input-border로 사용한다. 기존 muted 글자색을 배경색으로 재해석하지 않고 muted surface는 neutral-soft에 연결한다.
- registry 원본의 `outline-none` + `focus-visible:ring-*` 포커스 표시는 쓰지 않는다. 포커스는 base.css의 `:focus-visible` outline(`focus-ring` 토큰)이 그리고, 팝업 컨테이너만 forced-colors에서 보이는 `outline-hidden`을 쓴다(`focus-ring.test.ts`).
- registry 원본의 tw-animate-css 클래스(`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`)와 정의 없는 `accent-foreground`는 쓰지 않는다. 팝업 전환은 Base UI의 `data-starting-style`·`data-ending-style`로 만들고 `tailwind-utilities.test.ts`가 ui 클래스가 모두 생성되는지 확인한다.
- 입력은 16px, 기본 조작 영역은 44px 이상을 유지한다. NativeSelect는 모바일 OS 선택창을 사용하며 WYSIWYG와 파일 업로드의 전용 DOM은 앱이 소유한다.

Game Feedback의 실제 작성/수정/신고/로그인/언어/검색/채팅 폼이 이 컴포넌트를 사용한다. Photo Contest는 기존 공통 UI 진입점을 유지하며 같은 버튼/모달 기반과 토큰을 사용한다. 앱의 라우팅·서버 상태·도메인 로직은 공통 패키지에 넣지 않는다.

## Select와 Sonner

Select는 공식 base-nova의 Base UI Root/Trigger/Value/Portal/Positioner/Popup/List/Item/Indicator/ScrollArrow 구성을 사용한다. 공통 토큰, 16px 글자와 44px 트리거/옵션, popover 레이어에 맞췄다. hideIcon은 아이콘만 표시하는 트리거에서 기본 화살표를 숨기며 접근성 이름과 선택값은 앱이 제공한다. 언어와 화면 모드 설정에서 사용하고 RHF의 native 폼은 기존 NativeSelect를 유지한다.

Toaster는 같은 registry의 Sonner 조합을 named function으로 제공한다. 앱이 theme을 전달하므로 next-themes를 중복 설치하지 않는다. 색/모서리/폰트/44px 닫기는 공통 패키지가 소유하며, 위치/시간/번역/업무 알림은 앱에서 설정한다. Sonner 2.0.8을 이 패키지 의존성으로 선언하고 toast를 함께 내보낸다. Radix UI 의존성은 추가하지 않는다.

공통 색상은 html의 data-theme 속성이 있는 앱에서만 system/light/dark를 적용한다. light-dark와 color-scheme으로 기기 설정 변화를 즉시 반영하며, 쿠키/사용자 설정은 앱이 소유한다. data-theme이 없는 기존 소비 앱의 기본 테마는 유지한다.

DropdownMenu는 공식 base-nova의 Base UI Menu Root/Trigger/Portal/Positioner/Popup/Item을 필요한 범위로 제공한다. 키보드 이동과 Escape, 외부 클릭, 포커스 복귀를 Base UI에 위임하고 공통 popover 레이어와 44px 조작 영역을 사용한다. Game Feedback 채팅의 신고·대화내역 삭제·차단은 앱이 소유한다.

Dialog와 DialogContent는 중앙 배치만 제공한다. 하단 입력 시트는 같은 Base UI의 Drawer로 만든 BottomSheet가 맡는다. 포커스 격리·닫기·중첩 처리를 재사용하고, 공통 토큰과 visual viewport 높이·하단 안전 영역으로 키보드가 열린 화면의 스크롤을 처리한다. Game Feedback의 shared/BottomSheet가 번역을 연결하고 입력용 팝업에 적용하며, 버튼만 있는 확인창은 중앙 Dialog를 사용한다.
