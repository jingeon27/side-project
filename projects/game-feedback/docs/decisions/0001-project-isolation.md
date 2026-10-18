# 0001 — 전용 Workspace·DB·명시적 데모

날짜: 2026-10-16. 상태: 채택.

## 맥락

Game Feedback은 `jingeon27/side-project`의 기존 Yarn Workspace 안에서 개발하되 photo-contest의 실행 및 데이터와 분리해야 한다. 현재 저장소의 Node.js 24, Yarn 4.17.0과 node-modules 설치 방식을 따른다. 외부 키와 실제 사용자 모집은 로컬 코드만으로 검증할 수 없다.

## 결정

- 별도 Git Worktree와 `projects/game-feedback/**` 내부 Workspace를 사용한다.
- 프로젝트 Node.js 24와 저장소 Yarn 4.17.0·node-modules linker를 사용한다. 기존 저장소 도구와 photo-contest 구성을 변경하지 않는다.
- 테스트 러너와 파일은 API/Web이 소유하고 프로젝트 집계는 앱·패키지 명령에 위임한다.
- 개발 DB는 55442/game_feedback, 테스트 DB는 55444/game_feedback_test이며 앱 전용 역할을 사용한다.
- embedded-postgres는 `18.4.0-beta.17`로 고정하고 `.data` 아래의 소유 디렉터리만 관리한다. 앱 계정과 로컬 bootstrap 관리자를 분리한다.
- Migration은 URL 대상과 스키마를 검증하고 검토된 SQL의 `migrate deploy`만 실행한다.
- 일반 실행의 데모 모드는 꺼 둔다. 명시적 `dev:demo`만 가짜 로그인/프로필과 데모 seed를 사용하며 production에서는 거부한다.
- Google은 `openid`만 요청한다. 서비스 닉네임은 가입자가 입력한다. 이메일 알림을 위해 이메일을 자동 수집하지 않는다.
- 첫 공개 전에 실제 Google/Supercell 연결, 운영 문서, 모집 및 수동 매칭 증거를 별도로 확보한다.

## 결과

외부 키 없이 로컬 핵심 흐름을 검증할 수 있고 기존 서비스 DB에 접근할 경로를 줄인다. 로컬 명령은 원격 운영 DB를 지원하지 않으므로 배포 시 운영 Migration 및 비밀 관리 절차가 추가로 필요하다. 데모 테스트 통과는 API 출구 IP·정책 준수·제품 수요 검증의 증거로 취급하지 않는다.
