# Game Feedback

클래시로얄 플레이어가 자신의 덱과 고민을 올리고, 다른 사용자의 피드백을 받아 `도움됨`으로 표시하는 웹 서비스다. 한국어 중심의 비공개 알파를 구현하며 `/ko`, `/ja`, `/en` 경로를 준비한다. 공개 베타·모바일·추가 게임은 후속 단계다.

작성자와 1:1 대화를 시작하고 채팅함에서 이어 갈 수 있다. 대화와 메시지는 PostgreSQL에 보존하며 새 메시지·읽음 변경은 인증된 SSE 연결로 갱신한다. 상대 차단은 대화 조회와 메시지 전송에도 적용한다. 현재 구현·검증 상태는 [구현 기록](docs/implementation.md)에 구분해 남긴다.

## 로컬 실행

저장소의 Node.js 24와 Yarn 4.17.0을 사용한다. 의존성은 기존 `node-modules` linker로 설치한다.

```sh
nvm use
corepack yarn install --immutable
cp projects/game-feedback/.env.example projects/game-feedback/.env
corepack yarn workspace @side/game-feedback dev:demo
```

명시적 데모 실행은 외부 자격 증명 없이 가짜 로그인과 게임 프로필을 사용한다. Web은 <http://localhost:3300/ko>, API는 <http://localhost:4300>이다. Ctrl+C는 이 실행이 시작한 API와 Web을 종료한다. 로컬 PostgreSQL 데이터와 소유 프로세스는 유지되며 다음 명령으로 중지한다.

```sh
corepack yarn workspace @side/game-feedback db:stop
```

실제 Google/Supercell 제공자를 사용하려면 프로젝트 `.env`에 발급받은 값을 설정한 뒤 `corepack yarn workspace @side/game-feedback dev`를 실행한다. 일반 실행의 데모 모드는 꺼져 있다. 개발 실행은 계약 빌드, 전용 Prisma 생성, 소유 DB 시작, Migration 적용, 카테고리 seed를 준비한다. 데모 샘플은 명시적 데모 실행에만 추가한다.

## 고정 테스트 계정으로 확인하기

`dev:demo` 실행 후 `/ko`에서 **로그인 / 시작하기**를 누르면 계정을 선택할 수 있다. 선택 즉시 해당 DB 사용자로 세션이 발급된다. `/ko/settings`의 **테스트 계정 전환**에서도 바꿀 수 있다.

| 선택 계정                           | 고정 ID             | 초기 상태                     |
| ----------------------------------- | ------------------- | ----------------------------- |
| 새벽의호그 · 테스트 플레이어로 시작 | `sample-user-0`     | 일반 사용자, 태그 `#2PP`      |
| 덱연구소 · 인증 코치로 시작         | `sample-user-3`     | 서비스 인증 예시, 태그 `#9QY` |
| 운영테스터 · 운영자 테스트로 시작   | `sample-test-admin` | 데모 운영자, 태그 미등록      |

새벽의호그로 게시글을 작성하고, 덱연구소로 전환해 댓글·채팅을 남긴 뒤 다시 새벽의호그로 돌아오면 작성자와 알림·대화 상태를 확인할 수 있다. 기본 샘플 게시글에는 댓글과 두 계정 사이의 대화가 저장돼 있다. 전환 시 이전 세션은 폐기하며 운영자 계정도 참여하지 않은 비공개 채팅을 읽을 수 없다.

모든 고정 계정은 테스트 계정으로 표시한다. **인증 유저 (테스트)**는 서비스 인증 배지의 예시이며 게임 계정 소유권은 `UNVERIFIED`다. 일반 Google 가입자는 인증되지 않은 상태로 시작한다. 대표 태그는 프로필 조회·저장 성공 후 사용자 정보와 게임 계정에 함께 반영하고 재로그인에도 유지한다. 태그 변경은 기존 게시글 스냅샷을 바꾸지 않는다.

고정 계정 목록·전환 API는 명시적 데모에서만 제공하고 production에서는 사용할 수 없다. 이 절의 초기 상태는 최초 생성 기준이며 이후 저장한 태그·운영자 인증 변경을 시작할 때 덮어쓰지 않는다.

## 명령

모든 명령은 저장소 루트에서 실행한다.

| 명령 뒤의 작업                                                                   | 실행 내용                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `corepack yarn workspace @side/game-feedback setup`                              | 계약 및 Prisma 준비, 개발 DB 시작, 검토된 Migration 적용, 카테고리 seed |
| `corepack yarn workspace @side/game-feedback typecheck` / `check`                | 계약/API/SDK/Web 타입 검사 위임                                         |
| `corepack yarn workspace @side/game-feedback test`                               | API 소유 DB URL 가드·단위·PostgreSQL 통합 테스트                        |
| `corepack yarn workspace @side/game-feedback test:e2e`                           | 테스트 DB 시작 및 Web 소유 브라우저 테스트                              |
| `corepack yarn workspace @side/game-feedback build`                              | Game Feedback API/Web production build                                  |
| `corepack yarn workspace @side/game-feedback codegen`                            | 서버 계약 → OpenAPI → Orval Client 생성                                 |
| `corepack yarn workspace @side/game-feedback db:start` / `db:stop` / `db:status` | 개발 DB 소유 프로세스 관리                                              |
| `corepack yarn workspace @side/game-feedback db:test:start` / `db:test:stop`     | 테스트 DB 관리                                                          |
| `corepack yarn workspace @side/game-feedback db:migrate`                         | 개발 DB URL 검증 후 `prisma migrate deploy`                             |

## 데이터 격리

개발 DB는 `127.0.0.1:55442/game_feedback`, 테스트 DB는 `127.0.0.1:55444/game_feedback_test`이며 서비스 전용 `game_feedback` 역할을 쓴다. bootstrap 관리자 자격 증명은 프로젝트 `.data`에만 저장하고 앱에 전달하지 않는다. 앱 역할에는 superuser·DB 생성·역할 생성 권한이 없다. DB의 TCP 연결은 loopback으로 한정한다.

DB 실행기는 고정된 프로젝트 데이터 디렉터리만 관리한다. 포트가 다른 프로세스에 사용 중이면 종료하지 않고 실패한다. Migration 실행기는 hostname, port, database, user, schema를 검증한다. 개발과 테스트 간 URL 교체, 원격 URL, 기존 서비스 DB는 허용하지 않는다. 외부 배포의 Migration 절차는 별도의 운영 설정과 검토가 필요하다.

DB 소유 프로세스가 실행 중이어도 PostgreSQL이 예기치 않게 종료되면 `db:status`가 실행 중으로 표시될 수 있다. 연결 오류가 계속되면 해당 개발·테스트 DB의 `db:stop` 후 `db:start`를 실행한다. 데이터는 유지되며 포트의 다른 프로세스를 종료할 필요는 없다.

## 문서

- [제품과 범위](docs/product.md)
- [구조와 데이터 흐름](docs/architecture.md)
- [구현 상태와 검증 범위](docs/implementation.md)
- [결정 기록](docs/decisions/0001-project-isolation.md)
- [Yarn 및 실행 방식](docs/decisions/0002-node-modules-runtime.md)
- [사용자가 제공한 MVP Plan v4.0 원문](docs/mvp-plan-v4.md)

사용자 모집, 실제 API 키와 출구 IP, 개인정보·약관 검토, 영어·일본어 공개 품질 검증은 코드 구현과 별도로 완료해야 한다.
