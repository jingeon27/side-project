# Game Feedback 작업 규칙

사용자 지정(2026-10-25): 앱 설정은 프로젝트 루트 `.env`에 정의한 키만 사용한다. 모바일도 루트 설정을 읽고, 별도 앱 링크 인증서·모바일 env 템플릿은 제거했다. 테스트 설정은 루트 URL과 격리 실행기의 명시적 옵션을 사용한다. 스킬의 이전 env 키를 다시 도입하지 않는다. 저장소 공용 배포 도구의 이미지·네트워크·마이그레이션 계정 입력은 앱에 그대로 전달하지 않는다.

사용자 계획의 원본은 `docs/mvp-plan-v4.md`다. 구현 상태와 외부 검증 상태는 `docs/implementation.md`에 별도로 기록한다. 이 프로젝트는 클래시로얄 피드백의 비공개 알파를 위한 기반이며, Phase 0의 사용자 모집과 실제 Google·Supercell 검증을 코드 테스트 성공으로 대체하지 않는다.

## 작업 범위

- Game Feedback 작업은 독립 브랜치와 Worktree에서 진행한다.
- 기본 변경 범위는 `projects/game-feedback/**`다. 다른 서비스 코드와 데이터베이스를 변경하지 않는다.
- 대상 저장소는 `jingeon27/side-project`이며 새 기능은 `develop`을 기준으로 작업한다.
- push 전에 `git remote get-url origin`을 실행해 대상 URL이 `https://github.com/jingeon27/side-project.git`인지 확인한다. PR의 저장소와 base `develop`도 확인한다.
- 기존 원격 `develop`을 보존하고 그 기준의 별도 `feat/*` 브랜치·Worktree에서 작업한다. 이 작업을 위해 `develop`을 새로 만들거나 덮어쓰지 않는다.
- 공통 파일은 루트 `README.md`, `package.json`, `yarn.lock`, scripts, CI만 필요한 이유를 기록하고 수정한다. 기존 Workspace 경로, Yarn 4.17.0, `nodeLinker: node-modules`를 유지한다.
- 의존성을 변경하면 해당 manifest와 루트 lockfile을 함께 검토한다. 루트 Node·Yarn이나 기존 프로젝트 버전 업그레이드를 이 작업에 섞지 않는다.
- Node.js 24를 사용한다. 프로젝트 `.nvmrc`에서 `nvm use`를 실행한다.
- `corepack yarn`으로 저장소의 packageManager를 사용한다. 특정 `.yarn/releases` 파일이나 PnP 경로를 가정하지 않는다.
- Yarn의 패키지 최소 배포 기간 제한을 끄지 않는다. 격리된 신규 버전 대신 기존 게이트를 통과한 버전을 선택한다.

## DB 및 외부 서비스

- 개발: loopback `55442`, database `game_feedback`, user `game_feedback`.
- 테스트: loopback `55444`, database `game_feedback_test`, 테스트별 `gf_test_` 스키마.
- Prisma schema와 Client는 `apps/api` 전용이다. 기존 photo-contest나 다른 프로젝트의 URL을 사용하지 않는다.
- 운영 배포 준비 요청 이후 `schema.prisma`와 최초 migration을 함께 관리하며 운영은 `migrate deploy`로 적용한다. 로컬은 URL 가드를 거친 `db:sync`의 `prisma db push`를 유지한다. `--accept-data-loss`, `--force-reset`, `migrate reset`, 자동 reset은 사용하지 않는다. 운영 컨테이너 검증은 새 전용 Docker project/volume에서만 실행하고 개발·운영의 기존 volume을 재사용하지 않는다.
- DB 작업은 프로젝트의 `scripts/db.mjs` URL 검증을 거친다. 테스트 정리는 생성한 `gf_test_` 스키마에만 허용한다.
- `db:stop`은 이 프로젝트가 토큰으로 소유권을 확인한 로컬 DB만 종료한다. 포트 사용자를 임의로 kill하지 않는다.
- 외부 OAuth·게임 API는 인터페이스 뒤에 둔다. 테스트는 가짜 제공자를 강제한다. 데모 모드는 명시적 실행에만 허용하고 production에서는 거부한다.
- 앱 소셜 로그인은 시스템 브라우저 + PKCE + 일회용 코드 교환이고, 코드는 검증된 https App Link·Universal Link(`<WEB_ORIGIN>/app-auth/callback`)로만 받는다. 커스텀 스킴 `gamefeedback://`는 로그인 밖의 딥링크에만 쓴다(같은 스킴을 등록한 앱이 자기 challenge로 시작한 흐름의 코드를 가로챌 수 있다). 웹이 `/.well-known/apple-app-site-association`·`assetlinks.json`을 배포 환경변수로 제공하고, iOS 최소 버전은 17.4다.
- 인증 정보, 세션 쿠키, Player Tag 원본을 로그에 무분별하게 기록하지 않는다. OAuth는 제공자 식별자 확인에 필요한 최소 scope만 요청한다(Google `openid`, Discord `identify`, 카카오는 scope 없이 `property_keys=[]` 조회). 제공자 subject만 저장하고 이름·사진·이메일을 자동 수집하지 않는다.

