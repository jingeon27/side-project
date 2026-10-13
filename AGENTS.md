# Side projects monorepo

Yarn 4 workspaces, Node.js 22.12 이상. 프로젝트는 `projects/<name>` 아래에서 독립적으로 관리한다.
공유할 필요가 입증된 코드·설정만 `packages`로 올린다.

- 각 프로젝트의 `AGENTS.md`와 관련 skill을 따른다.
- 테스트는 앱의 소스 옆 또는 앱 전용 `test` 폴더에 둔다.
- 앱별 unit/UI/integration은 Vitest, 프로젝트 전체 흐름은 프로젝트 전용 E2E 워크스페이스의 Playwright를 사용한다.
- 루트에는 테스트 파일·Vitest/Playwright 설정·해당 러너 의존성을 두지 않는다. 루트 test/check 스크립트는 프로젝트에 위임만 한다.
- 워크스페이스 이름은 `<project>`로 구분한다. 프로젝트 집계는 `@side/<project>`, 앱은 `@<project>/<app>`.
- 프로젝트의 DB·환경변수·스토리지·생성 Prisma client는 서로 격리한다.
- 다른 프로젝트의 실행 중인 서버나 데이터를 변경하지 않는다.
