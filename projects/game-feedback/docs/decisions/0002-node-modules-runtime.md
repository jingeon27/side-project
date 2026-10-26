# 0002 — 저장소의 Yarn 4.17과 node-modules 실행 방식 유지

날짜: 2026-10-16. 상태: 채택.

## 맥락

대상 저장소 `jingeon27/side-project`는 Node.js 24, Yarn 4.17.0, `nodeLinker: node-modules`를 사용한다. Game Feedback은 이 실행 방식과 기존 프로젝트의 의존성·검증 구조를 유지해야 한다.

## 결정

- 저장소의 `packageManager`에 지정한 버전의 Yarn CLI를 직접 설치하고 실행한다. 특정 Yarn release 파일이나 PnP loader를 하드코딩하지 않는다.
- 기존 Workspace 경로와 `@side/*` 집계를 유지한다. Game Feedback은 자체 `test`, `build`, `typecheck`, `check`를 제공한다.
- API/Web과 각 패키지가 테스트 러너·설정·파일을 소유한다. 프로젝트 집계의 DB URL 가드 테스트도 API로 이동한다.
- Prisma Client는 API 전용 경로에 생성하고 API build에 Client와 엔진을 함께 포함한다. 다른 프로젝트의 Client 또는 DB 설정을 공유하지 않는다.
- production build에는 `NODE_ENV=production`을 전달하고 Next.js 기본 Turbopack build를 사용한다. Web 개발·E2E 서버에는 `--webpack`을 명시한다.
- 브라우저 테스트는 Web 3301·API 4301과 테스트 DB 55444의 실행별 `gf_test_web_` 스키마를 사용한다.
- 저장소의 패키지 최소 배포 기간 제한과 Prettier 설정을 유지한다.

## 결과

Game Feedback 추가를 위해 기존 저장소의 package manager, linker, photo-contest 코드·데이터를 바꾸지 않는다. 이전 PnP 환경에서의 성공은 현재 설치·실행의 증거로 취급하지 않고, 현재 Worktree에서 다시 검증한다.

현재 환경의 API·Web production build는 통과했다. Turbopack 개발 서버의 첫 채팅 route E2E에서는 메시지 POST가 성공한 뒤 최초 RSC 응답이 약 30초 지연되는 현상과 테스트 1건 실패를 관찰했다. 내부 원인은 확정하지 않았다. 개발·E2E에 webpack을 선택하고 기존 timeout으로 다시 실행한 E2E 8개는 모두 통과했다. production은 통과한 Turbopack build를 유지한다.