## 검증 및 완료 기록

- Web·Admin 코드 변경과 리뷰에는 `.agents/skills/game-feedback-code-style/SKILL.md`를 적용한다. 각 앱의 `AGENTS.md`와 lint 설정으로 구체적인 경계를 확인한다.
- 관련 검증 명령과 결과, 확인하지 못한 항목을 완료 기록에 남긴다.
- 서버 성공 결과와 사용자의 `도움됨` 신호를 중심으로 제품 지표를 정의한다. 프런트 행동 이벤트와 실제 DB 성공 지표를 혼동하지 않는다.
- API 계약은 서버 Zod 스키마 → OpenAPI → Orval 순서로 생성한다. `apps/api/openapi.json`은 Git에서 제외하고 프로젝트 준비 단계에서 생성한다. SDK 생성 코드는 Git에 포함하며 CI에서 재생성 diff를 검사한다. 생성 파일을 손으로 고치지 않는다. 모든 생성 JSON 요청은 Zod 응답 스키마를 transport에 전달하며 SDK 소유 Vitest로 누락을 검사한다. 응답 fallback은 SDK의 명시적 표시 필드에만 적용하고 원래 계약으로 재검증한다. ID·권한·세션·커서·날짜·본문·목록 오류를 fallback으로 감추지 않는다.
- 변경 범위에 맞는 검사만 수행한다. `check`, `test`, `test:e2e`, `build`, 계약 생성 결과 검사를 선택한다.
- 프로젝트 집계는 `test`, `build`, `typecheck`, `check`를 정의하고 앱·패키지 명령에 위임한다.
- 테스트 파일·Vitest/Playwright 설정·러너 의존성은 API/Web/Mobile 또는 해당 패키지가 소유한다. API는 Vitest+Supertest, Web은 Vitest+Playwright, Mobile은 Vitest unit/UI+Playwright native host로 검증한다. 루트·프로젝트 집계와 공통 e2e Workspace에 러너를 두지 않는다. DB URL 가드 테스트는 `scripts/database-guard.mjs` 옆에 두고 API의 unit 레인이 수집한다.
- 루트 Prettier 설정을 사용해 변경 파일의 format을 검사한다. 사용자 제공 원본 계획은 수정하지 않는다.
- 이전 저장소에서 얻은 테스트 결과를 현재 저장소의 검증으로 기록하지 않는다. 환경과 실제 실행 결과를 구분한다.
- 로컬 테스트 및 커밋 절차는 `.agents/skills/game-feedback-test/SKILL.md`, `.agents/skills/game-feedback-commit/SKILL.md`를 참고한다.
- 외부 공개·운영 데이터 삭제·다른 서비스 변경은 일반적인 로컬 구현 작업과 구분한다. 사용자 지시에 없는 배포를 완료로 주장하지 않는다.
