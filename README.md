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
packages/design-system/ # 공유 UI·토큰·스타일
packages/config/        # ESLint 규칙·프리셋, TypeScript 설정·tsc7
packages/toolkit/       # 공유 푸시 알림·migration 검사·Sentry 검사
scripts/                # 저장소 Git hook·worktree 도구
```

저장소의 Node 스크립트는 Node.js 24의 TypeScript 타입 제거로 실행합니다. Next.js가 TypeScript PostCSS 설정을 탐색하지 않아 세 웹 앱의 PostCSS 옵션은 각 `package.json`의 `postcss` 필드에 둡니다.

루트·프로젝트의 검사 명령은 앱과 패키지에 위임합니다. 테스트 러너·설정·파일·의존성은 각 앱 또는 패키지가 소유합니다. 화면 없는 API의 e2e는 Vitest·supertest로 실행하며, 공용 e2e 워크스페이스는 없습니다.

웃긴순간은 사진·동영상·합성을 공유하는 상시 그룹 커뮤니티입니다. 홈은 가입한 그룹의 최신 게시물과 이달의 인기를, MY는 내 그룹을 보여 줍니다. 탐색에서 공개·비공개 그룹을 찾고 공개 게시물을 로그인 없이 감상합니다. 공개 그룹은 바로 가입하고 비공개 그룹은 그룹장이 수락합니다. 그룹 안에서 대회를 열고 게시물 참여·투표·지난 대회 명예의 전당을 이용합니다. 그룹장은 부관리자 임명·해제와 관리자 양도를 관리합니다. 공개 그룹·대회·명예의 전당 SEO·사이트맵은 [SEO 안내](projects/photo-contest/docs/seo.md)에 정리했습니다.

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
corepack yarn storybook
corepack yarn build:storybook
```

## 코드 포맷과 import 순서

루트 Prettier와 `@ianvs/prettier-plugin-sort-imports`가 모든 워크스페이스의 포맷과 import 순서를 관리합니다. [`.prettierrc.json`](.prettierrc.json)의 `importOrder`에서 Node.js 내장 모듈 → React·Next.js → 외부 패키지 → 워크스페이스 패키지 → `@/`·`~/` 별칭 → 상대 경로 순서를 설정하며 그룹 사이에는 빈 줄을 둡니다. 새 프로젝트의 패키지 scope를 만들면 워크스페이스 정규식에도 추가하세요. CSS나 `server-only`처럼 값 없이 가져오는 import는 실행 순서를 유지합니다.

```sh
corepack yarn format:check
corepack yarn format
# 수정한 파일만 정리할 때
corepack yarn prettier --write packages/design-system/src/index.ts
```

편집기에서는 저장소에 설치된 Prettier와 루트 설정을 사용하세요. NestJS의 legacy decorator와 TypeScript 6.0.2 import 문법도 지원하도록 설정했습니다.

## Git hook

