# 모노레포 개발 가이드

[서비스 안내로 돌아가기](../README.md)

일상적인 실행은 각 프로젝트 README에서 시작합니다. 이 문서는 공통 도구·Git·테스트 규칙을 다룹니다. 버전의 기준은 `.nvmrc`, `package.json`, `.yarnrc.yml`이며 변경 이력과 현재 운영 상태를 혼동하지 않습니다.

전체 코드 감사에서 확인한 완료 항목·남은 개선 작업·검증 기준은 [코드 품질 후속 과제](code-quality-followups.md)에서 관리합니다.

## 개발 서버 실행

각 프로젝트 README에 따라 환경 파일과 개발 DB를 준비한 뒤, 저장소 루트에서 `yarn dev`로 Game Mate·피식·블로그를 함께 실행합니다. 개별 실행은 모두 `yarn workspace @side/<프로젝트> dev` 형식입니다.

```sh
yarn dev
# 서비스 하나만 실행할 때
yarn workspace @side/game-feedback dev
yarn workspace @side/photo-contest dev
yarn workspace @side/blog dev
```

전체 실행 중 Ctrl+C를 누르거나 서비스 프로세스가 종료되면 함께 시작한 서버도 종료합니다. DB는 각 프로젝트의 시작·중지 명령을 따릅니다. Game Mate의 테스트 인증·예시 콘텐츠 모드는 별도로 `yarn workspace @side/game-feedback dev:test`를 사용합니다.

## 공통 디자인 시스템

[설계와 사용법](../packages/design-system/README.md)은 `@side/design-system`이 관리합니다. Photo Contest·Game Feedback 웹이 같은 색·타이포·간격·컨트롤·모달 스타일을 사용합니다. 공통 UI는 `@side/design-system`, Next 링크는 `@side/design-system/next`, Tailwind 진입점에서는 `@side/design-system/styles.css`를 가져옵니다. 도메인 화면·라우팅·서버 상태·앱별 overlay 수명은 각 프로젝트가 소유합니다.

```sh
yarn workspace @side/design-system check
yarn storybook
yarn build:storybook
```

## 코드 포맷과 import 순서

루트 Prettier와 `@ianvs/prettier-plugin-sort-imports`가 모든 워크스페이스의 포맷과 import 순서를 관리합니다. [`.prettierrc.json`](../.prettierrc.json)의 `importOrder`에서 Node.js 내장 모듈 → React·Next.js → 외부 패키지 → 워크스페이스 패키지 → `@/`·`~/` 별칭 → 상대 경로 순서를 설정하며 그룹 사이에는 빈 줄을 둡니다. 새 프로젝트의 패키지 scope를 만들면 워크스페이스 정규식에도 추가하세요. CSS나 `server-only`처럼 값 없이 가져오는 import는 실행 순서를 유지합니다.

```sh
yarn format:check
yarn format
# 수정한 파일만 정리할 때
yarn prettier --write packages/design-system/src/index.ts
```

편집기에서는 저장소에 설치된 Prettier와 루트 설정을 사용하세요. NestJS의 legacy decorator와 TypeScript 6.0.2 import 문법도 지원하도록 설정했습니다.

## Git hook

