# @side/config

프로젝트가 공유하는 ESLint 규칙·프리셋과 TypeScript 설정을 관리합니다.

- ESLint: `@side/config/eslint/base`, `react`, `react-dom`, `next`, `expo`, `fsd-boundaries`.
- TypeScript: `tsconfig.json`에서 `@side/config/typescript`를 extends합니다.
- CLI: `tsc7`은 TypeScript 7.0.2를 실행합니다. JavaScript compiler API가 필요한 도구는 TypeScript 6.0.2를 사용합니다.

`yarn workspace @side/config check`로 lint·타입·ESLint 규칙 테스트를 실행하고, 루트 `scripts`의 커밋 메시지·브랜치 커밋·knip 기준선 검사와 그 spec도 함께 타입 검사하고 실행합니다. 이 spec은 Vitest globals를 쓰므로 루트 `tsconfig.scripts.json`이 아니라 이 패키지의 `tsconfig.json`이 검사합니다. Git hook 구현은 루트 `scripts/check-commit-message.ts`가 소유합니다.

ESLint 규칙과 fixture의 상세 구성은 [eslint/README.md](eslint/README.md)에 있습니다.
