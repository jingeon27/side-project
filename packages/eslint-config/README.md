# 공용 ESLint 설정

규칙과 설정은 TypeScript로 작성합니다. 앱의 `eslint.config.ts`는 preset과 앱 경로만 조합합니다. ESLint는 각 워크스페이스의 Jiti로 설정을 읽습니다.

| 파일                       | 역할                                          |
| -------------------------- | --------------------------------------------- |
| `src/base.ts`              | 공통 TypeScript 설정·산출물 제외·else 금지    |
| `src/react.ts`             | React 핸들러·컴포넌트 fetch 규칙              |
| `src/next.ts`              | Next 권장 설정·웹 상태 규칙·테스트 예외       |
| `src/expo.ts`              | Expo 권장 설정·모바일 규칙·테스트 예외        |
| `src/fsd-boundaries.ts`    | FSD 플러그인 등록과 앱별 src 경로 연결        |
| `src/rules/<규칙>.ts`      | 표준 `TSESLint.RuleModule`로 구현한 독립 규칙 |
| `src/rules/<규칙>.spec.ts` | 규칙별 RuleTester 테스트                      |
| `src/rules/__fixtures__`   | 테스트가 읽는 실제 코드 파일                  |
| `src/lib`                  | FSD 경로·import 분석                          |

웹은 `nextConfig`와 `fsdBoundaries(srcDir)`, 모바일은 `expoConfig`, API·공용 패키지는 `baseConfig`를 사용합니다. 프레임워크별 심각도와 테스트 예외는 해당 preset에서 관리합니다.

```sh
corepack yarn workspace @side/eslint-config check
```

Vitest와 RuleTester는 이 패키지가 소유합니다. 오류 메시지 ID와 옵션은 규칙 옆의 spec에 직접 작성합니다. 한 번 쓰는 인라인 핸들러는 허용하며, 오버레이 상태는 `side/no-overlay-state`가 검사합니다.

`installConfig.hoistingLimits`는 이 패키지의 의존성을 워크스페이스 안에 둡니다. 다른 앱의 Vitest peer 구성과 합쳐지며 Yarn의 실행 파일 경로가 누락되는 문제를 방지합니다.
