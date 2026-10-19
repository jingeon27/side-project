# Side

여러 사이드 프로젝트를 관리하는 Yarn 4·Node.js 24 모노레포입니다. 프로젝트는 `projects/<name>`에서 독립적으로 운영합니다.

```text
projects/photo-contest/
  apps/api/        # NestJS · GraphQL · Prisma, Vitest unit + supertest e2e
  apps/web/        # Next.js, Vitest unit/UI/API + Playwright
  apps/mobile/     # Expo WebView, Vitest unit/UI/API + Playwright
  packages/bridge/ # 앱↔웹 계약, 자체 Vitest
  packages/test-kit/ # 격리 DB·API·테스트 fixture 도구
  docs/
projects/game-feedback/
  apps/api/        # NestJS · REST · Prisma, 격리 PostgreSQL · Vitest · supertest
  apps/web/        # Next.js, 피드백 · 1:1 채팅 · Vitest + Playwright
  apps/mobile/     # Expo WebView, Vitest unit/UI + Playwright
  packages/bridge/ # Game Feedback 앱↔웹 메시지 계약
  packages/contracts/ # Zod 서버 검증 · OpenAPI 계약
  packages/sdk/    # Orval API Client · 응답 검증 스키마
  docs/
packages/design-system/ # 두 웹이 공유하는 Base UI·토큰·스타일·cn, 자체 Vitest
packages/typescript-config/
packages/eslint-config/ # 공용 lint·FSD 규칙, RuleTester fixture + 자체 Vitest
```

루트·프로젝트의 검사 명령은 앱과 패키지에 위임합니다. 테스트 러너·설정·파일·의존성은 각 앱 또는 패키지가 소유합니다. 화면 없는 API의 e2e는 Vitest·supertest로 실행하며, 공용 e2e 워크스페이스는 없습니다.

웃긴순간은 사진·동영상·합성을 공유하는 상시 그룹 커뮤니티입니다. 홈은 가입한 그룹의 최신 게시물과 이달의 인기를, MY는 내 그룹을 보여 줍니다. 탐색에서 공개·비공개 그룹을 찾고 공개 게시물을 로그인 없이 감상합니다. 공개 그룹은 바로 가입하고 비공개 그룹은 그룹장이 수락합니다. 공개 그룹 SEO·사이트맵은 [SEO 안내](projects/photo-contest/docs/seo.md)에 정리했습니다.

## 시작

```sh
corepack yarn install --immutable
cp projects/photo-contest/.env.example projects/photo-contest/.env
corepack yarn workspace @side/photo-contest db:generate
corepack yarn workspace @side/photo-contest codegen
corepack yarn workspace @side/photo-contest db:local
```

별도 터미널에서 마이그레이션과 개발 서버를 실행합니다.

```sh
corepack yarn workspace @side/photo-contest db:migrate
corepack yarn dev:photo-contest
```

웹은 http://localhost:3200, API는 http://127.0.0.1:4200입니다. 기존 DB의 포트는 해당 프로젝트 `.env`를 따릅니다. [웃긴순간 실행·운영 문서](projects/photo-contest/README.md)를 참고하세요.

## Game Feedback

플레이메이트는 피드백, 친추판매, 전투 모집, 게임코치, 자유게시판과 영속 1:1 채팅을 제공하는 비공개 알파입니다. 테스트 실행에서는 서버의 테스트 토큰 API로 고정 계정에 로그인합니다.

```sh
cp projects/game-feedback/.env.example projects/game-feedback/.env
corepack yarn workspace @side/game-feedback dev:demo
```

웹은 http://localhost:3300/ko, API는 http://127.0.0.1:4300입니다. [모바일 앱](projects/game-feedback/apps/mobile/README.md)은 이 웹을 Expo WebView로 열며 Metro 8082를 사용합니다. 전용 개발 DB는 55442, 테스트 DB는 55444를 사용합니다. 실행·검증·외부 연동의 준비 상태는 [Game Feedback 문서](projects/game-feedback/README.md)와 [검증 기록](projects/game-feedback/docs/implementation.md)을 참고하세요.

