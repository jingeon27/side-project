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
packages/typescript-config/
```

루트·프로젝트의 검사 명령은 앱과 패키지에 위임합니다. 테스트 러너·설정·파일·의존성은 각 앱 또는 패키지가 소유합니다. 화면 없는 API의 e2e는 Vitest·supertest로 실행하며, 공용 e2e 워크스페이스는 없습니다.

웃긴순간은 사진·동영상·합성을 공유하는 상시 갤러리 커뮤니티입니다. 홈은 가입한 갤러리의 최신 게시물과 이달의 인기를, MY는 내 갤러리를 보여 줍니다.

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

## 검증

별도 터미널에서 `corepack yarn workspace @side/photo-contest db:test:local`로 테스트 DB(55434)를 시작합니다. `.env`의 `TEST_DATABASE_URL`은 이 전용 DB를 가리킵니다.

```sh
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
