# 공용 ESLint 설정

규칙과 설정은 TypeScript로 작성합니다. 앱의 `eslint.config.ts`는 preset과 앱 경로만 조합합니다. ESLint는 각 워크스페이스의 Jiti로 설정을 읽습니다.

| 파일                                                      | 역할                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/plugin.ts`                                           | `side` 플러그인 객체 하나에 common·web 규칙을 모음                                                                 |
| `src/base.ts`                                             | 공통 TypeScript 설정·산출물 제외·`side` 등록과 common 규칙·테스트 예외                                             |
| `src/react.ts`                                            | React 컴포넌트·핸들러 이름 규칙과 web의 `no-component-fetch`, preset 옵션, 훅 의존성 오류(`hooksDependencyConfig`) |
| `src/react-dom.ts`                                        | React DOM 앱의 react-hooks·jsx-a11y recommended 등록·label 연결 옵션과 `domStyleRules`(web의 `no-subtle-text`)     |
| `src/next.ts`                                             | Next 권장 설정·web의 `no-overlay-state`·jsx-a11y·`domStyleRules`·테스트 예외                                       |
| `src/expo.ts`                                             | Expo 권장 설정·모바일 규칙·테스트 예외                                                                             |
| `src/fsd-boundaries.ts`                                   | FSD 플러그인 등록과 앱별 src 경로 연결                                                                             |
| `src/rules/<분류>/<규칙>/<규칙>.ts`                       | 표준 `TSESLint.RuleModule`로 구현한 독립 규칙                                                                      |
| `src/rules/<분류>/<규칙>/<규칙>.spec.ts`·`<규칙>.test.ts` | 규칙 사양(spec)과 확인한 미탐·오탐 회귀(test) RuleTester                                                           |
| `src/rules/<분류>/<규칙>/__fixtures__`                    | 그 규칙의 spec·test만 읽는 실제 코드 파일                                                                          |
| `src/rules/fsd/fsd.helper.ts`                             | FSD 규칙이 함께 쓰는 경로·import 분석                                                                              |
| `src/presets.spec.ts`                                     | preset마다 켜지는 `side`·훅·jsx-a11y 규칙과 플러그인 중복 등록 검증                                                |
| `src/test`                                                | 모든 spec이 쓰는 RuleTester 연결·파서 옵션·fixture 로더                                                            |

`<분류>`는 규칙이 걸리는 범위입니다. 화면 규칙은 `web`, 서버는 `api`이고 둘 모두에 걸리는 규칙만 `common`에 둡니다. 규칙이 아직 없는 분류는 `.gitkeep`으로 자리만 둡니다.

| 분류          | 규칙                                                | 켜는 preset                                                           | 실제 적용 워크스페이스                                                                      |
| ------------- | --------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `common`      | `side/no-else`                                      | `baseConfig`                                                          | 아래 preset을 쓰는 모든 워크스페이스, PC·GF 루트(api·packages·스크립트), toolkit, 이 패키지 |
| `common`      | `side/no-wildcard-exports`                          | `baseConfig`                                                          | `side/no-else`와 같다. blog web은 `baseConfig`를 쓰지 않아 제외                             |
| `web`         | `side/no-component-fetch`                           | `reactConfig`                                                         | Next(PC·GF web), Expo(PC·GF mobile), Vite(GF admin), design-system                          |
| `web`         | `side/no-form-state-copy`                           | `reactConfig`                                                         | Next(PC·GF web), Expo(PC·GF mobile), Vite(GF admin), design-system                          |
| `web`         | `side/no-overlay-state`                             | `nextConfig`                                                          | Next(PC·GF web)의 오버레이 상태 이름 검사                                                   |
| `web`         | `side/no-request-error-state`                       | `nextConfig`                                                          | Next(PC·GF web)의 요청 오류 상태 이름 검사                                                  |
| `web`         | `side/no-subtle-text`                               | `reactDomConfig`, `nextConfig`                                        | Next(PC·GF web), Vite(GF admin), design-system. Expo 제외                                   |
| `react`       | `react/jsx-handler-names`                           | `reactConfig`, `handlerNamesConfig`                                   | PC·GF web·admin·mobile, blog web, design-system                                             |
| `api`         | 아직 없음                                           | -                                                                     | -                                                                                           |
| `fsd`         | `fsd/*`                                             | `fsdBoundaries(srcDir)`                                               | PC web·mobile, GF web·admin·mobile                                                          |
| `jsx-a11y`    | `jsx-a11y/*` recommended                            | `reactDomConfig`, `nextConfig`                                        | PC·GF web, GF admin, design-system. Expo 제외                                               |
| `react-hooks` | `react-hooks/*` recommended, `exhaustive-deps` 오류 | `reactDomConfig`, `nextConfig`, `expoConfig`, `hooksDependencyConfig` | PC·GF web·mobile, GF admin, design-system, blog web                                         |

ESLint flat config는 같은 이름의 플러그인을 다른 객체로 다시 등록하면 `Cannot redefine plugin` 오류를 냅니다. 그래서 `side` 규칙은 분류와 관계없이 `src/plugin.ts`의 객체 하나에 모으고, 각 preset은 그 객체를 등록한 뒤 자기 분류의 규칙만 켭니다. 새 분류 규칙을 더하면 `plugin.ts`에 넣고 켤 preset과 `presets.spec.ts`의 기대값을 함께 고칩니다.

spec은 `createFixtures(import.meta.dirname)`로 자기 폴더의 `__fixtures__`만 읽습니다. FSD 규칙은 `__fixtures__`를 앱의 `src`로 보고 `srcDir`에 넘깁니다. 둘 이상의 규칙이 같은 fixture를 읽게 되면 그 분류 폴더(예: `rules/fsd/__fixtures__`)로 올립니다.

Next 웹은 `nextConfig`와 `fsdBoundaries(srcDir)`, Expo 모바일은 `expoConfig`와 `fsdBoundaries`, Vite 관리자(GF admin)는 `reactDomConfig`와 `fsdBoundaries`, design-system은 `reactDomConfig`, photo-contest와 game-feedback의 API·공용 패키지·프로젝트 스크립트는 각 프로젝트 루트 설정의 `baseConfig`, toolkit(migration-check 포함)은 자기 설정의 `baseConfig`를 사용합니다. photo-contest API 소스(`apps/api/src`, 테스트 제외)에는 루트 설정의 `photo-contest/api-typed` 블록이 projectService로 타입 정보를 읽어 `@typescript-eslint/no-unnecessary-condition`을 오류로 더 켭니다. blog 웹은 `baseConfig` 없이 자체 `eslint.config.ts`에 `handlerNamesConfig`를 조합하므로 `side/*` 규칙이 걸리지 않고, else는 자체 `no-restricted-syntax`로 막습니다. 프레임워크별 심각도와 테스트 예외(`testOverrides`)는 해당 preset이나 앱 설정에서 관리합니다.

`testOverrides`는 `testFiles`에서 non-null 단언을 허용하고, core `no-restricted-properties`로 `.only` 접근(`test.only`, `test.describe.only`, `it.only.each`)을 막습니다. 집중 실행이 남으면 `forbidOnly`가 없는 Playwright 설정은 그 테스트만 돌리고 통과하기 때문입니다. `nextConfig`·`expoConfig`가 포함하고, design-system과 GF admin은 설정에 직접 더합니다. 프로젝트 루트 설정(API·공용 패키지)에는 Playwright가 없고 Vitest가 CI에서 `allowOnly: false`로 막습니다. `no-restricted-syntax`로 막지 않습니다. preset이나 앱이 같은 파일에 이 규칙을 다시 지정하면 옵션이 통째로 바뀌어, Expo의 enum 금지나 GF admin의 `let` 금지가 테스트 파일에서 사라지거나 반대로 `.only` 금지가 빠집니다(`presets.spec.ts`). `@side/config` 자신의 `eslint.config.ts`는 `testOverrides`를 쓰지 않습니다. 나중에 더하면 `src/test/setup.ts`의 `RuleTester.itOnly = it.only` 두 줄이 이 규칙에 걸립니다. 집중 실행이 아니라 RuleTester를 Vitest에 연결하는 코드이므로 그 두 줄에만 이유를 적은 disable 주석을 답니다.

FSD 규칙이 막는 것은 위 레이어 import(`fsd/layer-imports`), 다른 slice의 내부 파일·자기 배럴 import(`fsd/slice-public-api`), 화면 slice끼리의 import(`fsd/no-cross-page`)입니다. 같은 레이어의 다른 slice(`features` → `features`, `widgets` → `widgets`)를 배럴로 가져오는 것은 막지 않습니다. photo-contest mobile의 "기능끼리 import하지 않는다" 같은 앱 규칙은 리뷰로 지킵니다.

FSD 규칙은 `srcDir` 바로 아래 파일(Next `proxy`·`instrumentation*`, Vite `main.tsx` 같은 진입 파일)을 `app/` 라우트와 같은 최상위로 봅니다. `srcDir`이 없거나 그 안에 `app`·`_app`·`_pages`·`widgets`·`features`·`shared` 폴더가 하나도 없으면 모든 파일이 분류 밖이 되어 아무것도 검사하지 못하므로 파일마다 `srcDir` 오류를 냅니다.

`side/no-component-fetch`는 `.tsx`·`.jsx` 파일(테스트 제외)에서 전역 `fetch`와 `window`·`globalThis`·`self`를 거친 `fetch` 참조를 막습니다. 호출뿐 아니라 별칭 대입·`.call`/`.apply`도 포함하고, 매개변수나 `refetch` 별칭 같은 지역 `fetch`는 제외합니다. Next 서버 컴포넌트(RSC)도 예외로 두지 않습니다. 서버 조회는 `shared/api`·도메인 `api`의 `*.server.ts`(Next fetch 캐시 옵션 포함)나 Route Handler(`route.ts`)에 두고, 컴포넌트는 그 함수를 호출합니다.

`side/no-form-state-copy`는 `useForm`·`useFormContext`·`useFormState`와 프로젝트의 `useZodForm`이 반환한 폼 상태를 추적합니다. React `useState`에 초기값으로 보관하거나 해당 값을 구독하는 effect에서 그대로 동기화하면 오류를 냅니다. 폼 오류와 제출 상태는 `formState`에서 읽고, 필드 오류를 등록할 때는 `setError`를 사용합니다.

`side/no-overlay-state`는 `open`·`isOpen`·`visible`·`shown`·`show`와 `sheet`·`modal`·`dialog` 같은 오버레이 명사가 붙은 열림 상태 이름을 검사합니다. `menuOpen` 같은 화면 안 토글을 허용합니다.

`side/no-request-error-state`는 `error`·`submitError` 같은 요청 오류 상태 이름을 검사합니다. `hasLoadError` 같은 불리언과 필드 검증 오류 이름을 허용합니다. React Hook Form의 값을 복제한 경우에는 폼 상태 규칙이 진단합니다.

`side/no-subtle-text`는 디자인 시스템의 `subtle`(흰 바탕 2.52:1)을 글자색으로 고른 클래스를 막습니다. `placeholder:text-subtle`은 항상 막고, `text-subtle`은 `aria-hidden` 요소의 `className`에 직접 쓴 장식 아이콘(알림함 하트, ↗)만 허용합니다. cva나 상수에 둔 클래스는 붙는 요소를 알 수 없어 막습니다. 토큰과 공통 컴포넌트의 대비는 design-system의 `color-contrast.test.ts`가 재고, 앱이 클래스로 고른 색은 이 규칙이 맡습니다.

모든 `eslint.config.ts`는 preset 뒤에 `tsconfigRootDir(import.meta.dirname)`을 둡니다. 에디터 ESLint 서버처럼 한 프로세스가 여러 설정을 읽으면 typescript-eslint가 루트 후보를 모두 모아 `multiple candidate TSConfigRootDirs` 파싱 오류를 냅니다.

```sh
yarn workspace @side/config check
```

Vitest와 RuleTester는 이 패키지가 소유합니다. 오류 메시지 ID와 옵션은 규칙 옆의 spec에 직접 작성합니다. 한 번 쓰는 인라인 핸들러는 허용하며, 오버레이 상태는 `side/no-overlay-state`가 검사합니다.

`installConfig.hoistingLimits`는 이 패키지의 의존성을 워크스페이스 안에 둡니다. 다른 앱의 Vitest peer 구성과 합쳐지며 Yarn의 실행 파일 경로가 누락되는 문제를 방지합니다.

콜백 prop은 `on*`, 직접 작성한 지역 핸들러는 `handle*`로 이름 짓습니다. 기존 함수는 이름을 맞추려고 래퍼나 별칭을 만들지 않고 인자·this·반환값이 호환되면 그대로 전달합니다. `react/jsx-handler-names`의 기존 옵션을 사용하고, 라이브러리 함수를 감싸기 위한 명명 전용 래퍼는 만들지 않습니다. DOM 이벤트를 refetch/mutate의 옵션으로 전달하지 않도록 필요한 인자 차단 래퍼는 유지합니다.

`jsx-a11y`는 DOM 요소 규칙이라 React DOM 앱에만 겁니다. `eslint-config-next`가 플러그인을 다른 객체로 이미 등록하므로 `nextConfig`는 `jsxA11yRules`만 더하고, `reactDomConfig`는 플러그인까지 등록합니다. `label-has-associated-control`은 디자인 시스템의 `Input`·`Textarea`·`NativeSelect`·`Checkbox`를 입력으로 봅니다. 디자인 시스템에는 `Label` 컴포넌트가 없고 레이블은 `FormField`·`TextField`가 연결하므로 label 컴포넌트 옵션은 두지 않습니다. 그런 컴포넌트를 만들면 `labelComponents`에 함께 더합니다. 사용자가 올린 동영상의 자막(`media-has-caption`), 사용자가 연 입력창·검색 전용 화면의 포커스 이동(`no-autofocus`)처럼 규칙이 의도를 구분하지 못하는 경우만 이유를 적은 줄 단위 disable로 남깁니다.

`react-hooks`는 훅 호출 규칙(`rules-of-hooks`), effect 의존성(`exhaustive-deps`)과 React Compiler 규칙(`immutability`, `refs`, `set-state-in-effect` 등)을 recommended로 켭니다. `eslint-config-next`와 `eslint-config-expo`가 같은 recommended로 플러그인을 이미 등록하므로 `nextConfig`·`expoConfig`는 심각도만 바꾸고, `reactDomConfig`는 플러그인까지 등록합니다. recommended는 `exhaustive-deps`를 경고로 두어 lint가 실패하지 않으므로, `hooksDependencyConfig`가 세 preset과 blog 웹에서 오류로 올립니다. 이 설정은 플러그인을 등록하지 않으니 react-hooks를 등록한 설정 뒤에 둡니다.

ESLint를 실행하는 워크스페이스 `lint` 스크립트는 모두 `eslint --max-warnings 0`으로 실행합니다. recommended가 경고로 둔 규칙(`incompatible-library` 등)과 쓰지 않는 disable 주석(ESLint 기본 경고)도 CI에서 lint를 실패시키려는 것입니다. 규칙이 의도를 구분하지 못하는 곳은 경고로 두지 않고 이유를 적은 줄 단위 disable로 처리합니다.

### 핸들러 이름 옵션

`handlerNamesConfig`는 기존 `react/jsx-handler-names`를 `eventHandlerPrefix: '(?:handle|on|fetchNext|mutate)'`, `eventHandlerPropPrefix: 'on'`, `checkLocalVariables: false`, `checkInlineFunction: false`로 설정합니다. `fetchNext`·`mutate`는 `pagination.fetchNextPage`·`upload.mutateAsync` 같은 기존 API를 직접 전달하기 위한 허용 접두사입니다.

이 규칙은 함수 출처를 구분하지 않습니다. 따라서 `refetch`뿐 아니라 직접 작성한 `submit` 같은 로컬 식별자도 검사에서 제외됩니다. JSX 밖의 이벤트 리스너·observer 역시 이 규칙의 검사 대상이 아닙니다. 내부 핸들러의 `const handle*` 관례는 리뷰로 유지하고, 명명 검사만을 위해 래퍼·별칭·별도 커스텀 규칙을 추가하지 않습니다. 멤버 핸들러와 `on*` prop 이름은 기존 규칙이 계속 검사합니다. 이 적용 범위와 Next 플러그인 조합은 설정 테스트로 확인합니다.

`useState`의 setter는 외부 `on*` 콜백에서 `(nextOpen) => setOpen(nextOpen)`처럼 새 값만 전달합니다. 이 입력 어댑터는 불필요한 전달 래퍼 정리 대상에서 제외합니다. DOM callback ref도 안정적인 함수 참조와 cleanup을 유지하며, setter를 매 렌더 새 ref 함수로 감싸 연결·해제가 반복되게 만들지 않습니다.
