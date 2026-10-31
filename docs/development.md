# 모노레포 개발 가이드

[서비스 안내로 돌아가기](../README.md)

일상적인 실행은 각 프로젝트 README에서 시작합니다. 이 문서는 공통 도구·Git·테스트 규칙을 다룹니다. 버전의 기준은 `.nvmrc`, `package.json`, `.yarnrc.yml`이며 변경 이력과 현재 운영 상태를 혼동하지 않습니다.

전체 코드 감사에서 확인한 완료 항목·남은 개선 작업·검증 기준은 [코드 품질 후속 과제](code-quality-followups.md)에서 관리합니다.

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

PR의 `Commits` 검사는 대상 브랜치에 더해지는 모든 일반 커밋에서 fixup·WIP·형식 오류·Co-Authored-By를 거부합니다. 검사 도입 직전의 공유 이력(`ebe5571f`)만 고정 SHA로 제외하므로 develop → main 릴리스가 과거 squash 제목 때문에 막히지 않습니다. 이후 커밋은 이미 develop에 병합됐어도 검사하며, PR 제목에는 이 검사가 적용되지 않습니다.

새 worktree는 다음 명령으로 만들면 기본 worktree의 로컬 `.env*`도 함께 복사합니다. 루트와 환경변수 예제가 있는 프로젝트·앱 디렉터리만 대상으로 하며, 기존 대상 파일과 예제 파일은 보존합니다. 복사본 권한은 `600`이며 값은 출력하지 않습니다.

```sh
yarn worktree:add ../side-project-feature -b feat/feature origin/develop
cd ../side-project-feature
yarn install --immutable
```

직접 `git worktree add`를 사용해도 새 worktree의 `yarn install`이 빠진 로컬 설정을 복사합니다. CI·Docker 설치에서는 복사하지 않습니다. `.env`는 Git에 포함되지 않으므로 다른 컴퓨터나 운영 서버에는 별도로 설정합니다. 복사한 설정에는 기존 DB·포트도 들어 있으므로 동시에 서버를 띄울 때는 프로젝트의 격리 규칙에 맞게 바꿉니다.

worktree는 `core.hooksPath`(`.husky/_`) 설정을 공유하지만 hook 파일은 각 worktree에 생기므로 새 worktree에서도 `yarn install`을 실행해야 hook이 동작합니다. 버전 관리자로 설치한 Node를 GUI Git 클라이언트가 찾지 못하면 `~/.config/husky/init.sh`에서 PATH를 설정합니다.

```sh
HUSKY=0 git rebase -i develop   # hook이 필요 없는 명령·자동화에서 끈다
git commit --no-verify          # 비상시에만 사용한다
```

## 미사용 코드 검사

`yarn knip`은 모든 워크스페이스의 새 미사용 파일, 의존성, export와 타입을 검사하며 루트 `check`와 Static analysis CI에도 연결되어 있습니다. `knip.ts`에 프레임워크 진입점과 생성 코드 범위를 정의합니다. Playwright 설정은 실행하지 않고 정적으로 분석하므로 검사 중 테스트 서버를 시작하지 않습니다.

기존 미사용 항목은 `knip-baseline.json`에 종류, 파일, 이름별로 기록했습니다. `yarn knip:report`로 기존 항목까지 포함한 전체 결과를 확인합니다. 새 문제를 기준선에 추가해 통과시키지 말고 원인을 수정하며, 기존 코드를 정리하면 해당 기준선 항목도 삭제합니다. ESLint의 `side/no-wildcard-exports`는 값, 타입, namespace의 `export *`를 모든 앱과 패키지에서 막습니다. 필요한 이름을 명시해서 내보내세요.

## 검증

Services workflow는 변경된 서비스의 검사만 선택하고 공용 호스트의 이미지 네 개는 실행당 한 번 빌드·검증합니다. 공통 패키지·배포 설정 변경과 수동 실행은 두 서비스를 모두 선택합니다. 모든 PR에서 변경 범위와 최종 판정은 실행하며 서비스와 무관한 변경은 서비스 검사 없이 통과합니다. PR은 대상 브랜치와 합친 결과를 검사하므로 develop push와 릴리즈 PR 검증은 각각 유지합니다.

GF의 정적·단위 검사(`yarn workspace @side/game-feedback test:unit`)는 S3 없이 실행합니다. 실제 API·DB 통합, 운영 빌드, 브라우저 E2E는 별도 작업에서 실제 테스트 S3와 격리 DB를 사용합니다. 기존 `test:game-feedback` 명령은 API 통합 검사를 포함하는 동작을 유지합니다.

`Service verification`은 선택한 검사가 모두 성공해야 통과합니다. 선택한 작업의 생략·취소·누락도 실패이며 두 서비스의 이미지 발행은 이 결과를 기다립니다. 서비스별 배포 활성화 값·main/배포 브랜치 조건·Environment·배포 잠금과 검증한 이미지 digest 사용은 유지합니다. 필수 상태 검사를 설정한다면 `Service verification`을 선택합니다.