`yarn install`이 루트 `postinstall`([`scripts/install-git-hooks.ts`](scripts/install-git-hooks.ts))로 [husky](https://typicode.github.io/husky/) hook을 설치합니다. Yarn 4는 `prepare`를 실행하지 않아 husky 문서의 Yarn 방식을 따릅니다. `HUSKY=0`, CI, `.git`이 없는 Docker 빌드, husky가 없는 production 설치에서는 조용히 건너뜁니다.

- `pre-commit`: lint-staged가 스테이징된 파일만 루트 설정으로 `prettier --write`합니다. `.prettierignore` 대상과 Prettier가 모르는 파일은 건드리지 않습니다. lint는 각 프로젝트의 검사 명령으로 실행합니다.
- `commit-msg`: 커밋 스킬의 `<type>(<scope>): <내용>` 형식을 검사합니다. type은 `feat`·`fix`·`refactor`·`test`·`docs`·`chore`·`perf`·`ci`·`build`·`style`·`revert`·`merge`이고 scope는 선택입니다. Git이 만드는 merge·revert·fixup·squash 메시지는 통과합니다. 검사 구현은 루트 `scripts/check-commit-message.ts`에 두며, 옆의 테스트는 `@side/config` 러너가 실행합니다.

새 worktree는 다음 명령으로 만들면 기본 worktree의 로컬 `.env*`도 함께 복사합니다. 루트와 환경변수 예제가 있는 프로젝트·앱 디렉터리만 대상으로 하며, 기존 대상 파일과 예제 파일은 보존합니다. 복사본 권한은 `600`이며 값은 출력하지 않습니다.

```sh
corepack yarn worktree:add ../side-project-feature -b feat/feature origin/develop
cd ../side-project-feature
corepack yarn install --immutable
```

직접 `git worktree add`를 사용해도 새 worktree의 `yarn install`이 빠진 로컬 설정을 복사합니다. CI·Docker 설치에서는 복사하지 않습니다. `.env`는 Git에 포함되지 않으므로 다른 컴퓨터나 운영 서버에는 별도로 설정합니다. 복사한 설정에는 기존 DB·포트도 들어 있으므로 동시에 서버를 띄울 때는 프로젝트의 격리 규칙에 맞게 바꿉니다.

worktree는 `core.hooksPath`(`.husky/_`) 설정을 공유하지만 hook 파일은 각 worktree에 생기므로 새 worktree에서도 `yarn install`을 실행해야 hook이 동작합니다. 버전 관리자로 설치한 Node를 GUI Git 클라이언트가 찾지 못하면 `~/.config/husky/init.sh`에서 PATH를 설정합니다.

```sh
HUSKY=0 git rebase -i develop   # hook이 필요 없는 명령·자동화에서 끈다
git commit --no-verify          # 비상시에만 사용한다
```

## 검증

별도 터미널에서 `corepack yarn workspace @side/photo-contest db:test:local`로 테스트 DB(55434)를 시작합니다. `.env`의 `TEST_DATABASE_URL`은 이 전용 DB를 가리킵니다.

```sh
corepack yarn workspace @side/config check
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

`test:api`는 웹·모바일이 소비하는 실제 API 계약을, API의 `test:integration`은 실제 DB+supertest를 실행하며 기존 `test:e2e`는 호환 위임입니다. 웹·모바일의 `test:e2e`는 Playwright를 실행합니다. 새 단위·통합 사양은 `.spec.ts(x)`를 사용합니다. `TEST_DATABASE_URL`을 우선 사용하고 실행마다 임시 스키마를 만든 뒤 제거합니다. 개발 서버의 포트·빌드 폴더·데이터를 재사용하지 않습니다.

새 프로젝트는 `@side/<name>` 집계 패키지에 `test`·`build`·`typecheck`·`check`를 정의합니다. 여러 프로젝트가 함께 쓰는 코드만 루트 `packages/*`에 둡니다.

## TypeScript와 테스트 파일 규칙

웹 앱의 Next.js와 관련 도구는 16.4.2를 사용합니다. 공통 `@side/config`의 `tsc7`은 안정 버전 TypeScript 7.0.2를 실행합니다. 각 앱의 타입 검사와 API 빌드도 이 명령을 사용합니다. Next 빌드, ESLint와 코드 생성 도구가 사용하는 JavaScript 컴파일러 API는 `typescript` 6.0.2로 유지합니다. TypeScript 7에는 안정된 컴파일러 API가 없으며, 공식 호환 shim은 Yarn 4.17 내장 패치에서 설치 오류가 발생해 직접 API 패키지와 네이티브 실행기를 분리했습니다. Node·Yarn·모바일 Expo 버전은 유지합니다.

새 기능의 사양은 `*.spec.ts(x)`, 확인한 버그의 회귀 검사는 `*.test.ts(x)`로 작성합니다. 기존 기능과 회귀 검사가 섞인 파일은 보존하며 Vitest가 두 접미사를 모두 수집합니다. API 통합 테스트도 Vitest와 Supertest가 소유합니다. Playwright는 화면 앱의 e2e 경로만 수집하며 파일명의 spec/test만으로 러너를 결정하지 않습니다. Photo Contest의 `*.api.spec.ts`와 `*.api.test.ts`는 unit에서 제외하고 격리 API 레인에서 실행합니다.

## Bambyul · 밤별

‘밤하늘의 별’이라는 의미의 공통 브랜드다. 작성자 김진건의 이름에 담긴 ‘별’과 ‘하늘’에서 가져왔다.

| 제품                    | 프로젝트      | 운영 웹                     | 운영 API                                         |
| ----------------------- | ------------- | --------------------------- | ------------------------------------------------ |
| 밤별 블로그             | blog          | https://blog.bambyul.com    | 별도 API 서버 없음 (`api.blog.bambyul.com` 예약) |
| Game Mate               | game-feedback | https://game.bambyul.com    | https://api.game.bambyul.com/api                 |
| 별사대 · 별난 사진 대회 | photo-contest | https://contest.bambyul.com | https://api.contest.bambyul.com/graphql          |

서비스 로고는 서로 다른 실루엣과 색을 쓴다. 밤별 블로그는 남색의 책과 별, Game Mate는 초록색 게임패드, 별사대는 코랄색의 카메라와 별 렌즈다. 각 서비스의 favicon·Apple 아이콘·공유 이미지·네이티브 앱 아이콘은 해당 로고를 따른다.

웹·WebView는 각 웹 origin의 `/api` 또는 `/backend` 프록시를 사용한다. API 공개 도메인과 서버 간 내부 upstream 주소를 구분하며, 별사대의 API GraphQL도 Next 프록시를 거쳐 공개 캐시를 무효화한다. DNS·TLS·호스팅 연결은 [공통 배포 안내](deploy/shared-instance/README.md)와 [블로그 배포 안내](projects/blog/docs/deployment.md)를 따른다.

두 서비스의 RN 푸시는 각 API가 세션·권한·DB 큐를 소유하고, [`@side/toolkit/push-notifications`](packages/toolkit/src/push-notifications/README.md)만 Expo HTTP 전송·재시도·영수증 처리를 공유한다. 같은 제공자의 오류·부분 성공을 두 번 구현하지 않기 위한 공통 패키지이며 사용자 데이터와 인증 설정은 공유하지 않는다.