## 공통 운영 배포

두 서비스는 서울 EC2 한 대에서 공통 Caddy를 사용하고, 외부 RDS PostgreSQL의 서비스별 DB·role과 서로 다른 비공개 S3 버킷을 사용합니다. [설정·CD·백업 복구 안내](deploy/shared-instance/README.md)를 따르세요. 운영 이미지는 AMD64이며 DB는 애플리케이션 Compose에 포함하지 않습니다.

## 공통 디자인 시스템

[설계와 사용법](packages/design-system/README.md)은 `@side/design-system`이 관리합니다. Photo Contest·Game Feedback 웹이 같은 색·타이포·간격·컨트롤·모달 스타일을 사용합니다. 공통 UI는 `@side/design-system`, Next 링크는 `@side/design-system/next`, Tailwind 진입점에서는 `@side/design-system/styles.css`를 가져옵니다. 도메인 화면·라우팅·서버 상태·앱별 overlay 수명은 각 프로젝트가 소유합니다.

```sh
corepack yarn workspace @side/design-system check
```

## 검증

별도 터미널에서 `corepack yarn workspace @side/photo-contest db:test:local`로 테스트 DB(55434)를 시작합니다. `.env`의 `TEST_DATABASE_URL`은 이 전용 DB를 가리킵니다.

```sh
corepack yarn workspace @side/eslint-config check
corepack yarn workspace @side/photo-contest check
corepack yarn workspace @photo-contest/web lint
corepack yarn workspace @photo-contest/mobile lint
corepack yarn test:photo-contest:api
corepack yarn workspace @photo-contest/web exec playwright install chromium webkit
corepack yarn test:photo-contest:e2e
corepack yarn workspace @photo-contest/test-kit check:cleanup
corepack yarn build:photo-contest
corepack yarn format:check
```

`test:api`는 웹·모바일이 소비하는 실제 API 계약을, `test:e2e`는 API의 supertest와 웹·모바일의 Playwright를 실행합니다. `TEST_DATABASE_URL`을 우선 사용하고 실행마다 임시 스키마를 만든 뒤 제거합니다. 개발 서버의 포트·빌드 폴더·데이터를 재사용하지 않습니다.

새 프로젝트는 `@side/<name>` 집계 패키지에 `test`·`build`·`typecheck`·`check`를 정의합니다. 여러 프로젝트가 함께 쓰는 코드만 루트 `packages/*`에 둡니다.

## TypeScript와 테스트 파일 규칙

웹 앱의 Next.js와 관련 도구는 16.4.2를 사용합니다. 공통 `@side/typescript-config`의 `tsc7`은 안정 버전 TypeScript 7.0.2를 실행합니다. 각 앱의 타입 검사와 API 빌드도 이 명령을 사용합니다. Next 빌드, ESLint와 코드 생성 도구가 사용하는 JavaScript 컴파일러 API는 `typescript` 6.0.2로 유지합니다. TypeScript 7에는 안정된 컴파일러 API가 없으며, 공식 호환 shim은 Yarn 4.17 내장 패치에서 설치 오류가 발생해 직접 API 패키지와 네이티브 실행기를 분리했습니다. Node·Yarn·모바일 Expo 버전은 유지합니다.

새 기능의 사양은 `*.spec.ts(x)`, 확인한 버그의 회귀 검사는 `*.test.ts(x)`로 작성합니다. 기존 기능과 회귀 검사가 섞인 파일은 보존하며 Vitest가 두 접미사를 모두 수집합니다. API 통합 테스트도 Vitest와 Supertest가 소유합니다. Playwright는 화면 앱의 e2e 경로만 수집하며 파일명의 spec/test만으로 러너를 결정하지 않습니다. Photo Contest의 `*.api.spec.ts`와 `*.api.test.ts`는 unit에서 제외하고 격리 API 레인에서 실행합니다.
