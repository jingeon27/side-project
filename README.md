# Side

여러 사이드 프로젝트를 함께 관리하는 Yarn 4 모노레포입니다.

```text
projects/
  photo-contest/                 # 웃긴순간: 비공개 사진 대회
    apps/
      api/
        src/*.spec.ts            # API unit: Vitest
        test/integration/        # 실제 PostgreSQL API 통합: Vitest
        vitest.config.mts
        vitest.integration.config.mts
      web/
        src/**/*.spec.tsx        # 웹 unit/UI: Vitest
        vitest.config.mts
    e2e/
      tests/                     # 프로젝트 전체 흐름: Playwright
      playwright.config.ts
    docs/
    scripts/
    .env.example
    package.json
packages/
  typescript-config/             # 공통 TypeScript 기반 설정
```

루트는 의존성 설치, 공통 형식 설정, 프로젝트 명령 위임만 담당합니다.
Vitest/Playwright 설정과 의존성, 테스트 파일, 환경변수, DB 스키마는 프로젝트·앱이 소유합니다.
새 사이드 프로젝트는 `projects/<name>`에 추가하고 워크스페이스 이름에 프로젝트 이름을 포함합니다.
자체 `test`, `build`, `typecheck`, `check` 스크립트를 가진 `@side/<name>` 패키지를 만들면 루트 집계 명령이 실행합니다.

## 시작

Node 24 권장 (`nvm use`), Node 22.12 이상이 필요합니다.

```sh
corepack yarn install
corepack yarn workspace @side/photo-contest db:generate
corepack yarn workspace @side/photo-contest codegen
cp projects/photo-contest/.env.example projects/photo-contest/.env
```

별도 터미널에서 PostgreSQL을 시작합니다.

```sh
corepack yarn workspace @side/photo-contest db:local
```

```sh
corepack yarn workspace @side/photo-contest db:migrate
corepack yarn dev:photo-contest
```

웹은 http://localhost:3200, API는 127.0.0.1:4200입니다.
[웃긴순간 실행·운영 문서](projects/photo-contest/README.md)를 참고하세요.

## 검증

```sh
corepack yarn test:photo-contest
corepack yarn test:photo-contest:integration
corepack yarn workspace @photo-contest/e2e install:browser
corepack yarn test:photo-contest:e2e
corepack yarn build:photo-contest
corepack yarn check
corepack yarn format:check
```

루트 `yarn test`/`yarn build`/`yarn check`는 프로젝트 집계 패키지로 위임합니다.
API·웹 테스트는 각각 `yarn workspace @photo-contest/api test`, `yarn workspace @photo-contest/web test`로 독립 실행할 수도 있습니다.
통합/E2E는 지정한 개발 DB에 임시 격리 스키마를 만들고 종료 후 해당 스키마만 정리합니다.
Vitest/Playwright를 루트에서 전역 설정하지 않습니다.
