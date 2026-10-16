# 공용 ESLint 설정

규칙·FSD 플러그인과 모든 `eslint.config.ts`는 TypeScript로 작성합니다. AST와 메시지 ID는 `@typescript-eslint/utils`로 검사하고 설정 객체는 `satisfies`로 검증합니다. ESLint는 각 워크스페이스에 선언한 Jiti로 설정을 읽으므로 CLI와 에디터에서 같은 파일을 사용합니다.

`coreConfig`는 else를 금지하고, `reactConfig`는 React 핸들러 규칙과 컴포넌트의 직접 fetch 금지를 더합니다. `createFsdPlugin(srcDir)`에는 각 앱의 src 절대 경로를 넘깁니다. React 플러그인은 앱의 Next·Expo 설정이 제공합니다.

```sh
corepack yarn workspace @side/eslint-config check
```

규칙 테스트는 이 패키지가 소유한 Vitest·TypeScript RuleTester로 `test/fixtures/*/cases.json`과 실제 코드 파일을 읽습니다. React 플러그인은 기존 ESLint RuleTester로 검증합니다. 한 번 쓰는 인라인 핸들러는 허용하며 재사용 핸들러 이름과 FSD 경계를 검사합니다.

`installConfig.hoistingLimits`는 이 패키지의 의존성을 워크스페이스 안에 둡니다. 다른 앱의 Vitest peer 구성과 합쳐지며 Yarn의 실행 파일 경로가 누락되는 문제를 방지합니다.
