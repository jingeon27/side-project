# 공용 ESLint 설정

규칙과 설정은 TypeScript로 작성합니다. 앱의 `eslint.config.ts`는 preset과 앱 경로만 조합합니다. ESLint는 각 워크스페이스의 Jiti로 설정을 읽습니다.

| 파일                                     | 역할                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| `src/base.ts`                            | 공통 TypeScript 설정·산출물 제외·else 금지              |
| `src/react.ts`                           | React 핸들러·컴포넌트 fetch 규칙                        |
| `src/react-dom.ts`                       | React DOM 앱의 jsx-a11y recommended·label 연결 옵션     |
| `src/next.ts`                            | Next 권장 설정·웹 상태 규칙·jsx-a11y·테스트 예외        |
| `src/expo.ts`                            | Expo 권장 설정·모바일 규칙·테스트 예외                  |
| `src/fsd-boundaries.ts`                  | FSD 플러그인 등록과 앱별 src 경로 연결                  |
| `src/rules/<분류>/<규칙>/<규칙>.ts`      | 표준 `TSESLint.RuleModule`로 구현한 독립 규칙           |
| `src/rules/<분류>/<규칙>/<규칙>.spec.ts` | 규칙별 RuleTester 테스트                                |
| `src/rules/<분류>/<규칙>/__fixtures__`   | 그 규칙의 spec만 읽는 실제 코드 파일                    |
| `src/rules/fsd/fsd.helper.ts`            | FSD 규칙이 함께 쓰는 경로·import 분석                   |
| `src/test`                               | 모든 spec이 쓰는 RuleTester 연결·파서 옵션·fixture 로더 |

`<분류>`는 규칙이 걸리는 범위입니다. 화면이 있는 Next·Expo 앱은 `web`, 서버는 `api`이고 둘 모두에 걸리는 규칙만 `common`에 둡니다. 규칙이 아직 없는 분류는 `.gitkeep`으로 자리만 둡니다.

| 분류       | 규칙                                               | 적용 preset                                                                                   |
| ---------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `common`   | `side/no-else`                                     | `baseConfig`(모든 워크스페이스)                                                               |
| `web`      | `side/no-component-fetch`, `side/no-overlay-state` | `reactConfig`(Next·Expo), `nextConfig`                                                        |
| `api`      | 아직 없음                                          | `baseConfig`를 쓰는 API 전용                                                                  |
| `fsd`      | `fsd/*`                                            | `fsdBoundaries(srcDir)`                                                                       |
| `react`    | `react/jsx-handler-names`                          | `reactConfig`(Next·Expo). 구현 없이 `eslint-plugin-react`의 preset 옵션 검증                  |
| `jsx-a11y` | `jsx-a11y/*` recommended                           | `reactDomConfig`(Vite·디자인 시스템), `nextConfig`. Expo 제외. 구현 없이 label 연결 옵션 검증 |

spec은 `createFixtures(import.meta.dirname)`로 자기 폴더의 `__fixtures__`만 읽습니다. FSD 규칙은 `__fixtures__`를 앱의 `src`로 보고 `srcDir`에 넘깁니다. 둘 이상의 규칙이 같은 fixture를 읽게 되면 그 분류 폴더(예: `rules/fsd/__fixtures__`)로 올립니다.

웹은 `nextConfig`와 `fsdBoundaries(srcDir)`, Next가 아닌 React DOM 앱(Vite 관리자·디자인 시스템)은 `reactDomConfig`, 모바일은 `expoConfig`, API·공용 패키지는 `baseConfig`를 사용합니다. 프레임워크별 심각도와 테스트 예외는 해당 preset에서 관리합니다.

`jsx-a11y`는 DOM 요소 규칙이라 React DOM 앱에만 겁니다. `eslint-config-next`가 플러그인을 다른 객체로 이미 등록하므로 `nextConfig`는 `jsxA11yRules`만 더하고, `reactDomConfig`는 플러그인까지 등록합니다. `label-has-associated-control`은 디자인 시스템의 `Input`·`Textarea`·`NativeSelect`·`Checkbox`를 입력으로, `Label`을 label로 봅니다. 사용자가 올린 동영상의 자막(`media-has-caption`), 사용자가 연 입력창·검색 전용 화면의 포커스 이동(`no-autofocus`)처럼 규칙이 의도를 구분하지 못하는 경우만 이유를 적은 줄 단위 disable로 남깁니다.

모든 `eslint.config.ts`는 preset 뒤에 `tsconfigRootDir(import.meta.dirname)`을 둡니다. 에디터 ESLint 서버처럼 한 프로세스가 여러 설정을 읽으면 typescript-eslint가 루트 후보를 모두 모아 `multiple candidate TSConfigRootDirs` 파싱 오류를 냅니다.

```sh
corepack yarn workspace @side/eslint-config check
```

Vitest와 RuleTester는 이 패키지가 소유합니다. 오류 메시지 ID와 옵션은 규칙 옆의 spec에 직접 작성합니다. 오버레이 상태는 `side/no-overlay-state`가 검사합니다.

`react/jsx-handler-names`는 `react.ts`가 내보내는 `jsxHandlerNamesOptions`를 preset과 spec이 함께 씁니다. `on*` prop에 넘기는 값은 인라인 함수, 분리한 핸들러 `handle*`, 받은 props 콜백 `on*`(멤버식 `field.onChange` 포함) 중 하나여야 하며, `checkLocalVariables`로 `onClick={submit}` 같은 지역 함수도 검사합니다. 라이브러리가 넘기는 콜백은 `overlay.open(({ close: onClose }) => …)`처럼 `on*`으로 받고, `refetch`·state setter처럼 콜백이 아닌 함수는 `onRetry={() => refetch()}`로 인라인에서 호출합니다.

`installConfig.hoistingLimits`는 이 패키지의 의존성을 워크스페이스 안에 둡니다. 다른 앱의 Vitest peer 구성과 합쳐지며 Yarn의 실행 파일 경로가 누락되는 문제를 방지합니다.