실패 시 이 작업의 Summary에서 실패 영역과 재현 명령을 확인합니다. 브라우저 trace는 GF/PC Playwright artifact, 컨테이너 trace는 PC deployment artifact에 있습니다. 컨테이너 재현에는 검증 대상 SHA로 빌드한 이미지·Docker·두 서비스의 테스트 S3 설정이 필요합니다.

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

## TypeScript와 테스트 파일 규칙

여러 워크스페이스에서 쓰는 외부 패키지의 정확한 버전은 [`.yarnrc.yml`](../.yarnrc.yml)의 Yarn catalog에서 관리합니다. 각 앱·패키지의 `dependencies`·`devDependencies`는 `catalog:`를 참조합니다. 웹과 Expo 앱의 React·React DOM도 공통 catalog를 참조하고, `peerDependencies`는 소비자가 사용할 수 있는 호환 범위를 유지합니다. 한 워크스페이스만 쓰는 패키지는 해당 manifest에서 관리합니다.

공통 버전을 올릴 때는 catalog를 수정하고 `yarn install`로 `yarn.lock`을 함께 갱신한 뒤 `yarn install --immutable`과 영향을 받는 앱의 검사를 실행합니다. Next.js와 관련 `@next/*`·`eslint-config-next`는 같은 버전을 사용합니다. 의존성 설치 후에는 해당 개발 서버를 재시작하세요. 이전 Next.js 프로세스와 새 설치 파일이 섞이면 `routeModule.ensureInstrumentation` 오류가 발생할 수 있습니다. 재시작 후에도 이전 개발 캐시가 남으면 서버를 중지한 상태에서 해당 앱의 `.next/dev`를 비우고 다시 시작합니다.

웹 앱의 Next.js와 관련 도구는 16.4.3을 사용하고 React·React DOM은 19.3.1을 사용합니다. 공통 `@side/config`의 `tsc7`은 안정 버전 TypeScript 7.0.2를 실행합니다. 각 앱의 타입 검사와 API 빌드도 이 명령을 사용합니다. Next 빌드, ESLint와 코드 생성 도구가 사용하는 JavaScript 컴파일러 API는 `typescript` 6.0.2로 유지합니다. TypeScript 7에는 안정된 컴파일러 API가 없으며, 공식 호환 shim은 Yarn 4.17 내장 패치에서 설치 오류가 발생해 직접 API 패키지와 네이티브 실행기를 분리했습니다. 모바일은 Expo SDK 58·React Native 0.88.0을 사용하고 React·React DOM은 웹과 같은 19.3.1을 사용합니다. React Native의 peer 범위 `^19.3.0` 안의 패치 업데이트입니다. Node·Yarn 버전은 유지합니다. Expo의 권장 버전 표는 React·React DOM 19.3.0과 TypeScript ~6.0.3을 가리키므로 의도적으로 고정한 세 패키지는 공식 `expo.install.exclude`에 명시합니다. 다른 네이티브 모듈 검사는 유지하고 앱의 타입 검사는 `tsc7`으로 실행합니다. `EXPO_OFFLINE=1 CI=1 yarn workspace @game-feedback/mobile exec expo install --check`는 설치된 SDK의 버전 표로 확인합니다. 온라인 최신 버전 표는 저장소의 24시간 배포 게이트를 아직 통과하지 못한 새 패치를 권장할 수 있습니다.

두 API는 NestJS 12.2.0을 사용하고 입력 검증은 내장 StandardSchemaValidationPipe와 Zod 스키마로 처리합니다. DTO 타입은 스키마에서 추론하며 GraphQL 입력도 스키마를 명시적으로 연결합니다.

Photo Contest의 Amplitude가 의존하는 AsyncStorage 1.x는 Expo SDK 58에서 사용하는 2.2.0으로 통일해 네이티브 모듈 중복을 막습니다.

Photo Contest의 Expo Doctor는 Amplitude의 New Architecture 미검증 메타데이터를 경고할 수 있습니다. Android/iOS 번들에는 공통 catalog의 React 19.3.1 한 개만 포함하는지 확인합니다. 네이티브 SDK 변경 뒤에는 dev client를 다시 빌드하고 실기기에서 확인해야 합니다.

WebView 14.0.1의 선언에서 추가 props의 기본값이 `undefined`라 props 전체가 `never`가 되는 문제는 Yarn 패치로 `unknown`을 사용해 보정합니다.

새 기능의 사양은 `*.spec.ts(x)`, 확인한 버그의 회귀 검사는 `*.test.ts(x)`로 작성합니다. 기존 기능과 회귀 검사가 섞인 파일은 보존하며 Vitest가 두 접미사를 모두 수집합니다. API 통합 테스트도 Vitest와 Supertest가 소유합니다. Playwright는 화면 앱의 e2e 경로만 수집하며 파일명의 spec/test만으로 러너를 결정하지 않습니다. Photo Contest의 `*.api.spec.ts`와 `*.api.test.ts`는 unit에서 제외하고 격리 API 레인에서 실행합니다.