`yarn install`이 루트 `postinstall`([`scripts/install-git-hooks.ts`](../scripts/install-git-hooks.ts))로 [husky](https://typicode.github.io/husky/) hook을 설치합니다. Yarn 4는 `prepare`를 실행하지 않아 husky 문서의 Yarn 방식을 따릅니다. `HUSKY=0`, CI, `.git`이 없는 Docker 빌드, husky가 없는 production 설치에서는 조용히 건너뜁니다.

- `pre-commit`: lint-staged가 스테이징된 파일만 루트 설정으로 `prettier --write`합니다. `.prettierignore` 대상과 Prettier가 모르는 파일은 건드리지 않습니다. lint는 각 프로젝트의 검사 명령으로 실행합니다.
- `commit-msg`: 커밋 스킬의 `<type>(<scope>): <내용>` 형식을 검사합니다. type은 `feat`·`fix`·`refactor`·`test`·`docs`·`chore`·`perf`·`ci`·`build`·`style`·`revert`·`merge`이고 scope는 선택입니다. Git이 만드는 merge·revert·fixup·squash 메시지는 통과합니다. 검사 구현은 루트 `scripts/check-commit-message.ts`에 두며, 옆의 테스트는 `@side/config` 러너가 실행합니다.

PR의 `Static analysis` 안에 있는 커밋 검사는 대상 브랜치에 더해지는 모든 일반 커밋에서 fixup·WIP·형식 오류·Co-Authored-By를 거부합니다. 검사 도입 직전의 공유 이력(`ebe5571f`)만 고정 SHA로 제외하므로 develop → main 릴리스가 과거 squash 제목 때문에 막히지 않습니다. 이후 커밋은 이미 develop에 병합됐어도 검사하며, PR 제목에는 이 검사가 적용되지 않습니다. 합성 merge를 checkout해 정적 검사를 실행하되 커밋 검사는 이벤트의 실제 base·head SHA 범위만 봅니다. 별도 Commits workflow와 runner는 사용하지 않습니다.

merge commit 병합은 루트 AGENTS.md 규칙과 리뷰로 지키며, 저장소 안의 검사는 병합 방식을 확인하지 않습니다. GitHub 저장소 설정이 squash·rebase 병합을 막는지는 저장소 밖 설정이라 이 문서로 확인할 수 없고, 규칙 도입(#98) 뒤에도 부모가 하나인 커밋으로 들어간 PR이 있습니다. 설정으로 막을지와 릴리스 merge 커밋에 버전 태그를 붙일지는 저장소 소유자가 정할 일로 남아 있습니다. 지금은 태그가 없고 릴리스 버전은 PR 제목과 merge 커밋 메시지(`Release v<버전>`)에 남습니다.

새 worktree는 다음 명령으로 만들면 기본 worktree의 로컬 `.env*`도 함께 복사합니다. 루트와 환경변수 예제가 있는 프로젝트·앱 디렉터리만 대상으로 하며, 기존 대상 파일과 예제 파일은 보존합니다. 복사본 권한은 `600`이며 값은 출력하지 않습니다.

```sh
yarn worktree:add ../side-project-feature -b feat/feature origin/develop
cd ../side-project-feature
yarn install --immutable
```

직접 `git worktree add`를 사용해도 새 worktree의 `yarn install`이 빠진 로컬 설정을 복사합니다. CI·Docker 설치에서는 복사하지 않습니다. `.env`는 Git에 포함되지 않으므로 다른 컴퓨터나 운영 서버에는 별도로 설정합니다. 복사한 설정에는 기존 DB·포트도 들어 있으므로 이 설정으로 다른 worktree의 개발 서버와 동시에 실행하지 않습니다. 먼저 실행 중인 개발 서버를 멈춥니다.

worktree는 `core.hooksPath`(`.husky/_`) 설정을 공유하지만 hook 파일은 각 worktree에 생기므로 새 worktree에서도 `yarn install`을 실행해야 hook이 동작합니다. 버전 관리자로 설치한 Node를 GUI Git 클라이언트가 찾지 못하면 `~/.config/husky/init.sh`에서 PATH를 설정합니다.

```sh
HUSKY=0 git rebase -i develop   # hook이 필요 없는 명령·자동화에서 끈다
git commit --no-verify          # 비상시에만 사용한다
```

## 미사용 코드 검사

`yarn knip`은 모든 워크스페이스의 새 미사용 파일, 의존성, export와 타입을 검사하며 루트 `check`와 Static analysis CI에도 연결되어 있습니다. `knip.ts`에 프레임워크 진입점과 생성 코드 범위를 정의합니다. Playwright 설정은 실행하지 않고 정적으로 분석하므로 검사 중 테스트 서버를 시작하지 않습니다.

기존 미사용 항목은 `knip-baseline.json`에 종류, 파일, 이름별로 기록했습니다. `yarn knip:report`로 기존 항목까지 포함한 전체 결과를 확인합니다. 새 문제를 기준선에 추가해 통과시키지 말고 원인을 수정하며, 기존 코드를 정리하면 해당 기준선 항목도 삭제합니다. ESLint의 `side/no-wildcard-exports`는 값, 타입, namespace의 `export *`를 공통 `baseConfig`를 쓰는 앱과 패키지에서 막습니다. 블로그 웹은 이 preset을 쓰지 않아 규칙이 걸리지 않지만 같은 원칙으로 필요한 이름을 명시해서 내보내세요.

## 검증

Services와 Blog workflow는 경로 필터 없이 develop·main 대상 PR과 develop·main push마다 실행합니다. 각 workflow의 selection job이 변경 파일로 검사를 고르고, 관련 변경이 없으면 검사 job을 건너뛴 채 집계 job만 성공합니다. Services는 변경된 서비스의 검사만 선택하고 공용 호스트의 이미지 네 개는 실행당 한 번 빌드·검증합니다. 공통 경로 변경과 수동 실행은 두 서비스를 모두 선택합니다. Blog는 블로그 프로젝트, 블로그 앱이 쓰는 공유 패키지, 루트 설치·포맷 설정, `blog.yml`이 바뀌면 `verify`를 실행합니다. PR은 대상 브랜치와 합친 결과를 검사하므로 서비스 변경이 있는 develop push와 릴리즈 PR 검증은 각각 유지합니다. Static analysis를 포함한 세 workflow는 push마다 그 push의 변경으로 검사를 고르므로 다음 push가 이전 실행을 취소하지 않고, PR은 같은 PR의 이전 실행만 취소합니다.

GF의 단위 검사(`yarn workspace @side/game-feedback test:unit`)는 S3 없이 실행합니다. 실제 API·DB 통합, 운영 빌드, 브라우저 E2E는 별도 작업에서 실제 테스트 S3와 격리 DB를 사용합니다. 기존 `test:game-feedback` 명령은 API 통합 검사를 포함하는 동작을 유지합니다.

집계 job인 `Service verification`과 `Blog verification`은 취소된 실행에서도 항상 실행합니다. 선택한 검사가 모두 성공해야 통과하며, selection의 실패와 선택한 작업의 생략·취소·누락도 실패입니다. 두 서비스의 이미지 발행은 `Service verification`을 기다립니다. 서비스별 배포 활성화 값·main/배포 브랜치 조건·Environment·배포 잠금과 검증한 이미지 digest 사용은 유지합니다.

병합 전 필수 검사는 다음과 같습니다.

- develop과 main 보호 규칙에 `knip`(Static analysis), `Service verification`(Services), `Blog verification`(Blog)을 필수 상태 검사로 지정합니다. 세 job은 develop·main 대상의 모든 PR에서 결과를 냅니다. 선택에 따라 건너뛰는 나머지 job은 GitHub가 통과로 처리하므로 필수로 지정하지 않습니다.
- 지정은 저장소 소유자가 GitHub 설정에서 직접 합니다. 저장소 밖 설정이라 이 문서로는 적용 여부를 확인할 수 없습니다. 브랜치마다 이 절의 workflow 구성이 그 브랜치에 들어간 뒤에 지정합니다. 먼저 지정하면 그 구성이 없는 PR은 보고되지 않는 검사를 기다리느라 병합할 수 없습니다. 관리자 우회를 허용하면 실패한 검사를 두고도 병합할 수 있으므로 우회도 함께 막습니다.
- 병합은 PR 최신 head에서 세 검사가 모두 성공한 뒤에 합니다. 릴리스 PR도 같습니다. 필수 검사를 지정하면 GitHub가 그때까지 병합을 막습니다. merge queue를 켜려면 먼저 세 workflow에 `merge_group` 트리거를 더해야 합니다. 그 전에는 queue에서 필수 검사가 실행되지 않아 병합이 멈춥니다.
- 서비스의 운영 배포는 main 실행 안의 `Service verification`이 막습니다. 블로그는 main push마다 Vercel Git 연동이 Actions 결과를 기다리지 않고 배포하며, Vercel 빌드에는 Vitest·E2E가 없습니다. 블로그 배포가 `Blog verification`을 기다리게 할지(Vercel Deployment Checks)는 저장소 소유자가 정합니다.

`Service verification`이 실패하면 그 작업의 Summary에서 실패 영역과 재현 명령을 확인합니다. 브라우저 trace는 GF/PC Playwright artifact, 컨테이너 trace는 PC deployment artifact에 있습니다. 컨테이너 재현에는 검증 대상 SHA로 빌드한 이미지·Docker·두 서비스의 테스트 S3 설정이 필요합니다.

공용 호스트 검증은 두 서비스의 실제 덤프를 그 실행이 소유한 PostgreSQL의 별도 DB로 복원하고 핵심 테이블의 행 수와 내용 지문을 비교합니다. `shared-instance-verification-<sha>` artifact는 복원·데이터 확인 시간, 재배포 중 probe의 p50/p95·실패 수를 기록합니다. CI 컨테이너의 DB 복원 시간이며 운영 서버 전체의 RTO나 RPO 측정값은 아닙니다. 운영 백업·스냅샷·S3 시점 복구 연습은 [배포 가이드](../deploy/shared-instance/README.md)를 따릅니다.

별도 터미널에서 `yarn workspace @side/photo-contest db:test:local`로 테스트 DB(55434)를 시작합니다. `.env`의 `TEST_DATABASE_URL`은 이 전용 DB를 가리킵니다.

```sh
yarn workspace @side/config check
yarn workspace @side/photo-contest check
yarn workspace @photo-contest/web lint
yarn workspace @photo-contest/mobile lint
yarn test:photo-contest:api
yarn workspace @photo-contest/web exec playwright install chromium webkit
yarn test:photo-contest:e2e
yarn workspace @photo-contest/test-kit check:cleanup
yarn build:photo-contest
yarn format:check
```

`test:api`는 웹·모바일이 소비하는 실제 API 계약을, API의 `test:integration`은 실제 DB+supertest를 실행하며 기존 `test:e2e`는 호환 위임입니다. 웹·모바일의 `test:e2e`는 Playwright를 실행합니다. 새 단위·통합 사양은 `.spec.ts(x)`를 사용합니다. `TEST_DATABASE_URL`을 우선 사용하고 실행마다 임시 스키마를 만든 뒤 제거합니다. 개발 서버의 포트·빌드 폴더·데이터를 재사용하지 않습니다.

새 프로젝트는 `@side/<name>` 집계 패키지에 `test`·`build`·`typecheck`·`check`를 정의합니다. 여러 프로젝트가 함께 쓰는 코드만 루트 `packages/*`에 둡니다.

같은 이름의 집계 스크립트도 지금은 프로젝트마다 범위가 다릅니다. 루트 `yarn typecheck`·`yarn check`·`test:photo-contest:unit`은 아래 범위를 그대로 위임합니다. 이름별 범위를 하나로 맞출지는 아직 정하지 않았습니다(저장소 소유자 결정).

| 스크립트    | 피식 `@side/photo-contest`                                                     | Game Mate `@side/game-feedback`                           |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `lint`      | 프로젝트 루트와 모든 앱의 ESLint                                               | 프로젝트 루트 ESLint만(API·contracts·SDK·bridge·스크립트) |
| `typecheck` | 루트와 모든 워크스페이스의 타입 검사                                           | `check`와 같다(타입 검사와 lint)                          |
| `test:unit` | 앱의 `test:unit`만. 웹·모바일은 unit 프로젝트뿐이라 컴포넌트(ui) 테스트가 빠짐 | API unit과 SDK·bridge·web·mobile·admin의 `test`(ui 포함)  |
| `test`      | 모든 워크스페이스의 `test`(웹·모바일은 unit과 ui, API는 unit)                  | API 전체 레인(통합 포함)과 나머지 워크스페이스의 `test`   |
| `check`     | `lint` → `typecheck` → `test`                                                  | 타입 검사와 lint만(테스트 없음)                           |

## TypeScript와 테스트 파일 규칙

여러 워크스페이스에서 쓰는 외부 패키지의 정확한 버전은 [`.yarnrc.yml`](../.yarnrc.yml)의 Yarn catalog에서 관리합니다. 각 앱·패키지의 `dependencies`·`devDependencies`는 `catalog:`를 참조합니다. 웹과 Expo 앱의 React·React DOM도 공통 catalog를 참조하고, `peerDependencies`는 소비자가 사용할 수 있는 호환 범위를 유지합니다. 한 워크스페이스만 쓰는 패키지는 해당 manifest에서 관리합니다.

공통 버전을 올릴 때는 catalog를 수정하고 `yarn install`로 `yarn.lock`을 함께 갱신한 뒤 `yarn install --immutable`과 영향을 받는 앱의 검사를 실행합니다. Next.js와 관련 `@next/*`·`eslint-config-next`는 같은 버전을 사용합니다. 의존성 설치 후에는 해당 개발 서버를 재시작하세요. 이전 Next.js 프로세스와 새 설치 파일이 섞이면 `routeModule.ensureInstrumentation` 오류가 발생할 수 있습니다. 재시작 후에도 이전 개발 캐시가 남으면 서버를 중지한 상태에서 해당 앱의 `.next/dev`를 비우고 다시 시작합니다.

웹 앱의 Next.js와 관련 도구, React·React DOM, 모바일의 Expo·React Native 버전은 `.yarnrc.yml` catalog가 기준이며 이 문서에 숫자로 적지 않습니다. 공통 `@side/config`의 `tsc7`은 안정 버전 TypeScript 7.0.2를 실행합니다. 각 앱의 타입 검사와 API 빌드도 이 명령을 사용합니다. Next 빌드, ESLint와 코드 생성 도구가 사용하는 JavaScript 컴파일러 API는 `typescript` 6.0.2로 유지합니다. TypeScript 7에는 안정된 컴파일러 API가 없으며, 공식 호환 shim은 Yarn 4.17 내장 패치에서 설치 오류가 발생해 직접 API 패키지와 네이티브 실행기를 분리했습니다. 모바일은 catalog의 Expo SDK를 사용하고 React·React DOM은 웹과 같은 catalog 버전을 사용합니다. catalog의 React 버전은 React Native의 `react` peer 범위 안에 있어야 합니다. Node·Yarn 버전은 유지합니다. React·React DOM·TypeScript는 Expo 권장 버전 표와 다른 catalog 버전을 의도적으로 쓰므로 세 패키지를 공식 `expo.install.exclude`에 명시합니다. 다른 네이티브 모듈 검사는 유지하고 앱의 타입 검사는 `tsc7`으로 실행합니다. `EXPO_OFFLINE=1 CI=1 yarn workspace @game-feedback/mobile exec expo install --check`는 설치된 SDK의 버전 표로 확인합니다. 온라인 최신 버전 표는 저장소의 24시간 배포 게이트를 아직 통과하지 못한 새 패치를 권장할 수 있습니다.

두 API는 NestJS 12.2.0을 사용하고 입력 검증은 내장 StandardSchemaValidationPipe와 Zod 스키마로 처리합니다. DTO 타입은 스키마에서 추론하며 GraphQL 입력도 스키마를 명시적으로 연결합니다. 피식 GraphQL은 지금 인증·프로필 입력만 이 방식이고 나머지 인자는 서비스가 검증합니다([API 지침](../projects/photo-contest/apps/api/AGENTS.md)).

Photo Contest의 Amplitude가 의존하는 AsyncStorage 1.x는 루트 `package.json`의 `resolutions`로 Expo SDK가 쓰는 catalog 버전에 맞춰 네이티브 모듈 중복을 막습니다. catalog 버전을 바꾸면 이 resolution도 함께 바꿉니다.

Photo Contest의 Expo Doctor는 Amplitude의 New Architecture 미검증 메타데이터를 경고할 수 있습니다. Android/iOS 번들에는 공통 catalog의 React 한 버전만 포함하는지 확인합니다. 네이티브 SDK 변경 뒤에는 dev client를 다시 빌드하고 실기기에서 확인해야 합니다.

WebView 14.0.1의 선언에서 추가 props의 기본값이 `undefined`라 props 전체가 `never`가 되는 문제는 Yarn 패치로 `unknown`을 사용해 보정합니다.

새 기능의 사양은 `*.spec.ts(x)`, 확인한 버그의 회귀 검사는 `*.test.ts(x)`로 작성합니다. 기존 기능과 회귀 검사가 섞인 파일은 보존하며 Vitest가 두 접미사를 모두 수집합니다. API 통합 테스트도 Vitest와 Supertest가 소유합니다. Playwright는 화면 앱의 e2e 경로만 수집하며 파일명의 spec/test만으로 러너를 결정하지 않습니다. Photo Contest의 `*.api.spec.ts`와 `*.api.test.ts`는 unit에서 제외하고 격리 API 레인에서 실행합니다.
