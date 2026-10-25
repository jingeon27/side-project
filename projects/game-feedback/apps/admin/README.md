# Game Feedback Admin

공개 Web/WebView와 분리된 React + Vite 로컬 관리자 서비스다. `apps/admin`이 화면, FSD 도메인, Vitest/Playwright를 소유하며 REST API와 공통 디자인 시스템을 재사용한다. 공개 Web의 `/ko/admin`, `/en/admin`, `/ja/admin`은 404다.

코드 변경에는 [코드스타일 스킬](../../.agents/skills/game-feedback-code-style/SKILL.md)과 [Admin 작업 규칙](AGENTS.md)을 적용한다. `_app`은 Provider·인증·라우트 조합, `_pages`는 로그인·문의·신고·사용자 관리 화면, `widgets`는 셸·대화·사용자 패널을 소유한다. `features`의 REST IO·조회 options·mutation options를 정의하고 호출부에서 useMutation으로 직접 조립한다. 폼은 각 목적의 Zod 스키마로 관리한다. 같은 경계는 앱 ESLint에서도 검사한다.

## 실행

저장소 루트에서 Node 24와 Yarn 4를 사용한다.

```sh
ssh -N -L 14300:127.0.0.1:4300 ubuntu@<IP>
# 별도 터미널
corepack yarn workspace @side/game-feedback admin:dev
```

http://127.0.0.1:3303 에서 관리자 전용 ID와 비밀번호로 로그인한다. 기본 연결은 운영 SSH 터널 `127.0.0.1:14300`, 서비스 Origin `https://game.bambyul.com`이다. 테스트 로그인 버튼이나 로컬/운영 모드 구분은 없다. 다른 격리된 API를 확인할 때만 `GAME_FEEDBACK_API_URL`, `WEB_ORIGIN`을 셸에 명시한다. Admin은 공개 Web의 개발용 `.env` 주소를 자동으로 읽지 않는다.

관리자는 `AdminAccount`로 관리하며 일반 이용자를 승격하지 않는다. 연결된 내부 User는 문의 대화·감사 기록의 발신자 용도다. 관리자 비밀번호는 salt를 포함한 scrypt 해시로 저장하며 가입 API는 제공하지 않는다. `/api/admin/auth/*`와 문의 답변 API 모두 공개 Caddy에서 차단하고 SSH 터널로만 접근한다. 로그인 쿠키 `gamefeedback_admin_session`은 HttpOnly·SameSite=Strict·Path=/api/admin이며 유효기간은 1시간이다. 로컬 HTTP 프록시를 통해 사용하므로 Secure 속성을 붙이지 않는다. 공개 사용자 쿠키·Bearer 세션과 분리하며 브라우저 storage에 토큰을 저장하지 않는다.

계정 생성·비밀번호 변경은 서버에서 실행한다. 비밀번호는 인자나 환경변수 대신 stdin으로 전달한다. 다음 Bash 명령은 비밀번호를 화면이나 셸 기록에 남기지 않는다.

```bash
read -r -s -p 'Admin password (8–128 chars): ' admin_password; echo
printf '%s' "$admin_password" | bash /srv/side-project/services/game-feedback/current/host/service.sh game-feedback operator create admin
unset admin_password
# 비밀번호 변경 시 create를 reset-password로 바꾼다. 기존 관리자 세션도 모두 폐기된다.
```

로컬 전용 API를 쓰는 경우 프로젝트의 `db:sync` 후 API 디렉터리에서 Node 24로 `node --env-file=../../.env --require tsx/cjs scripts/operator.mjs create admin`을 실행하고 같은 방식으로 stdin을 전달한다. 기존 개발 DB를 초기화하지 않는다. 계정을 만들면 프로필 인증 신청의 VERIFICATION 문의가 그 관리자의 문의함으로 배정된다.

문의함의 채팅 상단에서 게임 태그와 현재 프로필 인증 상태를 확인하고 인증·미인증을 바로 선택한다. 성공하면 문의 목록과 사용자 관리에 반영하며 실패하면 기존 상태와 재시도 버튼을 유지한다. 문의 채팅 답변/처리 완료/재개, 신고함에서 검토/반려/콘텐츠 숨김, 사용자 관리에서 ID 조회/프로필 인증 승인·해제/사유를 입력한 밴·해제를 제공한다. 문의 메시지는 5초 주기로 갱신하며 실패한 답변 초안과 재전송 ID를 유지한다. 감사 기록과 권한은 API가 관리한다.

문의·신고·사용자 관리 화면은 각 탭을 열 때 로딩하고 기존 `AsyncBoundary`가 대기·실패를 처리한다. 브라우저 번들은 contracts의 `browser` 진입점(`src/index.ts`)을 사용해 SDK와 같은 Zod ESM을 공유한다. API와 Node 도구는 기존 CommonJS `dist`를 사용한다.

Zod 4.6.7의 설명 주석에 들어 있던 최적화 표시 문구는 루트 Yarn patch로 고쳤다. 실행 코드와 실제 최적화 지시문은 유지한다. 버전을 갱신할 때는 patch 적용 여부와 Admin build의 주석·번들 크기 경고를 확인한다.

서버는 `127.0.0.1`에만 바인딩한다. 프록시는 실제 관리자 페이지 Origin을 확인한 뒤 API의 서비스 Origin으로 전달한다. iframe 방지 헤더, loopback 주소 제한과 API의 관리자 권한 검사를 유지한다. Admin 자체는 공개 배포하지 않는다.

## 검증

```sh
corepack yarn workspace @game-feedback/admin typecheck
corepack yarn workspace @game-feedback/admin lint
corepack yarn workspace @game-feedback/admin test
corepack yarn workspace @side/game-feedback db:test:start
corepack yarn workspace @game-feedback/admin test:e2e
corepack yarn workspace @game-feedback/admin build
```

Playwright는 개발 서버와 별개인 Admin 3304/API 4304와 테스트 DB 55444의 고유 `gf_test_admin_*` 스키마를 생성하고 해당 스키마만 정리한다.
