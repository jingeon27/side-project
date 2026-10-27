# Side projects monorepo

Yarn 4 workspaces(nodeLinker node-modules), Node.js 24(`.nvmrc`), 22.12 이상 필수. 프로젝트는 `projects/<name>` 아래에서 독립적으로 관리한다.
공유할 필요가 입증된 코드·설정만 올린다: 여러 프로젝트가 쓰면 `packages/*`, 한 프로젝트 안의 여러 앱이 쓰면 `projects/<name>/packages/*`.

- 각 프로젝트의 `AGENTS.md`와 `.agents/skills`를 따른다.
- `packageManager`에 고정한 Yarn 4.17.0 CLI를 직접 설치하고 `yarn`으로 실행한다. 최초 설치는 `npm install --global @yarnpkg/cli-dist@4.17.0 --force`를 사용한다.
- 변수는 `const`로 선언하고 `let`은 쓰지 않는다. 단계별 결과는 함수 반환값으로 전달한다.
- 새 worktree는 `yarn worktree:add <경로> -b <브랜치> origin/develop`로 만든다. 기본 worktree의 로컬 `.env*`가 복사되며 기존 대상 파일과 `.env*.example`은 보존한다. 직접 `git worktree add`를 썼다면 새 worktree에서 `yarn install --immutable`로 설정 복사와 hook 설치를 완료한다. 환경변수 값은 로그·커밋에 남기지 않고, 복사된 DB·포트로 다른 개발 서버를 동시에 실행하지 않는다.
- 워크스페이스 이름: 프로젝트 집계는 `@side/<project>`, 앱과 프로젝트 패키지는 `@<project>/<name>`.
- 테스트 러너는 앱(또는 패키지)이 소유한다. Vitest·Playwright 설정, 러너 의존성, 테스트 파일은 그 앱 안에 둔다. 프로젝트 스크립트의 단위 테스트는 대상 스크립트 옆에 두고 관련 앱의 러너가 수집한다. 루트와 프로젝트 루트에는 테스트 파일·러너 설정·러너 의존성을 두지 않고, test/check 스크립트는 위임만 한다. 프로젝트 전체를 도는 공용 e2e 워크스페이스를 만들지 않는다.
- Playwright는 화면이 있는 앱만 쓴다. API는 Vitest(+ supertest)로 검증한다.
- 프로젝트의 DB·환경변수·스토리지·생성 Prisma client는 서로 격리한다.
- 다른 프로젝트(또는 사용자의 개발 서버)의 실행 중인 프로세스와 데이터를 바꾸지 않는다. 테스트는 개발 서버와 다른 포트, 격리된 DB 스키마를 쓴다.
- Yarn 4.17은 24시간이 지나지 않은 패키지 버전을 격리한다(`All versions satisfying … are quarantined`). 게이트를 통과한 직전 버전을 고르고 `npmMinimalAgeGate`를 끄지 않는다.
- 커밋은 작게 나눈다. 프로젝트의 `commit` 스킬을 따른다.
- husky hook: `pre-commit`은 스테이징된 파일만 Prettier로 정리하고 `commit-msg`는 `<type>(<scope>): <내용>` 형식과 `Co-Authored-By` trailer 금지를 검사한다. 새 worktree는 `yarn install` 후 hook이 생긴다. 실패하면 고쳐서 다시 커밋한다. hook이 필요 없는 자동화는 `HUSKY=0`을 쓰고 `--no-verify`는 비상시에만 쓴다.
- PR은 squash가 아니라 merge commit으로 합친다(#94까지는 squash였으므로 그 이전 이력은 `gh pr view <번호> --json commits`로 본다). 브랜치 커밋이 develop 이력에 그대로 남으므로 PR을 올리기 전에 fixup·squash·WIP 커밋을 원래 커밋과 합친다(`git commit --fixup <sha>` 후 `git rebase --autosquash <base>`). 커밋 메시지에 `Co-Authored-By` trailer를 넣지 않는다. PR의 `Commits` 검사(`scripts/check-branch-commits.ts`)가 브랜치의 모든 커밋을 확인한다.

- TypeScript CLI는 공통 `@side/config`의 `tsc7`(7.0.2)을 사용한다. JavaScript compiler API 의존 도구는 `typescript` 6.0.2를 사용하며, `typescript/bin/tsc` 경로를 직접 가정하지 않는다.
- 설정 파일도 도구가 지원하면 `.ts`를 우선한다. 설치된 로더가 TypeScript 설정을 지원하지 않는 경우에만 `.mjs` 등 지원 형식을 유지한다.
- 테스트 접미사는 새 기능 사양 `*.spec.ts(x)`, 확인한 버그 회귀 `*.test.ts(x)`로 쓴다. 기존 혼합 파일은 보존하고 Vitest는 둘 다 수집한다. 러너는 파일 위치와 앱 설정이 결정하며 API는 Vitest+Supertest다.
- unit·integration 테스트는 대상 구현 파일과 같은 디렉터리에 둔다. DB·HTTP 통합 테스트는 `*.integration.spec.ts` 또는 `*.integration.test.ts`로 구분하고 앱의 unit 레인에서 제외한다. 공통 하네스·fixture와 브라우저 E2E는 앱의 별도 테스트 디렉터리에 둘 수 있다.
