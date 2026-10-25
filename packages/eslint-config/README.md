# 공용 ESLint 설정

규칙과 설정은 TypeScript로 작성합니다. 앱의 `eslint.config.ts`는 preset과 앱 경로만 조합합니다. ESLint는 각 워크스페이스의 Jiti로 설정을 읽습니다.

| 파일                                                      | 역할                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/plugin.ts`                                           | `side` 플러그인 객체 하나에 common·web 규칙을 모음                        |
| `src/base.ts`                                             | 공통 TypeScript 설정·산출물 제외·`side` 등록과 common 규칙·테스트 예외    |
| `src/react.ts`                                            | React 컴포넌트·핸들러 이름 규칙과 web의 `no-component-fetch`, preset 옵션 |
| `src/react-dom.ts`                                        | React DOM 앱의 jsx-a11y recommended·label 연결 옵션                       |
| `src/next.ts`                                             | Next 권장 설정·web의 `no-overlay-state`·jsx-a11y·테스트 예외              |
| `src/expo.ts`                                             | Expo 권장 설정·모바일 규칙·테스트 예외                                    |
| `src/fsd-boundaries.ts`                                   | FSD 플러그인 등록과 앱별 src 경로 연결                                    |
| `src/rules/<분류>/<규칙>/<규칙>.ts`                       | 표준 `TSESLint.RuleModule`로 구현한 독립 규칙                             |
| `src/rules/<분류>/<규칙>/<규칙>.spec.ts`·`<규칙>.test.ts` | 규칙 사양(spec)과 확인한 미탐·오탐 회귀(test) RuleTester                  |
| `src/rules/<분류>/<규칙>/__fixtures__`                    | 그 규칙의 spec·test만 읽는 실제 코드 파일                                 |
| `src/rules/fsd/fsd.helper.ts`                             | FSD 규칙이 함께 쓰는 경로·import 분석                                     |
| `src/presets.spec.ts`                                     | preset마다 켜지는 `side` 규칙과 플러그인 중복 등록 검증                   |
| `src/test`                                                | 모든 spec이 쓰는 RuleTester 연결·파서 옵션·fixture 로더                   |

`<분류>`는 규칙이 걸리는 범위입니다. 화면이 있는 앱은 `web`, 서버는 `api`이고 둘 모두에 걸리는 규칙만 `common`에 둡니다. 규칙이 아직 없는 분류는 `.gitkeep`으로 자리만 둡니다.

| 분류       | 규칙                      | 켜는 preset                    | 실제 적용 워크스페이스                                                                              |
| ---------- | ------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `common`   | `side/no-else`            | `baseConfig`                   | 아래 preset을 쓰는 모든 워크스페이스, PC·GF 루트(api·packages·스크립트), migration-check, 이 패키지 |
| `web`      | `side/no-component-fetch` | `reactConfig`                  | Next(PC·GF web), Expo(PC·GF mobile), Vite(GF admin), design-system                                  |
| `web`      | `side/no-overlay-state`   | `nextConfig`                   | Next(PC·GF web)만                                                                                   |
| `api`      | 아직 없음                 | -                              | -                                                                                                   |
| `fsd`      | `fsd/*`                   | `fsdBoundaries(srcDir)`        | PC web·mobile, GF web·admin·mobile                                                                  |
| `react`    | `react/jsx-handler-names` | `reactConfig`                  | 구현 없이 `eslint-plugin-react`에 `jsxHandlerNamesOptions`를 넘기고 spec이 같은 상수로 검증         |
| `jsx-a11y` | `jsx-a11y/*` recommended  | `reactDomConfig`, `nextConfig` | PC·GF web, GF admin, design-system. Expo 제외                                                       |

ESLint flat config는 같은 이름의 플러그인을 다른 객체로 다시 등록하면 `Cannot redefine plugin` 오류를 냅니다. 그래서 `side` 규칙은 분류와 관계없이 `src/plugin.ts`의 객체 하나에 모으고, 각 preset은 그 객체를 등록한 뒤 자기 분류의 규칙만 켭니다. 새 분류 규칙을 더하면 `plugin.ts`에 넣고 켤 preset과 `presets.spec.ts`의 기대값을 함께 고칩니다.

spec은 `createFixtures(import.meta.dirname)`로 자기 폴더의 `__fixtures__`만 읽습니다. FSD 규칙은 `__fixtures__`를 앱의 `src`로 보고 `srcDir`에 넘깁니다. 둘 이상의 규칙이 같은 fixture를 읽게 되면 그 분류 폴더(예: `rules/fsd/__fixtures__`)로 올립니다.

Next 웹은 `nextConfig`와 `fsdBoundaries(srcDir)`, Expo 모바일은 `expoConfig`와 `fsdBoundaries`, Vite 관리자(GF admin)는 `reactDomConfig`와 `fsdBoundaries`, design-system은 `reactDomConfig`, photo-contest와 game-feedback의 API·공용 패키지·프로젝트 스크립트는 각 프로젝트 루트 설정의 `baseConfig`, migration-check는 자기 설정의 `baseConfig`를 사용합니다. blog 웹은 아직 자체 `eslint.config.ts`를 쓰고, `typescript-config`에는 lint할 소스가 없습니다. 프레임워크별 심각도와 테스트 예외(`testOverrides`)는 해당 preset이나 앱 설정에서 관리합니다.

FSD 규칙이 막는 것은 위 레이어 import(`fsd/layer-imports`), 다른 slice의 내부 파일·자기 배럴 import(`fsd/slice-public-api`), 화면 slice끼리의 import(`fsd/no-cross-page`)입니다. 같은 레이어의 다른 slice(`features` → `features`, `widgets` → `widgets`)를 배럴로 가져오는 것은 막지 않습니다. photo-contest mobile의 "기능끼리 import하지 않는다" 같은 앱 규칙은 리뷰로 지킵니다.

FSD 규칙은 `srcDir` 바로 아래 파일(Next `proxy`·`instrumentation*`, Vite `main.tsx` 같은 진입 파일)을 `app/` 라우트와 같은 최상위로 봅니다. `srcDir`이 없거나 그 안에 `app`·`_app`·`_pages`·`widgets`·`features`·`shared` 폴더가 하나도 없으면 모든 파일이 분류 밖이 되어 아무것도 검사하지 못하므로 파일마다 `srcDir` 오류를 냅니다.

`side/no-component-fetch`는 `.tsx`·`.jsx` 파일(테스트 제외)에서 전역 `fetch`와 `window`·`globalThis`·`self`를 거친 `fetch` 참조를 막습니다. 호출뿐 아니라 별칭 대입·`.call`/`.apply`도 포함하고, 매개변수나 `refetch` 별칭 같은 지역 `fetch`는 제외합니다. Next 서버 컴포넌트(RSC)도 예외로 두지 않습니다. 서버 조회는 `shared/api`·도메인 `api`의 `*.server.ts`(Next fetch 캐시 옵션 포함)나 Route Handler(`route.ts`)에 두고, 컴포넌트는 그 함수를 호출합니다.

`side/no-overlay-state`는 `useState`(react import 별칭, `React.useState`·`React['useState']` 포함)로 만든 오버레이 열림 상태(`open`·`isOpen`·`visible`·`shown`·`show`, 또는 `sheet`·`modal`·`dialog` 같은 오버레이 명사가 붙은 이름)와 요청 오류 상태(`error`·`submitError` 등)를 막습니다. `menuOpen` 같은 화면 안 토글, `hasLoadError` 같은 불리언, `emailError` 같은 입력 검증 오류는 검사하지 않습니다.

모든 `eslint.config.ts`는 preset 뒤에 `tsconfigRootDir(import.meta.dirname)`을 둡니다. 에디터 ESLint 서버처럼 한 프로세스가 여러 설정을 읽으면 typescript-eslint가 루트 후보를 모두 모아 `multiple candidate TSConfigRootDirs` 파싱 오류를 냅니다.

```sh
corepack yarn workspace @side/eslint-config check
```

Vitest와 RuleTester는 이 패키지가 소유합니다. 오류 메시지 ID와 옵션은 규칙 옆의 spec에 직접 작성합니다. 한 번 쓰는 인라인 핸들러는 허용하며, 오버레이 상태는 `side/no-overlay-state`가 검사합니다.

`installConfig.hoistingLimits`는 이 패키지의 의존성을 워크스페이스 안에 둡니다. 다른 앱의 Vitest peer 구성과 합쳐지며 Yarn의 실행 파일 경로가 누락되는 문제를 방지합니다.

`jsx-handler-names`는 콜백 prop에 `on*`, 지역 핸들러에 `handle*` 이름을 요구합니다. 받은 `on*` 콜백과 RHF의 `field.onChange`는 그대로 전달하고, 일반 함수(`refetch` 등)는 JSX에서 인라인으로 호출합니다.

`jsx-a11y`는 DOM 요소 규칙이라 React DOM 앱에만 겁니다. `eslint-config-next`가 플러그인을 다른 객체로 이미 등록하므로 `nextConfig`는 `jsxA11yRules`만 더하고, `reactDomConfig`는 플러그인까지 등록합니다. `label-has-associated-control`은 디자인 시스템의 `Input`·`Textarea`·`NativeSelect`·`Checkbox`를 입력으로, `Label`을 label로 봅니다. 사용자가 올린 동영상의 자막(`media-has-caption`), 사용자가 연 입력창·검색 전용 화면의 포커스 이동(`no-autofocus`)처럼 규칙이 의도를 구분하지 못하는 경우만 이유를 적은 줄 단위 disable로 남깁니다.
